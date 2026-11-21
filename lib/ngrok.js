import { runSSH, getTargetHost, getRequestContext, getCachedTunnels } from './ssh';
import { logError, logAction } from './logger';

/**
 * Inicia um proxy local no servidor (porta `port + 10000`) que remove cabeçalhos restritivos de iframe
 * e suporta WebSockets e ponte Gamepad.
 */
export async function ensureFrameProxy(port, protocol = 'http:', isHttpsFrontend = true) {
  const proxyPort = Number(port) + 10000;
  const isTlsUpstream = protocol === 'https:' ? '1' : '0';
  const cookieMode = isHttpsFrontend ? 'https' : 'http';

  const setupProxyCmd = `
mkdir -p /tmp/srv_locks_rodrigo 2>/dev/null || true
(
  flock -x -w 15 9 || exit 0
  if [ -f /home/rodrigo/.local/bin/srv_frame_proxy.py ]; then
    cp /home/rodrigo/.local/bin/srv_frame_proxy.py /tmp/srv_frame_proxy.py 2>/dev/null || true
  fi
  if ! ss -tlnH "sport = :${proxyPort}" 2>/dev/null | grep -q .; then
    nohup python3 /tmp/srv_frame_proxy.py ${proxyPort} ${port} ${isTlsUpstream} ${cookieMode} </dev/null >/tmp/srv_frame_proxy_${proxyPort}.log 2>&1 9>&- &
    for i in 1 2 3 4 5 6; do
      ss -tlnH "sport = :${proxyPort}" 2>/dev/null | grep -q . && break
      sleep 0.2
    done
  fi
) 9>/tmp/srv_locks_rodrigo/srv_proxy_${proxyPort}.lock
`;
  await runSSH(setupProxyCmd);
  return proxyPort;
}

/**
 * Inicia ou reutiliza um túnel seguro HTTPS (Cloudflare -> Ngrok -> Bore) ou proxy local LAN.
 */
export async function startNgrok(port, protocol = 'http:', mode = 'tunnel', localHostHint = null) {
  const numPort = parseInt(String(port), 10);
  if (Number.isNaN(numPort) || numPort < 1 || numPort > 65535) {
    throw new Error('Porta inválida informada.');
  }
  const ctx = getRequestContext();
  const proxyPort = numPort + 10000;

  if (mode !== 'local_http') {
    const cachedTunnels = getCachedTunnels();
    const cachedUrl = cachedTunnels[String(proxyPort)] || cachedTunnels[String(numPort)];
    const fastCheckCmd = `
      if ss -tlnH "sport = :${numPort}" 2>/dev/null | grep -q . && ss -tlnH "sport = :${proxyPort}" 2>/dev/null | grep -q . && pgrep -af "[c]loudflared" | grep -q "localhost:${proxyPort}\\b"; then
        if ! grep -qE "Tunnel server stopped|no more connections active|status 429" /tmp/cf_${proxyPort}.log 2>/dev/null; then
          URL=\$(grep -o 'https://[-a-zA-Z0-9]*\\.trycloudflare\\.com' /tmp/cf_${proxyPort}.log 2>/dev/null | tail -n 1)
          if [ -n "\$URL" ]; then
            echo "FAST_REUSED:\$URL"
            exit 0
          fi
        fi
      fi
      exit 1
    `;
    try {
      const fastRes = await runSSH(fastCheckCmd, 8000);
      const fastMatch = (fastRes.stdout || '').trim().match(/FAST_REUSED:(https:\/\/[^\s]+)/);
      if (fastRes.code === 0 && (fastMatch || cachedUrl)) {
        return fastMatch ? fastMatch[1] : cachedUrl;
      }
    } catch (_) {}
  }

  const verifyPortCmd = `
    for i in $(seq 1 12); do
      if ss -tlnH "sport = :${numPort}" 2>/dev/null | grep -q .; then
        exit 0
      fi
      sleep 0.5
    done
    exit 1
  `;
  const portCheck = await runSSH(verifyPortCmd);
  if (portCheck.code !== 0) {
    throw new Error(`Porta ${numPort} não ficou disponível no servidor.`);
  }

  const isHttpsFrontend = mode !== 'local_http';
  await ensureFrameProxy(numPort, protocol, isHttpsFrontend);

  if (mode === 'local_http') {
    const cleanHint = typeof localHostHint === 'string' && /^[a-zA-Z0-9.-]+$/.test(localHostHint) ? localHostHint : '';
    const host = cleanHint || getTargetHost().split(':')[0];
    if (!host) {
      throw new Error('Host local indisponível para acesso direto.');
    }
    const localUrl = `http://${host}:${proxyPort}`;
    await logAction('Tunnel:LocalDirect', 'success', {
      port: numPort,
      proxyPort,
      deviceId: ctx.deviceId,
      deviceName: ctx.deviceName,
    });
    return localUrl;
  }

  // 1. Cloudflare Quick Tunnel (com saída rápida em caso de 429)
  const cfUrl = await startCloudflared(proxyPort, 'http:');
  if (cfUrl) {
    return cfUrl;
  }

  // 2. Fallback HTTPS+WSS via Ngrok Agent na porta 4040 (troca instantânea para o app ativo)
  const ngrokUrl = await startNgrokAgent(proxyPort);
  if (ngrokUrl) {
    return ngrokUrl;
  }

  // 3. Fallback final Bore HTTP
  return await startBore(proxyPort, 'http:');
}

async function startCloudflared(port, protocol = 'http:') {
  const ctx = getRequestContext();
  try {
    const targetScheme = protocol === 'https:' ? 'https' : 'http';
    const noTlsVerify = protocol === 'https:' ? '--no-tls-verify' : '';

    const atomicCfCmd = `
      mkdir -p /tmp/srv_locks_rodrigo 2>/dev/null || true
      (
        flock -x -w 20 9 || exit 1
        if pgrep -af "[c]loudflared" | grep -q "localhost:${port}\\b"; then
          if ! grep -qE "Tunnel server stopped|no more connections active|status 429" /tmp/cf_${port}.log 2>/dev/null; then
            URL=\$(grep -o 'https://[-a-zA-Z0-9]*\\.trycloudflare\\.com' /tmp/cf_${port}.log 2>/dev/null | tail -n 1)
            if [ -n "\$URL" ]; then
              echo "REUSED:\$URL"
              exit 0
            fi
          fi
        fi

        NOW_TS=\$(date +%s)
        COOLDOWN_UNTIL=\$(cat /tmp/cf_rate_limited.until 2>/dev/null || echo 0)
        if [ "\$NOW_TS" -lt "\$COOLDOWN_UNTIL" ]; then
          echo "COOLDOWN"
          exit 1
        fi

        CF_BIN=\$(command -v cloudflared || echo ~/.local/bin/cloudflared)
        [ -x "\$CF_BIN" ] || exit 1
        pgrep -af "[c]loudflared" | grep "localhost:${port}\\b" | awk '{print \$1}' | xargs -r kill -9 2>/dev/null || true
        rm -f /tmp/cf_${port}.log
        nohup \$CF_BIN tunnel --url ${targetScheme}://localhost:${port} ${noTlsVerify} --no-autoupdate </dev/null >/tmp/cf_${port}.log 2>&1 9>&- &
        CF_PID=\$!
        for i in $(seq 1 10); do
          sleep 0.6
          if grep -q "status 429" /tmp/cf_${port}.log 2>/dev/null; then
            echo \$(( \$(date +%s) + 120 )) > /tmp/cf_rate_limited.until
            kill "\$CF_PID" 2>/dev/null || true
            rm -f /tmp/cf_${port}.log
            echo "RATE_LIMITED"
            exit 1
          fi
          URL=\$(grep -o 'https://[-a-zA-Z0-9]*\\.trycloudflare\\.com' /tmp/cf_${port}.log 2>/dev/null | tail -n 1)
          if [ -n "\$URL" ]; then
            echo "CREATED:\$URL"
            exit 0
          fi
        done
        exit 1
      ) 9>/tmp/srv_locks_rodrigo/srv_cf_${port}.lock
    `;

    const cfRes = await runSSH(atomicCfCmd, 15000);
    const out = cfRes.stdout.trim();
    const match = out.match(/(REUSED|CREATED):(https:\/\/[^\s]+)/);
    if (cfRes.code === 0 && match) {
      const [, state, url] = match;
      await logAction(state === 'REUSED' ? 'Tunnel:Reuse' : 'Tunnel:Created', 'success', {
        port,
        provider: 'cloudflared',
        deviceId: ctx.deviceId,
        deviceName: ctx.deviceName,
      });
      return url;
    }
  } catch (_) {
    console.warn(`[Tunnel] Cloudflare Quick Tunnel indisponível para porta ${port}`);
  }
  return null;
}

async function startNgrokAgent(proxyPort) {
  const ctx = getRequestContext();
  try {
    const token = (process.env.NGROK_AUTHTOKEN || '').trim();
    const authSetup = token
      ? `[ -s ~/.config/ngrok/ngrok.yml ] || \$NGROK_BIN config add-authtoken '${token.replace(/'/g, '')}' >/dev/null 2>&1 || true;`
      : '';

    const ngrokCmd = `
      mkdir -p /tmp/srv_locks_rodrigo 2>/dev/null || true
      (
        flock -x -w 15 9 || exit 1
        NGROK_BIN=\$(command -v ngrok || echo ~/.local/bin/ngrok)
        [ -x "\$NGROK_BIN" ] || exit 1
        ${authSetup}
        if ! ss -tlnH "sport = :4040" 2>/dev/null | grep -q .; then
          nohup \$NGROK_BIN http ${proxyPort} --log=stdout </dev/null >/tmp/ngrok_agent.log 2>&1 9>&- &
          for i in $(seq 1 14); do
            sleep 0.5
            URL=\$(curl -s http://127.0.0.1:4040/api/tunnels | grep -oE 'https://[^"]+\\.ngrok[^"]*' | head -n 1 || true)
            if [ -n "\$URL" ]; then
              echo "NGROK_STARTED:\$URL"
              exit 0
            fi
          done
          exit 1
        fi
        URL=\$(python3 -c '
import json, urllib.request, urllib.parse
port_str = "${proxyPort}"
def req(path, method="GET", data=None):
    r = urllib.request.Request("http://127.0.0.1:4040" + path, method=method, data=(json.dumps(data).encode() if data else None), headers={"Content-Type":"application/json"})
    with urllib.request.urlopen(r, timeout=5) as resp:
        return json.loads(resp.read().decode())
tuns = req("/api/tunnels").get("tunnels", [])
for t in tuns:
    if t.get("config", {}).get("addr", "").endswith(":" + port_str) and str(t.get("public_url", "")).startswith("https://"):
        print(t["public_url"])
        raise SystemExit(0)
for t in tuns:
    name = t.get("name")
    if name:
        try: req("/api/tunnels/" + urllib.parse.quote(name), method="DELETE")
        except Exception: pass
res = req("/api/tunnels", method="POST", data={"name": "srv_active", "proto": "http", "addr": "http://127.0.0.1:" + port_str})
print(res.get("public_url", ""))
' 2>/dev/null)
        if [ -n "\$URL" ]; then
          echo "NGROK_SWITCHED:\$URL"
          exit 0
        fi
        exit 1
      ) 9>/tmp/srv_locks_rodrigo/srv_ngrok.lock
    `;

    const res = await runSSH(ngrokCmd, 15000);
    const out = (res.stdout || '').trim();
    const match = out.match(/NGROK_(?:STARTED|SWITCHED):(https:\/\/[^\s]+)/);
    if (res.code === 0 && match) {
      await logAction('Tunnel:Ngrok', 'success', {
        port: proxyPort,
        provider: 'ngrok',
        deviceId: ctx.deviceId,
        deviceName: ctx.deviceName,
      });
      return match[1];
    }
  } catch (_) {
    console.warn(`[Tunnel] Ngrok indisponível para porta ${proxyPort}`);
  }
  return null;
}

async function startBore(port, protocol = 'http:') {
  const ctx = getRequestContext();
  try {
    const atomicBoreCmd = `
      mkdir -p /tmp/srv_locks_rodrigo 2>/dev/null || true
      (
        flock -x -w 20 9 || exit 1
        if pgrep -a "[b]ore" | grep -q "local ${port}\\b"; then
          ADDR=\$(cat /tmp/bore_${port}.log 2>/dev/null | grep -o 'listening at bore.pub:[0-9]*' | tail -n 1 | cut -d' ' -f3)
          if [ -n "\$ADDR" ]; then
            echo "${protocol}//\$ADDR"
            exit 0
          fi
        fi
        pgrep -a "[b]ore" | grep "local ${port}\\b" | awk '{print \$1}' | xargs -r kill -9 2>/dev/null || true
        BORE_BIN=\$(command -v bore || ([ -x /home/rodrigo/bore ] && echo /home/rodrigo/bore) || echo ~/.local/bin/bore)
        nohup \$BORE_BIN local ${port} --to bore.pub </dev/null >/tmp/bore_${port}.log 2>&1 9>&- &
        for i in $(seq 1 7); do
          sleep 0.9
          ADDR=\$(cat /tmp/bore_${port}.log 2>/dev/null | grep -o 'listening at bore.pub:[0-9]*' | tail -n 1 | cut -d' ' -f3)
          if [ -n "\$ADDR" ]; then
            echo "${protocol}//\$ADDR"
            exit 0
          fi
        done
        exit 1
      ) 9>/tmp/srv_locks_rodrigo/srv_bore_${port}.lock
    `;

    const result = await runSSH(atomicBoreCmd, 15000);
    const publicUrl = result.stdout.trim();

    if (result.code === 0 && publicUrl.startsWith('http')) {
      await logAction('Tunnel:Success', 'success', {
        port,
        provider: 'bore',
        deviceId: ctx.deviceId,
        deviceName: ctx.deviceName,
      });
      return publicUrl;
    }
  } catch (err) {
    await logError(err, { context: 'BoreStartFailure', port, deviceId: ctx.deviceId });
  }

  return null;
}

export async function stopNgrok(port = null) {
  const ctx = getRequestContext();
  try {
    if (port) {
      const targetPort = Number(port);
      const proxyPort = targetPort + 10000;
      await logAction('Tunnel:StopPort', 'info', { port: targetPort, proxyPort, deviceId: ctx.deviceId });
      await runSSH(
        `pgrep -af "[c]loudflared" | grep "localhost:${proxyPort}\\b" | awk '{print $1}' | xargs -r kill -9 2>/dev/null || true; ` +
        `pgrep -af "[b]ore" | grep "local ${proxyPort}\\b" | awk '{print $1}' | xargs -r kill -9 2>/dev/null || true`
      );
      return;
    }

    await logAction('Tunnel:StopAllAppTunnels', 'info', { deviceId: ctx.deviceId });
    await runSSH(
      'pgrep -af "[c]loudflared tunnel --url" | grep -v "18022" | awk \'{print $1}\' | xargs -r kill -9 2>/dev/null || true; ' +
      'pkill -x ngrok 2>/dev/null || true; ' +
      'pgrep -af "[b]ore local" | grep -vE "local (22|5432|8090|8095|18022)" | awk \'{print $1}\' | xargs -r kill -9 2>/dev/null || true'
    );
  } catch (_) {
    console.error('[Tunnel] Falha ao parar túnel');
  }
}

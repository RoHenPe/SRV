import { runSSH, getTargetHost, getRequestContext, getCachedTunnels } from './ssh';
import { logError, logAction } from './logger';

/**
 * Inicia um proxy local no servidor (porta `port + 10000`) que:
 * - Desativa verificação de certificado TLS autoassinado (ex: Cockpit 9090)
 * - Reescreve cabeçalhos `Host` e `Origin` para `localhost:PORT` (exigido por CUPS 631 e Cockpit 9090)
 * - Remove `X-Frame-Options` e `Content-Security-Policy` para permitir execução nativa em `<iframe />`
 * - Suporta WebSockets (`Upgrade: websocket`) nativamente, isolamento `srv_env` por dispositivo e ponte Xbox Gamepad (`/__gamepad`)
 */
export async function ensureFrameProxy(port, protocol = 'http:', isHttpsFrontend = true) {
  const proxyPort = Number(port) + 10000;
  const isTlsUpstream = protocol === 'https:' ? '1' : '0';
  const cookieMode = isHttpsFrontend ? 'https' : 'http';

  const setupProxyCmd = `
(
  flock -x -w 15 200 || exit 0
  if [ -f /home/rodrigo/.local/bin/srv_frame_proxy.py ]; then
    cp /home/rodrigo/.local/bin/srv_frame_proxy.py /tmp/srv_frame_proxy.py 2>/dev/null || true
  fi
  if ! ss -tln | grep -q ":${proxyPort} "; then
    nohup python3 /tmp/srv_frame_proxy.py ${proxyPort} ${port} ${isTlsUpstream} ${cookieMode} </dev/null >/tmp/srv_frame_proxy_${proxyPort}.log 2>&1 200>&- &
    for i in 1 2 3 4 5 6; do
      ss -tln | grep -q ":${proxyPort} " && break
      sleep 0.2
    done
  fi
) 200>/tmp/srv_proxy_${proxyPort}.lock
`;
  await runSSH(setupProxyCmd);
  return proxyPort;
}

/**
 * Inicia ou reutiliza um túnel seguro HTTPS (ou proxy local desbloqueador de iframe) para a porta especificada.
 * Totalmente seguro para múltiplos aparelhos simultâneos (compartilha túnel ativo por porta sem derrubar sessões).
 */
export async function startNgrok(port, protocol = 'http:', mode = 'tunnel') {
  const ctx = getRequestContext();
  const proxyPort = Number(port) + 10000;

  if (mode !== 'local_http') {
    const fastCheckCmd = `
      if ss -tln | grep -q ":${port} " && ss -tln | grep -q ":${proxyPort} " && pgrep -a cloudflared | grep -q "localhost:${proxyPort}"; then
        URL=\$(grep -o 'https://[-a-zA-Z0-9]*\\.trycloudflare\\.com' /tmp/cf_${proxyPort}.log 2>/dev/null | head -n 1)
        if [ -n "\$URL" ]; then
          echo "FAST_REUSED:\$URL"
          exit 0
        fi
      fi
      exit 1
    `;
    try {
      const fastRes = await runSSH(fastCheckCmd, 8000);
      const fastMatch = (fastRes.stdout || '').trim().match(/FAST_REUSED:(https:\/\/[^\s]+)/);
      if (fastRes.code === 0 && fastMatch) {
        return fastMatch[1];
      }
    } catch (_) {}
  }

  const verifyPortCmd = `
    for i in $(seq 1 12); do
      if ss -tln | grep -q ":${port} "; then
        exit 0
      fi
      sleep 0.5
    done
    exit 1
  `;
  const portCheck = await runSSH(verifyPortCmd);
  if (portCheck.code !== 0) {
    throw new Error(`Serviço local na porta ${port} não está ouvindo conexões no servidor.`);
  }

  const isHttpsFrontend = mode !== 'local_http';
  await ensureFrameProxy(port, protocol, isHttpsFrontend);

  if (mode === 'local_http') {
    const host = getTargetHost().split(':')[0];
    const localUrl = `http://${host}:${proxyPort}`;
    await logAction('Tunnel:LocalDirect', 'success', {
      port,
      proxyPort,
      url: localUrl,
      deviceId: ctx.deviceId,
      deviceName: ctx.deviceName,
    });
    return localUrl;
  }

  // 1. Tenta Cloudflare Quick Tunnel apontando para o proxyPort
  const cfUrl = await startCloudflared(proxyPort, 'http:');
  if (cfUrl) {
    return cfUrl;
  }

  // 2. Fallback para Ngrok se NGROK_AUTHTOKEN estiver presente
  const token = process.env.NGROK_AUTHTOKEN;
  if (token) {
    try {
      const checkActiveResult = await runSSH('curl -s http://localhost:4040/api/tunnels');
      if (checkActiveResult.code === 0 && checkActiveResult.stdout) {
        const tunnelsObj = JSON.parse(checkActiveResult.stdout);
        const existingTunnel = tunnelsObj.tunnels?.find((t) => t.config?.addr?.endsWith(`:${proxyPort}`));
        if (existingTunnel && existingTunnel.public_url) {
          return existingTunnel.public_url;
        }
      }
    } catch (_) {}
  }

  // 3. Fallback final para Bore (apontando para proxyPort)
  return await startBore(proxyPort, 'http:');
}

async function startCloudflared(port, protocol = 'http:') {
  const ctx = getRequestContext();
  try {
    const targetScheme = protocol === 'https:' ? 'https' : 'http';
    const noTlsVerify = protocol === 'https:' ? '--no-tls-verify' : '';

    const atomicCfCmd = `
      (
        flock -x -w 25 200 || exit 1
        if pgrep -a cloudflared | grep -q "localhost:${port}"; then
          URL=\$(grep -o 'https://[-a-zA-Z0-9]*\\.trycloudflare\\.com' /tmp/cf_${port}.log 2>/dev/null | head -n 1)
          if [ -n "\$URL" ]; then
            echo "REUSED:\$URL"
            exit 0
          fi
        fi

        if ! command -v cloudflared >/dev/null 2>&1 && [ ! -x ~/.local/bin/cloudflared ]; then
          mkdir -p ~/.local/bin
          curl -fsSL -o ~/.local/bin/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
          chmod +x ~/.local/bin/cloudflared
        fi
        CF_BIN=\$(command -v cloudflared || echo ~/.local/bin/cloudflared)
        pgrep -a cloudflared | grep "localhost:${port}" | awk '{print \$1}' | xargs -r kill -9 2>/dev/null || true
        rm -f /tmp/cf_${port}.log
        nohup \$CF_BIN tunnel --url ${targetScheme}://localhost:${port} ${noTlsVerify} --no-autoupdate </dev/null >/tmp/cf_${port}.log 2>&1 200>&- &
        for i in {1..14}; do
          sleep 0.7
          URL=\$(grep -o 'https://[-a-zA-Z0-9]*\\.trycloudflare\\.com' /tmp/cf_${port}.log 2>/dev/null | head -n 1)
          if [ -n "\$URL" ]; then
            echo "CREATED:\$URL"
            exit 0
          fi
        done
        exit 1
      ) 200>/tmp/srv_cf_${port}.lock
    `;

    const cfRes = await runSSH(atomicCfCmd, 20000);
    const out = cfRes.stdout.trim();
    const match = out.match(/(REUSED|CREATED):(https:\/\/[^\s]+)/);
    if (cfRes.code === 0 && match) {
      const [, state, url] = match;
      await logAction(state === 'REUSED' ? 'Tunnel:Reuse' : 'Tunnel:Created', 'success', {
        port,
        url,
        provider: 'cloudflared',
        deviceId: ctx.deviceId,
        deviceName: ctx.deviceName,
      });
      return url;
    }
  } catch (err) {
    console.warn(`[Tunnel] Cloudflare Quick Tunnel indisponível para porta ${port}: ${err.message}`);
  }
  return null;
}

async function startBore(port, protocol = 'http:') {
  const ctx = getRequestContext();
  try {
    const atomicBoreCmd = `
      (
        flock -x -w 20 200 || exit 1
        if pgrep -a bore | grep -q "local ${port}"; then
          ADDR=\$(cat /tmp/bore_${port}.log 2>/dev/null | grep -o 'listening at bore.pub:[0-9]*' | head -n 1 | cut -d' ' -f3)
          if [ -n "\$ADDR" ]; then
            echo "${protocol}//\$ADDR"
            exit 0
          fi
        fi
        pgrep -a bore | grep "local ${port}" | awk '{print \$1}' | xargs -r kill -9 2>/dev/null || true
        BORE_BIN=\$(command -v bore || ([ -x /home/rodrigo/bore ] && echo /home/rodrigo/bore) || echo ~/.local/bin/bore)
        nohup \$BORE_BIN local ${port} --to bore.pub </dev/null >/tmp/bore_${port}.log 2>&1 200>&- &
        for i in {1..7}; do
          sleep 0.9
          ADDR=\$(cat /tmp/bore_${port}.log 2>/dev/null | grep -o 'listening at bore.pub:[0-9]*' | head -n 1 | cut -d' ' -f3)
          if [ -n "\$ADDR" ]; then
            echo "${protocol}//\$ADDR"
            exit 0
          fi
        done
        exit 1
      ) 200>/tmp/srv_bore_${port}.lock
    `;

    const result = await runSSH(atomicBoreCmd, 15000);
    const publicUrl = result.stdout.trim();

    if (result.code === 0 && publicUrl.startsWith('http')) {
      await logAction('Tunnel:Success', 'success', {
        port,
        url: publicUrl,
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

/**
 * Para processos de túnel de uma porta específica (ou temporários se não informada, preservando túneis de sistema 22, 5432, 8095).
 */
export async function stopNgrok(port = null) {
  const ctx = getRequestContext();
  try {
    if (port) {
      const targetPort = Number(port);
      const proxyPort = targetPort + 10000;
      await logAction('Tunnel:StopPort', 'info', { port: targetPort, proxyPort, deviceId: ctx.deviceId });
      await runSSH(
        `pgrep -f "[c]loudflared tunnel.*localhost:${proxyPort}" | xargs kill -9 2>/dev/null || true; ` +
        `pgrep -f "[b]ore local ${proxyPort}" | xargs kill -9 2>/dev/null || true`
      );
      return;
    }

    await logAction('Tunnel:StopAllAppTunnels', 'info', { deviceId: ctx.deviceId });
    await runSSH(
      'pgrep -af "cloudflared tunnel --url" | grep -v "18022" | awk \'{print $1}\' | xargs -r kill -9 2>/dev/null || true; ' +
      'pgrep -f "ngrok http" | grep -v $$ | xargs -r kill -9 2>/dev/null || true; ' +
      'pgrep -af "bore local" | grep -vE "local (22|5432|8090|8095|18022)" | awk \'{print $1}\' | xargs -r kill -9 2>/dev/null || true'
    );
  } catch (err) {
    console.error(`[Tunnel] Falha ao parar túnel: ${err.message}`);
  }
}

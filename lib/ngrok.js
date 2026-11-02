import { runSSH, getTargetHost, getRequestContext } from './ssh';
import { logError, logAction } from './logger';

/**
 * Inicia um proxy local no servidor (porta `port + 10000`) que:
 * - Desativa verificação de certificado TLS autoassinado (ex: Cockpit 9090)
 * - Reescreve cabeçalhos `Host` e `Origin` para `localhost:PORT` (exigido por CUPS 631 e Cockpit 9090)
 * - Remove `X-Frame-Options` e `Content-Security-Policy` para permitir execução nativa em `<iframe />`
 * - Suporta WebSockets (`Upgrade: websocket`) nativamente e múltiplas conexões simultâneas
 */
export async function ensureFrameProxy(port, protocol = 'http:', isHttpsFrontend = true) {
  const proxyPort = Number(port) + 10000;
  const isTlsUpstream = protocol === 'https:' ? '1' : '0';
  const cookieMode = isHttpsFrontend ? 'https' : 'http';

  const setupProxyCmd = `
(
  flock -x -w 15 200 || exit 0
  cat << 'EOF' > /tmp/srv_frame_proxy.py
import asyncio, ssl, sys

LISTEN_PORT = int(sys.argv[1])
TARGET_PORT = int(sys.argv[2])
USE_TLS = sys.argv[3] == "1"
COOKIE_MODE = sys.argv[4] if len(sys.argv) > 4 else "https"
SCHEME = "https" if USE_TLS else "http"

async def pipe(reader, writer):
    try:
        while True:
            data = await reader.read(65536)
            if not data:
                break
            writer.write(data)
            await writer.drain()
    except Exception:
        pass
    finally:
        try:
            writer.close()
        except Exception:
            pass

async def handle_client(client_reader, client_writer):
    upstream_writer = None
    try:
        raw_req = b""
        while b"\\r\\n\\r\\n" not in raw_req:
            chunk = await asyncio.wait_for(client_reader.read(65536), timeout=15)
            if not chunk:
                client_writer.close()
                return
            raw_req += chunk
            if len(raw_req) > 262144:
                break

        head_Bytes, _, rest_req = raw_req.partition(b"\\r\\n\\r\\n")
        lines = head_Bytes.decode("latin-1", errors="ignore").split("\\r\\n")
        req_line = lines[0]
        is_ws = False
        new_headers = [req_line]

        for h in lines[1:]:
            if ":" not in h:
                continue
            k, v = h.split(":", 1)
            kl = k.strip().lower()
            if kl == "upgrade" and "websocket" in v.lower():
                is_ws = True
            if kl in ("host", "origin", "referer", "accept-encoding"):
                continue
            if kl == "connection":
                continue
            new_headers.append(f"{k}: {v.strip()}")

        new_headers.append(f"Host: localhost:{TARGET_PORT}")
        new_headers.append(f"Origin: {SCHEME}://localhost:{TARGET_PORT}")
        new_headers.append(f"Referer: {SCHEME}://localhost:{TARGET_PORT}/")
        if is_ws:
            new_headers.append("Connection: Upgrade")
        else:
            new_headers.append("Connection: close")

        ssl_ctx = None
        if USE_TLS:
            ssl_ctx = ssl._create_unverified_context()

        upstream_reader, upstream_writer = await asyncio.wait_for(
            asyncio.open_connection("127.0.0.1", TARGET_PORT, ssl=ssl_ctx),
            timeout=10
        )

        out_head = ("\\r\\n".join(new_headers) + "\\r\\n\\r\\n").encode("latin-1")
        upstream_writer.write(out_head + rest_req)
        await upstream_writer.drain()

        if is_ws:
            await asyncio.gather(
                pipe(client_reader, upstream_writer),
                pipe(upstream_reader, client_writer)
            )
            return

        content_len = 0
        for h in lines[1:]:
            if h.lower().startswith("content-length:"):
                try:
                    content_len = int(h.split(":", 1)[1].strip())
                except Exception:
                    pass
        remaining = content_len - len(rest_req)
        while remaining > 0:
            chunk = await asyncio.wait_for(client_reader.read(min(65536, remaining)), timeout=15)
            if not chunk:
                break
            upstream_writer.write(chunk)
            await upstream_writer.drain()
            remaining -= len(chunk)

        raw_resp = b""
        while b"\\r\\n\\r\\n" not in raw_resp:
            chunk = await asyncio.wait_for(upstream_reader.read(65536), timeout=30)
            if not chunk:
                break
            raw_resp += chunk
            if len(raw_resp) > 262144:
                break

        if b"\\r\\n\\r\\n" not in raw_resp:
            client_writer.write(raw_resp)
            await client_writer.drain()
            client_writer.close()
            return

        resp_head_bytes, _, resp_body_start = raw_resp.partition(b"\\r\\n\\r\\n")
        resp_lines = resp_head_bytes.decode("latin-1", errors="ignore").split("\\r\\n")
        out_resp_headers = [resp_lines[0]]

        for h in resp_lines[1:]:
            if ":" not in h:
                continue
            k, v = h.split(":", 1)
            kl = k.strip().lower()
            if kl in ("x-frame-options", "content-security-policy", "content-security-policy-report-only"):
                continue
            if kl == "location" and f"localhost:{TARGET_PORT}" in v:
                v = v.replace(f"https://localhost:{TARGET_PORT}", "").replace(f"http://localhost:{TARGET_PORT}", "")
                if not v.strip():
                    v = " /"
            if kl == "set-cookie":
                if COOKIE_MODE == "https":
                    v_clean = v.replace("SameSite=Strict", "SameSite=None").replace("SameSite=Lax", "SameSite=None")
                    if "samesite=none" not in v_clean.lower():
                        v_clean += "; SameSite=None"
                    if "secure" not in v_clean.lower():
                        v_clean += "; Secure"
                    v = v_clean
                else:
                    v = v.replace("; Secure", "").replace("; secure", "")
            out_resp_headers.append(f"{k}: {v.strip()}")

        out_resp_headers.append("Access-Control-Allow-Origin: *")
        client_writer.write(("\\r\\n".join(out_resp_headers) + "\\r\\n\\r\\n").encode("latin-1") + resp_body_start)
        await client_writer.drain()

        await pipe(upstream_reader, client_writer)
    except Exception:
        pass
    finally:
        try:
            client_writer.close()
        except Exception:
            pass
        if upstream_writer:
            try:
                upstream_writer.close()
            except Exception:
                pass

async def main():
    server = await asyncio.start_server(handle_client, "0.0.0.0", LISTEN_PORT)
    async with server:
        await server.serve_forever()

asyncio.run(main())
EOF
  if ! pgrep -f "[s]rv_frame_proxy.py ${proxyPort} " >/dev/null; then
    nohup python3 /tmp/srv_frame_proxy.py ${proxyPort} ${port} ${isTlsUpstream} ${cookieMode} </dev/null >/tmp/srv_frame_proxy_${proxyPort}.log 2>&1 200>&- &
    sleep 0.5
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
  const proxyPort = await ensureFrameProxy(port, protocol, isHttpsFrontend);

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
        if pgrep -f '[c]loudflared tunnel.*localhost:${port}' >/dev/null; then
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
        pgrep -f "[c]loudflared tunnel.*localhost:${port}" | xargs -r kill -9 2>/dev/null || true
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
        if pgrep -f '[b]ore local ${port}' >/dev/null; then
          ADDR=\$(cat /tmp/bore_${port}.log 2>/dev/null | grep -o 'listening at bore.pub:[0-9]*' | head -n 1 | cut -d' ' -f3)
          if [ -n "\$ADDR" ]; then
            echo "${protocol}//\$ADDR"
            exit 0
          fi
        fi
        pgrep -f '[b]ore local ${port}' | xargs -r kill -9 2>/dev/null || true
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
      'pgrep -f "cloudflared tunnel --url" | grep -v $$ | xargs -r kill -9 2>/dev/null || true; ' +
      'pgrep -f "ngrok http" | grep -v $$ | xargs -r kill -9 2>/dev/null || true; ' +
      'pgrep -af "bore local" | grep -vE "local (22|5432|8090|8095)" | awk \'{print $1}\' | xargs -r kill -9 2>/dev/null || true'
    );
  } catch (err) {
    console.error(`[Tunnel] Falha ao parar túnel: ${err.message}`);
  }
}

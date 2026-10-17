import { runSSH } from './ssh';
import { logError, logAction } from './logger';

/**
 * Inicia um túnel seguro HTTPS no servidor remoto para a porta especificada.
 * Ordem de prioridade para funcionar de QUALQUER LUGAR (inclusive dentro de iframes HTTPS na Vercel):
 * 1. Cloudflare Quick Tunnel (`cloudflared` -> gera `https://*.trycloudflare.com` grátis, com SSL real, sem aviso de bloqueio e múltiplos túneis simultâneos)
 * 2. Ngrok (se `NGROK_AUTHTOKEN` estiver configurado)
 * 3. Bore (`bore.pub`, fallback HTTP)
 */
export async function startNgrok(port, protocol = 'http:') {
  // 0. Garante que o serviço local na porta alvo está ativo e ouvindo conexões.
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
    throw new Error(`Serviço local na porta ${port} não está ouvindo conexões no servidor (connection refused).`);
  }

  // 1. Tenta Cloudflare Quick Tunnel primeiro (HTTPS nativo, sem interstitial, ideal para Vercel!)
  const cfUrl = await startCloudflared(port, protocol);
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
        const existingTunnel = tunnelsObj.tunnels?.find(t => t.config?.addr?.endsWith(`:${port}`));
        if (existingTunnel && existingTunnel.public_url) {
          return existingTunnel.public_url;
        }
      }
    } catch (_) {}

    try {
      const target = protocol === 'https:' ? `https://localhost:${port}` : `${port}`;
      const tlsVerifyFlag = protocol === 'https:' ? ' --insecure-skip-tls-verify' : '';
      const setupAndStartCmd = `
        if ! command -v ngrok &> /dev/null; then
          if [ ! -f ~/.local/bin/ngrok ]; then
            mkdir -p ~/.local/bin
            wget -qO /tmp/ngrok.tgz https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-amd64.tgz
            tar -xzf /tmp/ngrok.tgz -C ~/.local/bin
            rm -f /tmp/ngrok.tgz
          fi
        fi
        PATH=$PATH:~/.local/bin ngrok config add-authtoken ${token}
        pgrep -f "ngrok http" | grep -v $$ | xargs kill -9 2>/dev/null || true
        sleep 1.0
        PATH=$PATH:~/.local/bin nohup ngrok http ${target} --host-header=rewrite${tlsVerifyFlag} > /dev/null 2>&1 &
      `;
      await runSSH(setupAndStartCmd);

      const pollCmd = `
        for i in {1..8}; do
          sleep 0.8
          URL=\$(curl -s http://localhost:4040/api/tunnels | grep -o '"public_url":"[^"]*' | head -n 1 | cut -d'"' -f4)
          if [ -n "\$URL" ]; then
            echo "\$URL"
            exit 0
          fi
        done
        exit 1
      `;
      const pollResult = await runSSH(pollCmd);
      const publicUrl = pollResult.stdout.trim();
      if (pollResult.code === 0 && publicUrl.startsWith('http')) {
        await logAction('Tunnel:Success', 'success', { port, protocol, url: publicUrl, provider: 'ngrok' });
        return publicUrl;
      }
    } catch (e) {
      await logError(e, { context: 'NgrokStartFailure', port, protocol });
    }
  }

  // 3. Fallback final para Bore
  return await startBore(port, protocol);
}

/**
 * Inicia ou reutiliza um Cloudflare Quick Tunnel (`https://*.trycloudflare.com`) para a porta informada.
 */
async function startCloudflared(port, protocol = 'http:') {
  try {
    const targetScheme = protocol === 'https:' ? 'https' : 'http';
    const noTlsVerify = protocol === 'https:' ? '--no-tls-verify' : '';

    // 1. Reutiliza túnel cloudflared já aberto para a mesma porta
    const checkCfCmd = `
      if pgrep -f '[c]loudflared tunnel.*localhost:${port}' >/dev/null; then
        URL=\$(grep -o 'https://[-a-zA-Z0-9]*\\.trycloudflare\\.com' /tmp/cf_${port}.log 2>/dev/null | head -n 1)
        if [ -n "\$URL" ]; then
          echo "\$URL"
          exit 0
        fi
      fi
      exit 1
    `;
    const checkRes = await runSSH(checkCfCmd);
    const existingCf = checkRes.stdout.trim();
    if (checkRes.code === 0 && existingCf.startsWith('https://')) {
      await logAction('Tunnel:Reuse', 'success', { port, url: existingCf, provider: 'cloudflared' });
      return existingCf;
    }

    // 2. Instala cloudflared em ~/.local/bin se não existir e abre o túnel HTTPS
    const startCfCmd = `
      if ! command -v cloudflared >/dev/null 2>&1 && [ ! -x ~/.local/bin/cloudflared ]; then
        mkdir -p ~/.local/bin
        curl -fsSL -o ~/.local/bin/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
        chmod +x ~/.local/bin/cloudflared
      fi
      CF_BIN=\$(command -v cloudflared || echo ~/.local/bin/cloudflared)
      pgrep -f "[c]loudflared tunnel.*localhost:${port}" | xargs kill -9 2>/dev/null || true
      rm -f /tmp/cf_${port}.log
      nohup \$CF_BIN tunnel --url ${targetScheme}://localhost:${port} ${noTlsVerify} --no-autoupdate > /tmp/cf_${port}.log 2>&1 &
      for i in {1..12}; do
        sleep 0.7
        URL=\$(grep -o 'https://[-a-zA-Z0-9]*\\.trycloudflare\\.com' /tmp/cf_${port}.log 2>/dev/null | head -n 1)
        if [ -n "\$URL" ]; then
          echo "\$URL"
          exit 0
        fi
      done
      exit 1
    `;
    const cfRes = await runSSH(startCfCmd);
    const cfUrl = cfRes.stdout.trim();
    if (cfRes.code === 0 && cfUrl.startsWith('https://')) {
      await logAction('Tunnel:Success', 'success', { port, url: cfUrl, provider: 'cloudflared' });
      return cfUrl;
    }
  } catch (err) {
    console.warn(`[Tunnel] Cloudflare Quick Tunnel indisponível para porta ${port}: ${err.message}`);
  }
  return null;
}

/**
 * Inicia o Bore no servidor remoto para a porta especificada.
 */
async function startBore(port, protocol = 'http:') {
  try {
    await logAction('Tunnel:StartAttempt', 'info', { port, provider: 'bore' });

    const checkBoreCmd = `
      if pgrep -f '[b]ore local ${port}' >/dev/null; then
        ADDR=\$(cat /tmp/bore_${port}.log 2>/dev/null | grep -o 'listening at bore.pub:[0-9]*' | head -n 1 | cut -d' ' -f3)
        if [ -n "\$ADDR" ]; then
          echo "${protocol}//\$ADDR"
          exit 0
        fi
      fi
      exit 1
    `;
    const checkResult = await runSSH(checkBoreCmd);
    const existingUrl = checkResult.stdout.trim();
    if (checkResult.code === 0 && existingUrl.startsWith('http')) {
      await logAction('Tunnel:Reuse', 'success', { port, url: existingUrl, provider: 'bore' });
      return existingUrl;
    }

    const combinedBoreCmd = `
      pgrep -f '[b]ore local ${port}' | xargs kill -9 2>/dev/null || true
      BORE_BIN=\$(command -v bore || ([ -x /home/rodrigo/bore ] && echo /home/rodrigo/bore) || echo ~/.local/bin/bore)
      nohup \$BORE_BIN local ${port} --to bore.pub > /tmp/bore_${port}.log 2>&1 &
      for i in {1..6}; do
        sleep 1.0
        ADDR=\$(cat /tmp/bore_${port}.log 2>/dev/null | grep -o 'listening at bore.pub:[0-9]*' | head -n 1 | cut -d' ' -f3)
        if [ -n "\$ADDR" ]; then
          echo "${protocol}//\$ADDR"
          exit 0
        fi
      done
      exit 1
    `;

    const result = await runSSH(combinedBoreCmd);
    const publicUrl = result.stdout.trim();

    if (result.code === 0 && publicUrl.startsWith('http')) {
      await logAction('Tunnel:Success', 'success', { port, url: publicUrl, provider: 'bore' });
      return publicUrl;
    }
  } catch (err) {
    console.error(`[Tunnel] Falha ao iniciar Bore: ${err.message}`);
    await logError(err, { context: 'BoreStartFailure', port });
  }

  return null;
}

/**
 * Para processos de túnel temporários de aplicações (preservando o túnel SSH na porta 22!).
 */
export async function stopNgrok() {
  try {
    await logAction('Tunnel:Stop', 'info');
    await runSSH(
      'pgrep -f "cloudflared tunnel --url" | grep -v $$ | xargs kill -9 2>/dev/null || true; ' +
      'pgrep -f "ngrok http" | grep -v $$ | xargs kill -9 2>/dev/null || true; ' +
      'main_pid=$(systemctl show -p MainPID --value bore-tunnel 2>/dev/null || echo "0"); ' +
      'if [ -n "$main_pid" ] && [ "$main_pid" -gt 0 ]; then ' +
      '  pgrep -f "bore local" | grep -v "local 22" | grep -v "$main_pid" | grep -v $$ | xargs kill -9 2>/dev/null || true; ' +
      'else ' +
      '  pgrep -f "bore local" | grep -v "local 22" | grep -v $$ | xargs kill -9 2>/dev/null || true; ' +
      'fi && sleep 0.5 || true'
    );
  } catch (err) {
    console.error(`[Tunnel] Falha ao parar os túneis: ${err.message}`);
  }
}

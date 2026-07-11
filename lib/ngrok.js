import { runSSH } from './ssh';
import { logError, logAction } from './logger';

/**
 * Inicia o Ngrok no servidor remoto para a porta especificada.
 * Se falhar ou se NGROK_AUTHTOKEN não estiver configurado, faz fallback automático para Bore.
 * Retorna a URL pública gerada ou null se ambos falharem.
 */
export async function startNgrok(port, protocol = 'http:') {
  const token = process.env.NGROK_AUTHTOKEN;

  // 1. Verifica se já existe um túnel ativo no Ngrok para esta mesma porta
  try {
    const checkActiveResult = await runSSH('curl -s http://localhost:4040/api/tunnels');
    if (checkActiveResult.code === 0 && checkActiveResult.stdout) {
      const tunnelsObj = JSON.parse(checkActiveResult.stdout);
      const existingTunnel = tunnelsObj.tunnels?.find(t => t.config?.addr?.endsWith(`:${port}`));
      if (existingTunnel && existingTunnel.public_url) {
        const publicUrl = existingTunnel.public_url;
        await logAction('Tunnel:Reuse', 'success', { port, protocol, url: publicUrl, provider: 'ngrok' });
        console.log(`[Tunnel] Reutilizando túnel ativo do Ngrok: ${publicUrl}`);
        return publicUrl;
      }
    }
  } catch (err) {
    // Falha silenciosa na verificação de túnel ativo
    console.warn(`[Tunnel] Falha ao verificar túnel ativo: ${err.message}`);
  }

  if (token) {
    try {
      console.log(`[Tunnel] Tentando iniciar Ngrok na porta ${port}...`);
      await logAction('Tunnel:StartAttempt', 'info', { port, protocol, provider: 'ngrok' });
      
      const target = protocol === 'https:' ? `https://localhost:${port}` : `${port}`;
      const tlsVerifyFlag = protocol === 'https:' ? ' --insecure-skip-tls-verify' : '';
      
      // Concatena toda a verificação, configuração e início em um único comando SSH.
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
        sleep 1.2
        PATH=$PATH:~/.local/bin nohup ngrok http ${target} --host-header=rewrite${tlsVerifyFlag} > /dev/null 2>&1 &
      `;
      
      await runSSH(setupAndStartCmd);

      // Polling otimizado: 8 tentativas de 0.8s (total ~6.4s)
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
        console.log(`[Tunnel] Ngrok iniciado com sucesso: ${publicUrl}`);
        await logAction('Tunnel:Success', 'success', { port, protocol, url: publicUrl, provider: 'ngrok' });
        return publicUrl;
      } else {
        throw new Error(`Falha no polling da API local do Ngrok (código: ${pollResult.code}, stdout: ${publicUrl})`);
      }
    } catch (e) {
      console.warn(`[Tunnel] Falha ao iniciar Ngrok: ${e.message}. Tentando fallback para Bore...`);
      await logError(e, { context: 'NgrokStartFailure', port, protocol });
    }
  } else {
    console.log(`[Tunnel] NGROK_AUTHTOKEN não configurado. Usando Bore para o túnel na porta ${port}...`);
  }

  // Fallback para Bore
  return await startBore(port, protocol);
}

/**
 * Inicia o Bore no servidor remoto para a porta especificada.
 */
async function startBore(port, protocol = 'http:') {
  try {
    await logAction('Tunnel:StartAttempt', 'info', { port, provider: 'bore' });

    // 1. Verifica se o Bore já está escutando na porta correspondente
    const checkBoreCmd = `
      ADDR=\$(cat /tmp/bore_${port}.log 2>/dev/null | grep -o 'listening at bore.pub:[0-9]*' | head -n 1 | cut -d' ' -f3)
      if [ -n "\$ADDR" ]; then
        echo "${protocol}//\$ADDR"
        exit 0
      fi
      exit 1
    `;
    const checkResult = await runSSH(checkBoreCmd);
    const existingUrl = checkResult.stdout.trim();
    if (checkResult.code === 0 && existingUrl.startsWith('http')) {
      console.log(`[Tunnel] Reutilizando túnel ativo do Bore: ${existingUrl}`);
      await logAction('Tunnel:Reuse', 'success', { port, url: existingUrl, provider: 'bore' });
      return existingUrl;
    }

    // 2. Inicia e faz o polling do Bore (6 tentativas de 1.0s)
    const combinedBoreCmd = `
      pgrep -f 'bore local ${port}' | grep -v $$ | xargs kill -9 2>/dev/null || true
      rm -f /tmp/bore_${port}.log
      nohup /home/rodrigo/bore local ${port} --to bore.pub > /tmp/bore_${port}.log 2>&1 &
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
      console.log(`[Tunnel] Bore iniciado com sucesso: ${publicUrl}`);
      await logAction('Tunnel:Success', 'success', { port, url: publicUrl, provider: 'bore' });
      return publicUrl;
    } else {
      throw new Error(`Falha no polling do arquivo de log do Bore (código: ${result.code}, stdout: ${publicUrl})`);
    }
  } catch (err) {
    console.error(`[Tunnel] Falha crítica ao iniciar Bore: ${err.message}`);
    await logError(err, { context: 'BoreStartFailure', port });
  }

  return null;
}

/**
 * Para qualquer processo de túnel (Ngrok ou Bore) rodando no servidor.
 */
export async function stopNgrok() {
  try {
    await logAction('Tunnel:Stop', 'info');
    await runSSH(
      'pgrep -f "ngrok http" | grep -v $$ | xargs kill -9 2>/dev/null || true; ' +
      'main_pid=$(systemctl show -p MainPID --value bore-tunnel 2>/dev/null || echo "0"); ' +
      'if [ -n "$main_pid" ] && [ "$main_pid" -gt 0 ]; then ' +
      '  pgrep -f "bore local" | grep -v "local 22" | grep -v "$main_pid" | grep -v $$ | xargs kill -9 2>/dev/null || true; ' +
      'else ' +
      '  pgrep -f "bore local" | grep -v "local 22" | grep -v $$ | xargs kill -9 2>/dev/null || true; ' +
      'fi && sleep 1 || true'
    );
  } catch (err) {
    console.error(`[Tunnel] Falha ao parar os túneis: ${err.message}`);
  }
}

import { runSSH } from './ssh';

/**
 * Inicia o Ngrok no servidor remoto para a porta especificada.
 * Se falhar ou se NGROK_AUTHTOKEN não estiver configurado, faz fallback automático para Bore.
 * Retorna a URL pública gerada ou null se ambos falharem.
 */
export async function startNgrok(port, protocol = 'http:') {
  const token = process.env.NGROK_AUTHTOKEN;

  if (token) {
    try {
      console.log(`[Tunnel] Tentando iniciar Ngrok na porta ${port}...`);
      
      const target = protocol === 'https:' ? `https://localhost:${port}` : `${port}`;
      
      // Concatena toda a verificação, configuração e início em um único comando SSH.
      // IMPORTANTE: Killamos qualquer "ngrok http" anterior para liberar o slot da conta gratuita (limite de 1 túnel).
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
        pkill -f "ngrok http" || true
        PATH=$PATH:~/.local/bin nohup ngrok http ${target} > /dev/null 2>&1 &
      `;
      
      await runSSH(setupAndStartCmd);

      // Executa o loop de polling diretamente no servidor remoto para evitar conexões repetidas.
      // Limitado a 3 iterações (3s) para evitar timeouts de 10s da Vercel no fallback.
      const pollCmd = `
        for i in {1..3}; do
          sleep 1
          URL=$(curl -s http://localhost:4040/api/tunnels | grep -o '"public_url":"[^"]*' | head -n 1 | cut -d'"' -f4)
          if [ -n "$URL" ]; then
            echo "$URL"
            exit 0
          fi
        done
        exit 1
      `;
      
      const pollResult = await runSSH(pollCmd);
      const publicUrl = pollResult.stdout.trim();
      
      if (pollResult.code === 0 && publicUrl.startsWith('http')) {
        console.log(`[Tunnel] Ngrok iniciado com sucesso: ${publicUrl}`);
        return publicUrl;
      }
    } catch (e) {
      console.warn(`[Tunnel] Falha ao iniciar Ngrok: ${e.message}. Tentando fallback para Bore...`);
    }
  } else {
    console.log(`[Tunnel] NGROK_AUTHTOKEN não configurado. Usando Bore para o túnel na porta ${port}...`);
  }

  // Fallback para Bore
  return await startBore(port);
}

/**
 * Inicia o Bore no servidor remoto para a porta especificada.
 */
async function startBore(port) {
  try {
    // Inicia e faz o polling do Bore em um único comando SSH.
    // Limitado a 3 iterações (3s) para evitar timeouts de 10s da Vercel.
    const combinedBoreCmd = `
      pkill -f 'bore local ${port}' || true
      rm -f /tmp/bore_${port}.log
      nohup ~/bore local ${port} --to bore.pub > /tmp/bore_${port}.log 2>&1 &
      for i in {1..3}; do
        sleep 1
        ADDR=$(cat /tmp/bore_${port}.log 2>/dev/null | grep -o 'listening at bore.pub:[0-9]*' | head -n 1 | cut -d' ' -f3)
        if [ -n "$ADDR" ]; then
          echo "http://$ADDR"
          exit 0
        fi
      done
      exit 1
    `;

    const result = await runSSH(combinedBoreCmd);
    const publicUrl = result.stdout.trim();

    if (result.code === 0 && publicUrl.startsWith('http')) {
      console.log(`[Tunnel] Bore iniciado com sucesso: ${publicUrl}`);
      return publicUrl;
    }
  } catch (err) {
    console.error(`[Tunnel] Falha crítica ao iniciar Bore: ${err.message}`);
  }

  return null;
}

/**
 * Para qualquer processo de túnel (Ngrok ou Bore) rodando no servidor.
 */
export async function stopNgrok() {
  await runSSH(
    'pkill -f "ngrok http" || true; ' +
    'main_pid=$(systemctl show -p MainPID --value bore-tunnel 2>/dev/null || echo "0"); ' +
    'if [ -n "$main_pid" ] && [ "$main_pid" -gt 0 ]; then ' +
    '  pgrep -f "bore local" | grep -v "$main_pid" | xargs kill 2>/dev/null || true; ' +
    'else ' +
    '  pkill -f "bore local" || true; ' +
    'fi && sleep 1 || true'
  );
}

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
      
      // Verificar se ngrok está instalado; se não, baixa no diretório do usuário
      const checkCmd = `
        if ! command -v ngrok &> /dev/null; then
          if [ ! -f ~/.local/bin/ngrok ]; then
            mkdir -p ~/.local/bin
            wget -qO /tmp/ngrok.tgz https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-amd64.tgz
            tar -xzf /tmp/ngrok.tgz -C ~/.local/bin
            rm /tmp/ngrok.tgz
          fi
        fi
      `;
      await runSSH(checkCmd);

      // Configurar token
      await runSSH(`PATH=$PATH:~/.local/bin ngrok config add-authtoken ${token}`);

      // Parar qualquer instância anterior
      await stopNgrok();

      // Iniciar em background
      const target = protocol === 'https:' ? `https://localhost:${port}` : `${port}`;
      const startCmd = `PATH=$PATH:~/.local/bin nohup ngrok http ${target} > /dev/null 2>&1 &`;
      await runSSH(startCmd);

      // Aguardar e extrair a URL pública da API local do Ngrok (max 6 segundos)
      let publicUrl = null;
      for (let i = 0; i < 6; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        try {
          const res = await runSSH(`curl -s http://localhost:4040/api/tunnels`);
          if (res && res.stdout) {
            const data = JSON.parse(res.stdout);
            if (data && data.tunnels && data.tunnels.length > 0) {
              // Encontra o túnel que corresponde exatamente à porta solicitada
              const targetTunnel = data.tunnels.find(t => 
                t.public_url && 
                t.public_url.startsWith('https://') &&
                t.config &&
                t.config.addr &&
                (t.config.addr.includes(`:${port}`) || t.config.addr === String(port))
              );
              if (targetTunnel) {
                publicUrl = targetTunnel.public_url;
                break;
              }
            }
          }
        } catch (err) {
          // Ignora erro de conexão temporário
        }
      }

      if (publicUrl) {
        console.log(`[Tunnel] Ngrok iniciado com sucesso: ${publicUrl}`);
        return publicUrl;
      }
    } catch (e) {
      console.warn(`[Tunnel] Falha ao iniciar Ngrok: ${e.message}. Tentando fallback para Bore...`);
    }
  } else {
    console.log(`[Tunnel] NGROK_AUTHTOKEN não configurado. Usando Bore para o túnel na porta ${port}...`);
  }

  // Fallback para Bore (túnel TCP leve e gratuito que já está no servidor)
  return await startBore(port);
}

/**
 * Inicia o Bore no servidor remoto para a porta especificada.
 */
async function startBore(port) {
  try {
    await runSSH(`pkill -f 'bore local ${port}' || true`);
    
    // Inicia o bore apontando para o servidor público bore.pub
    const startCmd = `nohup ~/bore local ${port} --to bore.pub > /tmp/bore_${port}.log 2>&1 &`;
    await runSSH(startCmd);

    // Aguarda e analisa a saída do log para extrair a porta atribuída
    let publicUrl = null;
    for (let i = 0; i < 6; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const logCheck = await runSSH(`cat /tmp/bore_${port}.log 2>/dev/null || true`);
      const logContent = logCheck.stdout || '';
      
      const match = logContent.match(/listening at (bore\.pub:[0-9]+)/);
      if (match && match[1]) {
        publicUrl = `http://${match[1]}`;
        break;
      }
    }

    if (publicUrl) {
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

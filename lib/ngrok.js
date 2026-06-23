import { runSSH } from './ssh';

/**
 * Inicia o Ngrok no servidor remoto para a porta especificada.
 * Retorna a URL pública gerada ou null se falhar.
 */
export async function startNgrok(port, protocol = 'http:') {
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

  // Configurar token se existir nas variáveis de ambiente
  const token = process.env.NGROK_AUTHTOKEN;
  if (token) {
    await runSSH(`PATH=$PATH:~/.local/bin ngrok config add-authtoken ${token}`);
  }

  // Parar qualquer instância anterior
  await stopNgrok();

  // Iniciar nova instância em background
  const target = protocol === 'https:' ? `https://localhost:${port}` : `${port}`;
  const startCmd = `PATH=$PATH:~/.local/bin nohup ngrok http ${target} > /dev/null 2>&1 &`;
  await runSSH(startCmd);

  // Aguardar e extrair a URL pública da API local do Ngrok (max 10 segundos)
  let publicUrl = null;
  for (let i = 0; i < 10; i++) {
    // Aguarda 1 segundo
    await new Promise(resolve => setTimeout(resolve, 1000));
    try {
      const res = await runSSH(`curl -s http://localhost:4040/api/tunnels`);
      if (res && res.stdout) {
        const data = JSON.parse(res.stdout);
        if (data && data.tunnels && data.tunnels.length > 0) {
          publicUrl = data.tunnels[0].public_url;
          break;
        }
      }
    } catch (err) {
      // Ignora e tenta novamente
    }
  }

  return publicUrl;
}

/**
 * Para qualquer processo do Ngrok rodando no servidor.
 */
export async function stopNgrok() {
  await runSSH(`pkill -f "ngrok http" || true`);
}

import { runSSH, getTargetHost, apiHandler } from '@/lib/ssh';
import { startNgrok } from '@/lib/ngrok';

// POST /api/sandbox/antigravity — inicia ttyd com interpreter no host
export async function POST(request) {
  return apiHandler(
    async () => {
      // Para qualquer ttyd rodando no interpreter
      await runSSH("pkill -f 'ttyd -W -p 7685' || true");
      // Inicia ttyd com interpreter no host
      await runSSH("nohup ttyd -W -p 7685 /home/rodrigo/.local/bin/interpreter > /dev/null 2>&1 &");
      const host = getTargetHost();
      const ngrokUrl = await startNgrok(7685);
      return {
        ok: true,
        message: 'Agente Antigravity iniciado!',
        url: ngrokUrl ? ngrokUrl + "" : `http://${host}:7685`,
      };
    },
    request,
    'POST /api/sandbox/antigravity'
  );
}

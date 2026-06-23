import { apiHandler } from '@/lib/ssh';
import { startNgrok, stopNgrok } from '@/lib/ngrok';

export async function POST(request) {
  return apiHandler(
    async () => {
      const { port, protocol, action } = await request.json();
      
      if (action === 'stop') {
        await stopNgrok();
        return { ok: true, message: 'Tunnel parado' };
      }

      if (!port) {
        throw new Error('Porta não informada.');
      }

      const url = await startNgrok(port, protocol);
      if (!url) {
        throw new Error('Não foi possível obter a URL pública do Ngrok. Verifique o NGROK_AUTHTOKEN no .env.');
      }

      return {
        ok: true,
        url
      };
    },
    request,
    'POST /api/tunnel'
  );
}

import { runSSH, apiHandler } from '@/lib/ssh';

export async function POST(request) {
  return apiHandler(
    async () => {
      const result = await runSSH('sudo reboot');
      return { message: 'Servidor está reiniciando...', output: result.stdout };
    },
    request,
    'POST /api/power/reboot'
  );
}

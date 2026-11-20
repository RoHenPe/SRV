import { runSSH, apiHandler } from '@/lib/ssh';

export async function POST(request) {
  return apiHandler(
    async () => {
      await runSSH('sudo -n reboot');
      return { message: 'Servidor está reiniciando...' };
    },
    request,
    'POST /api/power/reboot',
    { roles: ['admin'] }
  );
}

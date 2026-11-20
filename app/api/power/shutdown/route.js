import { runSSH, apiHandler } from '@/lib/ssh';

export async function POST(request) {
  return apiHandler(
    async () => {
      await runSSH('sudo -n poweroff');
      return { message: 'Servidor está desligando...' };
    },
    request,
    'POST /api/power/shutdown',
    { roles: ['admin'] }
  );
}

import { runSSH, apiHandler } from '@/lib/ssh';

// POST /api/docker/restart-service (Admin apenas)
export async function POST(request) {
  return apiHandler(
    async () => {
      const result = await runSSH('sudo -n systemctl restart docker');
      return { message: 'Serviço Docker reiniciado.', output: result.stdout };
    },
    request,
    'POST /api/docker/restart-service',
    { roles: ['admin'] }
  );
}

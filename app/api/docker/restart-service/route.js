import { runSSH, apiHandler } from '@/lib/ssh';

// POST /api/docker/restart-service
export async function POST() {
  return apiHandler(async () => {
    const result = await runSSH('sudo systemctl restart docker');
    return { message: 'Serviço Docker reiniciado.', output: result.stdout };
  });
}

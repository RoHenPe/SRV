import { apiHandler } from '@/lib/ssh';
import { listDockerContainers } from '@/lib/docker';

// GET /api/docker/ps — containers ativos
export async function GET(request) {
  return apiHandler(
    async () => {
      const containers = await listDockerContainers(false);
      return { containers };
    },
    request,
    'GET /api/docker/ps'
  );
}

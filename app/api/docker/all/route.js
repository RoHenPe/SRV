import { apiHandler } from '@/lib/ssh';
import { listDockerContainers } from '@/lib/docker';

// GET /api/docker/all — todos os containers (incluindo parados)
export async function GET(request) {
  return apiHandler(
    async () => {
      const containers = await listDockerContainers(true);
      return { containers };
    },
    request,
    'GET /api/docker/all'
  );
}

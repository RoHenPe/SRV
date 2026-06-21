import { runSSH, apiHandler } from '@/lib/ssh';

// GET /api/docker/all — todos os containers (incluindo parados)
export async function GET(request) {
  return apiHandler(
    async () => {
      const result = await runSSH("sudo docker ps -a --format '{{json .}}'");
      const containers = result.stdout
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          try { return JSON.parse(line); }
          catch { return null; }
        })
        .filter(Boolean);
      return { containers };
    },
    request,
    'GET /api/docker/all'
  );
}

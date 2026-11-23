import { runSSH, apiHandler } from '@/lib/ssh';
import { sanitizeSensitiveText, isValidDockerName } from '@/lib/sanitize';

// GET /api/docker/logs?name=container_name
export async function GET(request) {
  return apiHandler(
    async () => {
      const { searchParams } = new URL(request.url);
      const name = (searchParams.get('name') || '').trim();
      if (!isValidDockerName(name)) {
        throw new Error('O parâmetro "name" é obrigatório e deve conter apenas caracteres válidos.');
      }

      const result = await runSSH(`docker logs --tail 100 -- ${name}`);
      const logs = sanitizeSensitiveText((result.stdout + '\n' + result.stderr).trim());
      return { output: logs || 'Sem logs.' };
    },
    request,
    'GET /api/docker/logs'
  );
}

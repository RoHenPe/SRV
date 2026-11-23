import { runSSH, apiHandler } from '@/lib/ssh';
import { sanitizeSensitiveText, isValidDockerName } from '@/lib/sanitize';

export async function POST(request) {
  return apiHandler(
    async () => {
      const { name: rawName } = await request.json();
      const name = String(rawName || '').trim();
      if (!isValidDockerName(name)) {
        throw new Error('Nome de container inválido ou ausente.');
      }
      const result = await runSSH(`docker unpause ${name} >/dev/null 2>&1 || true; docker stop ${name}`);
      if (result.code !== 0) {
        throw new Error(`Falha ao parar container ${name}.`);
      }
      return { message: `Container "${name}" parado.`, output: sanitizeSensitiveText(result.stdout) };
    },
    request,
    'POST /api/docker/stop'
  );
}

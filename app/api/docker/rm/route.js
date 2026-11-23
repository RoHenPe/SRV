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
      const result = await runSSH(`docker rm -f ${name}`);
      if (result.code !== 0) {
        throw new Error(`Falha ao remover container ${name}.`);
      }
      return { message: `Container "${name}" removido.`, output: sanitizeSensitiveText(result.stdout) };
    },
    request,
    'POST /api/docker/rm',
    { roles: ['admin'] }
  );
}

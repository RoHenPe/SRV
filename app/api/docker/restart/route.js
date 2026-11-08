import { runSSH, apiHandler } from '@/lib/ssh';

const CONTAINER_NAME_RE = /^[a-zA-Z0-9_.-]{1,128}$/;

// POST /api/docker/restart  body: { name: "container_name" }
export async function POST(request) {
  return apiHandler(
    async () => {
      const { name: rawName } = await request.json();
      const name = String(rawName || '').trim();
      if (!name || !CONTAINER_NAME_RE.test(name)) {
        throw new Error('Campo "name" inválido ou ausente.');
      }

      const result = await runSSH(`docker unpause ${name} >/dev/null 2>&1 || true; docker restart ${name}`);
      if (result.code !== 0) {
        throw new Error(result.stderr || result.stdout || `Falha ao reiniciar container ${name}`);
      }
      return { message: `Container "${name}" reiniciado.`, output: result.stdout };
    },
    request,
    'POST /api/docker/restart'
  );
}

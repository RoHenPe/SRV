import { runSSH, apiHandler } from '@/lib/ssh';

// POST /api/maintenance/update — atualiza o OS (apt-get)
export async function POST(request) {
  return apiHandler(
    async () => {
      const result = await runSSH(
        'sudo apt-get update -y && sudo apt-get upgrade -y 2>&1 | tail -30'
      );
      return {
        message: 'Atualização do sistema iniciada.',
        output: result.stdout || result.stderr,
      };
    },
    request,
    'POST /api/maintenance/update'
  );
}

import { runSSH, apiHandler } from '@/lib/ssh';

// POST /api/maintenance/update — atualiza o OS (apt-get)
export async function POST(request) {
  return apiHandler(
    async () => {
      const result = await runSSH(
        'sudo DEBIAN_FRONTEND=noninteractive apt-get update -y && sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" 2>&1 | tail -30',
        45000
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

import { runSSH, apiHandler } from '@/lib/ssh';
import { sanitizeSensitiveText } from '@/lib/sanitize';

// POST /api/docker/restart-service (Admin apenas)
export async function POST(request) {
  return apiHandler(
    async () => {
      const result = await runSSH('sudo -n systemctl restart docker');
      if (result.code !== 0) {
        throw new Error('Falha ao reiniciar o serviço Docker.');
      }
      return {
        message: 'Serviço Docker reiniciado.',
        output: sanitizeSensitiveText(result.stdout || result.stderr || ''),
      };
    },
    request,
    'POST /api/docker/restart-service',
    { roles: ['admin'] }
  );
}

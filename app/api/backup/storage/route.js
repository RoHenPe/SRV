import { runSSH, apiHandler } from '@/lib/ssh';
import { sanitizeSensitiveText } from '@/lib/sanitize';

// GET /api/backup/storage — status de armazenamento do servidor
export async function GET(request) {
  return apiHandler(
    async () => {
      const result = await runSSH(
        "df -h | grep -E '^/dev/|/mnt/|/media/'; echo '---'; mountpoint -q /mnt/hd_externo && echo 'EXTERNAL_MOUNTED=true' || echo 'EXTERNAL_MOUNTED=false'"
      );
      const externalMounted = (result.stdout || '').includes('EXTERNAL_MOUNTED=true');
      return {
        output: sanitizeSensitiveText(result.stdout || 'Sem dados de storage disponíveis.'),
        externalMounted,
      };
    },
    request,
    'GET /api/backup/storage'
  );
}

import { runSSH, apiHandler } from '@/lib/ssh';
import { sanitizeSensitiveText } from '@/lib/sanitize';

// GET /api/backup/storage — status de armazenamento do servidor
export async function GET(request) {
  return apiHandler(
    async () => {
      const result = await runSSH(
        "(timeout 4 df -lhP -x overlay -x tmpfs -x devtmpfs -x squashfs 2>/dev/null || df -lh) | grep -E '^/dev/|/mnt/|/media/'; echo '---'; if findmnt -rn -o FSTYPE /mnt/hd_externo 2>/dev/null | tail -n 1 | grep -qEv '^(autofs|)$'; then echo 'EXTERNAL_MOUNTED=true'; else echo 'EXTERNAL_MOUNTED=false'; fi"
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

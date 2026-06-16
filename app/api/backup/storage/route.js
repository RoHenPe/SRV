import { runSSH, apiHandler } from '@/lib/ssh';

// GET /api/backup/storage — status de armazenamento do servidor
export async function GET() {
  return apiHandler(async () => {
    const result = await runSSH("df -h | grep -E '/dev/sd|/mnt/'");
    return { output: result.stdout || 'Sem dados de storage disponíveis.' };
  });
}

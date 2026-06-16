import { runSSH, apiHandler } from '@/lib/ssh';

// POST /api/maintenance/clean — remove arquivos temporários
export async function POST() {
  return apiHandler(async () => {
    const result = await runSSH(
      "find /home/rodrigo -maxdepth 2 \\( -name '*test*' -o -name '*tmp*' -o -name '*junk*' \\) -exec rm -rf {} + 2>&1; echo 'Limpeza concluída.'"
    );
    return { message: 'Limpeza executada.', output: result.stdout };
  });
}

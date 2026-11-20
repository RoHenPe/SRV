import { runSSH, apiHandler } from '@/lib/ssh';

// POST /api/maintenance/clean — remove arquivos temporários (Admin apenas)
export async function POST(request) {
  return apiHandler(
    async () => {
      const cleanCmd = `
        echo "=== Limpando Imagens e Cache Docker ===" && (docker image prune -f 2>&1 && docker builder prune -f 2>&1 || true) &&
        echo "=== Limpando Cache APT ===" && (sudo -n apt-get clean 2>&1 || true) &&
        echo "=== Limpando Arquivos Temporários /tmp ===" && (rm -f /tmp/bore_*.log /tmp/ngrok.tgz /tmp/*.tmp 2>/dev/null || true) &&
        echo "=== Otimizando Journal ===" && (sudo -n journalctl --vacuum-size=50M 2>&1 || true) &&
        echo "=== Limpeza concluída com sucesso! ==="
      `;
      const result = await runSSH(cleanCmd);
      return { message: 'Limpeza executada com sucesso.', output: result.stdout };
    },
    request,
    'POST /api/maintenance/clean',
    { roles: ['admin'] }
  );
}

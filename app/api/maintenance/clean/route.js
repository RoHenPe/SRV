import { runSSH, apiHandler } from '@/lib/ssh';

// POST /api/maintenance/clean — remove arquivos temporários
export async function POST(request) {
  return apiHandler(
    async () => {
      const cleanCmd = `
        echo "=== Limpando Docker ===" && (sudo docker system prune -f 2>&1 || true) &&
        echo "=== Limpando Cache APT ===" && (sudo apt-get clean 2>&1 || true) &&
        echo "=== Limpando Logs /tmp ===" && (rm -f /tmp/bore_*.log /tmp/ngrok.tgz /tmp/*.tmp 2>/dev/null || true) &&
        echo "=== Otimizando Journal ===" && (sudo journalctl --vacuum-size=50M 2>&1 || true) &&
        echo "=== Limpeza concluída com sucesso! ==="
      `;
      const result = await runSSH(cleanCmd);
      return { message: 'Limpeza executada com sucesso.', output: result.stdout };
    },
    request,
    'POST /api/maintenance/clean'
  );
}

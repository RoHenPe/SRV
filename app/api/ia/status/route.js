import { runSSH, apiHandler } from '@/lib/ssh';

// GET /api/ia/status — status do serviço Ollama e modelos carregados em RAM
export async function GET(request) {
  return apiHandler(
    async () => {
      const result = await runSSH(
        '(systemctl is-active --quiet ollama || sudo systemctl start ollama 2>/dev/null || true) && echo "=== MODELOS EM RAM (ollama ps) ===" && (ollama ps 2>&1 || true) && echo "" && echo "=== SERVIÇO SYSTEMD ===" && systemctl status ollama --no-pager -l'
      );
      return { output: result.stdout || result.stderr };
    },
    request,
    'GET /api/ia/status'
  );
}

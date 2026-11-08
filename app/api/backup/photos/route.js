import { runSSH, getTargetHost, getCachedTunnels, apiHandler } from '@/lib/ssh';

// POST /api/backup/photos — executa sincronização de fotos do Google Fotos
export async function POST(request) {
  return apiHandler(
    async () => {
      // 1. Inicia Webtop se não estiver rodando
      await runSSH(
        "if ! docker ps --format '{{.Names}}' | grep -q '^srv_webtop_sandbox$'; then " +
        "docker rm -f srv_webtop_sandbox >/dev/null 2>&1 || true; " +
        "docker run -d --privileged --name=srv_webtop_sandbox -p 3000:3000 -p 3001:3001 -p 9222:9222 " +
        "-v /home/rodrigo/webtop_config:/config -v /home/rodrigo:/storage --shm-size=2gb " +
        "srv-webtop-antigravity:latest; " +
        "sleep 3; " +
        "fi"
      );

      // 2. Garante redirect.html e servidor HTTP Python na porta 8085 do Webtop
      await runSSH(
        "if [ ! -f /home/rodrigo/redirect.html ]; then " +
        "cat << 'EOF' > /home/rodrigo/redirect.html\n" +
        "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><script>(function(){var u=new URLSearchParams(window.location.search).get('url');if(u)window.location.replace(u);})();</script></head><body>Redirecionando...</body></html>\n" +
        "EOF\n" +
        "fi && " +
        "docker cp /home/rodrigo/redirect.html srv_webtop_sandbox:/config/redirect.html && " +
        "docker exec srv_webtop_sandbox chown abc:abc /config/redirect.html && " +
        "if ! docker exec srv_webtop_sandbox ps aux | grep -q '[m].server 8085'; then " +
        "docker exec -d -u abc srv_webtop_sandbox python3 -m http.server 8085 --directory /config; " +
        "fi"
      );

      // 3. Inicia o sincronizador de fotos em background se ainda não estiver em execução
      const result = await runSSH(
        "if ! pgrep -f 'server_photos_backup.py' >/dev/null 2>&1; then " +
        "  nohup python3 /home/rodrigo/server_photos_backup.py </dev/null >>/home/rodrigo/google_photos_picker.log 2>&1 & " +
        "  sleep 1.5; " +
        "fi; " +
        "tail -n 25 /home/rodrigo/google_photos_picker.log 2>/dev/null || echo 'Sincronizador do Google Fotos iniciado em segundo plano.'"
      );

      const host = getTargetHost();
      const tunnels = getCachedTunnels();
      const webtopUrl = tunnels['13000'] || tunnels['3000'] || `http://${host}:13000`;

      return {
        ok: true,
        message: 'Sincronização do Google Fotos iniciada.',
        output: result.stdout || result.stderr || 'Sincronização iniciada no Webtop.',
        url: webtopUrl,
      };
    },
    request,
    'POST /api/backup/photos'
  );
}

import { runSSH, getTargetHost, apiHandler } from '@/lib/ssh';

// POST /api/backup/photos — executa sincronização de fotos do Google Fotos
export async function POST(request) {
  return apiHandler(
    async () => {
      // 1. Inicia Webtop se não estiver rodando
      await runSSH(
        "if ! sudo docker ps --format '{{.Names}}' | grep -q '^srv_webtop_sandbox$'; then " +
        "sudo docker rm -f srv_webtop_sandbox >/dev/null 2>&1 || true; " +
        "sudo docker run -d --name=srv_webtop_sandbox -p 3000:3000 -p 3001:3001 -p 9222:9222 " +
        "-v /home/rodrigo/webtop_config:/config -v /home/rodrigo:/storage --shm-size=2gb " +
        "srv-webtop-antigravity:latest; " +
        "sleep 5; " +
        "fi"
      );

      // 2. Copia o redirect.html e inicia o server HTTP Python se não estiver rodando
      await runSSH(
        "sudo docker cp /home/rodrigo/redirect.html srv_webtop_sandbox:/config/redirect.html && " +
        "sudo docker exec srv_webtop_sandbox chown abc:abc /config/redirect.html && " +
        "if ! sudo docker exec srv_webtop_sandbox ps aux | grep -q '[m].server 8085'; then " +
        "sudo docker exec -d -u abc srv_webtop_sandbox python3 -m http.server 8085 --directory /config; " +
        "fi"
      );

      // 3. Executa o downloader de fotos no servidor
      const result = await runSSH("python3 /home/rodrigo/server_photos_backup.py");

      const host = getTargetHost();
      return {
        ok: true,
        message: 'Sincronização do Google Fotos concluída.',
        output: result.stdout || result.stderr || 'Sem saída.',
        url: `https://${host}:3001`
      };
    },
    request,
    'POST /api/backup/photos'
  );
}

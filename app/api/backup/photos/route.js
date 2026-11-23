import { runSSH, getCachedTunnels, apiHandler } from '@/lib/ssh';
import { startNgrok } from '@/lib/ngrok';
import { sanitizeSensitiveText } from '@/lib/sanitize';

export const maxDuration = 60;

// POST /api/backup/photos — executa sincronização de fotos do Google Fotos
export async function POST(request) {
  return apiHandler(
    async () => {
      const cmd = `
        if ! mountpoint -q /mnt/hd_externo; then
          echo "STATE:UNMOUNTED"
          exit 0
        fi
        if ! docker ps --format '{{.Names}}' | grep -q '^srv_webtop_sandbox$'; then
          docker start srv_webtop_sandbox >/dev/null 2>&1 || docker run -d --privileged --name=srv_webtop_sandbox -p 3000:3000 -p 3001:3001 -p 9222:9222 -v /home/rodrigo/webtop_config:/config -v /home/rodrigo:/storage --shm-size=2gb srv-webtop-antigravity:latest
          sleep 3
        fi
        if [ ! -f /home/rodrigo/redirect.html ]; then
          cat << 'EOF' > /home/rodrigo/redirect.html
<!DOCTYPE html><html><head><meta charset="utf-8"><script>(function(){var u=new URLSearchParams(window.location.search).get('url');if(u)window.location.replace(u);})();</script></head><body>Redirecionando...</body></html>
EOF
        fi
        docker cp /home/rodrigo/redirect.html srv_webtop_sandbox:/config/redirect.html >/dev/null 2>&1 || true
        docker exec srv_webtop_sandbox chown abc:abc /config/redirect.html >/dev/null 2>&1 || true
        if ! docker exec srv_webtop_sandbox ps aux | grep -q '[m].server 8085'; then
          docker exec -d -u abc srv_webtop_sandbox python3 -m http.server 8085 --directory /config
        fi
        if ! ps -eo comm=,args= 2>/dev/null | grep -E "^python" | grep -q "server_photos_backup\\.py"; then
          nohup python3 /home/rodrigo/server_photos_backup.py </dev/null >>/home/rodrigo/google_photos_picker.log 2>&1 &
          sleep 1.5
        fi
        tail -n 25 /home/rodrigo/google_photos_picker.log 2>/dev/null || echo 'Sincronizador iniciado em segundo plano.'
      `;
      const result = await runSSH(cmd, 25000);
      const out = (result.stdout || '').trim();
      if (out.includes('STATE:UNMOUNTED')) {
        throw new Error('HD Externo não está montado no servidor. Conecte o disco antes de sincronizar fotos.');
      }

      const tunnels = getCachedTunnels();
      let webtopUrl = tunnels['13000'] || tunnels['3000'] || null;
      if (!webtopUrl) {
        try {
          webtopUrl = await startNgrok(3000, 'http:', 'tunnel');
        } catch (_) {}
      }

      return {
        ok: true,
        message: 'Sincronização do Google Fotos iniciada.',
        output: sanitizeSensitiveText(out || 'Sincronização iniciada no Webtop.', { maskTunnels: false }),
        ...(webtopUrl ? { url: webtopUrl } : {}),
      };
    },
    request,
    'POST /api/backup/photos'
  );
}

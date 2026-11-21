import { runSSH, apiHandler, getCachedTunnels, updateBridgeState } from '@/lib/ssh';
import { getActiveSessions } from '@/lib/auth';

let cachedStatusData = null;
let cachedStatusTime = 0;
let inFlightStatusPromise = null;
const STATUS_CACHE_TTL_MS = 3000;

function sanitizePublicTunnels(rawTunnels) {
  const clean = {};
  if (!rawTunnels || typeof rawTunnels !== 'object') return clean;
  for (const [k, v] of Object.entries(rawTunnels)) {
    if (
      typeof v === 'string' &&
      /^https:\/\/[-a-zA-Z0-9]+\.(?:trycloudflare\.com|ngrok(?:-free)?\.(?:app|dev|io))$/i.test(v.trim())
    ) {
      clean[k] = v.trim();
    }
  }
  return clean;
}

function parseStatus(stdout) {
  const lines = stdout.split('\n').map((l) => l.trim()).filter(Boolean);

  let cpu = 0;
  let uptime = '';
  let memory = { total: 0, used: 0, percent: 0 };
  const disks = [];

  const uptimeLine = lines.find((l) => l.includes('load average:'));
  if (uptimeLine) {
    const loadParts = uptimeLine.split('load average:')[1].split(',');
    const load1 = parseFloat(loadParts[0].replace(',', '.'));
    cpu = Math.min(Math.round(load1 * 12), 100);

    const upIndex = uptimeLine.indexOf('up');
    if (upIndex !== -1) {
      const commaIndex = uptimeLine.indexOf(',', upIndex);
      uptime = uptimeLine.substring(upIndex + 2, commaIndex !== -1 ? commaIndex : undefined).trim();
    }
  }

  const memLine = lines.find((l) => l.startsWith('Mem:'));
  if (memLine) {
    const parts = memLine.split(/\s+/);
    const total = parseInt(parts[1], 10);
    const used = parseInt(parts[2], 10);
    memory = {
      total: Math.round(total / 1024),
      used: Math.round(used / 1024),
      percent: total > 0 ? Math.round((used / total) * 100) : 0,
    };
  }

  lines.forEach((l) => {
    if (l.startsWith('/dev/')) {
      const parts = l.split(/\s+/);
      const size = parts[1];
      const used = parts[2];
      const avail = parts[3];
      const percentStr = parts.find((p) => p.includes('%'));
      const percent = percentStr ? parseInt(percentStr.replace('%', ''), 10) : 0;
      const mount = parts[parts.length - 1];

      if (mount === '/' || mount.startsWith('/mnt/') || mount.startsWith('/media/')) {
        disks.push({
          mount,
          label: mount === '/' ? 'Sistema' : mount.replace(/^\/(mnt|media)\//, ''),
          total: size,
          used,
          available: avail,
          percent,
        });
      }
    }
  });

  return { cpu, uptime, memory, disks };
}

async function fetchServerStatus() {
  const combinedCmd =
    'uptime && free -m && (timeout 4 df -lhP -x overlay -x tmpfs -x devtmpfs -x squashfs 2>/dev/null || df -h) && echo "===DOCKER===" && (timeout 5 docker ps --format "{{.Names}}" || true) && echo "===TUNNELS===" && (cat ~/.cloudflare_tunnels.json 2>/dev/null || echo "{}")';
  const result = await runSSH(combinedCmd, 18000);

  const parts = result.stdout.split(/===[A-Z0-9_]+===/);
  const sysStdout = parts[0] || '';
  const dockerStdout = parts[1] || '';
  const tunnelsStdout = (parts[2] || '').trim();

  let fileTunnels = {};
  if (tunnelsStdout) {
    try {
      const jsonMatch = tunnelsStdout.match(/\{[\s\S]*\}/);
      const parsedTunnels = JSON.parse(jsonMatch ? jsonMatch[0] : tunnelsStdout);
      if (parsedTunnels && typeof parsedTunnels === 'object') {
        fileTunnels = parsedTunnels;
        updateBridgeState({
          cfBridgeUrl: parsedTunnels['18022'] || null,
          tunnels: parsedTunnels,
        });
      }
    } catch (_) {}
  }

  const runningContainers = dockerStdout
    ? dockerStdout.split('\n').map((name) => name.trim()).filter(Boolean)
    : [];

  const parsed = parseStatus(sysStdout);
  const online = Boolean(parsed.uptime) && result.code === 0;
  if (!online) {
    throw new Error(result.stderr || 'Telemetria do servidor temporariamente indisponível.');
  }

  return {
    online: true,
    route: result.route || 'Conexão Segura',
    runningContainers,
    activeTunnels: sanitizePublicTunnels({ ...fileTunnels, ...getCachedTunnels() }),
    ...parsed,
  };
}

export async function GET(request) {
  return apiHandler(
    async () => {
      const url = new URL(request.url);
      const forceRefresh = url.searchParams.get('force') === '1';
      const now = Date.now();

      if (!forceRefresh && cachedStatusData && now - cachedStatusTime < STATUS_CACHE_TTL_MS) {
        const sessions = await getActiveSessions(false);
        return {
          ...cachedStatusData,
          activeDevices: sessions.filter((s) => s.online).length,
          cached: true,
        };
      }

      if (!inFlightStatusPromise) {
        inFlightStatusPromise = fetchServerStatus()
          .then((data) => {
            if (data?.online) {
              cachedStatusData = data;
              cachedStatusTime = Date.now();
            }
            return data;
          })
          .finally(() => {
            inFlightStatusPromise = null;
          });
      }

      const data = await inFlightStatusPromise;
      const sessions = await getActiveSessions(false);
      return {
        ...data,
        activeDevices: sessions.filter((s) => s.online).length,
      };
    },
    request,
    'GET /api/status'
  );
}

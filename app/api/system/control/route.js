import { runSSH, apiHandler } from '@/lib/ssh';

const MONITORED_SERVICES = [
  'docker',
  'ollama',
  'tailscaled',
  'bore-tunnel',
  'ssh',
  'cron',
];

/**
 * GET /api/system/control
 * Retorna processos (Top CPU/RAM), status dos serviços systemd, portas abertas e túneis ativos.
 */
export async function GET(request) {
  return apiHandler(
    async () => {
      const servicesCheck = MONITORED_SERVICES.map(
        (s) => `echo "${s}:$(systemctl is-active ${s} 2>/dev/null || echo inactive)"`
      ).join(' && ');

      const combinedCmd = [
        'echo "===PROCESSES==="',
        'ps -eo pid,user,%cpu,%mem,etime,comm --sort=-%cpu | head -n 16',
        'echo "===SERVICES==="',
        servicesCheck,
        'echo "===PORTS==="',
        'ss -tln | awk \'NR>1 {print $4}\' | head -n 25',
        'echo "===TUNNELS==="',
        '(journalctl -u bore-tunnel -n 30 --no-pager 2>/dev/null | grep -o "bore.pub:[0-9]*" | tail -n 1 || true)',
        '(grep -h -o "https://[-a-zA-Z0-9]*\\.trycloudflare\\.com" /tmp/cf_*.log 2>/dev/null || true)',
        '(grep -h -o "bore.pub:[0-9]*" /tmp/bore_*.log 2>/dev/null || true)',
      ].join(' && ');

      const res = await runSSH(combinedCmd);
      const sections = (res.stdout || '').split(/===[A-Z]+===/);
      const procRaw = (sections[1] || '').trim();
      const srvRaw = (sections[2] || '').trim();
      const portsRaw = (sections[3] || '').trim();
      const tunnelsRaw = (sections[4] || '').trim();

      const procLines = procRaw.split('\n').map((l) => l.trim()).filter(Boolean);
      const processes = procLines.slice(1).map((line) => {
        const parts = line.split(/\s+/);
        return {
          pid: parts[0],
          user: parts[1],
          cpu: parts[2],
          mem: parts[3],
          elapsed: parts[4],
          command: parts.slice(5).join(' '),
        };
      });

      const services = srvRaw
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((line) => {
          const [name, state] = line.split(':');
          return { name, state: state || 'unknown', active: state === 'active' };
        });

      const listeningPorts = Array.from(
        new Set(
          portsRaw
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean)
        )
      );

      const activeTunnels = Array.from(
        new Set(
          tunnelsRaw
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean)
        )
      );

      return {
        host: res.host,
        port: res.port,
        route: res.route,
        processes,
        services,
        listeningPorts,
        activeTunnels,
      };
    },
    request,
    'GET /api/system/control'
  );
}

/**
 * POST /api/system/control
 * Ações diretas:
 * - { action: 'kill_process', pid: '1234', signal: '9' }
 * - { action: 'service', service: 'ollama', op: 'restart' | 'start' | 'stop' }
 */
export async function POST(request) {
  return apiHandler(
    async () => {
      const body = await request.json();
      const { action } = body;

      if (action === 'kill_process') {
        const pid = parseInt(body.pid, 10);
        if (!pid || pid <= 1) {
          throw new Error('PID inválido.');
        }
        const sig = body.signal === '15' ? '-15' : '-9';
        const res = await runSSH(`sudo kill ${sig} ${pid} 2>&1 || kill ${sig} ${pid} 2>&1`);
        return {
          message: `Processo ${pid} finalizado (${sig}).`,
          output: res.stdout || res.stderr,
        };
      }

      if (action === 'service') {
        const { service, op } = body;
        if (!MONITORED_SERVICES.includes(service)) {
          throw new Error(`Serviço não autorizado: ${service}`);
        }
        if (!['start', 'stop', 'restart'].includes(op)) {
          throw new Error(`Operação inválida: ${op}`);
        }
        const res = await runSSH(`sudo systemctl ${op} ${service} 2>&1 && systemctl is-active ${service} 2>&1`);
        return {
          message: `Serviço ${service}: ${op} executado.`,
          output: res.stdout || res.stderr,
        };
      }

      throw new Error(`Ação desconhecida: ${action}`);
    },
    request,
    'POST /api/system/control'
  );
}

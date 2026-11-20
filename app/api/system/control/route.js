import { runSSH, apiHandler } from '@/lib/ssh';
import { logAction } from '@/lib/logger';
import { maskListeningEndpoint, sanitizeSensitiveText } from '@/lib/sanitize';

const MONITORED_SERVICES = [
  'docker',
  'ollama',
  'tailscaled',
  'bore-tunnel',
  'srv-cmd-bridge',
  'srv-bridge-tunnel',
  'bore-erp-web',
  'bore-erp-pg',
  'srv-xbox-gamepad',
  'cockpit',
  'smbd',
  'adb-server',
  'ssh',
  'cron',
];

const PROTECTED_REMOTE_SERVICES = new Set([
  'bore-tunnel',
  'srv-cmd-bridge',
  'srv-bridge-tunnel',
  'ssh',
]);

export async function GET(request) {
  return apiHandler(
    async () => {
      const servicesCheck = MONITORED_SERVICES.map(
        (s) => `echo "${s}:$(systemctl is-active ${s} 2>/dev/null || echo inactive)"`
      ).join(' && ');

      const combinedCmd = [
        'echo "===PROCESSES==="',
        'ps -eo pid,%cpu,%mem,etime,comm --sort=-%cpu | head -n 16',
        'echo "===SERVICES==="',
        servicesCheck,
        'echo "===PORTS==="',
        "ss -tln | awk 'NR>1 {print $4}' | head -n 30",
        'echo "===TUNNELS==="',
        '(systemctl is-active --quiet bore-tunnel && echo "Túnel SSH Bore: Ativo" || echo "Túnel SSH Bore: Inativo")',
        '(systemctl is-active --quiet srv-bridge-tunnel && echo "Bridge Bore: Ativo" || echo "Bridge Bore: Inativo")',
        '(systemctl is-active --quiet bore-erp-web && echo "ERP Web Bore: Ativo" || echo "ERP Web Bore: Inativo")',
        '(grep -h -o "https://[-a-zA-Z0-9]*\\.trycloudflare\\.com" /tmp/cf_*.log 2>/dev/null | sort -u || true)',
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
          cpu: parts[1],
          mem: parts[2],
          elapsed: parts[3],
          command: sanitizeSensitiveText(parts.slice(4).join(' ')),
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
            .map((l) => maskListeningEndpoint(l))
            .filter(Boolean)
        )
      );

      const activeTunnels = Array.from(
        new Set(
          tunnelsRaw
            .split('\n')
            .map((l) => sanitizeSensitiveText(l, { maskTunnels: false }).trim())
            .filter(Boolean)
        )
      );

      return {
        route: res.route,
        processes,
        services,
        listeningPorts,
        activeTunnels,
      };
    },
    request,
    'GET /api/system/control',
    { roles: ['admin'] }
  );
}

export async function POST(request) {
  return apiHandler(
    async (ctx) => {
      const body = await request.json();
      const { action } = body;

      if (action === 'kill_process') {
        const pid = parseInt(body.pid, 10);
        if (!pid || pid <= 1) {
          throw new Error('PID inválido.');
        }
        const sig = body.signal === '15' ? '-15' : '-9';
        const res = await runSSH(`sudo -n kill ${sig} ${pid} 2>&1 || kill ${sig} ${pid} 2>&1`);
        await logAction('system.kill_process', 'success', {
          pid,
          signal: sig,
          user: ctx.username,
          deviceId: ctx.deviceId,
          deviceName: ctx.deviceName,
        });
        return {
          message: `Processo ${pid} finalizado (${sig}).`,
          output: sanitizeSensitiveText(res.stdout || res.stderr),
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
        if (PROTECTED_REMOTE_SERVICES.has(service) && op === 'stop') {
          throw new Error(`Não é permitido parar o serviço crítico ${service} remotamente.`);
        }
        const res = await runSSH(`sudo -n systemctl ${op} ${service} 2>&1 && systemctl is-active ${service} 2>&1`);
        await logAction('system.service', 'success', {
          service,
          op,
          user: ctx.username,
          deviceId: ctx.deviceId,
          deviceName: ctx.deviceName,
        });
        return {
          message: `Serviço ${service}: ${op} executado.`,
          output: sanitizeSensitiveText(res.stdout || res.stderr),
        };
      }

      throw new Error(`Ação desconhecida: ${action}`);
    },
    request,
    'POST /api/system/control',
    { roles: ['admin'] }
  );
}

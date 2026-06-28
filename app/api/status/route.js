import { runSSH, apiHandler } from '@/lib/ssh';

function parseStatus(stdout) {
  const lines = stdout.split('\n').map(l => l.trim()).filter(Boolean);
  
  let cpu = 0;
  let uptime = '';
  let memory = { total: 0, used: 0, percent: 0 };
  const disks = [];

  // Parse uptime & CPU load
  const uptimeLine = lines.find(l => l.includes('load average:'));
  if (uptimeLine) {
    const loadParts = uptimeLine.split('load average:')[1].split(',');
    const load1 = parseFloat(loadParts[0].replace(',', '.')); // Handle Portuguese comma decimal separator
    // Estimate CPU percent visually
    cpu = Math.min(Math.round(load1 * 12), 100);
    
    const upIndex = uptimeLine.indexOf('up');
    if (upIndex !== -1) {
      const commaIndex = uptimeLine.indexOf(',', upIndex);
      uptime = uptimeLine.substring(upIndex + 2, commaIndex !== -1 ? commaIndex : undefined).trim();
    }
  }

  // Parse memory
  const memLine = lines.find(l => l.startsWith('Mem:'));
  if (memLine) {
    const parts = memLine.split(/\s+/);
    const total = parseInt(parts[1], 10);
    const used = parseInt(parts[2], 10);
    memory = {
      total: Math.round(total / 1024), // GB
      used: Math.round(used / 1024), // GB
      percent: Math.round((used / total) * 100)
    };
  }

  // Parse all physical disks (/dev/sd*, /dev/nvme*, /dev/mapper/* mounted on / or /mnt/* or /media/*)
  lines.forEach(l => {
    if (l.startsWith('/dev/')) {
      const parts = l.split(/\s+/);
      const fs = parts[0];
      const size = parts[1];
      const used = parts[2];
      const avail = parts[3];
      const percentStr = parts.find(p => p.includes('%'));
      const percent = percentStr ? parseInt(percentStr.replace('%', ''), 10) : 0;
      const mount = parts[parts.length - 1];

      // Filter only root and storage mounts
      if (mount === '/' || mount.startsWith('/mnt/') || mount.startsWith('/media/')) {
        disks.push({
          filesystem: fs,
          mount,
          total: size,
          used,
          available: avail,
          percent
        });
      }
    }
  });

  return { cpu, uptime, memory, disks };
}

export async function GET(request) {
  return apiHandler(
    async () => {
      // Executa comandos no servidor (df -h sem barra para listar todos os discos)
      const sysResult = await runSSH('uptime && free -m && df -h');
      const dockerResult = await runSSH('sudo docker ps --format "{{.Names}}" || true');
      
      const runningContainers = dockerResult.stdout
        ? dockerResult.stdout.split('\n').map(name => name.trim()).filter(Boolean)
        : [];

      // Verifica se o agente Antigravity no host está ativo na porta 7685
      const agResult = await runSSH('pgrep -f "ttyd -W -p 7685" || true');
      if (agResult.stdout.trim()) {
        runningContainers.push('srv_ag_sandbox');
      }

      // Verifica se o terminal ttyd no host está ativo na porta 7682
      const termResult = await runSSH('pgrep -f "ttyd -W -p 7682" || true');
      if (termResult.stdout.trim()) {
        runningContainers.push('srv_terminal_sandbox');
      }

      const parsed = parseStatus(sysResult.stdout);

      return {
        online: sysResult.code === 0,
        host: sysResult.host,
        runningContainers,
        ...parsed
      };
    },
    request,
    'GET /api/status'
  );
}

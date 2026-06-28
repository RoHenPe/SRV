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
      // Executa comandos no servidor em uma única chamada SSH combinada
      const combinedCmd = 'uptime && free -m && df -h && echo "===DOCKER===" && (sudo docker ps --format "{{.Names}}" || true) && echo "===TTYDS===" && (pgrep -f "ttyd -W -p 7685" || true) && echo "===TTYD_TERM===" && (pgrep -f "ttyd -W -p 7682" || true)';
      const result = await runSSH(combinedCmd);
      
      const parts = result.stdout.split(/===[A-Z0-9_]+===/);
      const sysStdout = parts[0] || '';
      const dockerStdout = parts[1] || '';
      const ttydStdout = parts[2] || '';
      const ttydTermStdout = parts[3] || '';

      const runningContainers = dockerStdout
        ? dockerStdout.split('\n').map(name => name.trim()).filter(Boolean)
        : [];

      if (ttydStdout.trim()) {
        runningContainers.push('srv_ag_sandbox');
      }

      if (ttydTermStdout.trim()) {
        runningContainers.push('srv_terminal_sandbox');
      }

      const parsed = parseStatus(sysStdout);

      return {
        online: result.code === 0,
        host: result.host,
        runningContainers,
        ...parsed
      };
    },
    request,
    'GET /api/status'
  );
}

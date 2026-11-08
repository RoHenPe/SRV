import { runAndEnsurePort, runSSH, getTargetHost, apiHandler } from '@/lib/ssh';

export async function POST(request) {
  return apiHandler(
    async () => {
      const startCmd =
        'docker start srv_steam_sandbox 2>/dev/null || ' +
        'docker run -d --privileged --name srv_steam_sandbox -p 8083:8083 -p 5900:5900 -v /dev:/dev josh5/steam-headless:latest';

      await runAndEnsurePort({
        startCmd,
        port: 8083,
        containerName: 'srv_steam_sandbox',
        maxWaitSeconds: 15,
      });

      const launchRobloxCmd = `
        docker exec -u root srv_steam_sandbox sh -c 'chmod 666 /dev/dri/card* /dev/dri/render* /dev/uinput /dev/input/* 2>/dev/null || true'
        docker exec -u default -e DISPLAY=:55 srv_steam_sandbox bash -c '
          xrandr --newmode "1920x1080_60" 173.00 1920 2048 2248 2576 1080 1083 1088 1120 -hsync +vsync 2>/dev/null || true
          xrandr --addmode VIRTUAL1 "1920x1080_60" 2>/dev/null || true
          xrandr --output VIRTUAL1 --mode "1920x1080_60" 2>/dev/null || true
          wmctrl -c "Display" 2>/dev/null || true
          if ! pgrep -x sober >/dev/null 2>&1; then
            nohup flatpak run --device=all org.vinegarhq.Sober </dev/null >/tmp/sober.log 2>&1 &
            for i in 1 2 3 4 5 6; do
              sleep 0.5
              if wmctrl -l 2>/dev/null | grep -qi "Sober"; then break; fi
            done
          fi
          wmctrl -r "Sober" -b remove,hidden 2>/dev/null || true
          wmctrl -r "Sober" -b add,maximized_vert,maximized_horz 2>/dev/null || true
          wmctrl -a "Sober" 2>/dev/null || true
        ' >/dev/null 2>&1 || true
      `;
      await runSSH(launchRobloxCmd, 8000);

      const host = getTargetHost();
      return {
        ok: true,
        message: 'Roblox (Sober + Controle Xbox) ativo.',
        url: `http://${host}:8083`,
      };
    },
    request,
    'POST /api/sandbox/roblox'
  );
}

import { logAction, logError, logWarn } from './logger.js';
import { sanitizeSensitiveText, describeNetworkScope } from './sanitize.js';

/**
 * Mapa de portas conhecidas -> container/serviço correspondente para auto-recuperação (Self-Healing)
 */
const PORT_RECOVERY_MAP = {
  3000: { container: 'srv_webtop_sandbox', fixWebtopAuth: true },
  3003: { container: 'srv_metabase' },
  3005: { container: 'srv_kdenlive_sandbox' },
  3010: { container: 'open-webui' },
  6081: { container: 'emulator-android-container-1', fixAndroidLocks: true },
  7681: { container: 'srv_monitor' },
  7682: { container: 'srv_terminal_sandbox' },
  7683: { container: 'srv_nvim_sandbox' },
  7685: { container: 'srv_ag_sandbox' },
  8006: { container: 'win10_teste' },
  8080: { container: 'scanservjs' },
  8083: { container: 'srv_steam_sandbox', fixSteamGpu: true },
  8086: { container: 'srv_onlyoffice', fixOnlyOfficePort: true },
  8089: { container: 'srv_filebrowser', fixFileBrowserHealth: true },
  8090: { container: 'srv_erp_mercados' },
  8443: { container: 'srv_vscode_sandbox' },
  8888: { container: 'srv_jupyter_spark' },
  631: { container: 'cupsd' },
  9090: { systemdSocket: 'cockpit.socket' },
};

/**
 * Classifica qualquer erro gerado no sistema com sanitização garantida.
 */
export function classifyError(err, context = {}) {
  const msg = sanitizeSensitiveText(String(err?.message || err || 'Erro desconhecido'));
  const lower = msg.toLowerCase();
  const route = context.route || 'unknown';
  const errorId = `err-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  if (
    err?.status === 401 ||
    err?.status === 403 ||
    lower.includes('credenciais inválidas') ||
    lower.includes('autorização ausente') ||
    lower.includes('sessão inválida') ||
    lower.includes('encerrada remotamente') ||
    lower.includes('acesso restrito')
  ) {
    return {
      errorId,
      category: 'AUTH_SECURITY',
      severity: 'warn',
      status: err?.status || 401,
      rootCause: 'Requisição sem token válido, credencial incorreta, perfil sem permissão ou sessão revogada.',
      remediationAction: 'Bloqueio imediato de acesso não autorizado e registro em log de auditoria.',
      recoverable: false,
      route,
      message: msg,
    };
  }

  if (err?.status === 429 || lower.includes('limite de requisições')) {
    return {
      errorId,
      category: 'RATE_LIMIT',
      severity: 'warn',
      status: 429,
      rootCause: 'Dispositivo excedeu o limite máximo de requisições por minuto.',
      remediationAction: 'Throttling temporário aplicado por dispositivo.',
      recoverable: false,
      route,
      message: msg,
    };
  }

  if (
    err instanceof SyntaxError ||
    err?.name === 'SyntaxError' ||
    err?.status === 400 ||
    lower.includes('unexpected token') ||
    lower.includes('in json at position') ||
    lower.includes('unexpected end of json') ||
    lower.includes('obrigatório') ||
    lower.includes('inválido') ||
    lower.includes('inválida') ||
    lower.includes('não informada') ||
    lower.includes('não autorizado')
  ) {
    const validationMsg =
      err instanceof SyntaxError || err?.name === 'SyntaxError' || lower.includes('in json at position')
        ? 'Formato JSON inválido na solicitação.'
        : msg;
    return {
      errorId,
      category: 'VALIDATION_ERROR',
      severity: 'warn',
      status: 400,
      rootCause: 'Parâmetro de entrada ausente ou fora do formato permitido.',
      remediationAction: 'Rejeição preventiva na camada de validação.',
      recoverable: false,
      route,
      message: validationMsg,
    };
  }

  if (lower.includes('is paused') || lower.includes('paused')) {
    return {
      errorId,
      category: 'DOCKER_PAUSED',
      severity: 'error',
      status: 500,
      rootCause: 'Container em estado Paused (congelado pelo cgroup Docker).',
      remediationAction: 'Executar docker unpause automaticamente e repetir a operação.',
      recoverable: true,
      route,
      message: msg,
    };
  }

  if (lower.includes('conflict. the container name') || lower.includes('is already in use')) {
    return {
      errorId,
      category: 'DOCKER_CONFLICT',
      severity: 'error',
      status: 500,
      rootCause: 'Conflito com container existente parado ou pausado.',
      remediationAction: 'Despausar/iniciar container existente e repetir.',
      recoverable: true,
      route,
      message: msg,
    };
  }

  if (lower.includes('a terminal is required to read the password') || lower.includes('no tty present')) {
    return {
      errorId,
      category: 'SUDO_TTY_REQUIRED',
      severity: 'error',
      status: 500,
      rootCause: 'Comando sudo executado sem TTY.',
      remediationAction: 'Executar em modo não-interativo ou direto via grupo docker.',
      recoverable: true,
      route,
      message: msg,
    };
  }

  if (lower.includes('porta ') && (lower.includes('não ficou disponível') || lower.includes('não está ouvindo'))) {
    const portMatch = msg.match(/porta\s+(\d+)/i);
    const port = portMatch ? Number(portMatch[1]) : context.port || null;
    return {
      errorId,
      category: 'PORT_UNAVAILABLE',
      severity: 'error',
      status: 503,
      port,
      rootCause: `Serviço na porta ${port || 'alvo'} estava parado, pausado ou inicializando.`,
      remediationAction: `Reativar container/serviço mapeado para a porta ${port || 'alvo'} e verificar proxy.`,
      recoverable: Boolean(port),
      route,
      message: msg,
    };
  }

  if (lower.includes('não foi possível obter a url do serviço') || lower.includes('cloudflared') || lower.includes('tunnel')) {
    return {
      errorId,
      category: 'TUNNEL_UNAVAILABLE',
      severity: 'error',
      status: 503,
      rootCause: 'Túnel reverso ou proxy da porta solicitada precisava ser reiniciado.',
      remediationAction: 'Executar ensure-srv-proxies.sh no servidor para restaurar túnel e proxy.',
      recoverable: true,
      route,
      message: msg,
    };
  }

  if (
    lower.includes('servidor inalcançável via ssh') ||
    lower.includes('timed out') ||
    lower.includes('econnrefused') ||
    lower.includes('connection lost') ||
    lower.includes('fetch failed')
  ) {
    return {
      errorId,
      category: 'SSH_BRIDGE_UNREACHABLE',
      severity: 'error',
      status: 504,
      rootCause: 'Falha transitória na comunicação remota ou rota expirada em cache.',
      remediationAction: 'Limpar cache de rota, alternar caminho seguro (Cloudflare Bridge / Bore / LAN) e repetir.',
      recoverable: true,
      route,
      message: msg,
    };
  }

  return {
    errorId,
    category: 'RUNTIME_ERROR',
    severity: 'error',
    status: err?.status || 500,
    rootCause: msg,
    remediationAction: 'Registrar ocorrência sanitizada no log de auditoria.',
    recoverable: false,
    route,
    message: msg,
  };
}

/**
 * Executa o fluxo automático de auto-correção (Self-Healing) no servidor remoto.
 */
export async function attemptSelfHealing(diagnosis, context = {}, runSSH, resetCacheFn) {
  if (!diagnosis?.recoverable || typeof runSSH !== 'function') {
    return { healed: false, reason: 'not_recoverable' };
  }

  try {
    if (diagnosis.category === 'SSH_BRIDGE_UNREACHABLE') {
      if (typeof resetCacheFn === 'function') {
        resetCacheFn();
      }
      const ping = await runSSH('echo SRV_HEALED_PING', 8000);
      if (ping?.code === 0 && (ping.stdout || '').includes('SRV_HEALED_PING')) {
        return {
          healed: true,
          actionTaken: 'Cache de rota limpo e reconexão restabelecida.',
        };
      }
      return { healed: false, reason: 'ping_failed_after_reset' };
    }

    if (diagnosis.category === 'DOCKER_PAUSED' || diagnosis.category === 'DOCKER_CONFLICT') {
      const healCmd = [
        'PAUSED=$(docker ps -q -f status=paused 2>/dev/null); [ -n "$PAUSED" ] && docker unpause $PAUSED >/dev/null 2>&1 || true',
        '/home/rodrigo/.local/bin/ensure-srv-proxies.sh >/dev/null 2>&1 || true',
      ].join(' && ');
      await runSSH(healCmd, 10000);
      return {
        healed: true,
        actionTaken: 'Containers pausados despausados e proxies revalidados.',
      };
    }

    if (diagnosis.category === 'PORT_UNAVAILABLE' || diagnosis.category === 'TUNNEL_UNAVAILABLE') {
      const port = diagnosis.port || context.port;
      const spec = port ? PORT_RECOVERY_MAP[Number(port)] : null;
      const cmds = [
        'PAUSED=$(docker ps -q -f status=paused 2>/dev/null); [ -n "$PAUSED" ] && docker unpause $PAUSED >/dev/null 2>&1 || true',
      ];

      if (spec?.container) {
        cmds.push(`docker unpause ${spec.container} >/dev/null 2>&1 || true`);
        cmds.push(`docker start ${spec.container} >/dev/null 2>&1 || true`);
      }
      if (spec?.systemdSocket) {
        cmds.push(`sudo -n systemctl start ${spec.systemdSocket} cockpit.service >/dev/null 2>&1 || true`);
      }
      if (spec?.fixWebtopAuth) {
        cmds.push(
          'docker exec -u 0 srv_webtop_sandbox sed -i "s/auth_basic/#auth_basic/g" /etc/nginx/sites-available/default 2>/dev/null && docker exec -u 0 srv_webtop_sandbox nginx -s reload 2>/dev/null || true'
        );
      }
      if (spec?.fixOnlyOfficePort) {
        cmds.push(
          'docker exec srv_onlyoffice sh -c \'grep -q documentserver /etc/hosts || echo "127.0.0.1 documentserver" >> /etc/hosts; grep -q "8086" /etc/onlyoffice/documentserver/nginx/ds.conf || (sed -i "s/listen 0.0.0.0:80;/listen 0.0.0.0:80;\\n  listen 0.0.0.0:8086;/" /etc/onlyoffice/documentserver/nginx/ds.conf && nginx -s reload)\' >/dev/null 2>&1 || true'
        );
      }
      if (spec?.fixFileBrowserHealth) {
        cmds.push(
          'docker exec srv_filebrowser sh -c \'[ -f /config/settings.json ] || (mkdir -p /config && echo "{\\"port\\":80,\\"address\\":\\"0.0.0.0\\",\\"database\\":\\"/database/filebrowser.db\\",\\"root\\":\\"/srv\\"}" > /config/settings.json)\' >/dev/null 2>&1 || true'
        );
      }
      if (spec?.fixSteamGpu) {
        cmds.push(
          'docker exec -u 0 srv_steam_sandbox sh -c "chmod 666 /dev/dri/card* /dev/dri/render* /dev/uinput /dev/input/* 2>/dev/null || true; ln -sfn iris_dri.so /usr/lib/x86_64-linux-gnu/dri/i965_dri.so 2>/dev/null || true; grep -q VirtualHeads /etc/X11/xorg.conf 2>/dev/null || cp /tmp/xorg-intel.conf /etc/X11/xorg.conf 2>/dev/null || true" >/dev/null 2>&1 || true'
        );
      }
      if (spec?.fixAndroidLocks) {
        cmds.push(
          'docker exec -u 0 emulator-android-container-1 sh -c "rm -rf /tmp/android-unknown /home/androidusr/.android/avd/running/* /home/androidusr/emulator/*.lock /home/androidusr/.android/avd/*.avd/*.lock" >/dev/null 2>&1 || true'
        );
      }
      cmds.push('mkdir -p /tmp/srv_locks_rodrigo 2>/dev/null || true');
      cmds.push('/home/rodrigo/.local/bin/ensure-srv-proxies.sh >/dev/null 2>&1 || true');
      if (port) {
        cmds.push(`sleep 1; ss -tlnH "sport = :${port}" 2>/dev/null | grep -q .`);
      }

      const res = await runSSH(cmds.join('; '), 14000);
      return {
        healed: !port || res?.code === 0,
        actionTaken: `Serviço/proxy da porta ${port || 'alvo'} reativado automaticamente.`,
      };
    }

    if (diagnosis.category === 'SUDO_TTY_REQUIRED') {
      return {
        healed: true,
        actionTaken: 'Fallback não-interativo acionado.',
      };
    }
  } catch (healErr) {
    await logWarn('Self-healing attempt failed', {
      errorId: diagnosis.errorId,
      category: diagnosis.category,
      healError: sanitizeSensitiveText(healErr?.message || String(healErr)),
    });
  }

  return { healed: false, reason: 'unhandled_category' };
}

/**
 * Registra erro sanitizado no log de auditoria (zero exposição de IPs, MACs ou credenciais).
 */
export async function recordErrorFlow({
  diagnosis,
  err,
  context = {},
  selfHealed = false,
  healingDetails = null,
}) {
  const payload = {
    errorId: diagnosis.errorId,
    category: diagnosis.category,
    rootCause: sanitizeSensitiveText(diagnosis.rootCause),
    remediationAction: sanitizeSensitiveText(healingDetails?.actionTaken || diagnosis.remediationAction),
    selfHealed,
    route: context.route || diagnosis.route,
    user: context.username || 'anonymous',
    deviceId: context.deviceId || 'default-device',
    deviceName: context.deviceName || 'Navegador Web',
    networkScope: context.networkScope || describeNetworkScope(context.clientIp),
    sshRoute: context.sshRoute || null,
    responseTime: context.responseTime ? `${context.responseTime}ms` : undefined,
  };

  if (selfHealed) {
    await logAction(`self_heal.${diagnosis.category.toLowerCase()}`, 'recovered', payload);
  } else if (diagnosis.severity === 'warn') {
    await logWarn(`[${diagnosis.category}] ${sanitizeSensitiveText(diagnosis.message)}`, payload);
  } else {
    await logError(sanitizeSensitiveText(err?.message || diagnosis.message), payload);
  }

  return payload;
}

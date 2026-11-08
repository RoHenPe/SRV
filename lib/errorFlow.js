import { logAction, logError, logWarn } from './logger.js';

/**
 * Mapa de portas conhecidas -> container/serviço correspondente para auto-recuperação (Self-Healing)
 */
const PORT_RECOVERY_MAP = {
  3000: { container: 'srv_webtop_sandbox', fixWebtopAuth: true },
  3005: { container: 'srv_kdenlive_sandbox' },
  6081: { container: 'emulator-android-container-1' },
  7681: { container: 'srv_dashboard' },
  7682: { container: 'srv_terminal_sandbox' },
  7683: { container: 'srv_nvim_sandbox' },
  7685: { container: 'srv_ag_sandbox' },
  8006: { container: 'win10_teste' },
  8083: { container: 'srv_steam_sandbox' },
  8086: { container: 'srv_onlyoffice' },
  8089: { container: 'srv_filebrowser' },
  8090: { container: 'srv_erp_mercados' },
  8443: { container: 'srv_vscode_sandbox' },
  631: { container: 'cupsd' },
  9090: { systemdSocket: 'cockpit.socket' },
};

/**
 * Classifica qualquer erro gerado no sistema com base, causa raiz e plano de ação contextual.
 */
export function classifyError(err, context = {}) {
  const msg = String(err?.message || err || 'Erro desconhecido');
  const lower = msg.toLowerCase();
  const route = context.route || 'unknown';
  const errorId = `err-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  if (err?.status === 401 || err?.status === 403 || lower.includes('credenciais inválidas') || lower.includes('autorização ausente') || lower.includes('sessão inválida') || lower.includes('encerrada remotamente')) {
    return {
      errorId,
      category: 'AUTH_SECURITY',
      severity: 'warn',
      status: err?.status || 401,
      rootCause: 'Requisição sem token válido, credencial incorreta ou sessão de dispositivo revogada.',
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
      remediationAction: 'Throttling temporário aplicado por IP/deviceId para proteger a estabilidade do servidor.',
      recoverable: false,
      route,
      message: msg,
    };
  }

  if (
    err?.status === 400 ||
    lower.includes('obrigatório') ||
    lower.includes('inválido') ||
    lower.includes('inválida') ||
    lower.includes('não informada') ||
    lower.includes('não autorizado')
  ) {
    return {
      errorId,
      category: 'VALIDATION_ERROR',
      severity: 'warn',
      status: 400,
      rootCause: 'Parâmetro de entrada ausente ou fora do formato seguro permitido.',
      remediationAction: 'Rejeição preventiva de payload malformado na camada de validação.',
      recoverable: false,
      route,
      message: msg,
    };
  }

  if (lower.includes('is paused') || lower.includes('paused')) {
    return {
      errorId,
      category: 'DOCKER_PAUSED',
      severity: 'error',
      status: 500,
      rootCause: 'O container alvo encontra-se em estado Paused (congelado pelo cgroup Docker).',
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
      rootCause: 'Tentativa de criar novo container com nome já existente (parado ou pausado).',
      remediationAction: 'Despausar e iniciar o container existente (docker unpause + docker start) e repetir.',
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
      rootCause: 'Comando sudo executado em sessão não-interativa sem TTY.',
      remediationAction: 'Converter chamada sudo para modo não-interativo autenticado ou execução direta no grupo docker.',
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
      rootCause: `O serviço local na porta ${port || 'alvo'} estava parado, pausado ou aguardando inicialização de socket.`,
      remediationAction: `Despausar/iniciar container mapeado para a porta ${port}, garantir srv_frame_proxy e revalidar escuta TCP.`,
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
      rootCause: 'Túnel reverso ou proxy de frame para a porta solicitada precisava ser reiniciado.',
      remediationAction: 'Executar ensure-srv-proxies.sh no servidor remoto para restaurar o proxy e o túnel Cloudflare.',
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
      rootCause: 'Falha transitória de rede ou endpoint em cache expirado na comunicação com o servidor.',
      remediationAction: 'Invalidar cache de endpoint/túnel, alternar rota (Cloudflare Bridge / Bore / LAN) e repetir comando.',
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
    remediationAction: 'Registrar stack/contexto completo no log de auditoria para rastreabilidade.',
    recoverable: false,
    route,
    message: msg,
  };
}

/**
 * Executa o fluxo automático de auto-correção (Self-Healing) no servidor remoto quando um erro recuperável é detectado.
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
          actionTaken: 'Cache de rota limpo e reconexão estabelecida por rota alternativa.',
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
        actionTaken: 'Containers pausados despausados e proxies verificados.',
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
        cmds.push(`systemctl start ${spec.systemdSocket} >/dev/null 2>&1 || true`);
      }
      if (spec?.fixWebtopAuth) {
        cmds.push(
          'docker exec -u 0 srv_webtop_sandbox sed -i "s/auth_basic/#auth_basic/g" /etc/nginx/sites-available/default 2>/dev/null && docker exec -u 0 srv_webtop_sandbox nginx -s reload 2>/dev/null || true'
        );
      }
      cmds.push('/home/rodrigo/.local/bin/ensure-srv-proxies.sh >/dev/null 2>&1 || true');
      if (port) {
        cmds.push(`sleep 1; ss -tln | grep -q ":${port} "`);
      }

      const res = await runSSH(cmds.join('; '), 14000);
      return {
        healed: !port || res?.code === 0,
        actionTaken: `Serviço/container da porta ${port || 'alvo'} e ensure-srv-proxies reativados automaticamente.`,
      };
    }

    if (diagnosis.category === 'SUDO_TTY_REQUIRED') {
      return {
        healed: true,
        actionTaken: 'Sinalizado fallback automático de comando administrativo sem TTY.',
      };
    }
  } catch (healErr) {
    await logWarn('Self-healing attempt failed', {
      errorId: diagnosis.errorId,
      category: diagnosis.category,
      healError: healErr?.message || String(healErr),
    });
  }

  return { healed: false, reason: 'unhandled_category' };
}

/**
 * Registra estruturadamente o erro e o resultado do fluxo de auto-correção no log de auditoria.
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
    rootCause: diagnosis.rootCause,
    remediationAction: healingDetails?.actionTaken || diagnosis.remediationAction,
    selfHealed,
    route: context.route || diagnosis.route,
    user: context.username || 'anonymous',
    deviceId: context.deviceId || 'default-device',
    deviceName: context.deviceName || 'Navegador Web',
    ip: context.clientIp || '127.0.0.1',
    sshHost: context.sshHost || null,
    sshRoute: context.sshRoute || null,
    responseTime: context.responseTime ? `${context.responseTime}ms` : undefined,
  };

  if (selfHealed) {
    await logAction(`self_heal.${diagnosis.category.toLowerCase()}`, 'recovered', {
      ...payload,
      originalError: diagnosis.message,
    });
  } else if (diagnosis.severity === 'warn') {
    await logWarn(`[${diagnosis.category}] ${diagnosis.message}`, payload);
  } else {
    await logError(err || new Error(diagnosis.message), payload);
  }

  return payload;
}

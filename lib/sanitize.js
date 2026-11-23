const ENV_SECRET_KEYS = [
  'SSH_PASSWORD',
  'API_KEY',
  'NGROK_AUTHTOKEN',
  'AI_GATEWAY_API_KEY',
  'SSH_HOST',
  'SSH_HOST_VPN',
  'SSH_HOST_LAN',
  'SSH_TUNNEL_HOST',
  'BRIDGE_URL',
  'BRIDGE_SECRET',
  'SRV_MAC',
  'DASHBOARD_ADMIN_PASS',
  'JUPYTER_TOKEN',
  'AUTH_SESSION_SECRET',
];

function getDynamicSecrets(extraSecrets = []) {
  const list = [];
  for (const key of ENV_SECRET_KEYS) {
    const val = process.env[key];
    if (val && typeof val === 'string' && val.trim().length >= 3) {
      const clean = val.trim();
      list.push(clean);
      if (clean.includes(':')) {
        const hostOnly = clean.split(':')[0].trim();
        if (hostOnly.length >= 4) list.push(hostOnly);
      }
      if (clean.includes('://')) {
        try {
          const u = new URL(clean);
          if (u.hostname && u.hostname.length >= 4) list.push(u.hostname);
        } catch (_) {}
      }
    }
  }
  for (const s of extraSecrets) {
    if (s && typeof s === 'string' && s.trim().length >= 3) {
      list.push(s.trim());
    }
  }
  return Array.from(new Set(list)).sort((a, b) => b.length - a.length);
}

/**
 * Redige IPs, MACs, credenciais, tokens, túneis privados e caminhos de usuário em qualquer texto
 * antes que ele saia para alertas de UI, logs de auditoria ou respostas HTTP de erro.
 */
export function sanitizeSensitiveText(input, { maskTunnels = true, extraSecrets = [] } = {}) {
  if (input === null || input === undefined) return '';
  let text = typeof input === 'string' ? input : (input?.message ? String(input.message) : String(input));
  if (!text) return '';

  // 1. Valores exatos de segredos e hosts configurados no ambiente
  const secrets = getDynamicSecrets(extraSecrets);
  for (const secret of secrets) {
    if (text.includes(secret)) {
      text = text.split(secret).join('[CONFIG-OCULTO]');
    }
  }

  // 2. Comandos sudo com senha inline e cabeçalhos/tokens de autenticação
  text = text.replace(/echo\s+(['"]).*?\1\s*\|\s*sudo\s+-S(?:\s+-p\s+(['"]).*?\2)?/gi, 'sudo -S');
  text = text.replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{6,}/gi, '$1 [TOKEN-OCULTO]');
  text = text.replace(/(x-bridge-token|authorization|cookie|set-cookie)\s*[:=]\s*(?:(?:Bearer|Basic)\s+)?[^\s;,\r\n]+/gi, '$1: [TOKEN-OCULTO]');
  text = text.replace(/([?&](?:token|key|password|secret|auth|code)=)[^&\s"'<>]+/gi, '$1[OCULTO]');

  // 3. Endereços MAC (aa:bb:cc:dd:ee:ff ou aa-bb-cc-dd-ee-ff)
  text = text.replace(/\b(?:[0-9a-fA-F]{2}[:-]){5}[0-9a-fA-F]{2}\b/g, '[MAC-OCULTO]');

  // 4. IPv4 com porta opcional (RFC1918, CGNAT ou IPs públicos)
  text = text.replace(
    /\b(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}(?::\d{1,5})?\b/g,
    '[IP-OCULTO]'
  );

  // 5. IPv6 explícitos (evitando falso positivo com horários HH:MM:SS)
  text = text.replace(/\[[0-9a-fA-F:]{2,}(?:%[a-zA-Z0-9_.-]+)?\](?::\d{1,5})?/g, '[IPV6-OCULTO]');
  text = text.replace(/\b(?:[0-9a-fA-F]{1,4}:){4,}[0-9a-fA-F:]{1,4}\b/g, '[IPV6-OCULTO]');
  text = text.replace(/\b(?:[0-9a-fA-F]{1,4}:){1,7}::[0-9a-fA-F:]*\b/g, '[IPV6-OCULTO]');

  // 6. Endpoints de túnel e MagicDNS em mensagens de erro
  text = text.replace(/\bbore\.pub(?::\d{1,5})?\b/gi, '[TUNEL-OCULTO]');
  text = text.replace(/\b[a-zA-Z0-9-]+\.ts\.net(?::\d{1,5})?\b/gi, '[VPN-OCULTO]');
  if (maskTunnels) {
    text = text.replace(/https?:\/\/[-a-zA-Z0-9.]+\.(?:trycloudflare\.com|ngrok(?:-free)?\.(?:app|dev|io))(?::\d{1,5})?/gi, '[TUNEL-URL]');
  }

  // 7. Destinos user@host e diretórios /home/<user>
  text = text.replace(/\b[a-zA-Z0-9_.-]{2,32}@(?:\[?[a-zA-Z0-9.:-]+\]?)/g, '[SSH-DESTINO]');
  text = text.replace(/\/home\/[a-zA-Z0-9_.-]+/g, '~');

  return text;
}

/**
 * Classifica escopo de rede de origem sem revelar nenhum octeto do IP real.
 */
export function describeNetworkScope(ip) {
  const clean = String(ip || '').trim();
  if (!clean || clean === '127.0.0.1' || clean === '::1') return 'Local';
  if (
    /^192\.168\./.test(clean) ||
    /^10\./.test(clean) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(clean)
  ) {
    return 'Rede Privada';
  }
  const m100 = clean.match(/^100\.(\d+)\./);
  if (m100 && parseInt(m100[1], 10) >= 64 && parseInt(m100[1], 10) <= 127) {
    return 'VPN Privada';
  }
  return 'Rede Externa';
}

/**
 * Mascara endereço de escuta (ss -tln) ocultando o IP da interface e mantendo apenas escopo + porta.
 */
export function maskListeningEndpoint(rawAddr) {
  const s = String(rawAddr || '').trim();
  if (!s) return '';
  const lastColon = s.lastIndexOf(':');
  if (lastColon === -1) return sanitizeSensitiveText(s);
  const host = s.slice(0, lastColon).trim();
  const port = s.slice(lastColon + 1).trim();
  if (!/^\d+$/.test(port)) return sanitizeSensitiveText(s);
  if (host === '127.0.0.1' || host === '[::1]' || host.startsWith('127.0.0.')) return `loopback:${port}`;
  if (host === '0.0.0.0' || host === '*' || host === '[::]') return `serviço:${port}`;
  if (/^100\./.test(host)) return `vpn:${port}`;
  if (/^(192\.168\.|10\.|172\.)/.test(host)) return `lan:${port}`;
  return `rede:${port}`;
}

/**
 * Gera uma mensagem segura e amigável para alertas da interface (sem IPs, MACs, stderr cru ou portas internas).
 */
export function formatClientSafeError(err, diagnosis) {
  const category = diagnosis?.category || 'RUNTIME_ERROR';
  const rawMsg = String(err?.message || diagnosis?.message || '').trim();

  if (category === 'AUTH_SECURITY') {
    return sanitizeSensitiveText(rawMsg) || 'Autenticação necessária ou sessão encerrada.';
  }
  if (category === 'RATE_LIMIT') {
    return 'Muitas requisições em sequência. Aguarde alguns segundos e tente novamente.';
  }
  if (category === 'VALIDATION_ERROR') {
    return sanitizeSensitiveText(rawMsg) || 'Dados inválidos na solicitação.';
  }
  if (category === 'SSH_BRIDGE_UNREACHABLE') {
    return 'Servidor temporariamente inacessível. Tente novamente em instantes.';
  }
  if (category === 'TUNNEL_UNAVAILABLE') {
    return 'Túnel seguro temporariamente indisponível. Tente abrir novamente em instantes.';
  }
  if (category === 'PORT_UNAVAILABLE') {
    return 'O serviço selecionado ainda está inicializando. Aguarde alguns segundos e tente novamente.';
  }
  if (category === 'DOCKER_PAUSED' || category === 'DOCKER_CONFLICT' || category === 'SUDO_TTY_REQUIRED') {
    return 'Serviço em recuperação automática no servidor. Tente novamente em instantes.';
  }

  // Evita retornar mensagens técnicas longas, traces ou strings cheias de IP/MAC/caminhos
  const scrubbed = sanitizeSensitiveText(rawMsg);
  const looksTechnical =
    scrubbed.length > 180 ||
    scrubbed.includes('\n') ||
    scrubbed.includes('Traceback') ||
    scrubbed.includes('OSError') ||
    scrubbed.includes('Error:') ||
    scrubbed.includes('[IP-OCULTO]') ||
    scrubbed.includes('[MAC-OCULTO]') ||
    scrubbed.includes('[TUNEL-OCULTO]');

  if (!scrubbed || looksTechnical) {
    return `Não foi possível concluir a operação (${diagnosis?.errorId || 'erro interno'}).`;
  }

  return scrubbed;
}

/**
 * Sanitiza um objeto inteiro recursivamente removendo campos sensíveis (IP, stack, secrets).
 */
export function sanitizeAuditRecord(record) {
  if (!record || typeof record !== 'object') return record;
  const { ip, sshHost, stack, password, token, secret, ...rest } = record;
  const clean = {};
  if (ip && !rest.networkScope) {
    clean.networkScope = describeNetworkScope(ip);
  }
  for (const [k, v] of Object.entries(rest)) {
    if (typeof v === 'string') {
      clean[k] = sanitizeSensitiveText(v, { maskTunnels: k !== 'url' });
    } else if (Array.isArray(v)) {
      clean[k] = v.map((item) => (typeof item === 'string' ? sanitizeSensitiveText(item) : item));
    } else if (v && typeof v === 'object') {
      clean[k] = sanitizeAuditRecord(v);
    } else {
      clean[k] = v;
    }
  }
  return clean;
}

const DOCKER_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;
const MODEL_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.:/-]{0,127}$/;

export function isValidDockerName(name) {
  return typeof name === 'string' && DOCKER_NAME_RE.test(name);
}

export function isValidModelName(model) {
  return typeof model === 'string' && MODEL_NAME_RE.test(model);
}

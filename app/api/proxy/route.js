import { NextResponse } from 'next/server';
import { requireAuth, AuthError } from '@/lib/auth';
import { logWarn } from '@/lib/logger';
import { getClientIp, getClientDeviceId, getClientDeviceName, checkRateLimit } from '@/lib/rateLimit';
import { classifyError, recordErrorFlow } from '@/lib/errorFlow';
import { formatClientSafeError } from '@/lib/sanitize';

const ALLOWED_CORS_ORIGIN = process.env.NEXT_PUBLIC_APP_ORIGIN || 'https://srvdash.vercel.app';

function getCorsOrigin(request) {
  const origin = request.headers?.get?.('origin') || '';
  if (
    origin === 'https://srvdash.vercel.app' ||
    origin === 'https://srv.rhporg.app' ||
    origin === 'https://srv-dash.rhporg.app' ||
    origin.startsWith('http://localhost:') ||
    origin.startsWith('http://127.0.0.1:')
  ) {
    return origin;
  }
  return ALLOWED_CORS_ORIGIN;
}

function isAllowedProxyTarget(targetUrl) {
  if (!targetUrl || !['http:', 'https:'].includes(targetUrl.protocol)) {
    return false;
  }
  const host = (targetUrl.hostname || '').toLowerCase().trim();
  if (!host) return false;

  if (
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host === '[::1]' ||
    host.startsWith('127.') ||
    host.startsWith('169.254.')
  ) {
    return false;
  }

  const allowedHosts = new Set(
    [
      (process.env.SSH_HOST || '').split(':')[0].toLowerCase(),
      (process.env.SSH_HOST_VPN || '').split(':')[0].toLowerCase(),
      (process.env.SSH_HOST_LAN || '').split(':')[0].toLowerCase(),
    ].filter(Boolean)
  );

  if (allowedHosts.has(host)) return true;
  if (host.endsWith('.trycloudflare.com')) return true;
  if (host.endsWith('.ngrok-free.app') || host.endsWith('.ngrok.io')) return true;
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+$/.test(host)) return true;

  return false;
}

/**
 * Proxy reverso HTTPS autenticado do Next.js (exige sessão validada por Cookie HttpOnly ou Bearer Token).
 */
async function handleProxy(request) {
  const corsOrigin = getCorsOrigin(request);
  try {
    if (!checkRateLimit(request, 'PROXY /api/proxy')) {
      return NextResponse.json({ ok: false, error: 'Limite de requisições excedido.' }, { status: 429 });
    }

    await requireAuth(request);

    const { searchParams } = new URL(request.url);
    const target = searchParams.get('url');
    if (!target || !target.startsWith('http')) {
      return NextResponse.json({ ok: false, error: 'URL alvo inválida.' }, { status: 400 });
    }

    let targetUrl;
    try {
      targetUrl = new URL(target);
    } catch {
      return NextResponse.json({ ok: false, error: 'URL alvo malformada.' }, { status: 400 });
    }

    if (!isAllowedProxyTarget(targetUrl)) {
      await logWarn('Blocked unauthorized proxy target (SSRF protection)', {
        route: '/api/proxy',
        blockedHost: targetUrl.hostname,
        ip: getClientIp(request),
        deviceId: getClientDeviceId(request),
      });
      return NextResponse.json(
        { ok: false, error: 'Host de destino não autorizado pelo proxy de segurança.' },
        { status: 403 }
      );
    }

    const headers = new Headers();
    request.headers.forEach((value, key) => {
      const k = key.toLowerCase();
      if (!['host', 'origin', 'referer', 'connection', 'accept-encoding', 'authorization', 'cookie'].includes(k)) {
        headers.set(key, value);
      }
    });
    headers.set('Host', targetUrl.host);
    headers.set('Origin', `${targetUrl.protocol}//${targetUrl.host}`);
    headers.set('ngrok-skip-browser-warning', 'true');

    const fetchOptions = {
      method: request.method,
      headers,
      redirect: 'manual',
    };

    if (!['GET', 'HEAD'].includes(request.method)) {
      fetchOptions.body = await request.arrayBuffer();
    }

    const upstream = await fetch(targetUrl.toString(), fetchOptions);
    const outHeaders = new Headers();

    upstream.headers.forEach((value, key) => {
      const k = key.toLowerCase();
      if (['x-frame-options', 'content-security-policy', 'content-security-policy-report-only', 'content-encoding', 'transfer-encoding'].includes(k)) {
        return;
      }
      outHeaders.set(key, value);
    });
    outHeaders.set('Access-Control-Allow-Origin', corsOrigin);
    outHeaders.set('Access-Control-Allow-Credentials', 'true');
    outHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    outHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Device-Id, X-Device-Name');
    outHeaders.set('X-Content-Type-Options', 'nosniff');
    outHeaders.set('Content-Security-Policy', "frame-ancestors 'self'");

    const contentType = upstream.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      let html = await upstream.text();
      const baseTag = `<base href="${targetUrl.origin}/">`;
      if (html.includes('<head>')) {
        html = html.replace('<head>', `<head>${baseTag}`);
      } else {
        html = `${baseTag}${html}`;
      }
      return new NextResponse(html, {
        status: upstream.status,
        headers: outHeaders,
      });
    }

    const body = await upstream.arrayBuffer();
    return new NextResponse(body, {
      status: upstream.status,
      headers: outHeaders,
    });
  } catch (err) {
    const status = err instanceof AuthError ? err.status : 502;
    const deviceId = getClientDeviceId(request);
    const deviceName = getClientDeviceName(request);
    const clientIp = getClientIp(request);
    const diagnosis = classifyError(err, { route: '/api/proxy', deviceId, deviceName, clientIp });
    await recordErrorFlow({
      diagnosis,
      err,
      context: { route: '/api/proxy', deviceId, deviceName, clientIp },
      selfHealed: false,
    });
    return NextResponse.json(
      { ok: false, error: formatClientSafeError(err, diagnosis), errorId: diagnosis.errorId, category: diagnosis.category },
      { status }
    );
  }
}

export async function GET(request) {
  return handleProxy(request);
}

export async function POST(request) {
  return handleProxy(request);
}

export async function PUT(request) {
  return handleProxy(request);
}

export async function PATCH(request) {
  return handleProxy(request);
}

export async function DELETE(request) {
  return handleProxy(request);
}

export async function OPTIONS(request) {
  const corsOrigin = getCorsOrigin(request);
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Device-Id, X-Device-Name',
    },
  });
}

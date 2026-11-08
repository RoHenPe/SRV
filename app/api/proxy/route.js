import { NextResponse } from 'next/server';
import { logWarn } from '@/lib/logger';
import { getClientIp, getClientDeviceId, getClientDeviceName, checkRateLimit } from '@/lib/rateLimit';
import { classifyError, recordErrorFlow } from '@/lib/errorFlow';

function isAllowedProxyTarget(targetUrl) {
  if (!targetUrl || !['http:', 'https:'].includes(targetUrl.protocol)) {
    return false;
  }
  const host = (targetUrl.hostname || '').toLowerCase().trim();
  if (!host) return false;

  // Block loopback, link-local (cloud metadata 169.254.169.254), and unspecified addresses
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
      'bore.pub',
      '192.168.15.109',
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
 * Proxy reverso HTTPS nativo do Next.js para evitar bloqueios de Mixed Content (HTTPS -> HTTP),
 * pular tela de aviso do Ngrok e remover cabeçalhos restritivos de iframe (X-Frame-Options / CSP),
 * com proteção anti-SSRF restrita aos túneis e hosts do servidor.
 */
async function handleProxy(request) {
  try {
    if (!checkRateLimit(request, 'PROXY /api/proxy')) {
      return NextResponse.json({ ok: false, error: 'Limite de requisições excedido.' }, { status: 429 });
    }

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
      if (!['host', 'origin', 'referer', 'connection', 'accept-encoding', 'authorization'].includes(k)) {
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
    outHeaders.set('Access-Control-Allow-Origin', '*');
    outHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    outHeaders.set('Access-Control-Allow-Headers', '*');
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
      { ok: false, error: err.message, errorId: diagnosis.errorId, category: diagnosis.category },
      { status: 502 }
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

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    },
  });
}

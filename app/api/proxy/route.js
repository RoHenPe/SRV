import { NextResponse } from 'next/server';
import { logError } from '@/lib/logger';

/**
 * Proxy reverso HTTPS nativo do Next.js para evitar bloqueios de Mixed Content (HTTPS -> HTTP),
 * pular tela de aviso do Ngrok e remover cabeçalhos restritivos de iframe (X-Frame-Options / CSP).
 */
async function handleProxy(request) {
  try {
    const { searchParams } = new URL(request.url);
    const target = searchParams.get('url');
    if (!target || !target.startsWith('http')) {
      return NextResponse.json({ ok: false, error: 'URL alvo inválida.' }, { status: 400 });
    }

    const targetUrl = new URL(target);
    const headers = new Headers();
    request.headers.forEach((value, key) => {
      const k = key.toLowerCase();
      if (!['host', 'origin', 'referer', 'connection', 'accept-encoding'].includes(k)) {
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
    await logError(err, { route: ' /api/proxy' });
    return NextResponse.json({ ok: false, error: err.message }, { status: 502 });
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

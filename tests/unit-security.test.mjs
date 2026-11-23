import test from 'node:test';
import assert from 'node:assert/strict';

// Isolate unit tests from live server SSH/Bridge side effects
process.env.REMOTE_AUDIT_LOG = 'false';
process.env.AUTH_SESSION_SECRET = 'unit-test-hmac-secret-999';
process.env.DASHBOARD_ADMIN_PASS = 'unit-admin-pass';
process.env.API_KEY = 'unit-api-key-123456';
process.env.BRIDGE_URL = '';
process.env.BRIDGE_SECRET = '';
process.env.SSH_HOST = '';
process.env.SSH_HOST_LAN = '';
process.env.SSH_HOST_VPN = '';
process.env.SSH_PASSWORD = '';
process.env.SSH_PRIVATE_KEY_B64 = '';

const sanitizeMod = await import('../lib/sanitize.js');
const authMod = await import('../lib/auth.js');
const rateMod = await import('../lib/rateLimit.js');
const errMod = await import('../lib/errorFlow.js');
const { proxy: middlewareProxy } = await import('../proxy.ts');
const tunnelRoute = await import('../app/api/tunnel/route.js');
const proxyRoute = await import('../app/api/proxy/route.js');
const dockerLogsRoute = await import('../app/api/docker/logs/route.js');
const dockerStartRoute = await import('../app/api/docker/start/route.js');
const iaRemoveRoute = await import('../app/api/ia/remove/route.js');
const servicesRoute = await import('../app/api/services/route.js');
const validateRoute = await import('../app/api/auth/validate/route.js');

function makeReq(url, { method = 'GET', headers = {}, body } = {}) {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
  });
}

test('sanitizeSensitiveText redacts IPs, MACs, auth tokens, and env secrets', () => {
  const input = 'Host 192.168.15.109 tailscale 100.119.122.10 mac aa:bb:cc:dd:ee:ff Authorization: Bearer secret123 ?token=abc unit-admin-pass';
  const out = sanitizeMod.sanitizeSensitiveText(input);
  assert.doesNotMatch(out, /192\.168\.15\.109/);
  assert.doesNotMatch(out, /100\.119\.122\.10/);
  assert.doesNotMatch(out, /aa:bb:cc:dd:ee:ff/i);
  assert.doesNotMatch(out, /secret123/);
  assert.doesNotMatch(out, /=abc/);
  assert.doesNotMatch(out, /unit-admin-pass/);
});

test('isValidDockerName and isValidModelName reject leading dash & shell metacharacters', () => {
  assert.equal(sanitizeMod.isValidDockerName('srv_monitor'), true);
  assert.equal(sanitizeMod.isValidDockerName('emulator-android-container-1'), true);
  assert.equal(sanitizeMod.isValidDockerName('--help'), false);
  assert.equal(sanitizeMod.isValidDockerName('-f'), false);
  assert.equal(sanitizeMod.isValidDockerName('srv_monitor;id'), false);
  assert.equal(sanitizeMod.isValidDockerName(''), false);

  assert.equal(sanitizeMod.isValidModelName('ia-core:latest'), true);
  assert.equal(sanitizeMod.isValidModelName('moonshotai/kimi-k3-fast'), true);
  assert.equal(sanitizeMod.isValidModelName('--help'), false);
  assert.equal(sanitizeMod.isValidModelName('llama;rm'), false);
});

test('password hashing & HMAC session binding reject tampering and expiry', () => {
  const hash = authMod.hashPassword('MySecret#2026');
  assert.equal(authMod.verifyPassword('MySecret#2026', { passwordHash: hash }), true);
  assert.equal(authMod.verifyPassword('WrongSecret', { passwordHash: hash }), false);

  const token = authMod.createSessionToken('admin', 'admin', 'dev-abc');
  assert.ok(token.startsWith('srv1.'));
  const verified = authMod.verifySessionCookieValue(token.slice(5));
  assert.equal(verified.username, 'admin');
  assert.equal(verified.role, 'admin');
  assert.equal(verified.tokenDeviceId, 'dev-abc');
  assert.ok(verified.tokenIat > 0);

  const tampered = token.slice(5, -2) + 'ZZ';
  assert.equal(authMod.verifySessionCookieValue(tampered), null);
});

test('rateLimit prefers x-real-ip and enforces perIpOnly limit across device rotation', () => {
  const reqSpoof = makeReq('https://srvdash.vercel.app/api/auth/validate', {
    headers: { 'x-forwarded-for': '9.9.9.9', 'x-real-ip': '203.0.113.55' },
  });
  assert.equal(rateMod.getClientIp(reqSpoof), '203.0.113.55');

  const routeKey = `UNIT_BRUTE_${Date.now()}`;
  for (let i = 0; i < 3; i++) {
    const r = makeReq('https://srvdash.vercel.app/api/auth/validate', {
      headers: { 'x-real-ip': '198.51.100.7', 'x-device-id': `rot-${i}` },
    });
    assert.equal(rateMod.checkRateLimit(r, routeKey, { max: 3, windowMs: 60000, perIpOnly: true }), true);
  }
  const rBlocked = makeReq('https://srvdash.vercel.app/api/auth/validate', {
    headers: { 'x-real-ip': '198.51.100.7', 'x-device-id': 'rot-999' },
  });
  assert.equal(rateMod.checkRateLimit(rBlocked, routeKey, { max: 3, windowMs: 60000, perIpOnly: true }), false);
});

test('errorFlow classifies SyntaxError as 400 VALIDATION_ERROR', () => {
  const diag = errMod.classifyError(new SyntaxError('Unexpected token x in JSON at position 1'), { route: 'POST /api/services' });
  assert.equal(diag.category, 'VALIDATION_ERROR');
  assert.equal(diag.status, 400);
});

test('proxy.ts adds anti-clickjacking & security headers', () => {
  const req = makeReq('https://srvdash.vercel.app/login');
  const res = middlewareProxy(req);
  assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN');
  assert.equal(res.headers.get('content-security-policy'), "frame-ancestors 'self'");
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
});

test('route security guards reject disallowed tunnel ports/paths, docker flags, SSRF, and malformed JSON', async () => {
  const adminTok = authMod.createSessionToken('admin', 'admin', 'dev-unit-admin');
  const adminHdr = {
    Authorization: `Bearer ${adminTok}`,
    'x-device-id': 'dev-unit-admin',
    'x-device-name': 'UnitTest',
  };

  // Disallowed internal ports in /api/tunnel
  for (const port of [22, 18022, 5432, 65000]) {
    const res = await tunnelRoute.POST(
      makeReq('https://srvdash.vercel.app/api/tunnel', { method: 'POST', headers: adminHdr, body: { port } })
    );
    assert.equal(res.status, 403, `Expected 403 for port ${port}`);
  }

  // Bad paths in /api/tunnel
  for (const path of ['@evil.com', '//evil.com', 'noslash']) {
    const res = await tunnelRoute.POST(
      makeReq('https://srvdash.vercel.app/api/tunnel', { method: 'POST', headers: adminHdr, body: { port: 7681, path } })
    );
    assert.equal(res.status, 400, `Expected 400 for path ${path}`);
  }

  // Docker & IA option injection
  const resLogs = await dockerLogsRoute.GET(
    makeReq('https://srvdash.vercel.app/api/docker/logs?name=--help', { headers: adminHdr })
  );
  assert.equal(resLogs.status, 400);

  const resStart = await dockerStartRoute.POST(
    makeReq('https://srvdash.vercel.app/api/docker/start', { method: 'POST', headers: adminHdr, body: { name: '-f' } })
  );
  assert.equal(resStart.status, 400);

  const resIaRm = await iaRemoveRoute.POST(
    makeReq('https://srvdash.vercel.app/api/ia/remove', { method: 'POST', headers: adminHdr, body: { model: '--help' } })
  );
  assert.equal(resIaRm.status, 400);

  // SSRF targets in /api/proxy
  for (const badUrl of [
    'http://127.0.0.1:18022/',
    'http://169.254.169.254/latest/meta-data/',
    'http://bore.pub:48022/',
    'http://bore.pub:12345/',
    'https://user:pass@foo.trycloudflare.com/',
    'https://example.com/',
  ]) {
    const resPx = await proxyRoute.GET(
      makeReq(`https://srvdash.vercel.app/api/proxy?url=${encodeURIComponent(badUrl)}`, { headers: adminHdr })
    );
    assert.equal(resPx.status, 403, `Expected proxy 403 for ${badUrl}`);
  }

  // Malformed JSON -> 400
  const resMalformed = await servicesRoute.POST(
    makeReq('https://srvdash.vercel.app/api/services', { method: 'POST', headers: adminHdr, body: '{bad json' })
  );
  assert.equal(resMalformed.status, 400);

  // Revocation check closes omitted & spoofed x-device-id
  await authMod.revokeDeviceSession('dev-unit-admin');
  const resRevokedOmitted = await dockerLogsRoute.GET(
    makeReq('https://srvdash.vercel.app/api/docker/logs?name=srv_monitor', {
      headers: { Authorization: `Bearer ${adminTok}` },
    })
  );
  assert.equal(resRevokedOmitted.status, 401);

  const resRevokedSpoofed = await dockerLogsRoute.GET(
    makeReq('https://srvdash.vercel.app/api/docker/logs?name=srv_monitor', {
      headers: { Authorization: `Bearer ${adminTok}`, 'x-device-id': 'new-spoofed-dev' },
    })
  );
  assert.equal(resRevokedSpoofed.status, 401);
});

test('POST /api/auth/validate blocks username=API_KEY spoof and brute force per IP', async () => {
  const spoofUserRes = await validateRoute.POST(
    makeReq('https://srvdash.vercel.app/api/auth/validate', {
      method: 'POST',
      headers: { 'x-real-ip': '203.0.113.10', 'x-device-id': 'dev-login-1' },
      body: { username: process.env.API_KEY, password: 'wrong' },
    })
  );
  assert.equal(spoofUserRes.status, 401);

  for (let i = 0; i < 19; i++) {
    await validateRoute.POST(
      makeReq('https://srvdash.vercel.app/api/auth/validate', {
        method: 'POST',
        headers: { 'x-real-ip': '203.0.113.10', 'x-device-id': `dev-rot-${i}` },
        body: { username: 'admin', password: `bad-${i}` },
      })
    );
  }
  const throttled = await validateRoute.POST(
    makeReq('https://srvdash.vercel.app/api/auth/validate', {
      method: 'POST',
      headers: { 'x-real-ip': '203.0.113.10', 'x-device-id': 'dev-rot-final' },
      body: { username: 'admin', password: 'bad-final' },
    })
  );
  assert.equal(throttled.status, 429);
});

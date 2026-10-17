import { app, shell } from 'electron';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { DesktopAuth, desktopAccountEndpoints } from './auth.js';
import { AUTH_CLIENT_ID, AUTH_SCHEME } from './auth-config.js';

/** Explicit dev-only integration check: real PostgreSQL/SMTP/PKCE/OS encryption. */
export async function verifyDesktopAuth(output: string): Promise<void> {
  if (app.isPackaged) throw new Error('Account integration verification is only available in development.');
  const { server, web } = desktopAccountEndpoints();
  assert.equal(server, 'http://127.0.0.1:3001', 'Desktop auth QA only targets the dedicated local server.');
  const email = `nexus-desktop-qa-${randomUUID()}@nexus.local`;
  const password = randomBytes(32).toString('base64url');
  const signal = AbortSignal.timeout(55_000);
  const originalOpen = shell.openExternal;
  const originalFetch = globalThis.fetch;
  let sessionChecks = 0;
  let fault: 'network' | 'rate_limit' | 'invalid_expiry' | 'expired' | undefined;
  let opened: string | undefined;
  let mailId: string | undefined;
  let browserCookies = '';
  let first: DesktopAuth | undefined;
  let restored: DesktopAuth | undefined;
  const checks: string[] = [];

  async function authRequest(route: string, body: unknown, cookie?: string): Promise<Response> {
    return fetch(new URL(`/auth/${route}`, server), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: web, ...(cookie ? { Cookie: cookie } : {}) },
      body: JSON.stringify(body),
      redirect: 'manual', signal,
    });
  }

  function cookiePairs(response: Response): string {
    return response.headers.getSetCookie().map((value) => value.split(';', 1)[0]).filter(Boolean).join('; ');
  }

  try {
    await mkdir(output, { recursive: true });
    // Only the test email is recorded so the coordinator can remove this exact
    // fixture. Passwords, cookies, links and auth codes never enter the report.
    await writeFile(path.join(output, 'desktop-auth-fixture.json'), JSON.stringify({ email, createdAt: new Date().toISOString() }, null, 2));
    const signup = await authRequest('sign-up/email', { email, password, name: 'Nexus Desktop QA', callbackURL: new URL('/sign-in', web).href });
    assert.equal(signup.status, 200, 'Desktop QA account registration failed.');
    checks.push('registration');

    for (let attempt = 0; attempt < 12 && !mailId; attempt++) {
      const search = await fetch(`http://127.0.0.1:8025/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`, { signal });
      assert.equal(search.status, 200, 'Mailpit search unavailable.');
      const result = await search.json() as { messages?: { ID: string }[] };
      mailId = result.messages?.[0]?.ID;
      if (!mailId) await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert.ok(mailId, 'The verification email was not received by Mailpit.');
    const messageResponse = await fetch(`http://127.0.0.1:8025/api/v1/message/${mailId}`, { signal });
    assert.equal(messageResponse.status, 200);
    const message = await messageResponse.json() as { Text?: string };
    const link = message.Text?.match(/https?:\/\/[^\s<>"]+/)?.[0];
    assert.ok(link, 'Verification email has no link.');
    const verificationUrl = new URL(link);
    assert.equal(verificationUrl.origin, server, 'Unexpected verification origin.');
    assert.equal(verificationUrl.pathname, '/auth/verify-email', 'Unexpected verification path.');
    const verification = await fetch(verificationUrl, { redirect: 'manual', signal });
    assert.ok([200, 302, 303].includes(verification.status), 'Email verification failed.');
    checks.push('real SMTP email verification');

    const login = await authRequest('sign-in/email', { email, password });
    assert.equal(login.status, 200, 'Verified browser sign-in failed.');
    browserCookies = cookiePairs(login);
    assert.ok(browserCookies, 'Browser sign-in did not set a session cookie.');

    // Replace only the OS browser launcher in this explicitly requested harness.
    // PKCE generation and code exchange remain the real official plugin paths.
    shell.openExternal = async (url: string) => { opened = url; };
    // Fault injection is confined to this explicit QA fixture's transport. No
    // real account, cookie value or provider credential is inspected or emitted.
    globalThis.fetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.origin !== server || url.pathname !== '/auth/get-session') return originalFetch(input, init);
      sessionChecks++;
      const nextFault = fault;
      fault = undefined;
      if (nextFault === 'network') throw new TypeError('QA transport outage');
      if (nextFault === 'rate_limit') return new Response(JSON.stringify({ message: 'Too many requests' }), {
        status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '60' },
      });
      const response = await originalFetch(input, init);
      if (nextFault !== 'invalid_expiry' && nextFault !== 'expired') return response;
      assert.equal(response.status, 200);
      const data = await response.json() as { session: { expiresAt: string } };
      data.session.expiresAt = nextFault === 'invalid_expiry' ? 'invalid' : new Date(Date.now() - 60_000).toISOString();
      return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    first = new DesktopAuth(() => undefined);
    assert.equal((await first.getState()).status, 'signed_out');
    assert.equal((await first.signIn()).status, 'signing_in');
    assert.ok(opened, 'Official desktop authentication did not open its browser URL.');
    const signInUrl = new URL(opened);
    assert.equal(signInUrl.origin, web);
    assert.equal(signInUrl.pathname, '/sign-in');
    assert.equal(signInUrl.searchParams.get('client_id'), AUTH_CLIENT_ID);
    const query = new URLSearchParams();
    for (const key of ['client_id', 'state', 'code_challenge']) {
      const value = signInUrl.searchParams.get(key);
      assert.ok(value, 'Official PKCE browser parameters are missing.');
      query.set(key, value);
    }
    const transfer = await authRequest(`electron/transfer-user?${query.toString()}`, {}, browserCookies);
    assert.equal(transfer.status, 200, 'Browser session transfer failed.');
    const redirectCookie = transfer.headers.getSetCookie().find((value) => value.startsWith(`better-auth.${AUTH_CLIENT_ID}=`));
    assert.ok(redirectCookie, 'The official proxy redirect credential was not set.');
    const token = decodeURIComponent(redirectCookie.split(';', 1)[0]!.slice(`better-auth.${AUTH_CLIENT_ID}=`.length));
    const callback = `${AUTH_SCHEME}://auth/callback#token=${token}`;
    await first.handleCallback(callback);
    const state = await first.getState();
    assert.equal(state.status, 'signed_in', 'Desktop PKCE callback did not establish a session.');
    assert.equal(state.user?.email, email);
    assert.equal(state.persistent, true);
    assert.equal(Object.keys(state).sort().join(','), 'expiresAt,message,persistent,status,user');
    await first.handleCallback(callback);
    assert.equal((await first.getState()).status, 'signed_in', 'Duplicate callbacks changed the active session.');
    checks.push('official PKCE exchange and duplicate callback rejection');

    const ciphertext = await readFile(path.join(app.getPath('userData'), 'account.bin'));
    assert.equal(ciphertext.includes(email), false);
    assert.equal(ciphertext.includes('session_token'), false);
    assert.equal(ciphertext.includes('better-auth'), false);
    first.dispose();
    first = undefined;
    let accountTransitions = 0;
    restored = new DesktopAuth(() => { accountTransitions++; });
    const resumed = await restored.getState();
    assert.equal(resumed.status, 'signed_in', 'Encrypted desktop session did not survive client reconstruction.');
    assert.equal(resumed.user?.email, email);
    checks.push('OS-encrypted atomic storage and validated restoration');

    const beforeConcurrent = sessionChecks;
    const beforeTransitions = accountTransitions;
    const concurrent = await Promise.all(Array.from({ length: 20 }, () => restored!.getState()));
    assert.ok(concurrent.every(value => value.status === 'signed_in'));
    assert.equal(sessionChecks - beforeConcurrent, 1, 'Overlapping account reads flooded the session endpoint.');
    assert.equal(accountTransitions, beforeTransitions, 'Unchanged validation emitted redundant account transitions.');
    checks.push('overlapping account checks coalesced without redundant transitions');

    for (const failure of ['network', 'rate_limit', 'invalid_expiry'] as const) {
      fault = failure;
      const interrupted = await restored.getState();
      assert.equal(interrupted.status, 'unavailable', 'A failed check must deny authenticated local actions.');
      if (failure === 'rate_limit') assert.match(interrupted.message ?? '', /rate limited/);
      const recovered = await restored.getState();
      assert.equal(recovered.status, 'signed_in', 'The next check did not recover the saved session.');
      assert.equal(recovered.user?.email, email);
    }
    checks.push('transient outage, rate limit and invalid expiry recover without login');

    fault = 'expired';
    assert.equal((await restored.getState()).status, 'signed_out', 'Expired timestamps remained authenticated.');
    const afterExpired = sessionChecks;
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal((await restored.getState()).status, 'signed_out');
    assert.equal(sessionChecks, afterExpired, 'Expired session entered a refresh timer loop.');
    checks.push('expired session clears local credential without a timer loop');

    // Restore only this QA account's encrypted record to independently verify
    // server-side revocation after the preceding expiry fault cleared it.
    restored.dispose();
    await writeFile(path.join(app.getPath('userData'), 'account.bin'), ciphertext, { mode: 0o600 });
    restored = new DesktopAuth(() => undefined);
    assert.equal((await restored.getState()).status, 'signed_in');

    const revoke = await authRequest('revoke-sessions', {}, browserCookies);
    assert.equal(revoke.status, 200, 'Server-side session revocation failed.');
    assert.equal((await restored.getState()).status, 'signed_out', 'Revoked desktop session remained authenticated.');
    checks.push('server revocation on revalidation');
    assert.equal((await restored.signOut()).status, 'signed_out');
    checks.push('local sign-out cleanup');
    await writeFile(path.join(output, 'desktop-auth-report.json'), JSON.stringify({ success: true, userId: state.user?.id, email, platform: process.platform, checks }, null, 2));
    console.log(`Desktop account verification passed: ${checks.length} real integration checks; no credentials emitted.`);
  } finally {
    shell.openExternal = originalOpen;
    globalThis.fetch = originalFetch;
    first?.dispose();
    restored?.dispose();
    if (browserCookies) await authRequest('sign-out', {}, browserCookies).catch(() => undefined);
    if (mailId) await fetch(`http://127.0.0.1:8025/api/v1/messages`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ IDs: [mailId] }),
      signal: AbortSignal.timeout(3_000),
    }).catch(() => undefined);
  }
}

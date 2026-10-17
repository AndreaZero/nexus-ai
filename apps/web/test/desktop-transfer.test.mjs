import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuthClient } from 'better-auth/client';
import { electronProxyClient } from '@better-auth/electron/proxy';
import { transferDesktopSession } from '../src/auth/desktop-transfer.ts';

test('browser transfer survives the default redirect plugin and dispatches the official OS callback', async (t) => {
  const scheme = 'io.github.andreazero.nexusai';
  const query = { client_id: 'nexus-desktop', state: '0123456789abcdef', code_challenge: 'a'.repeat(43) };
  const code = Buffer.from(JSON.stringify({ identifier: 'a'.repeat(32), state: query.state })).toString('base64url');
  const navigations = [];
  let cookie = '';
  let tick;
  const browser = { location: {
    set href(value) { navigations.push(value); },
    replace(value) { navigations.push(value); },
  } };
  t.mock.method(globalThis, 'setInterval', (callback) => { tick = callback; return 123; });
  t.mock.method(globalThis, 'clearInterval', () => undefined);
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: browser });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    get cookie() { return cookie; },
    set cookie(value) { cookie = value.includes('expires=Thu, 01 Jan 1970') ? '' : value; },
  } });
  t.after(() => {
    if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor);
    else delete globalThis.window;
    if (documentDescriptor) Object.defineProperty(globalThis, 'document', documentDescriptor);
    else delete globalThis.document;
  });
  const client = createAuthClient({
    baseURL: 'http://127.0.0.1:3001', basePath: '/auth',
    plugins: [electronProxyClient({ protocol: scheme, clientID: query.client_id, callbackPath: '/auth/callback' })],
    fetchOptions: { customFetchImpl: async (url, options) => {
      assert.equal(new URL(url).pathname, '/auth/electron/transfer-user');
      assert.equal(new URL(url).searchParams.get('state'), query.state);
      const body = JSON.parse(options.body);
      cookie = `better-auth.nexus-desktop=${code}`;
      // Response semantics of @better-auth/electron 1.7.10's transfer-user:
      // callbackURL sets redirect:true and triggers the real default fetch hook.
      return new Response(JSON.stringify({ url: body.callbackURL ?? null, redirect: Boolean(body.callbackURL), electron_authorization_code: 'a'.repeat(32) }), { headers: { 'Content-Type': 'application/json' } });
    } },
  });
  const result = await transferDesktopSession(client, query);
  assert.equal(result.error, null);
  assert.deepEqual(navigations, [], 'A page reload destroys the pending OS redirect.');
  assert.equal(typeof tick, 'function');
  tick();
  assert.deepEqual(navigations, [`${scheme}://auth/callback#token=${code}`]);
  assert.equal(cookie, '', 'The official proxy consumes the temporary redirect cookie.');
});

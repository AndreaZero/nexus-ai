import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { APP_URL, DEVELOPMENT_ORIGIN, developmentUrl, isTrustedIpcSender, isTrustedRendererUrl, isWithinDirectory, rendererAssetPath } from '../src/security.ts';

test('production assets stay inside the renderer and reject ambiguous paths', () => {
  const root = path.resolve('renderer');
  assert.equal(rendererAssetPath(APP_URL, root), path.join(root, 'index.html'));
  assert.equal(rendererAssetPath('nexus://app/assets/index.js', root), path.join(root, 'assets/index.js'));
  for (const url of [
    'nexus://evil/index.html', 'nexus://app.evil/index.html', 'nexus://user@app/index.html',
    'nexus://app:123/index.html', 'file:///secret', 'nexus://app/../secret',
    'nexus://app/%2e%2e/secret', 'nexus://app/%252e%252e/secret',
    'nexus://app/%2e%2e%5csecret', 'nexus://app/C:/secret', 'nexus://app/%00', 'nexus://app/%zz',
  ]) assert.throws(() => rendererAssetPath(url, root), Error, url);
  assert.equal(isWithinDirectory(root, `${root}-other/index.html`), false);
  assert.equal(isWithinDirectory(root, path.resolve(root, '..', 'secret')), false);
});

test('development is restricted to the explicit loopback origin and cannot override packages', () => {
  assert.equal(developmentUrl(DEVELOPMENT_ORIGIN, false), DEVELOPMENT_ORIGIN);
  assert.equal(developmentUrl(undefined, true), undefined);
  for (const url of ['https://127.0.0.1:5173', 'http://localhost:5173', 'http://127.0.0.1:51730', 'http://127.0.0.1:5173@evil']) {
    assert.throws(() => developmentUrl(url, false));
    assert.equal(isTrustedRendererUrl(url, DEVELOPMENT_ORIGIN), false);
  }
  assert.throws(() => developmentUrl(DEVELOPMENT_ORIGIN, true));
  assert.equal(isTrustedRendererUrl(APP_URL, DEVELOPMENT_ORIGIN), false);
  assert.equal(isTrustedRendererUrl(DEVELOPMENT_ORIGIN), false);
});

test('IPC requires the registered window, its main frame, and trusted origin', () => {
  const sender = { senderId: 9, mainFrame: true, url: APP_URL };
  assert.equal(isTrustedIpcSender(sender, 9), true);
  assert.equal(isTrustedIpcSender({ ...sender, senderId: 8 }, 9), false);
  assert.equal(isTrustedIpcSender({ ...sender, mainFrame: false }, 9), false);
  assert.equal(isTrustedIpcSender({ ...sender, url: 'https://evil.test' }, 9), false);
});

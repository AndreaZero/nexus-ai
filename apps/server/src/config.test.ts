import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import { readServerConfig, ServerConfigurationError } from './config.js';

test('server configuration defaults bind locally and allow only explicit renderer origins', () => {
  const config = readServerConfig({});
  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.port, 3001);
  assert.deepEqual(config.trustedProxies, []);
  assert.deepEqual(config.allowedOrigins, ['http://127.0.0.1:5173', 'nexus://app']);
});

test('proxy trust requires explicit bounded IP ranges without reflecting values', () => {
  assert.deepEqual(readServerConfig({ NEXUS_TRUSTED_PROXIES: '127.0.0.1,10.20.0.0/24,::1,127.0.0.1' }).trustedProxies, ['127.0.0.1', '10.20.0.0/24', '::1']);
  for (const value of ['true', '*', '0.0.0.0/0', '::/0', '127.0.0.1/33', '::1/129', 'secret.example', '10.0.0.1/24/2']) {
    assert.throws(() => readServerConfig({ NEXUS_TRUSTED_PROXIES: value }), (error: unknown) => error instanceof ServerConfigurationError && !error.message.includes(value));
  }
});

test('account URLs and SMTP are explicit and secrets remain server-only configuration', () => {
  const secret = randomBytes(32).toString('base64url');
  const config = readServerConfig({
    BETTER_AUTH_SECRET: secret,
    BETTER_AUTH_URL: 'http://127.0.0.1:3001',
    NEXUS_WEB_URL: 'http://127.0.0.1:5173',
    SMTP_HOST: '127.0.0.1', SMTP_PORT: '1025', SMTP_SECURE: 'false',
    NEXUS_EMAIL_FROM: 'Nexus AI <noreply@nexus.local>',
  });
  assert.equal(config.auth.secret, secret);
  assert.equal(config.auth.webURL, 'http://127.0.0.1:5173');
  assert.deepEqual(config.auth.mail, { host: '127.0.0.1', port: 1025, secure: false, from: 'Nexus AI <noreply@nexus.local>', credentials: null });
  assert.equal(readServerConfig({}).auth.secret, null);
  assert.equal(readServerConfig({}).auth.webURL, 'http://127.0.0.1:3001');
});

test('unsafe auth origins and incomplete mail configuration fail without reflecting values', () => {
  for (const env of [
    { BETTER_AUTH_URL: 'http://secret.example' },
    { NEXUS_WEB_URL: 'https://secret.example/path' },
    { NEXUS_WEB_URL: 'https://user:secret@example.test' },
    { BETTER_AUTH_SECRET: 'secret' },
    { BETTER_AUTH_SECRET: 'a'.repeat(64) },
    { SMTP_HOST: 'secret.example', SMTP_PORT: '70000', NEXUS_EMAIL_FROM: 'noreply@example.test' },
    { SMTP_HOST: 'secret.example', SMTP_SECURE: 'yes', NEXUS_EMAIL_FROM: 'noreply@example.test' },
    { SMTP_HOST: 'secret.example', SMTP_USER: 'secret', NEXUS_EMAIL_FROM: 'noreply@example.test' },
    { SMTP_PASSWORD: 'secret' },
    { SMTP_HOST: 'secret.example', NEXUS_EMAIL_FROM: 'sender@example.test\r\nBcc: secret@example.test' },
  ]) {
    assert.throws(() => readServerConfig(env), (error: unknown) => {
      assert.ok(error instanceof ServerConfigurationError);
      assert.equal(error.message.includes('secret'), false);
      return true;
    });
  }
});

test('server accepts explicit deployment configuration', () => {
  const config = readServerConfig({
    NEXUS_SERVER_HOST: '0.0.0.0',
    NEXUS_SERVER_PORT: '4010',
    NEXUS_ALLOWED_ORIGINS: 'https://nexus.example,nexus://app,https://nexus.example',
    NEXUS_LOG_LEVEL: 'warn',
  });
  assert.equal(config.host, '0.0.0.0');
  assert.equal(config.port, 4010);
  assert.deepEqual(config.allowedOrigins, ['https://nexus.example', 'nexus://app']);
});

test('invalid config fails with an actionable message without reflecting input', () => {
  for (const env of [
    { NEXUS_SERVER_HOST: 'https://secret.example' },
    { NEXUS_SERVER_PORT: '0' },
    { NEXUS_SERVER_PORT: '65536' },
    { NEXUS_SERVER_PORT: '3e3' },
    { NEXUS_SERVER_PORT: '' },
    { NEXUS_ALLOWED_ORIGINS: '*' },
    { NEXUS_ALLOWED_ORIGINS: 'null' },
    { NEXUS_ALLOWED_ORIGINS: 'https://secret.example/path' },
    { NEXUS_ALLOWED_ORIGINS: 'https://user:secret@example.test' },
    { NEXUS_ALLOWED_ORIGINS: '' },
    { NEXUS_LOG_LEVEL: 'secret' },
  ]) {
    assert.throws(() => readServerConfig(env), (error: unknown) => {
      assert.ok(error instanceof ServerConfigurationError);
      assert.equal(error.message.includes('secret'), false);
      return true;
    });
  }
});

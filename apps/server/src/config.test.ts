import assert from 'node:assert/strict';
import test from 'node:test';
import { readServerConfig, ServerConfigurationError } from './config.js';

test('server configuration defaults bind locally and allow only explicit renderer origins', () => {
  const config = readServerConfig({});
  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.port, 3001);
  assert.deepEqual(config.allowedOrigins, ['http://127.0.0.1:5173', 'nexus://app']);
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

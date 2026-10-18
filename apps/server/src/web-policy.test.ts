import assert from 'node:assert/strict';
import test from 'node:test';
import { webContentSecurityPolicy } from './web-policy.js';

test('hosted web CSP explicitly permits realtime on the exact HTTP or HTTPS authority', () => {
  for (const [http, socket] of [
    ['http://127.0.0.1:3001', 'ws://127.0.0.1:3001'],
    ['https://nexus.example.test', 'wss://nexus.example.test'],
    ['https://nexus.example.test:8443', 'wss://nexus.example.test:8443'],
  ]) {
    const policy = webContentSecurityPolicy(http!);
    assert.equal(policy.split('; ').find((rule) => rule.startsWith('connect-src')), `connect-src 'self' ${http} ${socket}`);
    assert.equal(policy.includes('*'), false);
    assert.ok(policy.includes("frame-ancestors 'none'"));
  }
});

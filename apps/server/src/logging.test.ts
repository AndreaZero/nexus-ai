import assert from 'node:assert/strict';
import test from 'node:test';
import { createServerLogStream, errorDiagnostic, logRoute } from './logging.js';
import { buildServer } from './app.js';
import { readServerConfig } from './config.js';

test('pretty server logs preserve useful fields and never print private or injected content', () => {
  const output: string[] = [];
  const stream = createServerLogStream(line => output.push(line), false);
  stream.write(JSON.stringify({ time: Date.UTC(2026, 9, 17, 16, 20), level: 50, event: 'auth.failure',
    requestId: 'req-17', method: 'POST', route: '/auth/sign-in/email?token=secret-token', statusCode: 503,
    durationMs: 14.25, category: 'database_authentication', errorCode: '28P01',
    msg: 'password=private-password', req: { headers: { cookie: 'private-cookie' } },
    err: { stack: 'private-stack' }, body: { email: 'private-email', password: 'private-password' } }));
  assert.equal(output.length, 1);
  assert.match(output[0]!, /16:20:00.000Z.*ERROR.*Errore account.*req-17.*POST.*\/auth\/sign-in\/email.*503.*14.3 ms.*database_authentication.*28P01/);
  assert.doesNotMatch(output.join(''), /secret-token|private-|password=/);
  assert.equal(output.join('').includes(String.fromCharCode(27)), false);
  stream.write('raw secret malformed JSON');
  stream.write(JSON.stringify({ level: 40, event: 'request.error', requestId: 'req\nforged', route: '/private-secret?token=also-secret', errorCode: 'secret-code', category: 'secret-category' }));
  assert.equal(output.length, 2);
  assert.match(output[1]!, /\/\[unmatched\]/);
  assert.doesNotMatch(output.join(''), /forged|private-secret|also-secret|secret-code|secret-category|raw secret/);
  const colored: string[] = [];
  createServerLogStream(line => colored.push(line), true).write(JSON.stringify({ event: 'request.completed', level: 30, statusCode: 200 }));
  assert.equal(colored[0]!.includes(`${String.fromCharCode(27)}[`), true);
});

test('diagnostics inspect nested stable codes while ignoring raw provider messages and SQL', () => {
  assert.deepEqual(errorDiagnostic(new Error('query with secrets', { cause: Object.assign(new Error('password failed'), { code: '28P01' }) })), { category: 'database_authentication', errorCode: '28P01' });
  assert.deepEqual(errorDiagnostic({ statusCode: 429, message: 'token' }), { category: 'rate_limited' });
  assert.deepEqual(errorDiagnostic({ code: 'ECONNREFUSED' }), { category: 'unavailable', errorCode: 'ECONNREFUSED' });
  assert.deepEqual(errorDiagnostic({ message: 'anything', code: 'token=secret' }), { category: 'internal' });
  assert.equal(logRoute('/auth/secret-token?secret'), '/auth/*');
  assert.equal(logRoute('/assets/private-filename.js?token'), '/assets/*');
});

test('HTTP logs correlate every request with status, time, rate limit and safe error category', async context => {
  const lines: string[] = [];
  const app = await buildServer(readServerConfig({ NEXUS_LOG_LEVEL: 'debug' }), line => lines.push(line));
  context.after(() => app.close());
  app.get('/qa-rate', async (_request, reply) => reply.header('Retry-After', 9).code(429).send({ error: 'rate_limited' }));
  app.get('/qa-error', async () => { throw new Error('SQL select private-data', { cause: Object.assign(new Error('private-password'), { code: '28P01' }) }); });
  const health = await app.inject('/health');
  assert.equal(health.statusCode, 200);
  assert.match(String(health.headers['x-request-id']), /^req-/);
  await app.inject('/qa-rate?token=private-token');
  await app.inject('/qa-error');
  await app.inject({ method: 'POST', url: '/auth/sign-in/email', payload: { email: 'private-email', password: 'private-password' }, headers: { cookie: 'private-cookie' } });
  await app.inject({ method: 'POST', url: '/api/collaboration', payload: { operation: 'listWorkspaces' }, headers: { origin: 'http://127.0.0.1:3001' } });
  const log = lines.join('');
  assert.equal((log.match(/Richiesta completata/g) ?? []).length, 5);
  assert.match(log, /#req-1.*GET.*\/health.*200.*ms/);
  assert.match(log, /429.*retryAfter=9s.*rate_limited/);
  assert.match(log, /database_authentication.*28P01/);
  assert.match(log, /operation=listWorkspaces/);
  assert.doesNotMatch(log, /private-|SQL select|qa-rate|qa-error/);
});

import chalk, { Chalk } from 'chalk';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { collaborationRequestSchema } from '@nexus-ai/contracts';

export type LogOutput = (line: string) => void;
const events: Record<string, string> = {
  'server.ready': 'Server pronto', 'server.stopping': 'Arresto server', 'server.stopped': 'Server arrestato',
  'server.start_failed': 'Avvio server fallito', 'server.message': 'Evento server',
  'request.started': 'Richiesta ricevuta', 'request.completed': 'Richiesta completata',
  'request.error': 'Errore richiesta', 'request.timeout': 'Timeout richiesta', 'request.aborted': 'Connessione interrotta',
  'auth.failure': 'Errore account', 'email.failure': 'Errore invio email',
  'collaboration.failure': 'Operazione workspace non riuscita',
};
const routes = new Set([
  '/', '/health', '/auth/status', '/auth/me', '/auth/get-session', '/auth/sign-in/email',
  '/auth/sign-up/email', '/auth/sign-out', '/auth/send-verification-email', '/auth/verify-email',
  '/auth/request-password-reset', '/auth/reset-password', '/auth/revoke-sessions',
  '/auth/electron/token', '/auth/electron/transfer-user', '/api/collaboration',
  '/sign-in', '/sign-up', '/verify-email', '/forgot-password', '/reset-password',
]);
const categories = new Set(['internal', 'configuration', 'database_authentication', 'database_unavailable',
  'database_query', 'rate_limited', 'invalid_request', 'origin_denied', 'timeout', 'email_delivery', 'unavailable']);
const knownCodes = new Set(['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT',
  'EADDRINUSE', 'EACCES', 'EPERM', 'ENOENT', 'ECONNECTION', 'ESOCKET', 'EAUTH', 'TOO_MANY_REQUESTS',
  'BAD_REQUEST', 'UNAUTHORIZED', 'FORBIDDEN', 'INTERNAL_SERVER_ERROR', 'NEXUS_ORIGIN_NOT_ALLOWED']);
const settings = new Set(['DATABASE_URL', 'BETTER_AUTH_URL', 'BETTER_AUTH_SECRET', 'NEXUS_WEB_URL',
  'SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASSWORD', 'NEXUS_EMAIL_FROM',
  'NEXUS_SERVER_HOST', 'NEXUS_SERVER_PORT', 'NEXUS_LOG_LEVEL', 'NEXUS_ALLOWED_ORIGINS']);
const operations = new Set<string>(collaborationRequestSchema.options.map(option => option.shape.operation.value));
const outcomes = new Set(['invalid_request', 'auth_required', 'forbidden', 'not_found', 'conflict', 'expired',
  'email_mismatch', 'already_member', 'last_owner', 'email_unavailable', 'unavailable']);
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const number = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Known endpoint labels only: query, fragment and arbitrary URL path values never reach logs. */
export function logRoute(url: string): string {
  const pathname = url.split(/[?#]/, 1)[0] ?? '';
  if (routes.has(pathname)) return pathname;
  if (pathname.startsWith('/auth/')) return '/auth/*';
  if (pathname.startsWith('/assets/')) return '/assets/*';
  return '/[unmatched]';
}

/** Inspect only stable error codes/status; messages, stacks, SQL and credentials stay private. */
export function errorDiagnostic(error: unknown): { category: string; errorCode?: string } {
  let current = error;
  for (let depth = 0; depth < 5 && record(current); depth++, current = current['cause']) {
    const code = current['code'];
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code) && /\d/.test(code)) {
      return { category: code.startsWith('28') ? 'database_authentication' : /^(08|53|57|58)/.test(code) ? 'database_unavailable' : 'database_query', errorCode: code };
    }
    if (current['statusCode'] === 429 || current['status'] === 'TOO_MANY_REQUESTS' || code === 'TOO_MANY_REQUESTS') return { category: 'rate_limited' };
    if (typeof code === 'string' && knownCodes.has(code)) return {
      category: code === 'ETIMEDOUT' ? 'timeout' : code === 'NEXUS_ORIGIN_NOT_ALLOWED' ? 'origin_denied'
        : ['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN'].includes(code) ? 'unavailable' : 'internal', errorCode: code,
    };
    if (current['name'] === 'EmailDeliveryError') return { category: 'email_delivery' };
  }
  return { category: 'internal' };
}

/** All output passes an allowlist even when Fastify/Pino supplies additional private fields. */
export function formatServerLog(value: unknown, color = chalk): string {
  if (!record(value)) return '';
  const time = number(value['time']) ? new Date(value['time']).toISOString().slice(11, 23) : '--:--:--.---';
  const level = number(value['level']) ? value['level'] : 30;
  const style = level >= 50 ? color.red : level >= 40 ? color.yellow : level <= 20 ? color.gray : color.cyan;
  const severity = level >= 60 ? 'FATAL' : level >= 50 ? 'ERROR' : level >= 40 ? 'WARN ' : level <= 20 ? 'DEBUG' : 'INFO ';
  const event = typeof value['event'] === 'string' && events[value['event']] ? value['event'] : 'server.message';
  const parts: string[] = [color.gray(`${time}Z`), style.bold(severity), color.blueBright('NEXUS'), events[event]!];
  if (typeof value['requestId'] === 'string' && /^[a-zA-Z0-9-]{1,64}$/.test(value['requestId'])) parts.push(color.gray(`#${value['requestId']}`));
  if (typeof value['method'] === 'string' && /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(value['method'])) parts.push(color.bold(value['method']));
  if (typeof value['route'] === 'string') parts.push(logRoute(value['route']));
  if (number(value['statusCode'])) {
    const status = value['statusCode'];
    parts.push((status >= 500 ? color.red : status >= 400 ? color.yellow : color.green)(String(status)));
  }
  if (number(value['durationMs'])) parts.push(color.gray(`${Math.max(0, value['durationMs']).toFixed(1)} ms`));
  if (number(value['retryAfterSeconds']) && value['retryAfterSeconds'] >= 0) parts.push(`retryAfter=${Math.ceil(value['retryAfterSeconds'])}s`);
  if (typeof value['category'] === 'string' && categories.has(value['category'])) parts.push(style(`[${value['category']}]`));
  if (typeof value['errorCode'] === 'string' && (knownCodes.has(value['errorCode']) || /^[0-9A-Z]{5}$/.test(value['errorCode']))) parts.push(`code=${value['errorCode']}`);
  if (typeof value['setting'] === 'string' && settings.has(value['setting'])) parts.push(`setting=${value['setting']}`);
  if (typeof value['operation'] === 'string' && operations.has(value['operation'])) parts.push(`operation=${value['operation']}`);
  if (typeof value['outcome'] === 'string' && outcomes.has(value['outcome'])) parts.push(`outcome=${value['outcome']}`);
  if (number(value['port']) && value['port'] > 0 && value['port'] <= 65535) parts.push(`port=${value['port']}`);
  if (typeof value['database'] === 'boolean') parts.push(`database=${value['database'] ? 'configured' : 'not_configured'}`);
  if (typeof value['accounts'] === 'boolean') parts.push(`accounts=${value['accounts'] ? 'configured' : 'not_configured'}`);
  return `${parts.join(' · ')}\n`;
}

export function createServerLogStream(output: LogOutput = line => { process.stdout.write(line); }, colors?: boolean) {
  const color = colors === undefined ? chalk : new Chalk({ level: colors ? 1 : 0 });
  return { write(line: string) {
    // Pino writes complete JSON records. Unknown/malformed records are dropped;
    // falling back to printing raw input could expose headers or provider errors.
    try { const formatted = formatServerLog(JSON.parse(line) as unknown, color); if (formatted) output(formatted); } catch { /* Log formatting must never crash a request. */ }
  } };
}

export function startupFailure(error: unknown): void {
  const message = error instanceof Error ? error.message : '';
  const setting = [...settings].find(name => message.includes(name));
  createServerLogStream().write(JSON.stringify({ time: Date.now(), level: 50, event: 'server.start_failed',
    ...errorDiagnostic(error), ...(setting ? { category: 'configuration', setting } : {}) }));
}

export function installRequestLogging(app: FastifyInstance): void {
  const starts = new WeakMap<FastifyRequest, number>();
  const fields = (request: FastifyRequest) => ({ requestId: request.id, method: request.method, route: logRoute(request.url) });
  app.addHook('onRequest', async (request, reply) => {
    starts.set(request, performance.now());
    reply.header('X-Request-ID', request.id);
    request.log.debug({ event: 'request.started', ...fields(request) });
  });
  app.addHook('onResponse', async (request, reply) => {
    const statusCode = reply.statusCode;
    const retry = Number(reply.getHeader('retry-after'));
    const domain = request.url.split('?', 1)[0] === '/api/collaboration' ? collaborationRequestSchema.safeParse(request.body) : null;
    const details = { event: 'request.completed', ...fields(request), statusCode,
      ...(domain?.success ? { operation: domain.data.operation } : {}),
      durationMs: performance.now() - (starts.get(request) ?? performance.now()),
      ...(statusCode === 429 ? { category: 'rate_limited', ...(Number.isFinite(retry) ? { retryAfterSeconds: retry } : {}) } : {}) };
    if (statusCode >= 500) request.log.error(details);
    else if (statusCode >= 400) request.log.warn(details);
    else request.log.info(details);
  });
  app.addHook('onError', async (request, _reply, error) => {
    request.log.error({ event: 'request.error', ...fields(request), ...errorDiagnostic(error) });
  });
  app.addHook('onTimeout', async (request) => { request.log.warn({ event: 'request.timeout', ...fields(request), category: 'timeout' }); });
  app.addHook('onRequestAbort', async (request) => { request.log.warn({ event: 'request.aborted', ...fields(request) }); });
}

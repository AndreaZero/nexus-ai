import {readOperationalReadiness} from './operations.js';
import {readinessResponseSchema} from '@nexus-ai/contracts';
import {applicationRequestSchema,applicationResponseSchema} from '@nexus-ai/contracts';
import {createApplicationService} from './application.js';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { collaborationRequestSchema, collaborationResponseSchema, healthResponseSchema, nexusUserSchema, sessionsRequestSchema, sessionsResponseSchema, realtimeApiRequestSchema, realtimeApiResponseSchema, overviewRequestSchema, overviewResponseSchema, pulseRequestSchema, pulseResponseSchema } from '@nexus-ai/contracts';
import { createDatabaseBoundary } from '@nexus-ai/db';
import Fastify, { LogController, type FastifyInstance } from 'fastify';
import { fromNodeHeaders } from 'better-auth/node';
import { APIError } from 'better-auth/api';
import { AUTH_CLIENT_IP_HEADER, DESKTOP_AUTH_ORIGIN, createNexusAuth } from './auth.js';
import { createEmailSender, EmailDeliveryError } from './email.js';
import type { ServerConfig } from './config.js';
import { createCollaborationService } from './collaboration.js';
import { createServerLogStream, errorDiagnostic, installRequestLogging, logRoute, type LogOutput } from './logging.js';
import { createSessionsService } from './sessions.js';
import { createRealtimeService } from './realtime.js';
import { installRealtimeSocket } from './realtime-socket.js';
import { createRealtimeBudget } from './realtime-rate.js';
import { createOverviewService } from './overview.js';
import { createPulseService } from './pulse.js';
import { createWorkService } from './work.js';
import { workRequestSchema, workResponseSchema } from '@nexus-ai/contracts';
import { repositoriesRequestSchema, repositoriesResponseSchema, repositoryScopeSchema } from '@nexus-ai/contracts';
import { createRepositoriesService } from './repositories.js';
import {deploymentsRequestSchema,deploymentsResponseSchema} from '@nexus-ai/contracts';
import {createDeploymentsService} from './deployments.js';
import {installDomainApi} from './domain-api.js';
import { webContentSecurityPolicy } from './web-policy.js';

class OriginNotAllowedError extends Error {
  readonly statusCode = 403;
  readonly code = 'NEXUS_ORIGIN_NOT_ALLOWED';

  constructor() {
    super('Origin non consentita.');
  }
}

export async function buildServer(config: ServerConfig, logOutput?: LogOutput): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.logLevel,
      redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
      stream: createServerLogStream(logOutput),
    },
    logController: new LogController({ disableRequestLogging: true }),
    bodyLimit: 1024 * 1024,
    requestTimeout: 30_000,
    trustProxy: config.trustedProxies.length ? [...config.trustedProxies] : false,
  });
  installRequestLogging(app);
  const database = createDatabaseBoundary(config.database);
  app.get('/ready',async(_request,reply)=>{
    reply.header('Cache-Control','no-store');
    const result=readinessResponseSchema.parse(await readOperationalReadiness(database,config,'0.16.0'));
    return reply.code(result.status==='ready'?200:503).send(result);
  });
  const mail = config.auth.mail ? createEmailSender(config.auth.mail) : null;
  const auth = createNexusAuth(config.auth, database, mail);
  const collaboration = createCollaborationService(database, mail, config.auth.webURL);
  const sessions = createSessionsService(database, error => app.log.error({ event: 'sessions.failure', ...errorDiagnostic(error) }));
  const realtime = createRealtimeService(database, error => app.log.error({ event: 'realtime.failure', ...errorDiagnostic(error) }));
  const realtimeOrigins = [config.auth.webURL, new URL(config.auth.baseURL).origin, DESKTOP_AUTH_ORIGIN];
  const realtimeBudget = createRealtimeBudget();
  const sessionReadBudget = createRealtimeBudget();
  const overviewBudget = createRealtimeBudget();
  const pulseBudget = createRealtimeBudget();
  const workBudget = createRealtimeBudget();
  const work = createWorkService(database, error => app.log.error({event: 'work.failure', ...errorDiagnostic(error)}));
  const repositories=createRepositoriesService(database,config.auth.secret,error=>app.log.error({event:'repositories.failure',...errorDiagnostic(error)}));
  const repositoriesBudget=createRealtimeBudget();
  const deployments=createDeploymentsService(database,error=>app.log.error({event:'request.error',...errorDiagnostic(error)}));
  installDomainApi(app,{path:'/api/deployments',origins:realtimeOrigins,request:deploymentsRequestSchema,response:deploymentsResponseSchema,execute:deployments.execute,
    async authenticate(request,reply){
      if(!auth)return null;const headers=fromNodeHeaders(request.headers);headers.set(AUTH_CLIENT_IP_HEADER,request.ip);for(const name of ['x-forwarded-for','x-real-ip','forwarded'])headers.delete(name);
      const result=await auth.api.getSession({headers,query:{disableCookieCache:true},returnHeaders:true});const cookies=result.headers.getSetCookie();if(cookies.length)reply.header('Set-Cookie',cookies);
      const current=result.response;if(!current?.user.emailVerified||current.session.expiresAt.getTime()<=Date.now())return null;return{id:current.user.id,email:current.user.email};
    }});
  const application=createApplicationService(database,error=>app.log.error({event:'request.error',...errorDiagnostic(error)}));
  installDomainApi(app,{path:'/api/application',origins:realtimeOrigins,request:applicationRequestSchema,response:applicationResponseSchema,execute:application.execute,
    async authenticate(request,reply){
      if(!auth)return null;const headers=fromNodeHeaders(request.headers);headers.set(AUTH_CLIENT_IP_HEADER,request.ip);for(const name of ['x-forwarded-for','x-real-ip','forwarded'])headers.delete(name);
      const result=await auth.api.getSession({headers,query:{disableCookieCache:true},returnHeaders:true});const cookies=result.headers.getSetCookie();if(cookies.length)reply.header('Set-Cookie',cookies);
      const current=result.response;if(!current?.user.emailVerified||current.session.expiresAt.getTime()<=Date.now())return null;return{id:current.user.id,email:current.user.email};
    }});
  const overview = createOverviewService(database, error => app.log.error({ event: 'overview.failure', ...errorDiagnostic(error) }));
  const pulse = createPulseService(database, error => app.log.error({ event: 'pulse.failure', ...errorDiagnostic(error) }));
  const realtimeSocket = installRealtimeSocket(app, {
    service: realtime, origins: realtimeOrigins,
    async authorize(request) {
      if (!auth) return null;
      const headers = fromNodeHeaders(request.headers);
      headers.set(AUTH_CLIENT_IP_HEADER, request.socket.remoteAddress ?? '127.0.0.1');
      for (const name of ['x-forwarded-for', 'x-real-ip', 'forwarded']) headers.delete(name);
      const result = await auth.api.getSession({ headers, query: { disableCookieCache: true } });
      if (!result?.user.emailVerified || result.session.expiresAt.getTime() <= Date.now()) return null;
      return { id: result.user.id, email: result.user.email };
    },
    report(event, outcome) { app.log.info({ event, ...(outcome ? { outcome } : {}) }); },
  });
  app.addHook('preClose', async () => { await realtimeSocket.close(); });
  app.addHook('onClose', async () => {
    mail?.close();
    await database.close();
  });

  app.setErrorHandler((error, request, reply) => {
    const isCollaboration = ['/api/collaboration', '/api/sessions', '/api/realtime', '/api/overview', '/api/pulse', '/api/work', '/api/repositories','/api/repositories/credential','/api/deployments','/api/application'].includes(request.url.split('?')[0] ?? '');
    if (isCollaboration) { reply.header('Cache-Control', 'no-store'); reply.header('Referrer-Policy', 'no-referrer'); }
    if (error instanceof OriginNotAllowedError) {
      if (isCollaboration) return reply.code(403).send({ ok: false, code: 'forbidden', message: 'Origine della richiesta non consentita.' });
      return reply.code(403).send({ error: 'origin_not_allowed', message: 'Origin non consentita.' });
    }
    if (typeof error === 'object' && error !== null && 'statusCode' in error) {
      const statusCode = error.statusCode;
      if (typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500) {
        if (isCollaboration) return reply.code(statusCode).send({ ok: false, code: 'invalid_request', message: 'Richiesta collaborazione non valida.' });
        return reply.code(statusCode).send({ error: 'invalid_request', message: 'Richiesta non valida.' });
      }
    }
    app.log.error({ event: 'request.error', requestId: request.id, route: logRoute(request.url), ...errorDiagnostic(error) });
    if (isCollaboration) return reply.code(503).send({ ok: false, code: 'unavailable', message: 'Servizio collaborazione temporaneamente non disponibile.' });
    return reply.code(500).send({ error: 'internal_error', message: 'Errore interno del server.' });
  });

  // Auth and collaboration are the only credentialed domains. Health remains read-only.
  await app.register(cors, {
    delegator(request, callback) {
      const requestPath = request.url.split('?')[0];
      const isAuth = requestPath?.startsWith('/auth/') || requestPath === '/api/collaboration' || requestPath === '/api/sessions' || requestPath === '/api/realtime' || requestPath === '/api/overview' || requestPath === '/api/pulse' || requestPath === '/api/work' || requestPath === '/api/repositories' || requestPath === '/api/repositories/credential' || requestPath === '/api/deployments' || requestPath === '/api/application';
      const origin = request.headers.origin;
      const allowed = isAuth
        ? origin === config.auth.webURL || origin === new URL(config.auth.baseURL).origin || origin === DESKTOP_AUTH_ORIGIN
        : origin === new URL(config.auth.baseURL).origin || config.allowedOrigins.includes(origin ?? '');
      if (origin !== undefined && !allowed) return callback(new OriginNotAllowedError());
      callback(null, {
        origin: origin ?? false,
        methods: isAuth ? ['GET', 'POST', 'OPTIONS'] : ['GET', 'HEAD', 'OPTIONS'],
        credentials: isAuth,
        allowedHeaders: isAuth ? ['Content-Type', 'Authorization', 'Better-Auth-Cookie'] : ['Content-Type'],
        exposedHeaders: isAuth ? ['X-Retry-After'] : [],
        strictPreflight: true,
      });
    },
  });

  app.post('/api/collaboration', { bodyLimit: 16 * 1024 }, async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    reply.header('Referrer-Policy', 'no-referrer');
    const fail = (status: number, code: 'invalid_request' | 'forbidden' | 'auth_required' | 'unavailable', message: string) =>
      reply.code(status).send(collaborationResponseSchema.parse({ ok: false, code, message }));
    const origin = request.headers.origin;
    if (!origin || ![config.auth.webURL, new URL(config.auth.baseURL).origin, DESKTOP_AUTH_ORIGIN].includes(origin)) {
      return fail(403, 'forbidden', 'Origine della richiesta non consentita.');
    }
    if (request.headers['content-type']?.split(';')[0]?.trim().toLowerCase() !== 'application/json') {
      return fail(400, 'invalid_request', 'È richiesta una richiesta JSON.');
    }
    const input = collaborationRequestSchema.safeParse(request.body);
    if (!input.success) return fail(400, 'invalid_request', 'Richiesta collaborazione non valida.');
    if (!auth) return fail(503, 'unavailable', 'Servizio account non disponibile.');
    try {
      const headers = fromNodeHeaders(request.headers);
      headers.set(AUTH_CLIENT_IP_HEADER, request.ip);
      headers.delete('x-forwarded-for');
      headers.delete('x-real-ip');
      headers.delete('forwarded');
      const result = await auth.api.getSession({ headers, query: { disableCookieCache: true }, returnHeaders: true });
      const cookies = result.headers.getSetCookie();
      if (cookies.length) reply.header('Set-Cookie', cookies);
      const session = result.response;
      if (!session || !session.user.emailVerified || session.session.expiresAt.getTime() <= Date.now()) {
        return fail(401, 'auth_required', 'Accedi con un account verificato per continuare.');
      }
      const resultDTO = await collaboration.execute({ id: session.user.id, email: session.user.email }, input.data);
      if (!resultDTO.ok) app.log.warn({ event: 'collaboration.failure', requestId: request.id, operation: input.data.operation, outcome: resultDTO.code });
      return reply.send(resultDTO);
    } catch (error) {
      app.log.error({ event: 'collaboration.failure', requestId: request.id, operation: input.data.operation, ...errorDiagnostic(error) });
      return fail(503, 'unavailable', 'Servizio collaborazione temporaneamente non disponibile.');
    }
  });

  app.post('/api/sessions', { bodyLimit: 1024 * 1024 }, async (request, reply) => {
    reply.header('Cache-Control', 'no-store'); reply.header('Referrer-Policy', 'no-referrer');
    const fail = (status: number, code: 'invalid_request' | 'forbidden' | 'auth_required' | 'unavailable', message: string) =>
      reply.code(status).send(sessionsResponseSchema.parse({ ok: false, code, message }));
    const origin = request.headers.origin;
    if (!origin || ![config.auth.webURL, new URL(config.auth.baseURL).origin, DESKTOP_AUTH_ORIGIN].includes(origin)) return fail(403, 'forbidden', 'Origine della richiesta non consentita.');
    if (request.headers['content-type']?.split(';')[0]?.trim().toLowerCase() !== 'application/json') return fail(400, 'invalid_request', 'È richiesta una richiesta JSON.');
    const input = sessionsRequestSchema.safeParse(request.body);
    if (!input.success) return fail(400, 'invalid_request', 'Estratto o richiesta sessione non validi.');
    if (!auth) return fail(503, 'unavailable', 'Servizio account non disponibile.');
    try {
      const headers = fromNodeHeaders(request.headers);
      headers.set(AUTH_CLIENT_IP_HEADER, request.ip);
      for (const name of ['x-forwarded-for', 'x-real-ip', 'forwarded']) headers.delete(name);
      const result = await auth.api.getSession({ headers, query: { disableCookieCache: true }, returnHeaders: true });
      const cookies = result.headers.getSetCookie(); if (cookies.length) reply.header('Set-Cookie', cookies);
      const account = result.response;
      if (!account?.user.emailVerified || account.session.expiresAt.getTime() <= Date.now()) return fail(401, 'auth_required', 'Accedi con un account verificato per continuare.');
      const outcome = sessionsResponseSchema.parse(await sessions.execute({ id: account.user.id, email: account.user.email }, input.data));
      if (!outcome.ok) app.log.warn({ event: 'sessions.failure', requestId: request.id, operation: input.data.operation, outcome: outcome.code });
      return reply.send(outcome);
    } catch (error) {
      app.log.error({ event: 'sessions.failure', requestId: request.id, operation: input.data.operation, ...errorDiagnostic(error) });
      return fail(503, 'unavailable', 'Servizio sessioni temporaneamente non disponibile.');
    }
  });

  app.get('/health', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    return healthResponseSchema.parse({
      schemaVersion: 1,
      service: 'nexus-server',
      version: '0.16.0',
      status: 'ok',
      database: await database.check(),
      codex: 'local_only',
      timestamp: new Date().toISOString(),
    });
  });

  app.post('/api/realtime', { bodyLimit: 1024 * 1024 }, async (request, reply) => {
    reply.header('Cache-Control', 'no-store'); reply.header('Referrer-Policy', 'no-referrer');
    const fail = (status: number, code: 'invalid_request' | 'forbidden' | 'auth_required' | 'unavailable', message: string) =>
      reply.code(status).send(realtimeApiResponseSchema.parse({ ok: false, code, message }));
    const ipBudget = realtimeBudget.consume(`ip:${request.ip}`, 1000);
    if (!ipBudget.allowed) { reply.header('Retry-After', String(ipBudget.retryAfterSeconds)); return fail(429, 'unavailable', 'Troppe richieste realtime. Riprova tra poco.'); }
    if (!realtimeOrigins.includes(request.headers.origin ?? '')) return fail(403, 'forbidden', 'Origine della richiesta non consentita.');
    if (request.headers['content-type']?.split(';')[0]?.trim().toLowerCase() !== 'application/json') return fail(400, 'invalid_request', 'È richiesta una richiesta JSON.');
    const input = realtimeApiRequestSchema.safeParse(request.body);
    if (!input.success) return fail(400, 'invalid_request', 'Richiesta realtime non valida.');
    if (!auth) return fail(503, 'unavailable', 'Servizio account non disponibile.');
    try {
      const headers = fromNodeHeaders(request.headers); headers.set(AUTH_CLIENT_IP_HEADER, request.ip);
      for (const name of ['x-forwarded-for', 'x-real-ip', 'forwarded']) headers.delete(name);
      const result = await auth.api.getSession({ headers, query: { disableCookieCache: true }, returnHeaders: true });
      const cookies = result.headers.getSetCookie(); if (cookies.length) reply.header('Set-Cookie', cookies);
      const account = result.response;
      if (!account?.user.emailVerified || account.session.expiresAt.getTime() <= Date.now()) return fail(401, 'auth_required', 'Accedi con un account verificato per continuare.');
      const accountBudget = realtimeBudget.consume(`account:${account.user.id}`, 600);
      if (!accountBudget.allowed) { reply.header('Retry-After', String(accountBudget.retryAfterSeconds)); return fail(429, 'unavailable', 'Troppe richieste realtime. Riprova tra poco.'); }
      const outcome = realtimeApiResponseSchema.parse(await realtime.execute({ id: account.user.id, email: account.user.email }, input.data));
      if (!outcome.ok) app.log.warn({ event: 'realtime.failure', requestId: request.id, operation: input.data.operation, outcome: outcome.code });
      return reply.send(outcome);
    } catch (error) {
      app.log.error({ event: 'realtime.failure', requestId: request.id, operation: input.data.operation, ...errorDiagnostic(error) });
      return fail(503, 'unavailable', 'Realtime temporaneamente non disponibile.');
    }
  });

  app.post('/api/overview', { bodyLimit: 16 * 1024 }, async (request, reply) => {
    reply.header('Cache-Control', 'no-store'); reply.header('Referrer-Policy', 'no-referrer');
    const fail = (status: number, code: 'invalid_request' | 'forbidden' | 'auth_required' | 'unavailable', message: string) =>
      reply.code(status).send(overviewResponseSchema.parse({ ok: false, code, message }));
    const ipBudget = overviewBudget.consume(`ip:${request.ip}`, 600);
    if (!ipBudget.allowed) { reply.header('Retry-After', String(ipBudget.retryAfterSeconds)); return fail(429, 'unavailable', 'Troppe richieste overview. Riprova tra poco.'); }
    if (!realtimeOrigins.includes(request.headers.origin ?? '')) return fail(403, 'forbidden', 'Origine della richiesta non consentita.');
    if (request.headers['content-type']?.split(';')[0]?.trim().toLowerCase() !== 'application/json') return fail(400, 'invalid_request', 'È richiesta una richiesta JSON.');
    const input = overviewRequestSchema.safeParse(request.body);
    if (!input.success) return fail(400, 'invalid_request', 'Richiesta overview non valida.');
    if (!auth) return fail(503, 'unavailable', 'Servizio account non disponibile.');
    try {
      const headers = fromNodeHeaders(request.headers); headers.set(AUTH_CLIENT_IP_HEADER, request.ip);
      for (const name of ['x-forwarded-for', 'x-real-ip', 'forwarded']) headers.delete(name);
      const result = await auth.api.getSession({ headers, query: { disableCookieCache: true }, returnHeaders: true });
      const cookies = result.headers.getSetCookie(); if (cookies.length) reply.header('Set-Cookie', cookies);
      const account = result.response;
      if (!account?.user.emailVerified || account.session.expiresAt.getTime() <= Date.now()) return fail(401, 'auth_required', 'Accedi con un account verificato per continuare.');
      const accountBudget = overviewBudget.consume(`account:${account.user.id}`, 240);
      if (!accountBudget.allowed) { reply.header('Retry-After', String(accountBudget.retryAfterSeconds)); return fail(429, 'unavailable', 'Troppe richieste overview. Riprova tra poco.'); }
      const outcome = overviewResponseSchema.parse(await overview.execute({ id: account.user.id, email: account.user.email }, input.data));
      if (!outcome.ok) app.log.warn({ event: 'overview.failure', requestId: request.id, operation: input.data.operation, outcome: outcome.code });
      return reply.send(outcome);
    } catch (error) {
      app.log.error({ event: 'overview.failure', requestId: request.id, operation: input.data.operation, ...errorDiagnostic(error) });
      return fail(503, 'unavailable', 'Overview temporaneamente non disponibile.');
    }
  });

  app.post('/api/pulse', { bodyLimit: 16 * 1024 }, async (request, reply) => {
    reply.header('Cache-Control', 'no-store'); reply.header('Referrer-Policy', 'no-referrer');
    const fail = (status: number, code: 'invalid_request' | 'forbidden' | 'auth_required' | 'unavailable', message: string) =>
      reply.code(status).send(pulseResponseSchema.parse({ ok: false, code, message }));
    const ipBudget = pulseBudget.consume(`ip:${request.ip}`, 600);
    if (!ipBudget.allowed) { reply.header('Retry-After', String(ipBudget.retryAfterSeconds)); return fail(429, 'unavailable', 'Troppe richieste Pulse. Riprova tra poco.'); }
    if (!realtimeOrigins.includes(request.headers.origin ?? '')) return fail(403, 'forbidden', 'Origine della richiesta non consentita.');
    if (request.headers['content-type']?.split(';')[0]?.trim().toLowerCase() !== 'application/json') return fail(400, 'invalid_request', 'È richiesta una richiesta JSON.');
    const input = pulseRequestSchema.safeParse(request.body);
    if (!input.success) return fail(400, 'invalid_request', 'Richiesta Pulse non valida.');
    if (!auth) return fail(503, 'unavailable', 'Servizio account non disponibile.');
    try {
      const headers = fromNodeHeaders(request.headers); headers.set(AUTH_CLIENT_IP_HEADER, request.ip);
      for (const name of ['x-forwarded-for', 'x-real-ip', 'forwarded']) headers.delete(name);
      const result = await auth.api.getSession({ headers, query: { disableCookieCache: true }, returnHeaders: true });
      const cookies = result.headers.getSetCookie(); if (cookies.length) reply.header('Set-Cookie', cookies);
      const account = result.response;
      if (!account?.user.emailVerified || account.session.expiresAt.getTime() <= Date.now()) return fail(401, 'auth_required', 'Accedi con un account verificato per continuare.');
      const accountBudget = pulseBudget.consume(`account:${account.user.id}`, 240);
      if (!accountBudget.allowed) { reply.header('Retry-After', String(accountBudget.retryAfterSeconds)); return fail(429, 'unavailable', 'Troppe richieste Pulse. Riprova tra poco.'); }
      const outcome = pulseResponseSchema.parse(await pulse.execute({ id: account.user.id, email: account.user.email }, input.data));
      if (!outcome.ok) app.log.warn({ event: 'pulse.failure', requestId: request.id, operation: input.data.operation, outcome: outcome.code });
      return reply.send(outcome);
    } catch (error) {
      app.log.error({ event: 'pulse.failure', requestId: request.id, operation: input.data.operation, ...errorDiagnostic(error) });
      return fail(503, 'unavailable', 'Pulse temporaneamente non disponibile.');
    }
  });

  app.post('/api/work', { bodyLimit: 2 * 1024 * 1024 }, async (request, reply) => {
    reply.header('Cache-Control', 'no-store'); reply.header('Referrer-Policy', 'no-referrer');
    const fail = (status: number, code: 'invalid_request' | 'forbidden' | 'auth_required' | 'unavailable', message: string) =>
      reply.code(status).send(workResponseSchema.parse({ ok: false, code, message }));
    const ipBudget = workBudget.consume(`ip:${request.ip}`, 1200);
    if (!ipBudget.allowed) { reply.header('Retry-After', String(ipBudget.retryAfterSeconds)); return fail(429, 'unavailable', 'Troppe richieste Project work. Riprova tra poco.'); }
    if (!realtimeOrigins.includes(request.headers.origin ?? '')) return fail(403, 'forbidden', 'Origine della richiesta non consentita.');
    if (request.headers['content-type']?.split(';')[0]?.trim().toLowerCase() !== 'application/json') return fail(400, 'invalid_request', 'È richiesta una richiesta JSON.');
    const input = workRequestSchema.safeParse(request.body);
    if (!input.success) return fail(400, 'invalid_request', 'Richiesta Project work non valida.');
    if (!auth) return fail(503, 'unavailable', 'Servizio account non disponibile.');
    try {
      const headers = fromNodeHeaders(request.headers); headers.set(AUTH_CLIENT_IP_HEADER, request.ip);
      for (const name of ['x-forwarded-for', 'x-real-ip', 'forwarded']) headers.delete(name);
      const result = await auth.api.getSession({ headers, query: { disableCookieCache: true }, returnHeaders: true });
      const cookies = result.headers.getSetCookie(); if (cookies.length) reply.header('Set-Cookie', cookies);
      const account = result.response;
      if (!account?.user.emailVerified || account.session.expiresAt.getTime() <= Date.now()) return fail(401, 'auth_required', 'Accedi con un account verificato per continuare.');
      const accountBudget = workBudget.consume(`account:${account.user.id}`, 600);
      if (!accountBudget.allowed) { reply.header('Retry-After', String(accountBudget.retryAfterSeconds)); return fail(429, 'unavailable', 'Troppe richieste Project work. Riprova tra poco.'); }
      const outcome = workResponseSchema.parse(await work.execute({ id: account.user.id, email: account.user.email }, input.data));
      if (!outcome.ok) app.log.warn({ event: 'work.failure', requestId: request.id, operation: input.data.operation, outcome: outcome.code });
      return reply.send(outcome);
    } catch (error) {
      app.log.error({ event: 'work.failure', requestId: request.id, operation: input.data.operation, ...errorDiagnostic(error) });
      return fail(503, 'unavailable', 'Project work temporaneamente non disponibile.');
    }
  });

  for(const endpoint of ['/api/repositories','/api/repositories/credential'] as const){
    app.post(endpoint,{bodyLimit:64*1024},async(request,reply)=>{
      reply.header('Cache-Control','no-store');reply.header('Referrer-Policy','no-referrer');
      const fail=(status:number,code:'invalid_request'|'forbidden'|'auth_required'|'unavailable'|'rate_limited',message:string)=>reply.code(status).send({ok:false,code,message});
      const budget=repositoriesBudget.consume(`ip:${request.ip}`,300);
      if(!budget.allowed){reply.header('Retry-After',String(budget.retryAfterSeconds));return fail(429,'rate_limited','Too many repository requests. Retry shortly.');}
      const origins=endpoint.endsWith('/credential')?[DESKTOP_AUTH_ORIGIN]:realtimeOrigins;
      if(!origins.includes(request.headers.origin??''))return fail(403,'forbidden','Request origin unavailable.');
      if(request.headers['content-type']?.split(';')[0]?.trim().toLowerCase()!=='application/json')return fail(400,'invalid_request','JSON required.');
      const parsed=endpoint.endsWith('/credential')?repositoryScopeSchema.safeParse(request.body):repositoriesRequestSchema.safeParse(request.body);
      if(!parsed.success)return fail(400,'invalid_request','Invalid repository request.');
      if(!auth)return fail(503,'unavailable','Account service unavailable.');
      try{
        const headers=fromNodeHeaders(request.headers);headers.set(AUTH_CLIENT_IP_HEADER,request.ip);
        for(const name of ['x-forwarded-for','x-real-ip','forwarded'])headers.delete(name);
        const current=await auth.api.getSession({headers,query:{disableCookieCache:true},returnHeaders:true});
        const cookies=current.headers.getSetCookie();if(cookies.length)reply.header('Set-Cookie',cookies);
        const account=current.response;
        if(!account?.user.emailVerified||account.session.expiresAt.getTime()<=Date.now())return fail(401,'auth_required','Sign in with a verified Nexus account.');
        const accountBudget=repositoriesBudget.consume(`account:${account.user.id}`,180);
        if(!accountBudget.allowed){reply.header('Retry-After',String(accountBudget.retryAfterSeconds));return fail(429,'rate_limited','Too many repository requests. Retry shortly.');}
        const actor={id:account.user.id,email:account.user.email};
        if(endpoint.endsWith('/credential')){
          const value=await repositories.credential(actor,parsed.data.projectId,parsed.data.repositoryId);
          return value?reply.send(value):fail(403,'forbidden','Reconnect GitHub for this repository.');
        }
        const value=repositoriesResponseSchema.parse(await repositories.execute(actor,repositoriesRequestSchema.parse(parsed.data)));
        if(!value.ok)app.log.warn({event:'repositories.failure',requestId:request.id,outcome:value.code});
        return reply.send(value);
      }catch(error){app.log.error({event:'repositories.failure',requestId:request.id,...errorDiagnostic(error)});return fail(503,'unavailable','Repository service unavailable.');}
    });
  }
  // Encapsulated parser preserves the exact bytes covered by GitHub's signature.
  await app.register(async hook=>{
    hook.removeContentTypeParser('application/json');
    hook.addContentTypeParser('application/json',{parseAs:'buffer'},(_request,body,done)=>done(null,body));
    hook.post<{Params:{repositoryId:string}}>('/api/repositories/webhook/:repositoryId',{bodyLimit:1024*1024},async(request,reply)=>{
      reply.header('Cache-Control','no-store');
      const budget=repositoriesBudget.consume(`webhook:${request.ip}`,300);
      if(!budget.allowed){reply.header('Retry-After',String(budget.retryAfterSeconds));return reply.code(429).send({ok:false});}
      if(!repositoryScopeSchema.shape.repositoryId.safeParse(request.params.repositoryId).success||!Buffer.isBuffer(request.body))return reply.code(400).send({ok:false});
      const header=(name:string)=>typeof request.headers[name]==='string'?request.headers[name] as string:'';
      const result=await repositories.webhook(request.params.repositoryId,{delivery:header('x-github-delivery'),event:header('x-github-event'),signature:header('x-hub-signature-256')},request.body);
      if(result.status>=400)app.log.warn({event:'repositories.failure',requestId:request.id,outcome:'invalid_request'});
      return reply.code(result.status).send({ok:result.status<400});
    });
  });

  const unavailable = { error: 'auth_unavailable', message: 'Accesso non disponibile. Verificare database, configurazione account e servizio email.' };
  app.get('/auth/status', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    return { configured: auth !== null, emailConfigured: mail !== null };
  });
  app.get('/auth/me', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (!auth) return reply.code(503).send(unavailable);
    try {
      const headers = fromNodeHeaders(request.headers);
      headers.set(AUTH_CLIENT_IP_HEADER, request.ip);
      headers.delete('x-forwarded-for');
      headers.delete('x-real-ip');
      headers.delete('forwarded');
      const result = await auth.api.getSession({ headers, query: { disableCookieCache: true }, returnHeaders: true });
      const cookies = result.headers.getSetCookie();
      if (cookies.length) reply.header('Set-Cookie', cookies);
      const session = result.response;
      if (!session || !session.user.emailVerified) return { user: null, expiresAt: null };
      return {
        user: nexusUserSchema.parse({ id: session.user.id, name: session.user.name, email: session.user.email, emailVerified: session.user.emailVerified, image: session.user.image ?? null }),
        expiresAt: session.session.expiresAt.toISOString(),
      };
    } catch (error) {
      app.log.error({ event: 'auth.failure', requestId: request.id, route: '/auth/me', ...errorDiagnostic(error) });
      return reply.code(503).send(unavailable);
    }
  });
  app.route({
    method: ['GET', 'POST'],
    url: '/auth/*',
    bodyLimit: 16 * 1024,
    async handler(request, reply) {
      const startedAt = Date.now();
      const requestPath = request.url.split('?')[0] ?? '';
      const emailRequest = request.method === 'POST' && ['/auth/sign-up/email', '/auth/send-verification-email', '/auth/request-password-reset'].includes(requestPath);
      reply.header('Cache-Control', 'no-store');
      reply.header('Referrer-Policy', 'no-referrer');
      let canonicalPath: string;
      try { canonicalPath = decodeURIComponent(new URL(request.url, config.auth.baseURL).pathname).replace(/\/+/g, '/').replace(/\/+$/, ''); }
      catch { return reply.code(400).send({ message: 'Invalid account request.' }); }
      if (canonicalPath === '/auth/get-session') {
        const budget = sessionReadBudget.consume(`session:${request.ip}`, 100);
        if (!budget.allowed) {
          reply.header('Retry-After', String(budget.retryAfterSeconds));
          return reply.code(429).send({ message: 'Too many account checks. Retry after the indicated delay.' });
        }
      }
      if (!auth || !mail) return reply.code(503).send(unavailable);
      try {
        // Fixed configured baseURL: Host and forwarded headers cannot construct email links.
        const url = new URL(request.url, config.auth.baseURL);
        if (url.origin !== new URL(config.auth.baseURL).origin) {
          return reply.code(400).send({ error: 'invalid_request', message: 'Richiesta non valida.' });
        }
        const headers = fromNodeHeaders(request.headers);
        headers.set(AUTH_CLIENT_IP_HEADER, request.ip);
        headers.delete('x-forwarded-for');
        headers.delete('x-real-ip');
        headers.delete('forwarded');
        if (emailRequest) await mail?.verify();
        const delivery = await mail.track(() => auth.handler(new Request(url, {
          method: request.method,
          headers,
          ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
        })));
        const response = delivery.result;
        // Better Auth deliberately catches some email hook failures. Preserve their
        // request-local outcome so the UI never reports a failed send as queued.
        if (delivery.failed) throw new EmailDeliveryError();
        reply.code(response.status);
        response.headers.forEach((value, key) => {
          if (key !== 'set-cookie') reply.header(key, value);
        });
        const cookies = response.headers.getSetCookie();
        if (cookies.length) reply.header('Set-Cookie', cookies);
        if (emailRequest) await delay(Math.max(0, 500 - (Date.now() - startedAt)));
        return reply.send(response.body ? await response.text() : null);
      } catch (error) {
        if (emailRequest) await delay(Math.max(0, 500 - (Date.now() - startedAt)));
        if (error instanceof EmailDeliveryError) {
          app.log.error({ event: 'email.failure', requestId: request.id, route: logRoute(request.url), ...errorDiagnostic(error) });
          return reply.code(503).send({ error: 'email_unavailable', message: error.message });
        }
        if (error instanceof APIError && error.statusCode >= 400 && error.statusCode < 500) {
          app.log.warn({ event: 'auth.failure', requestId: request.id, route: logRoute(request.url), statusCode: error.statusCode, ...errorDiagnostic(error) });
          return reply.code(error.statusCode).send(error.body);
        }
        app.log.error({ event: 'auth.failure', requestId: request.id, route: logRoute(request.url), ...errorDiagnostic(error) });
        return reply.code(503).send(unavailable);
      }
    },
  });

  const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist');
  if (existsSync(path.join(webRoot, 'index.html'))) {
    await app.register(fastifyStatic, {
      root: webRoot,
      wildcard: false,
      index: false,
      setHeaders(response) {
        response.header('X-Content-Type-Options', 'nosniff');
        response.header('Referrer-Policy', 'no-referrer');
        response.header('Cache-Control', 'no-cache');
        response.header('Content-Security-Policy', webContentSecurityPolicy(config.auth.baseURL));
      },
    });
    for (const route of ['/', '/sign-in', '/sign-up', '/forgot-password', '/reset-password', '/verify-email', '/desktop-auth']) {
      app.get(route, async (_request, reply) => reply.sendFile('index.html'));
    }
  }

  app.setNotFoundHandler((_request, reply) => {
    return reply.code(404).send({ error: 'not_found', message: 'Risorsa non disponibile.' });
  });

  return app;
}

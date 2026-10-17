import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { collaborationRequestSchema, collaborationResponseSchema, healthResponseSchema, nexusUserSchema } from '@nexus-ai/contracts';
import { createDatabaseBoundary } from '@nexus-ai/db';
import Fastify, { LogController, type FastifyInstance } from 'fastify';
import { fromNodeHeaders } from 'better-auth/node';
import { APIError } from 'better-auth/api';
import { AUTH_CLIENT_IP_HEADER, DESKTOP_AUTH_ORIGIN, createNexusAuth } from './auth.js';
import { createEmailSender, EmailDeliveryError } from './email.js';
import type { ServerConfig } from './config.js';
import { createCollaborationService } from './collaboration.js';

class OriginNotAllowedError extends Error {
  readonly statusCode = 403;
  readonly code = 'NEXUS_ORIGIN_NOT_ALLOWED';

  constructor() {
    super('Origin non consentita.');
  }
}

export async function buildServer(config: ServerConfig): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.logLevel,
      redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
    },
    logController: new LogController({ disableRequestLogging: true }),
    bodyLimit: 1024 * 1024,
    requestTimeout: 30_000,
    trustProxy: false,
  });
  const database = createDatabaseBoundary(config.database);
  const mail = config.auth.mail ? createEmailSender(config.auth.mail) : null;
  const auth = createNexusAuth(config.auth, database, mail);
  const collaboration = createCollaborationService(database, mail, config.auth.webURL);
  app.addHook('onClose', async () => {
    mail?.close();
    await database.close();
  });

  app.setErrorHandler((error, request, reply) => {
    const isCollaboration = request.url.split('?')[0] === '/api/collaboration';
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
    app.log.error({ requestId: request.id }, 'Errore interno durante la richiesta.');
    if (isCollaboration) return reply.code(503).send({ ok: false, code: 'unavailable', message: 'Servizio collaborazione temporaneamente non disponibile.' });
    return reply.code(500).send({ error: 'internal_error', message: 'Errore interno del server.' });
  });

  // Auth and collaboration are the only credentialed domains. Health remains read-only.
  await app.register(cors, {
    delegator(request, callback) {
      const requestPath = request.url.split('?')[0];
      const isAuth = requestPath?.startsWith('/auth/') || requestPath === '/api/collaboration';
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
      return reply.send(resultDTO);
    } catch {
      return fail(503, 'unavailable', 'Servizio collaborazione temporaneamente non disponibile.');
    }
  });

  app.get('/health', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    return healthResponseSchema.parse({
      schemaVersion: 1,
      service: 'nexus-server',
      version: '0.4.0',
      status: 'ok',
      database: await database.check(),
      codex: 'local_only',
      timestamp: new Date().toISOString(),
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
    } catch {
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
        if (error instanceof EmailDeliveryError) return reply.code(503).send({ error: 'email_unavailable', message: error.message });
        if (error instanceof APIError && error.statusCode >= 400 && error.statusCode < 500) {
          return reply.code(error.statusCode).send(error.body);
        }
        app.log.error({ requestId: request.id }, 'Servizio account temporaneamente non disponibile.');
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
        response.header('Content-Security-Policy', `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self' ${config.auth.baseURL}; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'`);
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

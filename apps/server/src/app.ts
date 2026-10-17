import cors from '@fastify/cors';
import { healthResponseSchema } from '@nexus-ai/contracts';
import { createDatabaseBoundary } from '@nexus-ai/db';
import Fastify, { LogController, type FastifyInstance } from 'fastify';
import type { ServerConfig } from './config.js';

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
  });
  const database = createDatabaseBoundary(config.database);
  app.addHook('onClose', async () => database.close());

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof OriginNotAllowedError) {
      return reply.code(403).send({ error: 'origin_not_allowed', message: 'Origin non consentita.' });
    }
    if (typeof error === 'object' && error !== null && 'statusCode' in error) {
      const statusCode = error.statusCode;
      if (typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500) {
        return reply.code(statusCode).send({ error: 'invalid_request', message: 'Richiesta non valida.' });
      }
    }
    app.log.error({ requestId: request.id }, 'Errore interno durante la richiesta.');
    return reply.code(500).send({ error: 'internal_error', message: 'Errore interno del server.' });
  });

  // CORS restricts browser origins. Domain authorization will be introduced in T03.
  await app.register(cors, {
    origin(origin, callback) {
      if (origin === undefined || config.allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new OriginNotAllowedError(), false);
    },
    methods: ['GET', 'HEAD', 'OPTIONS'],
    credentials: false,
    strictPreflight: true,
  });

  app.get('/health', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    return healthResponseSchema.parse({
      schemaVersion: 1,
      service: 'nexus-server',
      version: '0.1.0',
      status: 'ok',
      database: database.status,
      codex: 'local_only',
      timestamp: new Date().toISOString(),
    });
  });

  app.setNotFoundHandler((_request, reply) => {
    return reply.code(404).send({ error: 'not_found', message: 'Risorsa non disponibile.' });
  });

  return app;
}

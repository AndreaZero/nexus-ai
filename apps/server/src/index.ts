import { buildServer } from './app.js';
import { readServerConfig } from './config.js';
import { startupFailure } from './logging.js';

async function start(): Promise<void> {
  const config = readServerConfig(process.env);
  const app = await buildServer(config);
  let closing = false;

  const shutdown = (): void => {
    if (closing) return;
    closing = true;
    app.log.info({ event: 'server.stopping' });
    void app.close().catch(() => {
      app.log.error({ event: 'server.stopping', category: 'internal' });
      process.exitCode = 1;
    });
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  app.addHook('onClose', async () => {
    process.removeListener('SIGINT', shutdown);
    process.removeListener('SIGTERM', shutdown);
    app.log.info({ event: 'server.stopped' });
  });

  try {
    await app.listen({ host: config.host, port: config.port });
    app.log.info({ event: 'server.ready', port: config.port, database: config.database.configured, accounts: Boolean(config.auth.secret && config.database.configured && config.auth.mail) });
  } catch (error) {
    await app.close();
    throw error;
  }
}

void start().catch((error: unknown) => {
  startupFailure(error);
  process.exitCode = 1;
});

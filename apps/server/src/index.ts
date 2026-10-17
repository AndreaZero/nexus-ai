import { DatabaseConfigurationError } from '@nexus-ai/db';
import { buildServer } from './app.js';
import { readServerConfig, ServerConfigurationError } from './config.js';

async function start(): Promise<void> {
  const config = readServerConfig(process.env);
  const app = await buildServer(config);
  let closing = false;

  const shutdown = (): void => {
    if (closing) return;
    closing = true;
    app.log.info('Arresto del server Nexus.');
    void app.close().catch(() => {
      console.error('Arresto del server Nexus non completato.');
      process.exitCode = 1;
    });
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  app.addHook('onClose', async () => {
    process.removeListener('SIGINT', shutdown);
    process.removeListener('SIGTERM', shutdown);
  });

  try {
    await app.listen({ host: config.host, port: config.port });
  } catch {
    await app.close();
    throw new Error('Impossibile avviare il server Nexus. Verificare host, porta e disponibilità della porta.');
  }
}

void start().catch((error: unknown) => {
  // Only known configuration messages are safe to display; never dump env or errors.
  if (error instanceof ServerConfigurationError || error instanceof DatabaseConfigurationError) {
    console.error(error.message);
  } else {
    console.error('Impossibile avviare il server Nexus. Verificare la configurazione e la disponibilità della porta.');
  }
  process.exitCode = 1;
});

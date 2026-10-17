import { isIP } from 'node:net';
import { readDatabaseConfig, type DatabaseConfig } from '@nexus-ai/db';

const logLevels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
export type LogLevel = (typeof logLevels)[number];

export interface ServerConfig {
  readonly host: string;
  readonly port: number;
  readonly allowedOrigins: readonly string[];
  readonly logLevel: LogLevel;
  readonly database: DatabaseConfig;
}

export class ServerConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ServerConfigurationError';
  }
}

function validateOrigin(origin: string): boolean {
  if (origin === 'nexus://app') return true;
  try {
    const url = new URL(origin);
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      url.origin === origin &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

export function readServerConfig(
  env: Readonly<Record<string, string | undefined>>,
): ServerConfig {
  const host = env['NEXUS_SERVER_HOST'] ?? '127.0.0.1';
  if (host !== 'localhost' && !isIP(host)) {
    throw new ServerConfigurationError('NEXUS_SERVER_HOST deve essere localhost o un indirizzo IP.');
  }

  const portValue = env['NEXUS_SERVER_PORT'] ?? '3001';
  if (!/^\d+$/.test(portValue)) {
    throw new ServerConfigurationError('NEXUS_SERVER_PORT deve essere un intero fra 1 e 65535.');
  }
  const port = Number(portValue);
  if (port < 1 || port > 65535) {
    throw new ServerConfigurationError('NEXUS_SERVER_PORT deve essere un intero fra 1 e 65535.');
  }

  const allowedOrigins = (env['NEXUS_ALLOWED_ORIGINS'] ?? 'http://127.0.0.1:5173,nexus://app')
    .split(',')
    .map((origin) => origin.trim());
  if (!allowedOrigins.length || !allowedOrigins.every(validateOrigin)) {
    throw new ServerConfigurationError(
      'NEXUS_ALLOWED_ORIGINS richiede origini esatte HTTP/HTTPS separate da virgole o nexus://app; wildcard e percorsi non sono consentiti.',
    );
  }

  const logLevel = env['NEXUS_LOG_LEVEL'] ?? 'info';
  if (!logLevels.some((level) => level === logLevel)) {
    throw new ServerConfigurationError(
      'NEXUS_LOG_LEVEL deve essere fatal, error, warn, info, debug, trace o silent.',
    );
  }

  return {
    host,
    port,
    allowedOrigins: [...new Set(allowedOrigins)],
    logLevel: logLevel as LogLevel,
    database: readDatabaseConfig(env),
  };
}

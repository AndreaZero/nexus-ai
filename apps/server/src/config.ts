import { isIP } from 'node:net';
import { readDatabaseConfig, type DatabaseConfig } from '@nexus-ai/db';

const logLevels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
export type LogLevel = (typeof logLevels)[number];

export interface ServerConfig {
  readonly host: string;
  readonly port: number;
  readonly allowedOrigins: readonly string[];
  readonly logLevel: LogLevel;
  readonly trustedProxies: readonly string[];
  readonly database: DatabaseConfig;
  readonly auth: AuthConfig;
}

export interface MailConfig {
  readonly host: string;
  readonly port: number;
  readonly secure: boolean;
  readonly from: string;
  readonly credentials: { readonly user: string; readonly pass: string } | null;
}

export interface AuthConfig {
  readonly baseURL: string;
  readonly webURL: string;
  readonly secret: string | null;
  readonly mail: MailConfig | null;
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

function readHTTPOrigin(value: string, variable: string): string {
  if (!validateOrigin(value) || value === 'nexus://app') {
    throw new ServerConfigurationError(`${variable} richiede un'origine HTTP/HTTPS esatta, senza credenziali o percorso.`);
  }
  const url = new URL(value);
  if (url.protocol === 'http:' && !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    throw new ServerConfigurationError(`${variable} richiede HTTPS fuori dal loopback locale.`);
  }
  return value;
}

function readAuthConfig(env: Readonly<Record<string, string | undefined>>): AuthConfig {
  const baseURL = readHTTPOrigin(env['BETTER_AUTH_URL'] ?? 'http://127.0.0.1:3001', 'BETTER_AUTH_URL');
  const webURL = readHTTPOrigin(env['NEXUS_WEB_URL'] ?? baseURL, 'NEXUS_WEB_URL');
  const secret = env['BETTER_AUTH_SECRET']?.trim() || null;
  if (secret && (!/^[A-Za-z0-9+/_=-]{43,}$/.test(secret) || Buffer.from(secret, 'base64').length < 32 || new Set(secret).size < 16)) {
    throw new ServerConfigurationError('BETTER_AUTH_SECRET deve contenere almeno 32 byte casuali codificati base64/base64url, stabili fra gli avvii.');
  }
  const host = env['SMTP_HOST']?.trim();
  let mail: MailConfig | null = null;
  if (host) {
    const portValue = env['SMTP_PORT'] ?? '1025';
    const secureValue = env['SMTP_SECURE'] ?? 'false';
    const from = env['NEXUS_EMAIL_FROM']?.trim();
    const user = env['SMTP_USER']?.trim();
    const pass = env['SMTP_PASSWORD'];
    if (!/^\d+$/.test(portValue) || Number(portValue) < 1 || Number(portValue) > 65535 || !['true', 'false'].includes(secureValue)) {
      throw new ServerConfigurationError('SMTP_PORT deve essere una porta valida e SMTP_SECURE deve essere true o false.');
    }
    if (!from || /[\r\n]/.test(from) || !/@/.test(from) || /[\r\n\s]/.test(host)) {
      throw new ServerConfigurationError('SMTP_HOST e NEXUS_EMAIL_FROM devono essere configurati con valori validi.');
    }
    if (Boolean(user) !== Boolean(pass)) {
      throw new ServerConfigurationError('SMTP_USER e SMTP_PASSWORD devono essere entrambi impostati o entrambi assenti.');
    }
    mail = { host, port: Number(portValue), secure: secureValue === 'true', from, credentials: user && pass ? { user, pass } : null };
  } else if (env['SMTP_USER'] || env['SMTP_PASSWORD'] || env['NEXUS_EMAIL_FROM']) {
    throw new ServerConfigurationError('Impostare SMTP_HOST prima delle altre variabili email.');
  }
  return { baseURL, webURL, secret, mail };
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

  const trustedProxies = (env['NEXUS_TRUSTED_PROXIES'] ?? '').split(',').map(value => value.trim()).filter(Boolean);
  if (!trustedProxies.every(value => {
    const parts = value.split('/');
    const address = parts[0] ?? '';
    const family = isIP(address);
    if (!family || parts.length > 2) return false;
    if (parts.length === 1) return true;
    const prefix = parts[1] ?? '';
    return /^\d+$/.test(prefix) && Number(prefix) > 0 && Number(prefix) <= (family === 4 ? 32 : 128);
  })) {
    throw new ServerConfigurationError('NEXUS_TRUSTED_PROXIES richiede IP o CIDR espliciti con prefisso maggiore di zero; wildcard e trust globale sono vietati.');
  }

  return {
    host,
    port,
    allowedOrigins: [...new Set(allowedOrigins)],
    logLevel: logLevel as LogLevel,
    trustedProxies: [...new Set(trustedProxies)],
    database: readDatabaseConfig(env),
    auth: readAuthConfig(env),
  };
}

import { betterAuth } from 'better-auth';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { electron } from '@better-auth/electron';
import { authSchema, type DatabaseBoundary } from '@nexus-ai/db';
import type { AuthConfig } from './config.js';
import type { EmailSender } from './email.js';

export const DESKTOP_AUTH_CLIENT_ID = 'nexus-desktop';
export const DESKTOP_AUTH_ORIGIN = 'io.github.andreazero.nexusai:/';
export const AUTH_CLIENT_IP_HEADER = 'x-nexus-client-ip';

/** No identity provider, migrations or non-local execution are hidden in this factory. */
export function createNexusAuth(config: AuthConfig, database: DatabaseBoundary, mail: EmailSender | null) {
  if (!config.secret || !database.db || !mail) return null;
  return betterAuth({
    appName: 'Nexus AI',
    baseURL: config.baseURL,
    basePath: '/auth',
    secret: config.secret,
    database: drizzleAdapter(database.db, { provider: 'pg', schema: authSchema, transaction: true }),
    trustedOrigins: [config.webURL, DESKTOP_AUTH_ORIGIN],
    logger: { disabled: true },
    onAPIError: { throw: true },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      autoSignIn: false,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: 15 * 60,
      revokeSessionsOnPasswordReset: true,
      async sendResetPassword({ user, url }) {
        await mail.send(user.email, 'reset', url);
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: false,
      autoSignInAfterVerification: false,
      expiresIn: 60 * 60,
      async sendVerificationEmail({ user, url }) {
        await mail.send(user.email, 'verification', url);
      },
    },
    session: {
      expiresIn: 7 * 24 * 60 * 60,
      updateAge: 24 * 60 * 60,
      cookieCache: { enabled: false },
    },
    account: { accountLinking: { enabled: false } },
    advanced: {
      disableOriginCheck: false,
      disableCSRFCheck: false,
      useSecureCookies: config.baseURL.startsWith('https:'),
      ipAddress: { ipAddressHeaders: [AUTH_CLIENT_IP_HEADER] },
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax' },
    },
    rateLimit: {
      enabled: true,
      storage: 'database',
      modelName: 'rateLimit',
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/email': { window: 60, max: 5 },
        '/sign-up/email': { window: 60, max: 3 },
        '/send-verification-email': { window: 60, max: 1 },
        '/request-password-reset': { window: 300, max: 3 },
        '/reset-password': { window: 60, max: 5 },
        '/electron/*': { window: 60, max: 20 },
      },
    },
    plugins: [electron({ clientID: DESKTOP_AUTH_CLIENT_ID, codeExpiresIn: 120, redirectCookieExpiresIn: 120 })],
  });
}

export type NexusAuth = NonNullable<ReturnType<typeof createNexusAuth>>;

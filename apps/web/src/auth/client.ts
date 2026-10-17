import { createAuthClient } from 'better-auth/react';
import { electronProxyClient } from '@better-auth/electron/proxy';
import { accountServerUrl } from './configuration.js';

function createClient() {
  const server = accountServerUrl();
  if (!server) throw new Error('The account server is not configured.');
  return createAuthClient({
    baseURL: server.href,
    basePath: '/auth',
    fetchOptions: { credentials: 'include', timeout: 10_000 },
    plugins: [electronProxyClient({ protocol: 'io.github.andreazero.nexusai', callbackPath: '/auth/callback', clientID: 'nexus-desktop' })],
  });
}

let client: ReturnType<typeof createClient> | undefined;
export function getAuthClient() {
  client ??= createClient();
  return client;
}

export function desktopQuery(): { client_id: string; state: string; code_challenge: string } | undefined {
  const params = new URLSearchParams(window.location.search);
  const clientID = params.get('client_id');
  const state = params.get('state');
  const challenge = params.get('code_challenge');
  if (clientID !== 'nexus-desktop' || !state || !challenge) return undefined;
  // The official main client emits an alphanumeric state and an unpadded SHA256 base64url challenge.
  if (!/^[A-Za-z0-9]{16}$/.test(state) || !/^[A-Za-z0-9_-]{43}$/.test(challenge)) return undefined;
  return { client_id: clientID, state, code_challenge: challenge };
}

interface AccountError { code?: string | undefined; status?: number | undefined }
export function accountErrorMessage(error: AccountError | null | undefined): string {
  if (error?.status === 429 || error?.code === 'TOO_MANY_REQUESTS') return 'Too many attempts. Wait a minute before trying again.';
  if (error?.code === 'EMAIL_NOT_VERIFIED') return 'Verify your email before signing in. You can request a new verification email below.';
  if (error?.code === 'INVALID_EMAIL_OR_PASSWORD' || error?.code === 'INVALID_PASSWORD') return 'The email or password is incorrect.';
  if (error?.code === 'INVALID_TOKEN' || error?.code === 'TOKEN_EXPIRED' || error?.code === 'TOKEN_HAS_EXPIRED') return 'This link has expired or has already been used. Request a new one.';
  if (error?.code === 'PASSWORD_TOO_SHORT') return 'Choose a password with at least 12 characters.';
  if (error?.code === 'PASSWORD_TOO_LONG') return 'Choose a password with at most 128 characters.';
  if (error?.status === 503 || error?.status === 500) return 'The account or email service is unavailable. Check the local server and Mailpit, then retry.';
  return 'The request could not be completed. Check your connection and try again.';
}

export const AUTH_SCHEME = 'io.github.andreazero.nexusai';
export const AUTH_CALLBACK_PATH = '/auth/callback';
export const AUTH_CLIENT_ID = 'nexus-desktop';

export function publicServiceUrl(value: string): string {
  const url = new URL(value);
  const local = url.hostname === '127.0.0.1' || url.hostname === '[::1]';
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && local))) {
    throw new Error('Account endpoints must be HTTPS origins, or HTTP on the loopback address for local development.');
  }
  return url.origin;
}

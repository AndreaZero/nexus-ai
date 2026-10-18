export const AUTH_SCHEME = 'io.github.andreazero.nexusai';
export const AUTH_CALLBACK_PATH = '/auth/callback';
export const AUTH_CLIENT_ID = 'nexus-desktop';

export function publicServiceUrl(value: string): string {
  if (typeof value !== 'string' || [...value].some(character=>character==='\\'||character.charCodeAt(0)<=32||character.charCodeAt(0)===127)) throw new Error('Invalid account endpoint.');
  // Validate the spelling before WHATWG URL normalization changes local hosts.
  const authority = /^https?:\/\/([^/?#]+)\/?$/u.exec(value)?.[1];
  if (!authority) throw new Error('Account endpoints must be origins.');
  const url = new URL(value);
  if (!/^(?:[a-z0-9_.-]+|\[[0-9a-f:]+\])$/iu.test(url.hostname)) throw new Error('Invalid account endpoint host.');
  const local = url.hostname === '127.0.0.1' || url.hostname === '[::1]';
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && local && /^(127\.0\.0\.1|\[::1\])(?::[1-9][0-9]{0,4})?$/u.test(authority)))) {
    throw new Error('Account endpoints must be HTTPS origins, or HTTP on the loopback address for local development.');
  }
  return url.origin;
}

let configured: {server:string;web:string}|null = null;
export function setDesktopAccountEndpoints(value:{server:string;web:string}):void {
  configured=Object.freeze({server:publicServiceUrl(value.server),web:publicServiceUrl(value.web)});
}
export function configuredDesktopAccountEndpoints():{server:string;web:string}|null { return configured; }

/** Keep HTTP and WebSocket connections on the configured account authority. */
export function webContentSecurityPolicy(baseURL: string): string {
  const endpoint = new URL(baseURL);
  const origin = endpoint.origin;
  endpoint.protocol = endpoint.protocol === 'https:' ? 'wss:' : 'ws:';
  return `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self' ${origin} ${endpoint.origin}; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'`;
}

/** Public service address only. Never pass credentials in a renderer environment variable. */
export function getServerUrl(configured: string | undefined, development: boolean): URL | null {
  const value = configured?.trim() || (development ? 'http://127.0.0.1:3001' : '');
  if (!value) return null;

  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('VITE_NEXUS_SERVER_URL deve essere un URL HTTP(S) senza credenziali, query o frammenti.');
  }
  const loopback = url.hostname === 'localhost' || url.hostname === '[::1]' || /^127(?:\.\d{1,3}){3}$/.test(url.hostname);
  if (url.protocol === 'http:' && !loopback) {
    throw new Error('VITE_NEXUS_SERVER_URL richiede HTTPS per server remoti. HTTP è consentito soltanto su loopback.');
  }
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/`;
  return url;
}

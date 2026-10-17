import type { getAuthClient } from './client.js';
import type { desktopQuery } from './client.js';

type DesktopClient = Pick<ReturnType<typeof getAuthClient>, 'electron' | 'ensureElectronRedirect'>;
type DesktopQuery = NonNullable<ReturnType<typeof desktopQuery>>;

export async function transferDesktopSession(client: DesktopClient, query: DesktopQuery) {
  // A callbackURL makes Better Auth's default fetch plugin reload the browser
  // page, destroying the Electron redirect timer before it can open the app.
  // Stay on this page and let the official proxy consume its redirect cookie.
  const result = await client.electron.transferUser({}, { query });
  if (result.error) return { error: result.error, redirectTimer: undefined };
  return {
    error: null,
    redirectTimer: client.ensureElectronRedirect({ timeout: 4_000, interval: 200 }),
  };
}

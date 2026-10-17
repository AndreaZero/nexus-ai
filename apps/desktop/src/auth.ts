import { app, safeStorage } from 'electron';
import { createAuthClient, type BetterAuthClientPlugin } from 'better-auth/client';
import { electronClient } from '@better-auth/electron/client';
import path from 'node:path';
import { nexusAuthStateSchema, nexusUserSchema, type NexusAuthState } from '@nexus-ai/contracts';
import { AuthAttempt } from './auth-attempt.js';
import { AUTH_CALLBACK_PATH, AUTH_CLIENT_ID, AUTH_SCHEME, publicServiceUrl } from './auth-config.js';
import { AuthStorageError, EncryptedAuthStorage } from './auth-storage.js';

declare const __NEXUS_AUTH_SERVER_URL__: string;
declare const __NEXUS_WEB_URL__: string;

const signedOut = (message: string | null = null): NexusAuthState => ({
  status: 'signed_out', user: null, expiresAt: null, persistent: false, message,
});

export function desktopAccountEndpoints(): { server: string; web: string } {
  return {
    server: publicServiceUrl(!app.isPackaged && process.env['BETTER_AUTH_URL'] || __NEXUS_AUTH_SERVER_URL__),
    web: publicServiceUrl(!app.isPackaged && process.env['NEXUS_WEB_URL'] || __NEXUS_WEB_URL__),
  };
}

export class DesktopAuth {
  private state: NexusAuthState = signedOut();
  private readonly storage = new EncryptedAuthStorage(path.join(app.getPath('userData'), 'account.bin'), safeStorage, process.platform);
  private readonly entries = new Map<string, string>();
  private writes: Promise<void> = Promise.resolve();
  private writeError: unknown;
  private readonly attempt = new AuthAttempt();
  private timeout: NodeJS.Timeout | undefined;
  private expiryTimer: NodeJS.Timeout | undefined;
  private operations: Promise<unknown> = Promise.resolve();
  private initialized = false;
  private readonly client;

  constructor(
    private readonly publish: (state: NexusAuthState) => void,
    private readonly verificationOnly = false,
  ) {
    const { server, web } = desktopAccountEndpoints();
    const plugin = electronClient({
        protocol: AUTH_SCHEME,
        callbackPath: AUTH_CALLBACK_PATH,
        clientID: AUTH_CLIENT_ID,
        signInURL: new URL('/sign-in', web),
        storagePrefix: 'nexus',
        disableCache: true,
        userImageProxy: { enabled: false },
        sanitizeUser: (user) => ({
          id: user.id, name: user.name, email: user.email,
          emailVerified: user.emailVerified, image: user.image ?? null,
          createdAt: user.createdAt, updatedAt: user.updatedAt,
        }),
        storage: {
          getItem: (key) => this.entries.get(key) ?? null,
          setItem: (key, value) => {
            if (typeof value !== 'string' || (key !== 'nexus.cookie' && key !== 'nexus.local_cache')) {
              this.writeError = new AuthStorageError('Unsupported secure account storage record.');
              return;
            }
            this.entries.set(key, value);
            // The pinned plugin's storage API is synchronous. Hydration and this
            // write barrier adapt it to atomic disk I/O without plaintext files.
            this.writes = this.writes.then(() => this.storage.setItem(key, value)).catch((error: unknown) => {
              this.writeError = error instanceof AuthStorageError ? error
                : new AuthStorageError('Secure account storage could not be saved. Check your user profile permissions and retry.');
            });
          },
        },
      });
    this.client = createAuthClient({
      baseURL: server,
      basePath: '/auth',
      fetchOptions: { timeout: 8_000, retry: 0 },
      // Published 1.7.10 types widen optional RequestInit properties to include
      // undefined; retain strict project types and the plugin's typed actions.
      plugins: [plugin as Omit<typeof plugin, 'fetchPlugins'> & BetterAuthClientPlugin],
    });
    // Explicitly disable the plugin's broad IPC, CSP changes and OS callbacks.
    // Nexus validates every IPC caller and every OS callback before exchanging.
    this.client.setupMain({ bridges: false, csp: false, scheme: false });
  }

  private update(state: NexusAuthState): NexusAuthState {
    this.state = nexusAuthStateSchema.parse(state);
    if (this.expiryTimer) clearTimeout(this.expiryTimer);
    this.expiryTimer = undefined;
    if (state.status === 'signed_in' && state.expiresAt) {
      const delay = Math.min(Math.max(0, Date.parse(state.expiresAt) - Date.now()), 2_147_483_647);
      this.expiryTimer = setTimeout(() => { void this.getState(); }, delay);
      this.expiryTimer.unref();
    }
    this.publish(this.state);
    return this.state;
  }

  private unavailable(error: unknown): NexusAuthState {
    return this.update({ ...signedOut(), status: 'unavailable', message: error instanceof AuthStorageError
      ? error.message
      : 'The account server is unavailable. Check its address and connection, then retry.' });
  }

  private run(operation: () => Promise<NexusAuthState>): Promise<NexusAuthState> {
    const pending = this.operations.then(operation).catch((error: unknown) => this.unavailable(error));
    this.operations = pending;
    return pending;
  }

  private async initialize(): Promise<void> {
    if (this.initialized) return;
    this.storage.assertAvailable();
    for (const key of ['nexus.cookie', 'nexus.local_cache']) {
      const value = await this.storage.getItem(key);
      // Plugin values have their own safeStorage envelope. Reject unreadable
      // inner records rather than silently accepting its empty-cookie fallback.
      if (value) {
        try {
          const decoded: unknown = JSON.parse(safeStorage.decryptString(Buffer.from(value, 'base64')));
          if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) throw new Error('Invalid encrypted record');
        }
        catch { throw new AuthStorageError('Saved account credentials cannot be decrypted. Sign out and sign in again.'); }
        this.entries.set(key, value);
      }
    }
    this.initialized = true;
  }

  private async flush(): Promise<void> {
    await this.writes;
    if (this.writeError) throw this.writeError;
    this.storage.assertAvailable();
  }

  private async clearLocal(): Promise<void> {
    await this.writes;
    this.entries.clear();
    try { await this.storage.clear(); }
    catch { throw new AuthStorageError('Saved account credentials could not be removed. Check your user profile permissions and retry signing out.'); }
    this.writeError = undefined;
    this.initialized = false;
  }

  private async refresh(): Promise<NexusAuthState> {
    await this.initialize();
    if (!this.client.getCookie()) return this.update(signedOut());
    const result = await this.client.getSession({ query: { disableCookieCache: true }, fetchOptions: { cache: 'no-store' } });
    if (result.error) {
      if (result.error.status === 401) {
        await this.clearLocal();
        return this.update(signedOut('Your session has expired or was revoked. Sign in again.'));
      }
      throw new Error('Session could not be checked.');
    }
    await this.flush();
    if (!result.data || Date.parse(String(result.data.session.expiresAt)) <= Date.now()) {
      await this.clearLocal();
      return this.update(signedOut('Your session has expired or was revoked. Sign in again.'));
    }
    const user = nexusUserSchema.parse({
      id: result.data.user.id,
      name: result.data.user.name,
      email: result.data.user.email,
      emailVerified: result.data.user.emailVerified,
      image: result.data.user.image ?? null,
    });
    if (!user.emailVerified) {
      await this.clearLocal();
      return this.update(signedOut('Verify your email in the browser before signing in.'));
    }
    return this.update({ status: 'signed_in', user, expiresAt: new Date(result.data.session.expiresAt).toISOString(), persistent: true, message: null });
  }

  getState(): Promise<NexusAuthState> {
    if (this.verificationOnly) return Promise.resolve({ ...signedOut(), status: 'unavailable', message: 'Account checks are disabled during isolated desktop verification.' });
    return this.run(() => this.state.status === 'signing_in' ? Promise.resolve(this.state) : this.refresh());
  }

  signIn(): Promise<NexusAuthState> {
    if (this.verificationOnly) return this.getState();
    return this.run(async () => {
      if (this.state.status === 'signing_in') return this.state;
      await this.initialize();
      if (this.state.status === 'signed_in') return this.refresh();
      this.attempt.begin();
      this.update({ ...signedOut(), status: 'signing_in', message: 'Complete sign-in in your browser. This request expires in five minutes.' });
      try {
        await this.client.requestAuth();
        this.attempt.captureState();
        this.timeout = setTimeout(() => { void this.cancelSignIn('Sign-in expired. Start a new request.'); }, 5 * 60_000);
        this.timeout.unref();
        return this.state;
      } catch {
        this.cancelAttempt();
        return this.update({ ...signedOut(), status: 'unavailable', message: 'The browser could not be opened. Check your default browser and retry.' });
      }
    });
  }

  private cancelAttempt(): void {
    if (this.timeout) clearTimeout(this.timeout);
    this.timeout = undefined;
    this.attempt.cancel();
  }

  cancelSignIn(message = 'Browser sign-in was cancelled.'): Promise<NexusAuthState> {
    return this.run(async () => {
      this.cancelAttempt();
      return this.state.status === 'signing_in' ? this.update(signedOut(message)) : this.state;
    });
  }

  async handleCallback(url: string): Promise<void> {
    if (this.verificationOnly) return;
    await this.run(async () => {
      let token: string;
      try { token = this.attempt.consume(url); }
      catch { return this.state; } // Unsolicited/malformed/replayed callbacks do not change an account.
      if (this.timeout) clearTimeout(this.timeout);
      this.timeout = undefined;
      try {
        this.storage.assertAvailable();
        const result = await this.client.authenticate({ token });
        if (result.error) throw new Error('Code exchange denied.');
        await this.flush();
        return await this.refresh();
      } catch (error) {
        if (error instanceof AuthStorageError) return this.unavailable(error);
        return this.update(signedOut('Sign-in could not be completed. The code may have expired; start a new request.'));
      } finally {
        this.cancelAttempt();
      }
    });
  }

  signOut(): Promise<NexusAuthState> {
    if (this.verificationOnly) return this.getState();
    return this.run(async () => {
      this.cancelAttempt();
      let revoked = true;
      try {
        await this.initialize();
        if (this.client.getCookie()) {
          const result = await this.client.signOut();
          revoked = !result.error;
        }
      } catch { revoked = false; }
      await this.clearLocal();
      return this.update(signedOut(revoked ? null : 'Signed out on this device. The server could not confirm remote session revocation.'));
    });
  }

  dispose(): void {
    this.cancelAttempt();
    if (this.expiryTimer) clearTimeout(this.expiryTimer);
  }
}

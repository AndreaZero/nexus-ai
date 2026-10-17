import { AUTH_CALLBACK_PATH, AUTH_SCHEME } from './auth-config.ts';

// @better-auth/electron 1.7.10 keeps outstanding PKCE verifiers here. Its public
// requestAuth returns void and has no cancellation API. Isolate this pinned
// source contract so cancellation actually removes the verifier, without
// generating, exporting or reimplementing the plugin's PKCE material.
export function electronPendingVerifiers(): Map<string, string> {
  const registry: unknown = (globalThis as Record<symbol, unknown>)[Symbol.for('better-auth:electron')];
  if (registry === undefined) return new Map();
  if (!(registry instanceof Map)) throw new Error('Unsupported Electron authentication integration.');
  return registry as Map<string, string>;
}

export class AuthAttempt {
  private before: Set<string> | undefined;
  private state: string | undefined;
  private expiresAt = 0;
  private readonly registry: () => Map<string, string>;

  constructor(registry: () => Map<string, string> = electronPendingVerifiers) {
    this.registry = registry;
  }

  begin(now = Date.now()): void {
    this.cancel();
    this.before = new Set(this.registry().keys());
    this.expiresAt = now + 5 * 60_000;
  }

  captureState(): void {
    if (!this.before) throw new Error('No sign-in attempt is active.');
    const states = [...this.registry().keys()].filter((state) => !this.before?.has(state));
    if (states.length !== 1 || !/^[A-Za-z0-9]{16}$/.test(states[0] ?? '')) {
      this.cancel();
      throw new Error('Unsupported Electron authentication attempt.');
    }
    this.state = states[0];
  }

  consume(url: string, now = Date.now()): string {
    if (!this.before || now >= this.expiresAt) {
      this.cancel();
      throw new Error('No active sign-in attempt. Start sign-in from Nexus AI.');
    }
    const parsed = new URL(url);
    if (url.length > 2048 || parsed.protocol !== `${AUTH_SCHEME}:` || parsed.hostname !== 'auth' ||
        `/${parsed.hostname}${parsed.pathname}` !== AUTH_CALLBACK_PATH || parsed.username || parsed.password ||
        parsed.port || parsed.search || !/^#token=[A-Za-z0-9_-]+={0,2}$/.test(parsed.hash)) {
      throw new Error('Invalid account callback.');
    }
    const token = parsed.hash.slice(7);
    let data: unknown;
    try { data = JSON.parse(Buffer.from(token, 'base64url').toString('utf8')); }
    catch { throw new Error('Invalid account callback.'); }
    if (!this.state) this.captureState();
    if (!data || typeof data !== 'object' || Array.isArray(data) ||
        Object.keys(data).sort().join(',') !== 'identifier,state' ||
        (data as Record<string, unknown>)['state'] !== this.state ||
        typeof (data as Record<string, unknown>)['identifier'] !== 'string' ||
        !/^[A-Za-z0-9]{32}$/.test((data as { identifier: string }).identifier) ||
        !this.registry().has(this.state!)) {
      throw new Error('Account callback does not match the active sign-in attempt.');
    }
    // Consume before any asynchronous exchange: duplicate OS events cannot race.
    this.before = undefined;
    this.expiresAt = 0;
    return token;
  }

  cancel(): void {
    if (this.state) this.registry().delete(this.state);
    if (this.before) {
      for (const state of this.registry().keys()) if (!this.before.has(state)) this.registry().delete(state);
    }
    this.before = undefined;
    this.state = undefined;
    this.expiresAt = 0;
  }
}

import { environmentProbeRequestSchema, environmentProbeResponseSchema, type EnvironmentProbeResponse, type NexusAuthState } from '@nexus-ai/contracts';

interface Dependencies {
  authorize(projectId: string): Promise<{ userId: string } | null>;
  fetch?: typeof fetch;
  now?: () => number;
}

/** A single explicit, private HEAD observation. It neither polls nor publishes its result. */
export class DesktopEnvironmentProbe {
  private readonly dependencies: Dependencies;
  private generation = 0;
  private account: string | null | undefined;
  private pending = false;
  private controller: AbortController | null = null;

  constructor(dependencies: Dependencies) { this.dependencies = dependencies; }

  nexusStateChanged(state: NexusAuthState): void {
    const account = state.status === 'signed_in' ? state.user?.id ?? null : null;
    if (account !== this.account) { this.account = account; this.invalidate(); }
  }

  invalidate(): void {
    this.generation++;
    this.controller?.abort();
  }

  async request(input: unknown): Promise<EnvironmentProbeResponse> {
    // Inspect the original string before a URL schema can canonicalize it.
    const rawUrl = input && typeof input === 'object' && 'url' in input && typeof input.url === 'string' ? input.url : '';
    // Inspect the raw authority before WHATWG URL canonicalization accepts decimal,
    // octal, encoded or abbreviated IP spellings. No DNS lookup is needed.
    const authority = /^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(?::([1-9]\d{0,4}))?(?:\/[^?#]*)?$/.exec(rawUrl);
    if (!authority || /[\\\p{Cc}]/u.test(rawUrl) || (authority[2] && Number(authority[2]) > 65535)) return { ok: false, code: 'invalid_request', message: 'Only exact localhost, 127.0.0.1 or [::1] HTTP URLs without credentials, query or fragment can be observed.' };
    const parsed = environmentProbeRequestSchema.safeParse(input);
    if (!parsed.success) return { ok: false, code: 'invalid_request', message: 'Choose a loopback HTTP URL and explicitly consent to this observation.' };
    const { projectId } = parsed.data;
    const target = new URL(rawUrl);
    if (target.hostname === 'localhost') target.hostname = '127.0.0.1';
    if (this.pending) return { ok: false, code: 'unavailable', message: 'An environment observation is already running. Wait for it to finish.' };
    this.pending = true;
    const generation = this.generation;
    const now = this.dependencies.now ?? Date.now;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const access = await this.dependencies.authorize(projectId);
      if (!access) return { ok: false, code: 'forbidden', message: 'Your current account cannot observe this project environment.' };
      if (generation !== this.generation || (this.account !== undefined && access.userId !== this.account)) return { ok: false, code: 'auth_required', message: 'Your Nexus account changed. Reopen this project before observing.' };
      const controller = new AbortController();
      this.controller = controller;
      const startedAt = now();
      timeout = setTimeout(() => controller.abort(), 5000);
      let status: number | null = null;
      try {
        const response = await (this.dependencies.fetch ?? fetch)(target.href, {
          method: 'HEAD', redirect: 'error', cache: 'no-store', credentials: 'omit',
          signal: controller.signal,
        });
        status = response.status >= 100 && response.status <= 599 ? response.status : null;
      } catch { /* A failed connection is an observation, never evidence of service health. */ }
      clearTimeout(timeout);
      timeout = undefined;
      const finishedAt = now();
      const current = await this.dependencies.authorize(projectId);
      if (!current || generation !== this.generation || current.userId !== access.userId || (this.account !== undefined && current.userId !== this.account)) return { ok: false, code: 'auth_required', message: 'Project access or your Nexus account changed. This observation was discarded.' };
      return environmentProbeResponseSchema.parse({ ok: true, observation: {
        projectId, url: target.href, status: status !== null && status >= 200 && status < 300 ? 'reachable' : 'unreachable',
        httpStatus: status, latencyMs: Math.max(0, finishedAt - startedAt), observedAt: new Date(finishedAt).toISOString(),
        expiresAt: new Date(finishedAt + 30000).toISOString(), source: 'local_http',
      } });
    } catch {
      return { ok: false, code: 'unavailable', message: 'Project authorization is unavailable. Reconnect to Nexus and try again.' };
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
      this.controller = null;
      this.pending = false;
    }
  }
}

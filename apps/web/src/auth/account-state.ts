import type { NexusAuthState } from '@nexus-ai/contracts';

export interface AccountSnapshot {
  state: NexusAuthState;
  configured: boolean;
  emailConfigured: boolean;
}

/** Keeps a slow account read from replacing a newer login/logout event. */
export class AccountStateCoordinator {
  private active = false;
  private revision = 0;
  private refreshPending: Promise<void> | null = null;
  private readonly apply: (snapshot: AccountSnapshot) => void;
  private readonly loading: (value: boolean) => void;
  private readonly failed: () => void;

  constructor(apply: (snapshot: AccountSnapshot) => void, loading: (value: boolean) => void, failed: () => void) {
    this.apply = apply; this.loading = loading; this.failed = failed;
  }

  activate() { this.active = true; }
  deactivate() { this.active = false; }

  accept(snapshot: AccountSnapshot) {
    ++this.revision;
    if (this.active) { this.apply(snapshot); this.loading(false); }
  }

  refresh(load: () => Promise<AccountSnapshot>): Promise<void> {
    if (this.refreshPending) return this.refreshPending;
    const pending = this.perform(load).finally(() => {
      if (this.refreshPending === pending) this.refreshPending = null;
    });
    this.refreshPending = pending;
    return pending;
  }

  perform(load: () => Promise<AccountSnapshot>): Promise<void> {
    const ticket = ++this.revision;
    if (this.active) this.loading(true);
    return Promise.resolve().then(load).then(snapshot => {
      if (this.active && ticket === this.revision) this.apply(snapshot);
    }).catch(() => {
      if (this.active && ticket === this.revision) this.failed();
    }).finally(() => {
      if (this.active && ticket === this.revision) this.loading(false);
    });
  }
}

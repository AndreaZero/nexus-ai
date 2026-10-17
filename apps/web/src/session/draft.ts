/** Coalesces edits; at most one write and one newest pending value per scope. */
export type DraftStatus = 'saved' | 'saving' | 'unsaved';
export class DraftWriter {
  private pending: string | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running: Promise<void> | undefined;
  private readonly write: (text: string) => Promise<unknown>;
  private readonly allowed: () => boolean;
  private readonly failed: () => void;
  private readonly status: (value: DraftStatus) => void;
  constructor(write: (text: string) => Promise<unknown>, allowed: () => boolean, failed: () => void, status: (value: DraftStatus) => void = () => {}) { this.write = write; this.allowed = allowed; this.failed = failed; this.status = status; }
  schedule(text: string) {
    this.pending = text;
    this.status('saving');
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.flush(); }, 1500);
  }
  flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    if (this.running) return this.running;
    this.running = (async () => {
      while (this.pending !== undefined && this.allowed()) {
        const next = this.pending; this.pending = undefined;
        try { await this.write(next); } catch { if (this.pending === undefined) this.pending = next; this.status('unsaved'); this.failed(); break; }
      }
      if (this.pending === undefined) this.status('saved');
      else if (!this.allowed()) this.status('unsaved');
    })().finally(() => { this.running = undefined; });
    return this.running;
  }
  cancel() { if (this.timer) clearTimeout(this.timer); this.timer = undefined; this.pending = undefined; }
}

export function successfulDraftClear(current: string, sent: string, succeeded: boolean) { return succeeded && current === sent ? '' : current; }

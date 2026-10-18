import type { BrowserWindow, Event, RenderProcessGoneDetails } from 'electron';

interface RecoveryOptions {
  stopExecution: () => Promise<void>;
  confirm: () => Promise<'reload' | 'close'>;
  isClosing?: () => boolean;
}

/** A missing execution UI must stop local work before offering a user-driven recovery. */
export function installRendererProcessRecovery(window: BrowserWindow, options: RecoveryOptions): void {
  let pending = false, closing = false;
  const contents = window.webContents;
  const unavailable = () => closing || window.isDestroyed() || window.webContents.isDestroyed() || options.isClosing?.() === true;
  const close = () => { if (!unavailable()) window.close(); };
  const recover = async () => {
    try {
      await options.stopExecution();
      if (unavailable()) return;
      const choice = await options.confirm();
      if (unavailable()) return;
      if (choice === 'reload') window.webContents.reload();
      else close();
    } catch {
      // Never expose crash details or restart execution after an uncertain shutdown.
      close();
    } finally { pending = false; }
  };
  const gone = (_event: Event, details: RenderProcessGoneDetails) => {
    if (details.reason === 'clean-exit' || pending || unavailable()) return;
    pending = true;
    void recover();
  };
  window.on('close', () => { closing = true; });
  contents.on('render-process-gone', gone);
  window.once('closed', () => { contents.removeListener('render-process-gone', gone); });
}

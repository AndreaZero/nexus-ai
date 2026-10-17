import { useEffect, useState } from 'react';
import { desktopInfoSchema } from '@nexus-ai/contracts';
import type { DesktopInfo } from '@nexus-ai/contracts';

export type DesktopState =
  | { status: 'web' }
  | { status: 'loading' }
  | { status: 'ready'; info: DesktopInfo }
  | { status: 'error' };

export function useDesktopInfo(): DesktopState {
  const [state, setState] = useState<DesktopState>(() => ({ status: window.nexusDesktop ? 'loading' : 'web' }));

  useEffect(() => {
    const bridge = window.nexusDesktop;
    if (!bridge) return;
    let active = true;
    const timeout = window.setTimeout(() => {
      if (active) {
        active = false;
        setState({ status: 'error' });
      }
    }, 8_000);

    void Promise.resolve().then(() => bridge.getInfo()).then((response) => {
      const info = desktopInfoSchema.parse(response);
      if (active) setState({ status: 'ready', info });
    }).catch(() => {
      if (active) setState({ status: 'error' });
    }).finally(() => window.clearTimeout(timeout));

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, []);

  return state;
}

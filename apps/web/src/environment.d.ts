import type { DesktopBridge } from '@nexus-ai/contracts';

declare global {
  interface Window {
    readonly nexusDesktop?: DesktopBridge;
  }
}

export {};

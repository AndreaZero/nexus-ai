import { platform } from 'node:os';

/** Runtime discovery and supervision are implemented in T05, never in the renderer. */
export function getCodexIntegrationStatus(): {
  available: false;
  reason: 'not_configured';
  hostPlatform: NodeJS.Platform;
} {
  return { available: false, reason: 'not_configured', hostPlatform: platform() };
}

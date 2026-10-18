import { getServerUrl } from '../server-url.js';
import { pendingInvitation } from '../collaboration/invitation.js';

export function accountServerUrl(): URL | null {
  try {
    return getServerUrl(window.nexusDesktop?.configuration?.serverUrl ?? import.meta.env['VITE_NEXUS_SERVER_URL'] as string | undefined, import.meta.env.DEV);
  } catch {
    return null;
  }
}

export const accountPaths = ['/sign-in', '/sign-up', '/forgot-password', '/reset-password', '/verify-email', '/desktop-auth'] as const;
export type AccountPath = typeof accountPaths[number];

export function isAccountPath(path: string): path is AccountPath {
  return accountPaths.some((value) => value === path);
}

/** Auth destinations are fixed paths on the current web origin. No caller-controlled redirects. */
export function accountUrl(path: AccountPath): string {
  const destination = new URL(path, window.location.origin);
  for (const key of ['client_id', 'state', 'code_challenge', 'code_challenge_method']) {
    const value = new URLSearchParams(window.location.search).get(key);
    if (value) destination.searchParams.set(key, value);
  }
  return destination.href;
}

export function isDesktopJourney(): boolean {
  return new URLSearchParams(window.location.search).get('client_id') === 'nexus-desktop';
}

export function completedAccountUrl(): string {
  return isDesktopJourney() ? accountUrl('/desktop-auth') : `${window.location.origin}/#/${pendingInvitation() ? 'invitations' : 'settings'}`;
}

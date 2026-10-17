const storageKey = 'nexus.pending-invitation';
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
let memoryToken: string | null = null;

/** Invitation secrets use tab-scoped storage only, never persistent selection storage. */
export function pendingInvitation(): string | null {
  try {
    const value = window.sessionStorage.getItem(storageKey);
    return value && tokenPattern.test(value) ? value : memoryToken;
  } catch { return memoryToken; }
}

export function captureInvitation(): string | null {
  if (!window.location.hash.startsWith('#/invitations')) return pendingInvitation();
  const query = window.location.hash.split('?')[1] ?? '';
  const candidate = new URLSearchParams(query).get('token');
  if (candidate !== null) {
    memoryToken = tokenPattern.test(candidate) ? candidate : null;
    try {
      if (memoryToken) window.sessionStorage.setItem(storageKey, memoryToken);
      else window.sessionStorage.removeItem(storageKey);
    } catch { /* Keep this page usable when tab storage is disabled. */ }
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/invitations`);
  }
  return pendingInvitation();
}

export function clearInvitation(): void {
  memoryToken = null;
  try { window.sessionStorage.removeItem(storageKey); } catch { /* No persistent fallback. */ }
}

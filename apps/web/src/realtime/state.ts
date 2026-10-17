import type { LiveMessage, RealtimeSnapshot, RealtimeState } from '@nexus-ai/contracts';

export function emptyRealtime(): RealtimeState { return { projectId: null, connection: 'idle', cursor: null, snapshot: null, presence: [], pending: 0, sharing: null, lastSyncedAt: null, notice: null }; }
export function cursorAfter(next: string, previous: string | null): boolean { return previous === null || BigInt(next) > BigInt(previous); }
export function acceptSnapshot(state: RealtimeState, snapshot: RealtimeSnapshot, now: string): RealtimeState {
  if (snapshot.projectId !== state.projectId || (state.cursor !== null && BigInt(snapshot.cursor) < BigInt(state.cursor))) return state;
  return { ...state, connection: 'online', cursor: snapshot.cursor, snapshot, lastSyncedAt: now, notice: null };
}
export function disconnected(state: RealtimeState, connection: 'offline' | 'reconnecting' | 'denied', notice: string): RealtimeState {
  // A disconnected projection is not current authorization. Drop private data immediately.
  return { ...state, connection, snapshot: null, presence: [], notice };
}
export function retryDelay(attempt: number, random = Math.random()): number | null { return attempt >= 8 ? null : Math.round(Math.min(30000, 1000 * 2 ** attempt) * (0.75 + Math.max(0, Math.min(1, random)) * 0.5)); }
export function selectedLiveMessages(source: LiveMessage[], selected: string[]): LiveMessage[] { return source.filter(item => selected.includes(item.id)).map(item => ({ ...item })); }
export function liveSelectionValid(messages: LiveMessage[]): boolean { return messages.length > 0 && messages.length <= 20 && new Set(messages.map(item => item.id)).size === messages.length && messages.reduce((sum, item) => sum + item.text.length, 0) <= 131072; }

import type { CodexMessage, SharedMessage } from '@nexus-ai/contracts';

export function excerpt(messages: CodexMessage[], ids: string[]): SharedMessage[] {
  const selected = new Set(ids);
  return messages.filter(item => selected.has(item.id) && item.status !== 'streaming' && item.text.trim() && item.text.length <= 32768).map(({ id, role, text }) => ({ id, role, text }));
}
export function excerptValid(messages: SharedMessage[]) { return messages.length > 0 && messages.length <= 20 && messages.reduce((total, item) => total + item.text.length, 0) <= 131072; }
export const SHARE_SESSION_EVENT = 'nexus:share-session';

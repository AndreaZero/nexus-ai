import type { CodexApproval, CodexFileChange } from '@nexus-ai/contracts';

export function approvalActive(approval: CodexApproval, threadId: string, turnId: string | null, now: number) {
  return approval.threadId === threadId && approval.turnId === turnId && Date.parse(approval.expiresAt) > now;
}
export function approvalFiles(approval: CodexApproval, changes: CodexFileChange[]) {
  return changes.filter(change => change.id.startsWith(`${approval.itemId.slice(0, 180)}:`));
}
export function approvalReviewable(approval: CodexApproval, changes: CodexFileChange[]) {
  if (approval.kind === 'command') return Boolean(approval.command?.trim());
  const files = approvalFiles(approval, changes);
  return files.length > 0 && files.every(file => Boolean(file.diff.trim()) && !file.truncated);
}

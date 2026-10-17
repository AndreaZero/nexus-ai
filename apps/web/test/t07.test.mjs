import assert from 'node:assert/strict';
import test from 'node:test';
import { parseDiff, splitDiff } from '../src/session/diff.ts';
import { approvalActive, approvalReviewable, approvalFiles } from '../src/session/approval-state.ts';

test('diff line numbers follow independent old/new hunk ranges across files', () => {
  const rows = parseDiff('diff --git a/a b/a\n--- a/a\n+++ b/a\n@@ -4,2 +4,3 @@\n same\n-old\n+new\n+extra\ndiff --git a/b b/b\n--- a/b\n+++ b/b\n@@ -10 +20 @@\n-final\n+next');
  assert.deepEqual(rows.filter(row => row.kind !== 'hunk').map(({ oldLine, newLine }) => [oldLine, newLine]), [[4, 4], [5, null], [null, 5], [null, 6], [10, null], [null, 20]]);
});
test('header-looking source remains code and split pairs replacements without losing lines', () => {
  const lines = parseDiff('@@ -1,3 +1,4 @@\n--- source\n+++ source\n+second\n context\n+last');
  assert.equal(lines[1].text, '-- source'); assert.equal(lines[2].text, '++ source');
  const rows = splitDiff(lines);
  assert.equal(rows[1].left.kind, 'delete'); assert.equal(rows[1].right.kind, 'add');
  assert.equal(rows[2].left, null); assert.equal(rows[2].right.text, 'second');
  assert.equal(rows.at(-1).right.text, 'last');
});
test('untrusted markup and ANSI remain inert source text; metadata alone is not a diff hunk', () => {
  const payload = '<img src=x onerror=alert(1)>\u001b[31m';
  const lines = parseDiff(`@@ -0,0 +1 @@\n+${payload}`);
  assert.equal(lines[1].text, payload);
  assert.deepEqual(parseDiff('Binary files a/x and b/x differ\nnew file mode 100644'), []);
});
test('an approval expires precisely and cannot carry across a thread or turn', () => {
  const now = Date.parse('2026-10-17T12:00:00.000Z');
  const approval = { threadId: 'thread', turnId: 'turn', expiresAt: new Date(now + 1000).toISOString() };
  assert.equal(approvalActive(approval, 'thread', 'turn', now), true);
  assert.equal(approvalActive(approval, 'other-thread', 'turn', now), false);
  assert.equal(approvalActive(approval, 'thread', 'other-turn', now), false);
  assert.equal(approvalActive(approval, 'thread', null, now), false);
  assert.equal(approvalActive(approval, 'thread', 'turn', now + 1000), false);
});
test('file approval requires a matching complete patch; commands require visible command text', () => {
  const approval = { kind: 'fileChange', itemId: 'patch-1' };
  const changes = [{ id: 'patch-1:0', path: 'src/file.ts', diff: '@@ -0,0 +1 @@\n+const value = 1;', truncated: false }];
  assert.equal(approvalReviewable(approval, changes), true);
  assert.equal(approvalReviewable(approval, []), false);
  assert.equal(approvalReviewable({ ...approval, itemId: 'other' }, changes), false);
  assert.equal(approvalReviewable(approval, [{ ...changes[0], truncated: true }]), false);
  assert.equal(approvalReviewable(approval, [{ ...changes[0], diff: '' }]), false);
  assert.deepEqual(approvalFiles(approval, [...changes, { ...changes[0], id: 'patch-10:0' }]), changes);
  assert.equal(approvalReviewable({ kind: 'command', command: '' }, []), false);
  assert.equal(approvalReviewable({ kind: 'command', command: 'node --test' }, []), true);
});

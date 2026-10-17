import assert from 'node:assert/strict';
import test from 'node:test';
import { DraftWriter, successfulDraftClear } from '../src/session/draft.ts';
import { excerpt, excerptValid } from '../src/session/publication.ts';

test('draft writes coalesce and serialize while preserving the newest edit', async () => {
  const writes = []; const statuses = []; let release;
  const writer = new DraftWriter(async text => { writes.push(text); if (text === 'first') await new Promise(resolve => { release = resolve; }); }, () => true, () => assert.fail('unexpected failure'), status => statuses.push(status));
  writer.schedule('discarded'); writer.schedule('first'); const pending = writer.flush();
  writer.schedule('second'); writer.schedule('latest'); release(); await pending; writer.cancel();
  assert.deepEqual(writes, ['first', 'latest']);
  assert.equal(statuses.at(-1), 'saved');
});
test('typing waits at least 1500ms while explicit blur/navigation flush persists immediately', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const writes = []; const writer = new DraftWriter(async text => { writes.push(text); }, () => true, () => assert.fail('unexpected failure'));
  writer.schedule('draft'); t.mock.timers.tick(1499); await Promise.resolve(); assert.deepEqual(writes, []);
  t.mock.timers.tick(1); await writer.flush(); assert.deepEqual(writes, ['draft']);
  writer.schedule('latest before leaving'); await writer.flush(); assert.deepEqual(writes, ['draft', 'latest before leaving']); writer.cancel();
});
test('a switched account cannot dispatch an old queued draft; failures preserve it for explicit retry', async () => {
  let allowed = true; let fail = true; let failures = 0; const writes = [];
  const writer = new DraftWriter(async text => { writes.push(text); if (fail) throw new Error('offline'); }, () => allowed, () => ++failures);
  writer.schedule('private'); allowed = false; await writer.flush(); assert.deepEqual(writes, []);
  allowed = true; await writer.flush(); assert.equal(failures, 1); fail = false; await writer.flush(); writer.cancel();
  assert.deepEqual(writes, ['private', 'private']);
});
test('failed sends preserve drafts and successful stale sends do not erase newer edits', () => {
  assert.equal(successfulDraftClear('original', 'original', false), 'original');
  assert.equal(successfulDraftClear('new edit', 'original', true), 'new edit');
  assert.equal(successfulDraftClear('original', 'original', true), '');
});
test('publication is empty without explicit selection and excludes streaming or oversized messages', () => {
  const messages = [{ id: 'a', role: 'user', text: 'private prompt', status: 'complete', secret: 'never serialize' }, { id: 'b', role: 'assistant', text: 'selected answer', status: 'complete' }, { id: 'c', role: 'assistant', text: 'still changing', status: 'streaming' }, { id: 'd', role: 'user', text: 'x'.repeat(32769), status: 'complete' }];
  assert.deepEqual(excerpt(messages, []), []);
  assert.deepEqual(excerpt(messages, ['b', 'c', 'd']), [{ id: 'b', role: 'assistant', text: 'selected answer' }]);
  assert.equal(excerptValid(excerpt(messages, ['b'])), true);
  assert.equal(excerptValid([]), false);
  assert.equal(excerptValid(Array.from({ length: 21 }, (_, i) => ({ id: `${i}`, role: 'user', text: 'message' }))), false);
  assert.equal(excerptValid(Array.from({ length: 5 }, (_, i) => ({ id: `${i}`, role: 'user', text: 'x'.repeat(32768) }))), false);
});

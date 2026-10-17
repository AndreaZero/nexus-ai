import assert from 'node:assert/strict';
import test from 'node:test';
import { createRealtimeBudget } from './realtime-rate.js';

test('realtime HTTP budget isolates identities, caps memory, expires windows and returns fixed retry seconds', () => {
  let now = 0;
  const budget = createRealtimeBudget({ now: () => now, windowMs: 60_000, maxKeys: 2 });
  assert.ok(budget.consume('ip:fixture', 2).allowed);
  assert.ok(budget.consume('account:fixture', 1).allowed);
  assert.ok(budget.consume('ip:fixture', 2).allowed);
  assert.deepEqual(budget.consume('ip:fixture', 2), { allowed: false, retryAfterSeconds: 60 });
  assert.equal(budget.consume('ip:other', 2).allowed, false);
  now = 59_000;
  assert.deepEqual(budget.consume('account:fixture', 1), { allowed: false, retryAfterSeconds: 1 });
  now = 60_000;
  assert.ok(budget.consume('ip:other', 2).allowed);
  assert.ok(budget.consume('ip:fixture', 2).allowed);
  assert.equal(budget.consume('account:fixture', 1).allowed, false);
});

test('continuous session reads never accumulate across fixed windows, and blocked retries do not extend a window', () => {
  let now = 0;
  const budget = createRealtimeBudget({ now: () => now });
  for (let request = 0; request < 360; request++) {
    assert.equal(budget.consume('session:fixture', 100).allowed, true);
    now += 2000;
  }
  now += 60_000;
  const start = now;
  for (let request = 0; request < 100; request++) assert.equal(budget.consume('session:fixture', 100).allowed, true);
  for (const elapsed of [0, 10_000, 30_000, 59_999]) {
    now = start + elapsed;
    const outcome = budget.consume('session:fixture', 100);
    assert.equal(outcome.allowed, false);
    assert.equal(outcome.retryAfterSeconds, Math.ceil((60_000 - elapsed) / 1000));
  }
  now = start + 60_000;
  assert.equal(budget.consume('session:fixture', 100).allowed, true);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { activityChanged, activityHref, mergeActivity, retainAuthorized, samplePoints, sessionTarget } from '../src/overview/state.ts';
const project = '8f835b67-ffb9-48b7-9341-ab96adbf0a26';
const other = 'ee0ab564-2399-49de-8fc7-c5af32599837';
const entity = '3d89f187-b360-4e77-a434-c080b021a0ae';
const event = (id, sequence, target = entity) => ({ id, sequence, category: 'sessions', kind: 'live.updated', target: { kind: 'live_share', id: target }, actor: { id: 'author', name: 'Author' }, title: 'Selected text', visibility: 'team', occurredAt: '2026-10-17T12:00:00.000Z' });
test('pagination preserves the feed being read and never adds a second row for an updated entity', () => {
  const first = event(project, '9007199254740993'); const olderDuplicate = event(other, '9007199254740992'); const second = event(entity, '9007199254740991', other);
  assert.deepEqual(mergeActivity([first], [olderDuplicate, second, second]), [first, second]);
  assert.equal(activityChanged([first, second], [first]), false);
  assert.equal(activityChanged([first, second], [event(other, '9007199254740994')]), true);
  assert.equal(activityChanged([first], []), true);
  assert.equal(mergeActivity(Array.from({ length: 500 }, (_, i) => event(String(i), String(i), String(i))), [second]).length, 500);
});
test('feed and notification targets carry only UUIDs and open the matching authorized shared detail', () => {
  const live = activityHref(event(project, '2')); assert.equal(live, `#/session?live=${entity}`); assert.deepEqual(sessionTarget(live), { live: entity, excerpt: null });
  const excerpt = activityHref({ target: { kind: 'shared_session', id: entity } }); assert.deepEqual(sessionTarget(excerpt), { live: null, excerpt: entity });
  for (const invalid of ['#/session?live=../../secret', '#/session?excerpt=javascript%3Aalert(1)', '#/session?live=not-an-id']) assert.deepEqual(sessionTarget(invalid), { live: null, excerpt: null });
});
test('device chart uses real percent samples and preserves unknown CPU intervals', () => {
  assert.deepEqual(samplePoints([null, 0, 50, 100], 300, 40), [null, '100,40', '200,20', '300,0']);
  assert.deepEqual(samplePoints([]), []); assert.deepEqual(samplePoints([null]), [null]); assert.deepEqual(samplePoints([25], 100, 40), ['100,30']);
});
test('an audience revocation removes held feed rows immediately, while new text on authorized entities waits for explicit apply', () => {
  const privateRow = event(project, '3'); const publicRow = event(other, '2', other);
  const retained = retainAuthorized([privateRow, publicRow], [{ kind: 'live_share', id: other }]);
  assert.deepEqual(retained, [publicRow]);
  const newer = { ...publicRow, id: entity, title: 'New text remains pending until apply' };
  assert.equal(activityChanged(retained, [newer]), true); assert.equal(retained[0].title, 'Selected text');
  assert.deepEqual(retainAuthorized([publicRow], [{ kind: 'shared_session', id: other }]), []);
  assert.deepEqual(retainAuthorized([privateRow, publicRow], []), []);
});
const clientSource = stripTypeScriptTypes(readFileSync(new URL('../src/overview/client.ts', import.meta.url), 'utf8')).replaceAll("'@nexus-ai/contracts'", JSON.stringify(import.meta.resolve('@nexus-ai/contracts'))).replace("import { accountServerUrl } from '../auth/configuration.js';", "const accountServerUrl = () => 'https://nexus.example/';");
const { overviewRequest } = await import('data:text/javascript;base64,' + Buffer.from(clientSource).toString('base64'));
const snapshot = { projectId: project, cursor: '9007199254740993', observedAt: '2026-10-17T12:00:00.000Z', activity: [], nextBefore: null, notifications: [], unreadCount: 0, readThrough: '0', tasks: [], activeShares: [], memberCount: 2, authorizedTargets: [] };
test('overview transport validates account/project boundaries, fixed browser endpoint and captured read cursor', async () => {
  const originalWindow = globalThis.window; const originalFetch = globalThis.fetch; const calls = [];
  try {
    globalThis.window = {}; globalThis.fetch = async (url, options) => { calls.push({ url: String(url), options, request: JSON.parse(options.body) }); return { json: async () => ({ ok: true, kind: 'overview', snapshot }) }; };
    await overviewRequest({ operation: 'snapshot', projectId: project, filter: 'commits', before: '9007199254740992', limit: 30 });
    assert.equal(calls[0].url, 'https://nexus.example/api/overview'); assert.equal(calls[0].options.credentials, 'include'); assert.equal(calls[0].options.redirect, 'error'); assert.equal(calls[0].options.cache, 'no-store'); assert.equal(calls[0].request.before, '9007199254740992');
    globalThis.window = { nexusDesktop: { overview: { request: async input => { calls.push(input); return { ok: true, kind: 'read', projectId: project, readThrough: input.through, unreadCount: 1 }; } } } };
    const displayedCursor = snapshot.cursor; const unseenCursor = '9007199254740995';
    const read = await overviewRequest({ operation: 'markRead', projectId: project, through: displayedCursor });
    assert.equal(read.readThrough, displayedCursor); assert.notEqual(read.readThrough, unseenCursor); assert.equal(read.unreadCount, 1);
    globalThis.window.nexusDesktop.overview.request = async () => ({ ok: true, kind: 'overview', snapshot: { ...snapshot, projectId: other } });
    await assert.rejects(overviewRequest({ operation: 'snapshot', projectId: project, filter: 'all', before: null, limit: 30 }), /another project/);
    globalThis.window.nexusDesktop.overview.request = async () => ({ ok: false, code: 'forbidden', message: 'Project access was revoked.' });
    await assert.rejects(overviewRequest({ operation: 'markRead', projectId: project, through: displayedCursor }), /revoked/);
    await assert.rejects(overviewRequest({ operation: 'markRead', projectId: project, through: '2', cookie: 'never from renderer' }));
  } finally { globalThis.window = originalWindow; globalThis.fetch = originalFetch; }
});

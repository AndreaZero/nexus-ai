import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { attachmentType, mergeWork, workHref, workTarget } from '../src/work/state.ts';

const project = 'ad11d18a-78a4-4a5c-a3f8-05a00d82b847';
const other = 'bd11d18a-78a4-4a5c-a3f8-05a00d82b847';
const id = 'cd11d18a-78a4-4a5c-a3f8-05a00d82b847';
const item = { id, projectId: project, kind: 'document', title: 'Project record', body: '<script>plain text</script>', visibility: 'client', version: 2, author: { id: 'author', name: 'Author' }, createdAt: '2026-10-17T12:00:00.000Z', updatedAt: '2026-10-17T12:00:00.000Z', status: null, assignee: null, milestoneId: null, dueAt: null, sourceSessionId: null, taskId: null, documentId: null, targetKind: null, targetId: null, sentiment: null, attachments: [], progress: null, decision: null, revisions: [] };
const list = { operation: 'list', projectId: project, view: 'client', kind: 'document', offset: 0, limit: 30, targetKind: null, targetId: null };
const response = { ok: true, kind: 'list', projectId: project, entityKind: 'document', items: [item], total: 1, nextOffset: null };
const source = stripTypeScriptTypes(readFileSync(new URL('../src/work/client.ts', import.meta.url), 'utf8')).replaceAll("'@nexus-ai/contracts'", JSON.stringify(import.meta.resolve('@nexus-ai/contracts'))).replace("import { accountServerUrl } from '../auth/configuration.js';", "const accountServerUrl = () => 'https://nexus.example/';");
const { workRequest, downloadWork } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

test('Work browser transport fixes endpoint, credentials, cache and scope while aborting obsolete reads', async () => {
  const before = { window: globalThis.window, fetch: globalThis.fetch }; const calls = [];
  try {
    globalThis.window = {}; globalThis.fetch = async (url, options) => { calls.push({ url: String(url), options, input: JSON.parse(options.body) }); return { ok: true, json: async () => response }; };
    const abort = new AbortController(); await workRequest(list, abort.signal);
    assert.equal(calls[0].url, 'https://nexus.example/api/work'); assert.equal(calls[0].options.credentials, 'include'); assert.equal(calls[0].options.redirect, 'error'); assert.equal(calls[0].options.cache, 'no-store'); assert.equal(calls[0].input.view, 'client'); abort.abort(); assert.equal(calls[0].options.signal.aborted, true);
    globalThis.fetch = async () => ({ ok: false, json: async () => response }); await assert.rejects(workRequest(list), /unavailable/);
  } finally { globalThis.window = before.window; globalThis.fetch = before.fetch; }
});
test('Work rejects substituted projects, private client records, revisions and arbitrary renderer capabilities', async () => {
  const before = globalThis.window; let calls = 0;
  try {
    globalThis.window = { nexusDesktop: { work: { request: async () => { ++calls; return response; } } } };
    await assert.rejects(workRequest({ ...list, cookie: 'renderer cookie' })); await assert.rejects(workRequest({ ...list, path: 'local path' })); assert.equal(calls, 0);
    globalThis.window.nexusDesktop.work.request = async () => ({ ...response, projectId: other }); await assert.rejects(workRequest(list), /another project/);
    globalThis.window.nexusDesktop.work.request = async () => ({ ...response, items: [{ ...item, projectId: other }] }); await assert.rejects(workRequest(list), /another project/);
    globalThis.window.nexusDesktop.work.request = async () => ({ ...response, items: [{ ...item, visibility: 'team' }] }); await assert.rejects(workRequest(list), /client audience/);
    globalThis.window.nexusDesktop.work.request = async () => ({ ok: true, kind: 'item', projectId: project, item }); await assert.rejects(workRequest({ operation: 'read', projectId: project, view: 'client', kind: 'document', id, revision: 1 }), /revision/);
    globalThis.window.nexusDesktop.work.request = async () => ({ ok: false, code: 'conflict', message: 'A newer version exists.' }); await assert.rejects(workRequest(list), error => error.code === 'conflict');
  } finally { globalThis.window = before; }
});
test('CAS and receipt IDs survive transport unchanged and response identity cannot change kind or ID', async () => {
  const before = globalThis.window; const requestId = 'dd11d18a-78a4-4a5c-a3f8-05a00d82b847'; let sent;
  const input = { operation: 'saveDocument', projectId: project, requestId, id, expectedVersion: 2, title: 'New version', body: 'Plain body', visibility: 'client', sourceSessionId: null, taskId: null, documentId: null };
  try {
    globalThis.window = { nexusDesktop: { work: { request: async value => { sent = value; return { ok: true, kind: 'changed', projectId: project, entityKind: 'document', id, version: 3 }; } } } };
    await workRequest(input); assert.equal(sent.requestId, requestId); assert.equal(sent.expectedVersion, 2);
    globalThis.window.nexusDesktop.work.request = async () => ({ ok: true, kind: 'changed', projectId: project, entityKind: 'task', id, version: 3 }); await assert.rejects(workRequest(input), /change response/);
    globalThis.window.nexusDesktop.work.request = async () => ({ ok: true, kind: 'changed', projectId: project, entityKind: 'document', id: other, version: 3 }); await assert.rejects(workRequest(input), /change response/);
  } finally { globalThis.window = before; }
});
test('Work links resolve existing authorized target domains and attachment selection excludes secret/active names', () => {
  assert.deepEqual(workTarget(workHref('milestone', id, 'client')), { kind: 'milestone', id, client: true });
  assert.equal(workHref('deliverable', id), `#/docs?kind=deliverable&id=${id}`); assert.equal(workTarget('#/docs?kind=unknown&id=broken').id, null);
  assert.equal(attachmentType('result.md', 'text/markdown'), 'text/markdown'); assert.equal(attachmentType('module.ts', ''), 'text/plain');
  for (const name of ['.env', 'credentials.json', 'secret.txt', '../result.txt', 'payload.html', 'image.svg', 'private.key', 'package-lock.json']) assert.throws(() => attachmentType(name, 'text/plain'));
  assert.deepEqual(mergeWork([item], [item, { ...item, id: other }]).map(value => value.id), [id, other]);
});
test('Native save requires an authorized attachment ID and rejects a successful response from another project', async () => {
  const before = globalThis.window; const attachment = { id, name: 'result.txt', mime: 'text/plain', size: 4, sha256: 'a'.repeat(64) }; let input;
  try {
    globalThis.window = { nexusDesktop: { work: { download: async value => { input = value; return { ok: true, kind: 'saved', projectId: project, saved: true }; } } } };
    assert.equal(await downloadWork(project, attachment, 'client'), true); assert.deepEqual(input, { projectId: project, id, view: 'client' }); assert.equal('path' in input, false);
    globalThis.window.nexusDesktop.work.download = async () => ({ ok: true, kind: 'saved', projectId: other, saved: true }); await assert.rejects(downloadWork(project, attachment, 'client'), /download response/);
  } finally { globalThis.window = before; }
});

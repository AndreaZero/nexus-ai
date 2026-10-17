import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { activityHref } from '../src/overview/state.ts';

const projectId = 'ad12d18a-78a4-4a5c-a3f8-05a00d82b847';
const repositoryId = 'bd12d18a-78a4-4a5c-a3f8-05a00d82b847';
const snapshotId = 'cd12d18a-78a4-4a5c-a3f8-05a00d82b847';
const other = 'dd12d18a-78a4-4a5c-a3f8-05a00d82b847';
const requestId = 'ed12d18a-78a4-4a5c-a3f8-05a00d82b847';
const scope = { projectId, repositoryId };
const snapshot = { ...scope, remoteUrl: 'https://github.com/example/project', connected: true, login: 'reviewer', private: true, commits: [], pulls: [], observedAt: null, webhookConfigured: false, page: 1, hasMore: false };
const local = { ...scope, isGit: true, branch: 'feature/review', head: 'a'.repeat(40), branches: ['main', 'feature/review'], ahead: 1, behind: 0, dirty: true, conflicts: [], staged: false, changes: [], commits: [], truncated: false, observedAt: '2026-10-18T12:00:00.000Z', snapshotId };
const pull = { number: 12, title: 'Current revision', body: 'Plain description', state: 'open', draft: false, head: 'feature/review', headSha: 'a'.repeat(40), base: 'main', author: 'reviewer', url: 'https://github.com/example/project/pull/12', updatedAt: '2026-10-18T12:00:00.000Z' };
const source = stripTypeScriptTypes(readFileSync(new URL('../src/repositories/client.ts', import.meta.url), 'utf8')).replaceAll("'@nexus-ai/contracts'", JSON.stringify(import.meta.resolve('@nexus-ai/contracts'))).replace("import { accountServerUrl } from '../auth/configuration.js';", "const accountServerUrl = () => new URL('https://nexus.example/');");
const { repositoryRequest, gitRequest, githubUrl } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

test('Repository browser transport fixes credentials, endpoint and page scope; aborts obsolete reads', async () => {
  const previous = { window: globalThis.window, fetch: globalThis.fetch }; const calls = [];
  try {
    globalThis.window = {}; globalThis.fetch = async (url, options) => { calls.push({ url: String(url), options }); return { ok: true, json: async () => ({ ok: true, kind: 'snapshot', snapshot }) }; };
    const abort = new AbortController(); await repositoryRequest({ ...scope, operation: 'snapshot', page: 1 }, abort.signal);
    assert.equal(calls[0].url, 'https://nexus.example/api/repositories'); assert.equal(calls[0].options.credentials, 'include'); assert.equal(calls[0].options.cache, 'no-store'); assert.equal(calls[0].options.redirect, 'error'); abort.abort(); assert.equal(calls[0].options.signal.aborted, true);
    globalThis.fetch = async () => ({ ok: false, json: async () => ({ ok: true, kind: 'snapshot', snapshot }) }); await assert.rejects(repositoryRequest({ ...scope, operation: 'snapshot', page: 1 }), /unavailable/);
  } finally { globalThis.window = previous.window; globalThis.fetch = previous.fetch; }
});
test('Repository transport rejects substituted tenant, repository, page and echoed credentials', async () => {
  const previous = globalThis.window; let calls = 0;
  try {
    globalThis.window = { nexusDesktop: { repositories: { request: async () => { ++calls; return { ok: true, kind: 'snapshot', snapshot }; } } } };
    await assert.rejects(repositoryRequest({ ...scope, operation: 'snapshot', page: 1, token: 'unexpected' })); assert.equal(calls, 0);
    for (const changed of [{ projectId: other }, { repositoryId: other }, { page: 2 }, { token: 'must-never-return' }]) {
      globalThis.window.nexusDesktop.repositories.request = async () => ({ ok: true, kind: 'snapshot', snapshot: { ...snapshot, ...changed } });
      await assert.rejects(repositoryRequest({ ...scope, operation: 'snapshot', page: 1 }));
    }
  } finally { globalThis.window = previous; }
});
test('Pull detail is correlated to exact number/page and typed uncertain mutation never becomes success', async () => {
  const previous = globalThis.window;
  try {
    globalThis.window = { nexusDesktop: { repositories: { request: async () => ({ ok: true, kind: 'pull', pull, files: [], reviews: [], page: 1, hasMore: false }) } } };
    await repositoryRequest({ ...scope, operation: 'getPull', number: 12, page: 1 });
    await assert.rejects(repositoryRequest({ ...scope, operation: 'getPull', number: 13, page: 1 }), /pull request response/);
    await assert.rejects(repositoryRequest({ ...scope, operation: 'getPull', number: 12, page: 2 }), /pull request response/);
    globalThis.window.nexusDesktop.repositories.request = async () => ({ ok: false, code: 'uncertain', message: 'Inspect GitHub before retrying the same request.' });
    await assert.rejects(repositoryRequest({ ...scope, operation: 'review', requestId, number: 12, headSha: pull.headSha, event: 'APPROVE', body: 'Reviewed this exact revision.' }), error => error.code === 'uncertain');
  } finally { globalThis.window = previous; }
});
test('Explicit Git and review intent preserve opaque snapshot, selection, receipt and revision', async () => {
  const previous = globalThis.window; let git; let review;
  try {
    globalThis.window = { nexusDesktop: { git: { request: async input => { git = input; return { ok: true, snapshot: local, notice: null }; } }, repositories: { request: async input => { review = input; return { ok: true, kind: 'done', url: pull.url }; } } } };
    await gitRequest({ ...scope, operation: 'commit', snapshotId, fileIds: [other], message: 'Reviewed change', authorName: 'Explicit author', authorEmail: 'author@example.invalid' });
    assert.equal(git.snapshotId, snapshotId); assert.deepEqual(git.fileIds, [other]); assert.equal('path' in git, false);
    await repositoryRequest({ ...scope, operation: 'review', requestId, number: 12, headSha: pull.headSha, event: 'REQUEST_CHANGES', body: 'Please update the boundary validation.' });
    assert.equal(review.headSha, pull.headSha); assert.equal(review.requestId, requestId); assert.equal(review.event, 'REQUEST_CHANGES');
    await assert.rejects(gitRequest({ ...scope, operation: 'push', snapshotId, force: true }));
    globalThis.window.nexusDesktop.git.request = async () => ({ ok: true, snapshot: { ...local, repositoryId: other }, notice: null }); await assert.rejects(gitRequest({ ...scope, operation: 'snapshot' }), /another repository/);
    globalThis.window = {}; await assert.rejects(gitRequest({ ...scope, operation: 'snapshot' }), /desktop/);
  } finally { globalThis.window = previous; }
});
test('External technical links stay on credential-free GitHub HTTPS and feed targets open Code', () => {
  assert.equal(githubUrl(pull.url), pull.url);
  assert.equal(githubUrl(`${pull.url}#pullrequestreview-123`), `${pull.url}#pullrequestreview-123`);
  for (const value of ['https://evil.example/pull/12', 'javascript:alert(1)', 'http://github.com/example/project', 'https://token@github.com/example/project', 'https://github.com/example/project?token=private', 'https://github.com/example/project#token']) assert.equal(githubUrl(value), null);
  assert.equal(activityHref({ target: { kind: 'repository_activity', id: other } }), `#/code?activity=${other}`);
});
test('Activity resolution preserves the target ID and a created PR needs a safe result URL before success', async () => {
  const previous = globalThis.window;
  try {
    globalThis.window = { nexusDesktop: { repositories: { request: async () => ({ ok: true, kind: 'activity', id: other, activityKind: 'review', url: pull.url, sha: pull.headSha, pullNumber: 12 }) } } };
    const result = await repositoryRequest({ ...scope, operation: 'resolveActivity', id: other }); assert.equal(result.pullNumber, 12);
    await assert.rejects(repositoryRequest({ ...scope, operation: 'resolveActivity', id: requestId }), /activity response/);
    globalThis.window.nexusDesktop.repositories.request = async () => ({ ok: true, kind: 'done', url: null });
    await assert.rejects(repositoryRequest({ ...scope, operation: 'createPull', requestId, title: 'Explicit publication', body: '', head: 'feature/review', base: 'main', draft: true }), /could not be verified/);
  } finally { globalThis.window = previous; }
});

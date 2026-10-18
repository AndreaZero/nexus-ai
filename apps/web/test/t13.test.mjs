import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { currentHealth, deploymentTarget, pngThumbnail } from '../src/deployments/state.ts';
import { activityHref } from '../src/overview/state.ts';
const projectId = 'ad13d18a-78a4-4a5c-a3f8-05a00d82b847';
const id = 'bd13d18a-78a4-4a5c-a3f8-05a00d82b847';
const other = 'cd13d18a-78a4-4a5c-a3f8-05a00d82b847';
const date = '2026-10-18T12:00:00.000Z';
const identity = { projectId, id, version: 1, createdAt: date, updatedAt: date };
const environment = { ...identity, name: 'Real staging', kind: 'staging', visibility: 'client', previewUrl: 'https://staging.example.com', requiredChecks: ['tests'] };
const deployment = { ...identity, environmentId: id, title: 'Registered build', status: 'succeeded', commitSha: 'a'.repeat(40), branch: 'main', buildUrl: null, previewUrl: 'https://staging.example.com', notes: '', thumbnail: null, source: 'manual', authorId: 'account', observedAt: date };
const snapshot = { projectId, audience: 'client', canManage: false, environments: [environment], deployments: [deployment], health: [], total: 1, nextOffset: null, observedAt: date };
const source = stripTypeScriptTypes(readFileSync(new URL('../src/deployments/client.ts', import.meta.url), 'utf8')).replaceAll("'@nexus-ai/contracts'", JSON.stringify(import.meta.resolve('@nexus-ai/contracts'))).replace("import { accountServerUrl } from '../auth/configuration.js';", "const accountServerUrl = () => new URL('https://nexus.example/');");
const { deploymentRequest, probeEnvironment } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

test('Deployment browser transport uses fixed authenticated endpoint and aborts obsolete snapshot', async () => {
  const previous = { window: globalThis.window, fetch: globalThis.fetch }; let call;
  try {
    globalThis.window = {}; globalThis.fetch = async (url, options) => { call = { url: String(url), ...options }; return { ok: true, json: async () => ({ ok: true, kind: 'snapshot', snapshot }) }; };
    const controller = new AbortController(); await deploymentRequest({ operation: 'snapshot', projectId, view: 'client', offset: 0, limit: 100 }, controller.signal);
    assert.equal(call.url, 'https://nexus.example/api/deployments'); assert.equal(call.credentials, 'include'); assert.equal(call.cache, 'no-store'); assert.equal(call.redirect, 'error'); controller.abort(); assert.equal(call.signal.aborted, true);
    globalThis.fetch = async () => ({ ok: false, json: async () => ({ ok: true, kind: 'snapshot', snapshot }) }); await assert.rejects(deploymentRequest({ operation: 'snapshot', projectId, view: 'client' }), /unavailable/);
  } finally { globalThis.window = previous.window; globalThis.fetch = previous.fetch; }
});
test('Deployment client rejects substituted project, parent environment and client audience leaks', async () => {
  const previous = globalThis.window;
  try {
    for (const changed of [{ projectId: other }, { deployments: [{ ...deployment, projectId: other }] }, { deployments: [{ ...deployment, environmentId: other }] }, { audience: 'team' }, { canManage: true }, { environments: [{ ...environment, visibility: 'team' }] }]) {
      globalThis.window = { nexusDesktop: { deployments: { request: async () => ({ ok: true, kind: 'snapshot', snapshot: { ...snapshot, ...changed } }) } } };
      await assert.rejects(deploymentRequest({ operation: 'snapshot', projectId, view: 'client' }));
    }
    globalThis.window.nexusDesktop.deployments.request = async () => ({ ok: true, kind: 'deployment', item: deployment });
    await deploymentRequest({ operation: 'readDeployment', projectId, id }); await assert.rejects(deploymentRequest({ operation: 'readDeployment', projectId, id: other }), /detail response/);
  } finally { globalThis.window = previous; }
});
test('Deployment mutations preserve CAS receipt and distinguish stale version from success', async () => {
  const previous = globalThis.window; let called;
  try {
    globalThis.window = { nexusDesktop: { deployments: { request: async request => { called = request; return { ok: true, kind: 'changed', id, version: 2 }; } } } };
    const input = { operation: 'saveEnvironment', projectId, requestId: other, id, expectedVersion: 1, name: 'Staging', kind: 'staging', visibility: 'client', previewUrl: null, requiredChecks: ['tests'] };
    await deploymentRequest(input); assert.equal(called.expectedVersion, 1); assert.equal(called.requestId, other);
    globalThis.window.nexusDesktop.deployments.request = async () => ({ ok: false, code: 'conflict', message: 'Reload current revision.' }); await assert.rejects(deploymentRequest(input), cause => cause.code === 'conflict');
    globalThis.window.nexusDesktop.deployments.request = async () => ({ ok: true, kind: 'changed', id: other, version: 2 }); await assert.rejects(deploymentRequest(input), /change response/);
    await assert.rejects(deploymentRequest({ ...input, command: 'build' }));
  } finally { globalThis.window = previous; }
});
test('Local HTTP probe requires desktop, explicit consent and exact project URL correlation', async () => {
  const previous = globalThis.window;
  const input = { operation: 'observe', projectId, url: 'http://127.0.0.1:5173', consent: true };
  const observation = { projectId, url: input.url, status: 'reachable', httpStatus: 200, latencyMs: 2, observedAt: date, expiresAt: '2026-10-18T12:00:30.000Z', source: 'local_http' };
  try {
    globalThis.window = {}; await assert.rejects(probeEnvironment(input), /desktop/);
    globalThis.window = { nexusDesktop: { environmentProbe: { request: async () => ({ ok: true, observation }) } } }; assert.equal((await probeEnvironment(input)).source, 'local_http');
    await assert.rejects(probeEnvironment({ ...input, consent: false })); globalThis.window.nexusDesktop.environmentProbe.request = async () => ({ ok: true, observation: { ...observation, projectId: other } }); await assert.rejects(probeEnvironment(input), /observation response/);
  } finally { globalThis.window = previous; }
});
test('Local HTTP probe correlates normalized localhost and trailing slash without accepting another endpoint', async () => {
  const previous = globalThis.window; const url = 'http://localhost:5173';
  const observation = { projectId, url: 'http://127.0.0.1:5173/', status: 'reachable', httpStatus: 200, latencyMs: 2, observedAt: date, expiresAt: '2026-10-18T12:00:30.000Z', source: 'local_http' };
  try {
    globalThis.window = { nexusDesktop: { environmentProbe: { request: async input => { assert.equal(input.url, url); return { ok: true, observation }; } } } };
    assert.equal((await probeEnvironment({ operation: 'observe', projectId, url, consent: true })).url, observation.url);
    globalThis.window.nexusDesktop.environmentProbe.request = async () => ({ ok: true, observation: { ...observation, url: 'http://127.0.0.1:5174/' } }); await assert.rejects(probeEnvironment({ operation: 'observe', projectId, url, consent: true }), /observation response/);
    globalThis.window.nexusDesktop.environmentProbe.request = async () => ({ ok: true, observation: { ...observation, url: 'http://127.0.0.1:5173/other' } }); await assert.rejects(probeEnvironment({ operation: 'observe', projectId, url, consent: true }), /observation response/);
  } finally { globalThis.window = previous; }
});
test('Required observations expire without another network request and missing checks cannot stay green', () => {
  const report = { ...identity, environmentId: id, check: 'tests', status: 'pass', value: 12, unit: 'passed', summary: 'Actual report', sourceUrl: null, source: 'manual', observedAt: date, expiresAt: '2026-10-18T12:01:00.000Z', stale: false };
  const health = { environmentId: id, status: 'healthy', score: 100, required: ['tests'], observations: [report], computedAt: date };
  assert.equal(currentHealth(health, Date.parse(date)).score, 100);
  const expired = currentHealth(health, Date.parse(report.expiresAt)); assert.equal(expired.score, null); assert.equal(expired.status, 'unknown'); assert.equal(expired.observations[0].stale, true);
  assert.equal(currentHealth({ ...health, required: ['tests','security'] }, Date.parse(date)).score, null);
  assert.equal(currentHealth({ ...health, required: [] }, Date.parse(date)).score, null);
});
test('Thumbnail selection accepts only bounded PNG dimensions and does not upload or capture the screen', async () => {
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0mQAAAAASUVORK5CYII=', 'base64');
  assert.match(await pngThumbnail(new File([bytes], 'chosen.png', { type: 'image/png' })), /^data:image\/png;base64,/);
  await assert.rejects(pngThumbnail(new File([bytes], 'renamed.jpg', { type: 'image/jpeg' })));
  const large = Buffer.from(bytes); large.writeUInt32BE(1281,16); await assert.rejects(pngThumbnail(new File([large], 'wide.png', { type: 'image/png' })), /1280/);
  await assert.rejects(pngThumbnail(new File([new Uint8Array(262145)], 'large.png', { type: 'image/png' })), /256 KiB/);
});
test('Deployment feed links resolve records and environments without mistaking environment for a build', () => {
  assert.equal(activityHref({ target: { kind: 'deployment', id } }), '#/deployments?id=' + id);
  assert.equal(activityHref({ target: { kind: 'deployment_environment', id } }), '#/deployments?environment=' + id);
  assert.equal(deploymentTarget('#/deployments?id=' + id), id); assert.equal(deploymentTarget('#/deployments?id=../../secret'), null);
});

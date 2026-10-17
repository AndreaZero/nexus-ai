import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const project = '8f835b67-ffb9-48b7-9341-ab96adbf0a26';
const other = 'ee0ab564-2399-49de-8fc7-c5af32599837';
const source = stripTypeScriptTypes(readFileSync(new URL('../src/pulse/client.ts', import.meta.url), 'utf8')).replaceAll("'@nexus-ai/contracts'", JSON.stringify(import.meta.resolve('@nexus-ai/contracts'))).replace("import { accountServerUrl } from '../auth/configuration.js';", "const accountServerUrl = () => 'https://nexus.example/';");
const { pulseRequest } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const progress = { total: 0, completed: 0, inProgress: 0, planned: 0, percent: null, source: 'visible_tasks' };
const snapshot = { projectId: project, audience: 'client', overview: { projectId: project, cursor: '9007199254740993', observedAt: '2026-10-17T12:00:00.000Z', activity: [], nextBefore: null, notifications: [], unreadCount: 0, readThrough: '0', tasks: [], activeShares: [], memberCount: 2, authorizedTargets: [] }, milestones: [], milestoneCount: 0, progress, summary: { dayStart: '2026-10-17T00:00:00.000Z', dayEnd: '2026-10-18T00:00:00.000Z', scope: 'project', tasksUpdated: 0, sharedUpdates: 0, sharedSource: 'retained_entities', commits: null, comments: null, buildsDeploys: null }, outcomes: [] };
const request = { operation: 'snapshot', projectId: project, view: 'client', scope: 'project', filter: 'all', before: null, limit: 30 };

test('Pulse browser uses only the fixed authenticated endpoint and retains exact pagination, client view and mine scope', async () => {
  const previousWindow = globalThis.window; const previousFetch = globalThis.fetch; const calls = [];
  try {
    globalThis.window = {}; globalThis.fetch = async (url, options) => { calls.push({ url: String(url), options, input: JSON.parse(options.body) }); return { ok: true, json: async () => ({ ok: true, snapshot }) }; };
    const controller = new AbortController();
    await pulseRequest({ ...request, scope: 'mine', filter: 'sessions', before: '9007199254740992' }, controller.signal);
    assert.equal(calls[0].url, 'https://nexus.example/api/pulse');
    assert.equal(calls[0].options.credentials, 'include'); assert.equal(calls[0].options.redirect, 'error'); assert.equal(calls[0].options.cache, 'no-store');
    assert.equal(calls[0].input.view, 'client'); assert.equal(calls[0].input.scope, 'mine'); assert.equal(calls[0].input.before, '9007199254740992');
    controller.abort(); assert.equal(calls[0].options.signal.aborted, true);
    globalThis.fetch = async () => ({ ok: false, json: async () => ({ ok: true, snapshot }) });
    await assert.rejects(pulseRequest(request), /unavailable/);
  } finally { globalThis.window = previousWindow; globalThis.fetch = previousFetch; }
});
test('Pulse rejects mismatched project and a team snapshot substituted for an explicit client preview', async () => {
  const previousWindow = globalThis.window;
  try {
    globalThis.window = { nexusDesktop: { pulse: { request: async () => ({ ok: true, snapshot: { ...snapshot, projectId: other } }) } } };
    await assert.rejects(pulseRequest(request), /another project/);
    globalThis.window.nexusDesktop.pulse.request = async () => ({ ok: true, snapshot: { ...snapshot, overview: { ...snapshot.overview, projectId: other } } });
    await assert.rejects(pulseRequest(request), /another project/);
    globalThis.window.nexusDesktop.pulse.request = async () => ({ ok: true, snapshot: { ...snapshot, audience: 'team' } });
    await assert.rejects(pulseRequest(request), /client projection/);
    const team = await pulseRequest({ ...request, view: 'auto' }); assert.equal(team.audience, 'team');
  } finally { globalThis.window = previousWindow; }
});
test('Pulse transport rejects arbitrary renderer fields and malformed progress instead of rendering misleading metrics', async () => {
  const previousWindow = globalThis.window; let count = 0;
  try {
    globalThis.window = { nexusDesktop: { pulse: { request: async () => { count++; return { ok: true, snapshot }; } } } };
    await assert.rejects(pulseRequest({ ...request, cookie: 'arbitrary renderer credential' }));
    await assert.rejects(pulseRequest({ ...request, command: 'arbitrary command' })); assert.equal(count, 0);
    globalThis.window.nexusDesktop.pulse.request = async () => ({ ok: true, snapshot: { ...snapshot, progress: { ...progress, total: 4, completed: 3, inProgress: 2 } } });
    await assert.rejects(pulseRequest(request));
    globalThis.window.nexusDesktop.pulse.request = async () => ({ ok: false, code: 'forbidden', message: 'Project access revoked.' });
    await assert.rejects(pulseRequest(request), /revoked/);
    globalThis.window.nexusDesktop.pulse.request = async () => ({ ok: true, snapshot: { ...snapshot, localPath: 'private filesystem data' } });
    await assert.rejects(pulseRequest(request));
  } finally { globalThis.window = previousWindow; }
});

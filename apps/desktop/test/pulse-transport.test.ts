import assert from 'node:assert/strict';
import test from 'node:test';
import { pulseRequestSchema, type PulseRequest } from '@nexus-ai/contracts';
import { requestPulse } from '../src/pulse-transport.ts';
import { AUTH_SCHEME } from '../src/auth-config.ts';

const projectId = 'd309dd11-6d7e-4bc1-bd49-292bc50c2f74';
const request = pulseRequestSchema.parse({ operation: 'snapshot', projectId, view: 'client' });
const progress = { total: 0, completed: 0, inProgress: 0, planned: 0, percent: null, source: 'visible_tasks' };
const snapshot = { projectId, audience: 'client', progress, milestones: [], milestoneCount: 0, outcomes: [],
  summary: { dayStart: '2026-10-17T00:00:00.000Z', dayEnd: '2026-10-18T00:00:00.000Z', scope: 'project', tasksUpdated: 0,
    sharedUpdates: 0, sharedSource: 'retained_entities', commits: null, comments: null, buildsDeploys: null },
  overview: { projectId, cursor: '0', observedAt: '2026-10-17T00:00:00.000Z', activity: [], nextBefore: null,
    notifications: [], unreadCount: 0, readThrough: '0', tasks: [], activeShares: [], memberCount: 1, authorizedTargets: [] } };

test('Pulse transport fixes the endpoint, credentials and selected audience', async () => {
  const result = await requestPulse('http://127.0.0.1:3001', 'qa-cookie', request, async (url, options) => {
    assert.equal(String(url), 'http://127.0.0.1:3001/api/pulse');
    assert.equal(options?.redirect, 'error'); assert.equal(options?.credentials, 'omit'); assert.equal(options?.cache, 'no-store');
    const headers = new Headers(options?.headers);
    assert.equal(headers.get('Cookie'), 'qa-cookie'); assert.equal(headers.get('Origin'), `${AUTH_SCHEME}:/`);
    assert.deepEqual(JSON.parse(String(options?.body)), request);
    return Response.json({ ok: true, snapshot });
  });
  assert.equal(result.ok, true);
  for (const changed of [{ ...snapshot, projectId: '02f71f6e-69b1-49b7-b6d8-df89167070b9' },
    { ...snapshot, overview: { ...snapshot.overview, projectId: '02f71f6e-69b1-49b7-b6d8-df89167070b9' } },
    { ...snapshot, summary: { ...snapshot.summary, scope: 'mine' } }, { ...snapshot, audience: 'team' }]) {
    assert.equal((await requestPulse('http://127.0.0.1:3001', 'qa-cookie', request, async () => Response.json({ ok: true, snapshot: changed }))).ok, false);
  }
});

test('Pulse rejects renderer-supplied credentials/URLs and oversized or invalid responses', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; return Response.json({ ok: true, snapshot }); };
  for (const input of [{ ...request, cookie: 'private' }, { ...request, url: 'https://example.invalid' }, { ...request, view: 'team' }]) {
    assert.equal((await requestPulse('http://127.0.0.1:3001', 'qa-cookie', input as PulseRequest, fetcher)).ok, false);
  }
  assert.equal((await requestPulse('http://127.0.0.1:3001', '', request, fetcher)).ok, false);
  assert.equal(calls, 0);
  for (const response of [new Response('{}', { headers: { 'Content-Length': '1048577' } }),
    Response.json({ ok: true, snapshot }, { status: 403 }), Response.json({ ok: true, snapshot: { ...snapshot, private: 'secret' } })]) {
    assert.equal((await requestPulse('http://127.0.0.1:3001', 'qa-cookie', request, async () => response)).ok, false);
  }
  const failure = await requestPulse('http://127.0.0.1:3001', 'qa-cookie', request, async () => { throw new Error('private-password'); });
  assert.equal(JSON.stringify(failure).includes('private'), false);
});

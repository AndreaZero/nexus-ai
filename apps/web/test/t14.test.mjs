import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { defaultApplicationPreferences } from '@nexus-ai/contracts';
import { preferredModel, searchHref, visibleNotifications } from '../src/application/state.ts';
const id = 'a7c323c6-8285-4a18-bb29-bd83b488dc39';
const other = 'b7c323c6-8285-4a18-bb29-bd83b488dc39';
const date = '2026-10-18T12:00:00.000Z';
const settings = { version: 1, name: 'Nexus member', preferences: defaultApplicationPreferences, updatedAt: date };
const hit = { id, workspaceId: other, projectId: id, projectName: 'Authorized project', kind: 'document', title: 'Published knowledge', excerpt: 'Selected shared content' };
const source = stripTypeScriptTypes(readFileSync(new URL('../src/application/client.ts', import.meta.url), 'utf8')).replaceAll("'@nexus-ai/contracts'", JSON.stringify(import.meta.resolve('@nexus-ai/contracts'))).replace("import { accountServerUrl } from '../auth/configuration.js';", "const accountServerUrl = () => new URL('https://nexus.example/');");
const { applicationRequest, desktopPreferencesRequest } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

test('Application browser search uses fixed authenticated endpoint, trimmed literal query and cancellable request', async () => {
  const previous = { window: globalThis.window, fetch: globalThis.fetch }; let call;
  try {
    globalThis.window = {}; globalThis.fetch = async (url, options) => { call = { url: String(url), ...options }; return new Response(JSON.stringify({ ok: true, kind: 'search', query: 'knowledge', items: [hit], nextOffset: null, observedAt: date }), { status: 200 }); };
    const controller = new AbortController(); const result = await applicationRequest({ operation: 'search', query: ' knowledge ', projectId: null, kind: null, offset: 0, limit: 30 }, controller.signal);
    assert.equal(result.items.length, 1); assert.equal(call.url, 'https://nexus.example/api/application'); assert.equal(call.credentials, 'include'); assert.equal(call.cache, 'no-store'); assert.equal(call.redirect, 'error'); assert.equal(JSON.parse(call.body).query, 'knowledge'); controller.abort(); assert.equal(call.signal.aborted, true);
    await assert.rejects(applicationRequest({ operation: 'search', query: 'knowledge' }, controller.signal), { name: 'AbortError' });
  } finally { globalThis.window = previous.window; globalThis.fetch = previous.fetch; }
});

test('Search responses reject substituted scope, type, query and non-progressing pages', async () => {
  const previous = globalThis.window;
  try {
    for (const patch of [{ query: 'different' }, { items: [{ ...hit, projectId: other }] }, { items: [{ ...hit, kind: 'task' }] }, { nextOffset: 0 }]) {
      globalThis.window = { nexusDesktop: { application: { request: async () => ({ ok: true, kind: 'search', query: 'knowledge', items: [hit], nextOffset: null, observedAt: date, ...patch }) } } };
      await assert.rejects(applicationRequest({ operation: 'search', query: 'knowledge', projectId: id, kind: 'document' }));
    }
    globalThis.window.nexusDesktop.application.request = async () => ({ ok: true, kind: 'settings', settings });
    await assert.rejects(applicationRequest({ operation: 'search', query: 'knowledge' }));
  } finally { globalThis.window = previous; }
});

test('Application transport bounds response bodies and rejects HTTP success-shaped errors', async () => {
  const previous = { window: globalThis.window, fetch: globalThis.fetch };
  try {
    globalThis.window = {}; globalThis.fetch = async () => new Response('x'.repeat(1048577));
    await assert.rejects(applicationRequest({ operation: 'getSettings' }), /too large/);
    globalThis.fetch = async () => new Response(JSON.stringify({ ok: true, kind: 'settings', settings }), { status: 503 });
    await assert.rejects(applicationRequest({ operation: 'getSettings' }), /unavailable/);
  } finally { globalThis.window = previous.window; globalThis.fetch = previous.fetch; }
});

test('Settings preserve expected revision and explicit CAS errors without unsafe preference keys', async () => {
  const previous = globalThis.window; let sent;
  try {
    globalThis.window = { nexusDesktop: { application: { request: async request => { sent = request; return { ok: true, kind: 'settings', settings }; } } } };
    await applicationRequest({ operation: 'saveSettings', expectedVersion: 0, name: 'Nexus member', preferences: defaultApplicationPreferences }); assert.equal(sent.expectedVersion, 0);
    globalThis.window.nexusDesktop.application.request = async () => ({ ok: false, code: 'conflict', message: 'Reload saved preferences.' });
    await assert.rejects(applicationRequest({ operation: 'saveSettings', expectedVersion: 0, name: 'Nexus member', preferences: defaultApplicationPreferences }), cause => cause.code === 'conflict');
    await assert.rejects(applicationRequest({ operation: 'saveSettings', expectedVersion: 0, name: 'Nexus member', preferences: { ...defaultApplicationPreferences, token: 'not-allowed' } }));
  } finally { globalThis.window = previous; }
});

test('Notifications obey saved categories, master switch and exact monotonic cursor', () => {
  const rows = [{ category: 'tasks', sequence: '9007199254740994' }, { category: 'documents', sequence: '9007199254740993' }, { category: 'sessions', sequence: '4' }];
  const preferences = { ...defaultApplicationPreferences, notificationCategories: ['tasks', 'documents'] };
  assert.equal(visibleNotifications(rows, preferences, '9007199254740993', 'all', true).length, 1);
  assert.equal(visibleNotifications(rows, preferences, '0', 'documents').length, 1);
  assert.equal(visibleNotifications(rows, { ...preferences, notificationsEnabled: false }, '0').length, 0);
  assert.equal(visibleNotifications(rows, preferences, '0').length, 2);
});

test('Search targets map only to product detail routes and runtime defaults require current catalog', () => {
  for (const [kind, route] of [['project', '#/overview'], ['task', `#/tasks?kind=task&id=${id}`], ['document', `#/docs?kind=document&id=${id}`], ['shared_session', `#/session?excerpt=${id}`], ['live_share', `#/session?live=${id}`], ['deployment', `#/deployments?id=${id}`], ['environment', `#/deployments?environment=${id}`]]) assert.equal(searchHref({ id, kind }), route);
  const models = [{ id: 'available', defaultEffort: 'medium', efforts: ['low', 'medium'] }];
  assert.equal(preferredModel(models, { ...defaultApplicationPreferences, defaultModelId: 'absent', defaultEffort: 'high' }), null);
  assert.deepEqual(preferredModel(models, { ...defaultApplicationPreferences, defaultModelId: 'available', defaultEffort: 'high' }), { id: 'available', effort: 'medium' });
  assert.deepEqual(preferredModel(models, { ...defaultApplicationPreferences, defaultModelId: 'available', defaultEffort: 'low' }), { id: 'available', effort: 'low' });
});

test('Connection preferences require desktop bridge and keep restart explicit', async () => {
  const previous = globalThis.window; const preferences = { active: { serverUrl: 'https://nexus.example', webUrl: 'https://web.example' }, pending: null, restartRequired: false }; let sent;
  try {
    globalThis.window = {}; await assert.rejects(desktopPreferencesRequest({ operation: 'read' }), /desktop/);
    globalThis.window = { nexusDesktop: { preferences: { request: async request => { sent = request; return { ok: true, preferences }; } } } };
    assert.deepEqual(await desktopPreferencesRequest({ operation: 'read' }), preferences); assert.equal(sent.operation, 'read');
    await assert.rejects(desktopPreferencesRequest({ operation: 'restart', url: 'https://unknown.example' }));
    globalThis.window.nexusDesktop.preferences.request = async () => ({ ok: false, code: 'forbidden', message: 'Sign out first.' });
    await assert.rejects(desktopPreferencesRequest({ operation: 'saveConnection', connection: preferences.active }), cause => cause.code === 'forbidden');
  } finally { globalThis.window = previous; }
});

import { app, BrowserWindow, ipcMain, protocol, session } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { DESKTOP_IPC, codexRequestSchema, codexStateSchema, collaborationRequestSchema, collaborationResponseSchema, contextRequestSchema, contextResponseSchema, localBindingRequestSchema, localBindingResponseSchema, sessionsRequestSchema, sessionsResponseSchema, workspaceRequestSchema, workspaceResponseSchema, type NexusAuthState } from '@nexus-ai/contracts';
import type { CodexNotification, CodexProcess, CodexServerRequest } from '@nexus-ai/codex-bridge';
import { DesktopCodex } from './codex.ts';
import { DesktopWorkspace } from './workspace.ts';
import { APP_URL, isTrustedIpcSender, rendererAssetPath } from './security.ts';
import { realtimeRequestSchema, realtimeResponseSchema, type RealtimeState } from '@nexus-ai/contracts';
import { overviewRequestSchema, overviewResponseSchema, telemetryRequestSchema, telemetryResponseSchema, type OverviewActivity } from '@nexus-ai/contracts';
import { DesktopTelemetry } from './telemetry.ts';
import { pulseRequestSchema, pulseResponseSchema, type PulseMilestone, type PulseRequest } from '@nexus-ai/contracts';

// Standalone verification entry, bundled into the disposable QA directory by scripts/verify-workspace.mjs.
// Not imported by main.ts, exposed as a renderer route, or included in application startup.
const input = JSON.parse(await readFile(process.argv[2]!, 'utf8')) as { repository: string; directory: string; output: string; root: string; tap: string };
app.setPath('userData', path.join(input.directory, 'profile'));
app.commandLine.appendSwitch('force-device-scale-factor', '1');
protocol.registerSchemesAsPrivileged([{ scheme: 'nexus', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
const projectId = 'd309dd11-6d7e-4bc1-bd49-292bc50c2f74'; const repositoryId = '02f71f6e-69b1-49b7-b6d8-df89167070b9'; const workspaceId = '8cda10c0-a979-44bb-a068-3a06ecdb9ca7';
const now = new Date().toISOString();
const account: NexusAuthState = { status: 'signed_in', user: { id: 't07-ui-qa', name: 'Nexus QA', email: 'qa@example.invalid', emailVerified: true, image: null }, expiresAt: '2099-01-01T00:00:00.000Z', persistent: false, message: null };
const auth = { getState: async () => account, authorizeRepository: async () => ({ userId: account.user!.id }) };
const binding = { projectId, repositoryId, deviceId: workspaceId, rootPath: input.repository, label: 'Local QA repository', updatedAt: now };
const bindings = { get: async () => binding };
const model = { id: 'qa-model', model: 'qa-model', displayName: 'QA transport', description: 'Controlled protocol fixture; no inference', isDefault: true, defaultReasoningEffort: 'low', supportedReasoningEfforts: [{ reasoningEffort: 'low' }] };
class ProviderFixture {
  notify: (event: CodexNotification) => void = () => undefined;
  ask: (event: CodexServerRequest) => void = () => undefined;
  responses: { id: string | number; result: unknown }[] = [];
  onNotification(callback: typeof this.notify) { this.notify = callback; return () => undefined; }
  onServerRequest(callback: typeof this.ask) { this.ask = callback; return () => undefined; }
  onExit() { return () => undefined; }
  async start() {} async dispose() {} async reject() {}
  async respond(id: string | number, result: unknown) { this.responses.push({ id, result }); }
  async request(method: string, params: unknown) {
    if (method === 'account/read') return { account: { type: 'chatgpt', email: 'qa@example.invalid', planType: 'QA fixture' }, requiresOpenaiAuth: true };
    if (method === 'model/list') return { data: [model], nextCursor: null };
    const thread = { id: 'qa-thread', cwd: input.repository, modelProvider: 'openai', turns: [{ id: 'qa-history', status: 'completed', error: null, items: [
      { id: 'qa-user', type: 'userMessage', content: [{ type: 'text', text: 'Review the local document service change and test output.' }] },
      { id: 'qa-assistant', type: 'agentMessage', text: 'The local changes and the test report are available for review. This is an isolated UI verification with a controlled provider transport.' },
      { id: 'qa-test', type: 'commandExecution', command: 'node --test --test-reporter=tap local.test.mjs', cwd: input.repository, aggregatedOutput: input.tap, exitCode: 0, durationMs: 100, status: 'completed' },
    ] }] };
    if (['thread/start', 'thread/read', 'thread/resume'].includes(method)) return { thread };
    if (method === 'turn/start') return { turn: { id: 'qa-active-turn', status: 'inProgress', items: [], error: null } };
    if (method === 'turn/interrupt') this.notify({ method: 'turn/completed', params: { threadId: thread.id, turn: { id: (params as { turnId: string }).turnId, status: 'interrupted', error: null, items: [] } } });
    return {};
  }
}
async function verify() {
await app.whenReady();
const qaSession = session.fromPartition(`t10-qa-${Date.now()}`);
const renderer = path.join(input.root, 'apps/web/dist');
qaSession.protocol.handle('nexus', async request => {
  const filename = rendererAssetPath(request.url, renderer);
  const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
  return new Response(new Uint8Array(await readFile(filename)), { headers: { 'Content-Type': types[path.extname(filename)] ?? 'application/octet-stream' } });
});
qaSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
const window = new BrowserWindow({ show: false, width: 1586, height: 992, useContentSize: true, webPreferences: { preload: path.join(input.root, 'apps/desktop/dist/preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, session: qaSession, backgroundThrottling: false } });
window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
const external: string[] = [];
let opened: ((url: string) => void) | undefined;
async function openExternal(url: string) { external.push(url); opened?.(url); }
const fixture = new ProviderFixture();
const codex = new DesktopCodex({ userData: input.directory, executable: 'controlled-provider-fixture', clientVersion: '0.10.0', platform: process.platform, auth, bindings, openExternal, createProcess: () => fixture as unknown as CodexProcess,
  publish: state => window.webContents.send(DESKTOP_IPC.codexStateChanged, codexStateSchema.parse(state)) });
const workspace = new DesktopWorkspace({ auth, bindings, openExternal });
workspace.nexusStateChanged(account);
function handle(channel: string, handler: (value: unknown) => unknown) {
  ipcMain.handle(channel, (event, value: unknown) => {
    const frame = event.senderFrame;
    if (!frame || !isTrustedIpcSender({ senderId: event.sender.id, mainFrame: frame === event.sender.mainFrame, url: frame.url }, window.webContents.id)) throw new Error('QA IPC denied');
    return handler(value);
  });
}
handle(DESKTOP_IPC.getInfo, () => ({ appVersion: '0.10.0', platform: process.platform, architecture: process.arch, electronVersion: process.versions.electron, capabilities: { canRunLocalSession: true, canOpenLocalEditor: true } }));
for (const channel of [DESKTOP_IPC.authGetState, DESKTOP_IPC.authSignIn, DESKTOP_IPC.authCancelSignIn, DESKTOP_IPC.authSignOut]) handle(channel, () => account);
handle(DESKTOP_IPC.localBindingRequest, value => { localBindingRequestSchema.parse(value); return localBindingResponseSchema.parse({ ok: true, binding }); });
handle(DESKTOP_IPC.codexRequest, value => codex.request(codexRequestSchema.parse(value)));
handle(DESKTOP_IPC.workspaceRequest, value => workspace.request(workspaceRequestSchema.parse(value)).then(result => workspaceResponseSchema.parse(result)));
handle(DESKTOP_IPC.collaborationRequest, value => {
  const request = collaborationRequestSchema.parse(value);
  if (request.operation === 'listWorkspaces') return collaborationResponseSchema.parse({ ok: true, kind: 'workspaces', items: [{ id: workspaceId, name: 'Isolated UI QA', role: 'owner', createdAt: now }] });
  if (request.operation === 'listProjects') return collaborationResponseSchema.parse({ ok: true, kind: 'projects', items: [{ id: projectId, workspaceId, name: 'Local document service', description: 'Git and TAP observations · controlled provider transport', defaultVisibility: 'team', role: 'owner', repository: { id: repositoryId, projectId, remoteUrl: 'https://github.com/example/qa', defaultBranch: 'main' }, createdAt: now, updatedAt: now, capabilities: { manageMembers: true, editProject: true, viewRepository: true } }] });
  return { ok: false, code: 'forbidden', message: 'Not part of isolated QA.' };
});
handle(DESKTOP_IPC.contextRequest, value => { const request = contextRequestSchema.parse(value); return contextResponseSchema.parse({ ok: true, context: { projectId, repositoryId, folderLabel: binding.label, files: [], repository: { isGit: true, branch: 'main', head: null, dirty: true, ahead: null, behind: null, observedAt: now }, draft: request.operation === 'saveDraft' ? request.text : '', updatedAt: now }, preview: null }); });
handle(DESKTOP_IPC.sessionsRequest, value => { const request = sessionsRequestSchema.parse(value); return sessionsResponseSchema.parse(request.operation === 'listProjectTasks' ? { ok: true, kind: 'tasks', items: [] } : { ok: true, kind: 'sessions', items: [] }); });
const shareId = '0bdd2528-e0f4-41bf-bda0-4de027fc4dda';
const qaShare = { id: shareId, projectId, title: 'Reviewed API contract excerpt', visibility: 'client' as const, author: { id: 'qa-reviewer', name: 'QA Reviewer' }, status: 'active' as const, updatedAt: now };
const realtime: RealtimeState = { projectId, connection: 'online', cursor: '2', snapshot: { projectId, cursor: '2', sessions: [], shares: [qaShare] }, presence: [{ userId: account.user!.id, name: account.user!.name, role: 'owner', connections: 1, lastSeenAt: now }, { userId: 'qa-reviewer', name: 'QA Reviewer', role: 'developer', connections: 1, lastSeenAt: now }], pending: 0, sharing: null, lastSyncedAt: now, notice: 'Isolated UI fixture; no remote connection.' };
realtime.presence.push({ userId: 'qa-client', name: 'QA Client', role: 'client', connections: 1, lastSeenAt: now }, { userId: 'qa-viewer', name: 'QA Stakeholder', role: 'viewer', connections: 1, lastSeenAt: now }, { userId: 'qa-engineer', name: 'QA Engineer', role: 'developer', connections: 1, lastSeenAt: now });
handle(DESKTOP_IPC.realtimeRequest, value => { const request = realtimeRequestSchema.parse(value); return realtimeResponseSchema.parse({ ok: true, state: request.operation === 'disconnect' ? { ...realtime, connection: 'idle', snapshot: null, presence: [] } : realtime, share: request.operation === 'readShare' && request.shareId === shareId ? { ...qaShare, messages: [{ id: 'selected-qa', role: 'assistant', text: 'Explicitly selected QA text. Controlled shared projection, no personal inference.', status: 'complete' }] } : null }); });
const activity: OverviewActivity[] = [{ id: '9bdafc78-5e65-4a67-a474-bae539b81761', sequence: '2', category: 'sessions', kind: 'live.updated', target: { kind: 'live_share', id: shareId }, actor: qaShare.author, title: qaShare.title, visibility: 'client', occurredAt: now }];
let readThrough = '0';
let snapshotCursor = '2';
let authorizedTargets = activity.map(item => item.target);
handle(DESKTOP_IPC.overviewRequest, value => {
  const request = overviewRequestSchema.parse(value);
  const visibleActivity = activity.filter(item => authorizedTargets.some(target => target.id === item.target.id && target.kind === item.target.kind));
  if (request.operation === 'markRead') { readThrough = request.through; return overviewResponseSchema.parse({ ok: true, kind: 'read', projectId, readThrough, unreadCount: visibleActivity.filter(item => BigInt(item.sequence) > BigInt(readThrough)).length }); }
  return overviewResponseSchema.parse({ ok: true, kind: 'overview', snapshot: { projectId, cursor: snapshotCursor, observedAt: now, activity: ['all', 'sessions'].includes(request.filter) ? visibleActivity : [], nextBefore: null, authorizedTargets, notifications: visibleActivity, unreadCount: visibleActivity.filter(item => BigInt(item.sequence) > BigInt(readThrough)).length, readThrough, tasks: [{ id: '3d9d5121-6049-44f6-8472-a650cc8b3c34', title: 'Review document service contract', status: 'in_progress', visibility: 'client' }], activeShares: authorizedTargets.length ? [qaShare] : [], memberCount: 3 } });
});
// These projections exist only in this disposable verification entry, never in production startup.
const milestones: PulseMilestone[] = [
  { id: '13d420ac-dac4-4566-9f02-4473f5ac1001', title: 'Core platform review', visibility: 'client', dueAt: null, state: 'completed', progress: { total: 4, completed: 4, inProgress: 0, planned: 0, percent: 100, source: 'visible_tasks' } },
  { id: '13d420ac-dac4-4566-9f02-4473f5ac1002', title: 'Internal document workflow', visibility: 'team', dueAt: null, state: 'in_progress', progress: { total: 6, completed: 4, inProgress: 2, planned: 0, percent: 100 * 4 / 6, source: 'visible_tasks' } },
  { id: '13d420ac-dac4-4566-9f02-4473f5ac1003', title: 'Integration contract', visibility: 'client', dueAt: null, state: 'in_progress', progress: { total: 4, completed: 1, inProgress: 2, planned: 1, percent: 25, source: 'visible_tasks' } },
  { id: '13d420ac-dac4-4566-9f02-4473f5ac1004', title: 'Internal assistant review', visibility: 'team', dueAt: null, state: 'planned', progress: { total: 2, completed: 0, inProgress: 0, planned: 2, percent: 0, source: 'visible_tasks' } },
  { id: '13d420ac-dac4-4566-9f02-4473f5ac1005', title: 'Release acceptance', visibility: 'client', dueAt: null, state: 'planned', progress: { total: 0, completed: 0, inProgress: 0, planned: 0, percent: null, source: 'visible_tasks' } },
];
const outcomes = ['Document service contract review', 'Notification delivery notes', 'API interface excerpt', 'Unit test observation'].map((title, index) => ({ id: `43d420ac-dac4-4566-9f02-4473f5ac100${index + 1}`, projectId, title, visibility: index % 2 ? 'team' as const : 'client' as const, status: 'completed' as const, author: qaShare.author, version: index + 1, messageCount: 1, createdAt: now, updatedAt: now }));
const pulseRequests: PulseRequest[] = [];
handle(DESKTOP_IPC.pulseRequest, value => {
  const request = pulseRequestSchema.parse(value); pulseRequests.push(request);
  const client = request.view === 'client'; const visibleMilestones = milestones.filter(item => !client || item.visibility === 'client');
  const visibleOutcomes = outcomes.filter(item => !client || item.visibility === 'client');
  const progress = visibleMilestones.reduce((sum, item) => ({ ...sum, total: sum.total + item.progress.total, completed: sum.completed + item.progress.completed, inProgress: sum.inProgress + item.progress.inProgress, planned: sum.planned + item.progress.planned }), { total: 0, completed: 0, inProgress: 0, planned: 0, percent: null as number | null, source: 'visible_tasks' as const });
  progress.percent = progress.total ? progress.completed * 100 / progress.total : null;
  const pulseActivity: OverviewActivity[] = [...activity, ...visibleOutcomes.map((item, index) => ({ id: `63d420ac-dac4-4566-9f02-4473f5ac100${index + 1}`, sequence: '2', category: 'sessions' as const, kind: 'excerpt.published' as const, target: { kind: 'shared_session' as const, id: item.id }, actor: item.author, title: item.title, visibility: item.visibility, occurredAt: now }))];
  const dayStart = new Date(now); dayStart.setUTCHours(0, 0, 0, 0); const dayEnd = new Date(dayStart.getTime() + 86_400_000);
  return pulseResponseSchema.parse({ ok: true, snapshot: { projectId, audience: client ? 'client' : 'team', overview: { projectId, cursor: snapshotCursor, observedAt: now, activity: ['all', 'sessions'].includes(request.filter) ? pulseActivity : [], nextBefore: null, authorizedTargets: pulseActivity.map(item => item.target), notifications: pulseActivity, unreadCount: 0, readThrough: '2', tasks: [{ id: '3d9d5121-6049-44f6-8472-a650cc8b3c34', title: 'Review document service contract', status: 'in_progress', visibility: 'client' }], activeShares: [qaShare], memberCount: 5 }, milestones: visibleMilestones, milestoneCount: visibleMilestones.length, progress, summary: { dayStart: dayStart.toISOString(), dayEnd: dayEnd.toISOString(), scope: request.scope, tasksUpdated: request.scope === 'mine' ? 2 : 7, sharedUpdates: visibleOutcomes.length + 1, sharedSource: 'retained_entities', commits: null, comments: null, buildsDeploys: null }, outcomes: visibleOutcomes } });
});
const telemetry = new DesktopTelemetry({ auth, bindings }); telemetry.nexusStateChanged(account);
handle(DESKTOP_IPC.telemetryRequest, value => telemetry.request(telemetryRequestSchema.parse(value)).then(result => telemetryResponseSchema.parse(result)));
const checks: string[] = [];
async function waitFor(expression: string) {
  await window.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const test=()=>{if(${expression}){observer.disconnect();clearTimeout(timer);resolve(true)}};const observer=new MutationObserver(test);const timer=setTimeout(()=>{observer.disconnect();reject(new Error(${JSON.stringify(`Workspace UI condition timed out: ${expression}`)}))},8000);observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true});test()})`);
}
async function click(text: string) { await window.webContents.executeJavaScript(`(()=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!button||button.disabled)throw new Error('QA control unavailable');button.click()})()`); }
async function capture(name: string) {
  await window.webContents.executeJavaScript('document.fonts.ready.then(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(resolve,80)))))');
  await writeFile(path.join(input.output, name + '.png'), (await window.webContents.capturePage()).toPNG());
}
async function expectOpen(button: string): Promise<string> {
  const result = new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => { opened = undefined; reject(new Error('OS open request did not reach the main service')); }, 5000);
    opened = url => { clearTimeout(timer); opened = undefined; resolve(url); };
  });
  await click(button); return result;
}
try {
  await window.loadURL(APP_URL + '#/session');
  await waitFor("document.querySelector('.session-diff--split') && document.body.textContent.includes('1 / 1 passed')");
  await capture('workspace-split'); checks.push('Actual Git diff and Node TAP rendered through production preload');
  await click('Split View'); await waitFor("document.querySelector('.session-diff--unified')"); await capture('workspace-unified'); checks.push('Split/unified toggle and line numbers');
  await click('Terminal'); await waitFor("document.querySelector('.session-command-output')"); checks.push('Terminal output with exit code');
  await click('Tests'); await waitFor("document.querySelector('.session-test-reports')"); checks.push('Recognized TAP report');
  await click('Preview'); await waitFor("document.querySelector('.session-preview-config')"); checks.push('Explicit preview configuration');
  await window.webContents.executeJavaScript(`(()=>{const field=document.querySelector('.session-preview-config input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,'http://127.0.0.1:5173');field.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  await click('Save URL'); await waitFor("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Open Preview'&&!b.disabled)");
  assert.equal(await expectOpen('Open Preview'), 'http://127.0.0.1:5173/'); checks.push('Configured preview dispatches validated URL (OS open intercepted)');
  await waitFor("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Open in Editor'&&!b.disabled)");
  assert.match(await expectOpen('Open in Editor'), /^vscode:\/\/file\//); checks.push('Validated editor URI dispatched through IPC (OS open intercepted)');
  await window.webContents.executeJavaScript(`(()=>{const field=document.querySelector('.session-policy-select select');field.value='workspaceWrite';field.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  await waitFor("document.querySelector('.policy-acknowledgement input')");
  await window.webContents.executeJavaScript("document.querySelector('.policy-acknowledgement input').click()");
  await click('Enable workspace writes'); await waitFor("!document.querySelector('.policy-acknowledgement')");
  const policy = await codex.request({ operation: 'getState' }); assert.equal(policy.state.policy, 'workspaceWrite'); checks.push('UI requires explicit checkbox and confirmation before workspace write');
  const started = await codex.request({ operation: 'send', projectId, repositoryId, model: model.model, effort: 'low', text: 'Controlled approval transport fixture', attachmentIds: [] }); assert.equal(started.ok, true);
  const ask = (id: number) => fixture.ask({ id, method: 'item/commandExecution/requestApproval', params: { kind: 'command', threadId: 'qa-thread', turnId: 'qa-active-turn', itemId: `qa-command-${id}`, startedAtMs: Date.now(), environmentId: null, command: 'node --version', cwd: input.repository, reason: 'Controlled approval fixture; command is never executed.' } });
  ask(71); await waitFor("document.querySelector('.session-toolbar')?.textContent.includes('Approvals1')"); await click('Approvals1');
  await waitFor("document.querySelector('.execution-request')"); await capture('workspace-approval'); await click('Decline');
  await waitFor("!document.querySelector('.execution-request')"); assert.deepEqual(fixture.responses.find(value => value.id === 71)?.result, { decision: 'decline' }); checks.push('UI decline resolves the exact provider callback');
  ask(72); await waitFor("document.querySelector('.execution-request')"); await click('Allow once');
  await waitFor("!document.querySelector('.execution-request')"); assert.deepEqual(fixture.responses.find(value => value.id === 72)?.result, { decision: 'accept' }); assert.equal(fixture.responses.filter(value => value.id === 72).length, 1); checks.push('UI allow once resolves once, no execution in QA');
  await window.webContents.executeJavaScript(`document.querySelector('button[aria-label="Close dialog"]').click()`);
  await click('Session Info'); await waitFor("document.querySelector('.realtime-panel')");
  await capture('realtime-connection'); checks.push('Connection and presence render inside the reference Session Info panel (controlled state)');
  await click('Share'); await click('Share selected messages live');
  await waitFor("document.querySelector('.session-publish-selection input')");
  assert.equal(await window.webContents.executeJavaScript(`document.querySelectorAll('.session-publish-selection input:checked').length`), 0);
  assert.equal(await window.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Review selected messages').disabled`), true);
  await window.webContents.executeJavaScript(`document.querySelector('.session-publish-selection input').click()`);
  await click('Review selected messages'); await waitFor("document.querySelector('.realtime-consent input')");
  assert.equal(await window.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Confirm live sharing').disabled`), true);
  await capture('realtime-consent'); checks.push('Live share has no preselection and requires reviewed text plus explicit future-text consent');
  await window.webContents.executeJavaScript(`document.querySelector('.realtime-consent input').click()`);
  await click('Confirm live sharing'); await waitFor("!document.querySelector('.realtime-consent')");
  checks.push('Live share confirmation reaches the validated production preload (upload transport controlled in this UI fixture)');
  fixture.notify({ method: 'item/completed', params: { threadId: 'qa-thread', turnId: 'qa-active-turn', item: { id: 'qa-overview-test-report', type: 'commandExecution', command: 'node --test --test-reporter=tap local.test.mjs', cwd: input.repository, aggregatedOutput: input.tap, exitCode: 0, durationMs: 100, status: 'completed' } } });
  await window.webContents.executeJavaScript(`window.location.hash='/overview'`);
  await waitFor("document.querySelector('.overview-event') && document.querySelector('.overview-recent-diff') && document.querySelector('.health-card')?.textContent.includes('1/1')");
  checks.push('Reference3 overview renders authorized feed, actual Git diff and actual local TAP report');
  await click('Enable');
  await waitFor("Number(document.querySelector('.overview-system-chart svg')?.getAttribute('aria-label')?.match(/latest (\\d+)/)?.[1] ?? 0) >= 2");
  const metrics = await telemetry.request({ operation: 'getState', projectId, repositoryId });
  assert.equal(metrics.ok, true); if (metrics.ok) { assert.ok(metrics.state.samples.length >= 2); assert.ok(metrics.state.samples.at(-1)!.memoryTotalBytes > 0); assert.equal(metrics.state.networkBytesPerSecond, null); }
  await capture('overview-populated'); checks.push('Explicit UI opt-in renders real OS CPU/memory samples through production preload; network remains unknown');
  await click('Mark all read'); await waitFor("!document.querySelector('.overview-notifications .is-unread')");
  assert.equal(readThrough, '2'); checks.push('Mark all read reaches the captured project cursor through IPC');
  await click('Commits'); await waitFor("!document.querySelector('.overview-event') && document.querySelector('.overview-feed')?.textContent.includes('No activity in this category')");
  await click('All'); await waitFor("document.querySelector('.overview-event')"); checks.push('Feed filters show real empty categories and restore authorized session activity');
  await window.webContents.executeJavaScript(`(()=>{const field=document.querySelector('select[aria-label="Shared active session"]');field.value=${JSON.stringify(shareId)};field.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  await waitFor("document.querySelector('.active-session-card')?.textContent.includes('Shared by QA Reviewer')");
  assert.equal(await window.webContents.executeJavaScript(`[...document.querySelectorAll('.active-session-card button')].find(button=>button.textContent.includes('Stop Session')).disabled`), true);
  checks.push('Selecting an observed session changes the card and cannot control the remote runtime');
  await window.webContents.executeJavaScript(`document.querySelector('.overview-event a').click()`);
  await waitFor("document.body.textContent.includes('Explicitly selected QA text.')");
  checks.push('Feed deep link opens the selected authorized live text in Session Info');
  await window.webContents.executeJavaScript(`window.location.hash='/overview'`); await waitFor("document.querySelector('.overview-event')");
  snapshotCursor = '3'; activity[0] = { ...activity[0]!, id: '8e7cc0c3-d2d6-4a9b-9102-2cbec23f101b', sequence: '3', title: 'Updated selected QA text' };
  window.webContents.send(DESKTOP_IPC.realtimeStateChanged, { ...realtime, cursor: '3', snapshot: { ...realtime.snapshot!, cursor: '3' } });
  await waitFor("document.querySelector('.overview-new-events')");
  assert.equal(await window.webContents.executeJavaScript(`document.querySelector('.overview-event a').textContent`), qaShare.title);
  await click('New activity available · show latest ↑');
  await waitFor("document.querySelector('.overview-event a')?.textContent === 'Updated selected QA text'");
  checks.push('Incoming shared changes wait behind explicit apply and preserve the feed being read');
  snapshotCursor = '4'; authorizedTargets = [];
  window.webContents.send(DESKTOP_IPC.realtimeStateChanged, { ...realtime, cursor: '4', snapshot: { ...realtime.snapshot!, cursor: '4', shares: [] } });
  await waitFor("!document.querySelector('.overview-event') && document.querySelector('.overview-feed')?.textContent.includes('No activity in this category')");
  checks.push('A target removed from the authorized projection disappears immediately from held rows');
  window.webContents.send(DESKTOP_IPC.realtimeStateChanged, { ...realtime, connection: 'offline', snapshot: null, presence: [] });
  await waitFor("!document.querySelector('.overview-event') && !document.querySelector('.overview-notifications .is-unread')");
  checks.push('Realtime outage immediately hides shared overview data');
  window.webContents.send(DESKTOP_IPC.realtimeStateChanged, { ...realtime, cursor: '4', snapshot: { ...realtime.snapshot!, cursor: '4' } });
  await window.webContents.executeJavaScript(`window.location.hash='/pulse'`);
  await waitFor("document.querySelector('.pulse-layout[data-pulse-audience=team]') && document.querySelectorAll('.nexus-pulse-scene__node').length===5 && document.querySelectorAll('.pulse-outcomes-list>a').length===4");
  assert.equal(await window.webContents.executeJavaScript('document.documentElement.scrollWidth <= window.innerWidth'), true);
  assert.equal(await window.webContents.executeJavaScript('document.documentElement.scrollHeight <= window.innerHeight'), true);
  await capture('pulse-populated');
  checks.push('Reference1 Pulse composition renders five scoped milestones, four published outcomes and connected members without document overflow at 1586x992 through validated production preload (controlled QA projection)');
  await window.webContents.executeJavaScript(`(()=>{const node=document.querySelector('button.nexus-pulse-scene__node');node.focus();if(document.activeElement!==node)throw new Error('Milestone cannot receive keyboard focus');node.click()})()`);
  await waitFor("document.querySelector('dialog[open]')?.textContent.includes('Core platform review') && document.querySelector('.pulse-roadmap-detail')");
  assert.equal(await window.webContents.executeJavaScript("document.querySelector('.pulse-roadmap-detail').textContent.includes('4 completed')"), true);
  await capture('pulse-roadmap');
  await window.webContents.executeJavaScript(`document.querySelector('button[aria-label="Close dialog"]').click()`);
  checks.push('Focusable hero milestone opens its real scoped roadmap detail and linked-task counts');
  await window.webContents.executeJavaScript(`(()=>{const field=document.querySelector('.summary-card select');field.value='mine';field.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  await waitFor("document.querySelector('.summary-card select')?.value==='mine' && document.querySelectorAll('.summary-metrics strong')[1]?.textContent==='2'");
  assert.equal(pulseRequests.at(-1)?.scope, 'mine');
  assert.equal(await window.webContents.executeJavaScript("document.querySelectorAll('.summary-metrics strong')[0].textContent"), '—');
  checks.push('Summary My Activity scope reaches Pulse IPC and unavailable commit totals remain unknown');
  await window.webContents.executeJavaScript(`document.querySelector('.pulse-controls input').click()`);
  await waitFor("document.querySelector('.pulse-layout[data-pulse-audience=client]') && document.querySelectorAll('.nexus-pulse-scene__node').length===3");
  assert.equal(pulseRequests.at(-1)?.view, 'client');
  assert.equal(await window.webContents.executeJavaScript("document.querySelector('.pulse-layout').textContent.includes('Internal document workflow') || document.querySelector('.pulse-layout').textContent.includes('Internal assistant review')"), false);
  assert.equal(await window.webContents.executeJavaScript("document.querySelector('.working-card').textContent.includes('Local work stays on its device') && !document.querySelector('.working-card').textContent.includes('Review the local document service change') && ![...document.querySelectorAll('.pulse-layout button')].some(button=>['Open in Editor','Open Preview','Share Update'].includes(button.textContent.trim()))"), true);
  assert.equal(await window.webContents.executeJavaScript("document.querySelectorAll('.pulse-outcomes-list>a').length"), 2);
  await capture('pulse-client-preview');
  checks.push('Client preview requests client projection, removes internal milestone labels and local work/editor/preview/publication while retaining explicitly published outcomes');
  await window.webContents.executeJavaScript(`document.querySelector('.pulse-controls input').click()`);
  await waitFor("document.querySelector('.pulse-layout[data-pulse-audience=team]') && document.querySelectorAll('.nexus-pulse-scene__node').length===5");
  await window.webContents.executeJavaScript("document.querySelector('.nexus-pulse-scene canvas').style.transform='translateX(5000px)'");
  await window.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(resolve,120))))');
  const offscreenCanvas = await window.webContents.executeJavaScript("document.querySelector('.nexus-pulse-scene canvas').toDataURL()");
  await window.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(resolve,120))))');
  assert.equal(await window.webContents.executeJavaScript("document.querySelector('.nexus-pulse-scene canvas').toDataURL()"), offscreenCanvas);
  await window.webContents.executeJavaScript("document.querySelector('.nexus-pulse-scene canvas').style.transform=''");
  await window.webContents.executeJavaScript(`document.querySelector('button[aria-label="Reduce ambient motion"]').click()`);
  await waitFor("document.documentElement.dataset.reducedMotion==='true'");
  const staticCanvas = await window.webContents.executeJavaScript("document.querySelector('.nexus-pulse-scene canvas').toDataURL()");
  await window.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(resolve,120))))');
  assert.equal(await window.webContents.executeJavaScript("document.querySelector('.nexus-pulse-scene canvas').toDataURL()"), staticCanvas);
  await capture('pulse-reduced-motion');
  checks.push('Native offscreen observation pauses the actual canvas; reduced motion preserves and freezes the populated hero');
  window.setContentSize(960, 992);
  await waitFor('window.innerWidth===960');
  await capture('pulse-960');
  assert.equal(await window.webContents.executeJavaScript('document.documentElement.scrollWidth <= window.innerWidth'), true);
  checks.push('Pulse 960px responsive layout has no horizontal document overflow');
  await writeFile(path.join(input.output, 'workspace-report.json'), JSON.stringify({ checks, reference: 'examples/design/1.png; populated, client, roadmap, reduced motion and 960px captures', pulse: 'controlled audience-scoped QA projections only; no production data or fake production metrics', provider: 'controlled transport, no inference', realtime: 'controlled projection and request transport; see verify:realtime for real HTTP/WS/DB', filesystem: 'real isolated Git files', tests: 'actual Node TAP', osOpens: 'intercepted', personalCredentials: false }, null, 2));
  telemetry.dispose(); await codex.dispose(); window.destroy(); app.exit(0);
} catch (error) {
  await capture('workspace-failure').catch(() => undefined);
  await writeFile(path.join(input.output, 'workspace-failure.json'), JSON.stringify({ checks, error: error instanceof Error ? error.message : 'Workspace QA failed', body: await window.webContents.executeJavaScript('document.body.innerText').catch(() => '') }, null, 2));
  telemetry.dispose(); await codex.dispose(); console.error(error instanceof Error ? error.message : 'Workspace QA failed'); app.exit(1);
}
}
void verify().catch(error => { console.error(error instanceof Error ? error.message : 'Workspace QA setup failed'); app.exit(1); });

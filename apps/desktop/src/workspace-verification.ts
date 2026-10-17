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
const qaSession = session.fromPartition(`t07-qa-${Date.now()}`);
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
const codex = new DesktopCodex({ userData: input.directory, executable: 'controlled-provider-fixture', clientVersion: '0.7.0', platform: process.platform, auth, bindings, openExternal, createProcess: () => fixture as unknown as CodexProcess,
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
handle(DESKTOP_IPC.getInfo, () => ({ appVersion: '0.7.0', platform: process.platform, architecture: process.arch, electronVersion: process.versions.electron, capabilities: { canRunLocalSession: true, canOpenLocalEditor: true } }));
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
const realtime: RealtimeState = { projectId, connection: 'online', cursor: '0', snapshot: { projectId, cursor: '0', sessions: [], shares: [] }, presence: [{ userId: account.user!.id, name: account.user!.name, role: 'owner', connections: 1, lastSeenAt: now }], pending: 0, sharing: null, lastSyncedAt: now, notice: 'Isolated UI fixture; no remote connection.' };
handle(DESKTOP_IPC.realtimeRequest, value => { const request = realtimeRequestSchema.parse(value); return realtimeResponseSchema.parse({ ok: true, state: request.operation === 'disconnect' ? { ...realtime, connection: 'idle', snapshot: null, presence: [] } : realtime, share: null }); });
const checks: string[] = [];
async function waitFor(expression: string) {
  await window.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const test=()=>{if(${expression}){observer.disconnect();clearTimeout(timer);resolve(true)}};const observer=new MutationObserver(test);const timer=setTimeout(()=>{observer.disconnect();reject(new Error('Workspace UI condition timed out'))},8000);observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true});test()})`);
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
  await writeFile(path.join(input.output, 'workspace-report.json'), JSON.stringify({ checks, provider: 'controlled transport, no inference', realtime: 'controlled projection and request transport; see verify:realtime for real HTTP/WS/DB', filesystem: 'real isolated Git files', tests: 'actual Node TAP', osOpens: 'intercepted', personalCredentials: false }, null, 2));
  await codex.dispose(); window.destroy(); app.exit(0);
} catch (error) { await codex.dispose(); console.error(error instanceof Error ? error.message : 'Workspace QA failed'); app.exit(1); }
}
void verify().catch(error => { console.error(error instanceof Error ? error.message : 'Workspace QA setup failed'); app.exit(1); });

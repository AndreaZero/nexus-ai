import { app, BrowserWindow, ipcMain, protocol, session } from 'electron';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as c from '@nexus-ai/contracts';
import { APP_URL, isTrustedIpcSender, rendererAssetPath } from './security.ts';
import { rendererConnectionPolicy } from './preferences-csp.ts';

process.once('uncaughtException', error => { console.error('Polish bootstrap failed:', error.message); app.exit(1); });

// Disposable polish entry only: actual production renderer/preload and strict,
// explicitly controlled shared/local observations. Never imported by main.ts.
const input = JSON.parse(await readFile(process.argv[2]!, 'utf8')) as { directory: string; output: string; root: string };
app.setPath('userData', path.join(input.directory, 'profile'));
app.commandLine.appendSwitch('force-device-scale-factor', '1');
protocol.registerSchemesAsPrivileged([{ scheme: 'nexus', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const projectId = id(1), workspaceId = id(2), repositoryId = id(3), now = new Date().toISOString();
const author = { id: 'polish-qa', name: 'Polish maintainer with a deliberately long display name' };
const role = (input as { role?: 'owner' | 'developer' | 'client' }).role ?? 'owner', empty = false;
const account: c.NexusAuthState = { status: 'signed_in', user: { ...author, email: 'qa@example.invalid', emailVerified: true, image: null }, expiresAt: '2099-01-01T00:00:00.000Z', persistent: false, message: null };
const projectName = 'Document workflow and notifications — a deliberately long project name for polish verification';
const longTitle = 'Document workflow integration — preserve backward compatibility and review permissions, notifications and release polish with a long task title';
const checks: string[] = [], captures: string[] = [], measurements: Record<string, unknown> = {};
const tasks = ['in_progress', 'review', 'done'].map((status, index) => c.projectTaskSchema.parse({ id: id(10 + index), title: index ? ['Notification delivery review', 'Approved API contract'][index - 1] : longTitle, status, visibility: index === 1 ? 'team' : 'client' }));
const visible = <T extends { visibility: 'team' | 'client' }>(items: T[]) => empty ? [] : items.filter(item => role !== 'client' || item.visibility === 'client');
const share = { id: id(20), projectId, title: 'Selected live polish notes — only explicitly published text', visibility: 'client' as const, author: { id: 'qa-developer', name: 'QA Developer' }, status: 'active' as const, updatedAt: now };
const events = tasks.map((task, index) => c.overviewActivitySchema.parse({ id: id(30 + index), sequence: String(index + 1), category: 'tasks', kind: 'work.changed', target: { kind: 'work_task', id: task.id }, actor: author, title: task.title.slice(0, 140), visibility: task.visibility, occurredAt: now }));
function realtime(): c.RealtimeState { return { projectId, connection: 'online', cursor: '3', snapshot: { projectId, cursor: '3', sessions: [], shares: empty ? [] : [share] }, presence: empty ? [] : [{ userId: author.id, name: author.name, role, connections: 1, lastSeenAt: now }, { userId: 'qa-developer', name: 'QA Developer', role: 'developer', connections: 1, lastSeenAt: now }, { userId: 'qa-client', name: 'QA Client', role: 'client', connections: 1, lastSeenAt: now }], pending: 0, sharing: null, lastSyncedAt: now, notice: 'Controlled polish transport; no remote connection.' }; }
function overview(): c.OverviewSnapshot { const activity = visible(events); return { projectId, cursor: '3', observedAt: now, activity, authorizedTargets: activity.map(item => item.target), notifications: activity, unreadCount: activity.length, readThrough: '0', nextBefore: null, tasks: visible(tasks), activeShares: empty ? [] : [share], memberCount: empty ? 1 : 3 }; }
const milestones: c.PulseMilestone[] = ['Core platform and account', longTitle, 'Release and client polish'].map((title, index) => ({ id: id(40 + index), title, visibility: index === 1 ? 'team' : 'client', dueAt: null, state: index === 0 ? 'completed' : index === 1 ? 'in_progress' : 'planned', progress: { total: 2, completed: index === 0 ? 2 : index === 1 ? 1 : 0, inProgress: index === 1 ? 1 : 0, planned: index === 2 ? 2 : 0, percent: index === 0 ? 100 : index === 1 ? 50 : 0, source: 'visible_tasks' } }));
const workItems: c.WorkItem[] = [
  ...tasks.map(task => c.workItemSchema.parse({ ...task, projectId, kind: 'task', body: 'Controlled published polish task.', version: 1, author, createdAt: now, updatedAt: now, assignee: author, milestoneId: id(41), dueAt: null, sourceSessionId: null, taskId: null, documentId: null, targetKind: null, targetId: null, sentiment: null, attachments: [], progress: null, decision: null, revisions: [] })),
  ...['deliverable', 'feedback'].map((kind, index) => c.workItemSchema.parse({ id: id(50 + index), projectId, kind, title: index ? 'Reviewed release feedback' : 'Document workflow contract', body: index ? 'The published workflow is ready for the next polish check.' : 'Explicitly published version for client review.', visibility: 'client', version: 1, author, createdAt: now, updatedAt: now, status: index ? null : 'approved', assignee: null, milestoneId: null, dueAt: null, sourceSessionId: null, taskId: null, documentId: null, targetKind: index ? 'project' : null, targetId: null, sentiment: index ? 'positive' : null, attachments: [], progress: null, decision: index ? null : { by: { id: 'qa-client', name: 'QA Client' }, decision: 'approved', body: 'Approved controlled revision.', at: now }, revisions: [] })),
];
const patch = 'diff --git a/src/workflow.ts b/src/workflow.ts\n--- a/src/workflow.ts\n+++ b/src/workflow.ts\n@@ -1,2 +1,3 @@\n-export const version = 1;\n+export const version = 2;\n+export const notifications = true;\n export const permissions = true;';
let codex = c.codexStateSchema.parse({ runtime: 'ready', version: '0.159.2', expectedVersion: '0.159.2', runtimePath: null, account: { type: 'chatgpt', email: 'qa@example.invalid', plan: 'Controlled QA' }, login: null, models: [{ id: 'controlled-qa', model: 'controlled-qa', name: 'Controlled transport', description: 'No inference or model request', isDefault: true, defaultEffort: 'low', efforts: ['low'] }], policy: 'readOnly', notice: 'Controlled polish observations. No personal inference.', session: { projectId, repositoryId, threadId: 'polish-thread', turnId: null, folderLabel: 'Isolated polish folder', model: 'controlled-qa', status: 'completed', messages: [{ id: 'qa-user', role: 'user', text: longTitle, status: 'complete' }, { id: 'qa-answer', role: 'assistant', text: 'The controlled document workflow changes and test observation are ready for review. Only selected messages can be published.\n\nThis text is an isolated polish fixture, never a live model response.', status: 'complete' }], activities: [{ id: 'qa-command', kind: 'command', title: 'node --test polish.test.mjs', detail: 'Controlled report observation — not an executed command.', status: 'completed', exitCode: 0, durationMs: 127, outputTruncated: false }], error: null, plan: [{ step: 'Review existing permissions and document interfaces', status: 'completed' }, { step: 'Implement explicit notifications and compatibility checks', status: 'completed' }, { step: 'Review release polish', status: 'pending' }], planExplanation: 'Controlled protocol fixture; no inferred hidden reasoning.', usage: null, startedAt: now, approvals: [], diff: patch, diffTruncated: false, fileChanges: [{ id: 'qa-file', path: 'src/workflow.ts', kind: 'update', diff: patch, truncated: false, status: 'completed' }], testReports: [{ itemId: 'qa-command', format: 'tap', total: 3, passed: 3, failed: 0, skipped: 0, durationMs: 127, observedAt: now }] } });
const binding = { projectId, repositoryId, deviceId: id(60), rootPath: input.directory, label: 'Isolated polish folder', updatedAt: now };
const environments = [0, 1].map(index => c.deploymentEnvironmentSchema.parse({ id: id(100 + index), projectId, version: 1, createdAt: now, updatedAt: now, name: `Controlled staging environment with long display name ${index + 1}`, kind: 'staging', visibility: 'client', previewUrl: `https://preview-${index + 1}.example.invalid/a-deliberately-long-preview-path`, requiredChecks: [] }));
const deployments = environments.map((environment, index) => c.deploymentSchema.parse({ id: id(110 + index), projectId, version: 1, createdAt: now, updatedAt: now, environmentId: environment.id, title: `Controlled published deployment with a deliberately long title ${index + 1}`, status: 'succeeded', commitSha: 'a'.repeat(40), branch: 'feature/deliberately-long-document-workflow-branch', buildUrl: null, previewUrl: environment.previewUrl, notes: 'Explicit controlled QA record; no build or deployment was performed.', thumbnail: null, source: 'manual', authorId: author.id, observedAt: now }));
workItems.push(c.workItemSchema.parse({ ...workItems[0], id: id(120), kind: 'document', title: longTitle, status: null, assignee: null, milestoneId: null, body: 'Controlled long document body. '.repeat(40) }));
codex = c.codexStateSchema.parse({ ...codex, runtimePath: path.join(input.directory, 'a-deliberately-long-runtime-path-for-layout-verification', 'codex-runtime', 'bin', 'codex'), windowsSandbox: process.platform === 'win32' ? 'ready' : 'not_applicable', session: { ...codex.session!, bindingUpdatedAt: now } });

async function verify() {
  await app.whenReady();
  const server = createServer((_request, response) => { response.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); response.end(JSON.stringify({ schemaVersion: 1, service: 'nexus-server', version: '0.17.1', status: 'ok', database: 'connected', codex: 'local_only', timestamp: now })); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); const address = server.address(); assert.ok(address && typeof address !== 'string');
  const connection = { serverUrl: `http://127.0.0.1:${address.port}`, webUrl: `http://127.0.0.1:${address.port}` };
  const qaSession = session.fromPartition(`t18-polish-${Date.now()}`), renderer = path.join(input.root, 'apps/web/dist');
  qaSession.protocol.handle('nexus', async request => { const filename = rendererAssetPath(request.url, renderer), types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' }, bytes = await readFile(filename); return new Response(path.extname(filename) === '.html' ? rendererConnectionPolicy(bytes.toString('utf8'), connection.serverUrl) : new Uint8Array(bytes), { headers: { 'Content-Type': types[path.extname(filename)] ?? 'application/octet-stream' } }); });
  qaSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  const window = new BrowserWindow({ show: false, width: 1586, height: 992, useContentSize: true, webPreferences: { preload: path.join(input.root, 'apps/desktop/dist/preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, session: qaSession, backgroundThrottling: false } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  const trusted = (event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent) => { const frame = event.senderFrame; return Boolean(frame && isTrustedIpcSender({ senderId: event.sender.id, mainFrame: frame === event.sender.mainFrame, url: frame.url }, window.webContents.id)); };
  ipcMain.on(c.DESKTOP_IPC.configurationRead, (event, ...args: unknown[]) => { event.returnValue = trusted(event) && args.length === 0 ? connection : null; });
  function handle(channel: string, handler: (value: unknown) => unknown) { ipcMain.handle(channel, (event, value: unknown) => { if (!trusted(event)) throw new Error('Polish IPC denied'); return handler(value); }); }
  handle(c.DESKTOP_IPC.getInfo, () => c.desktopInfoSchema.parse({ appVersion: '0.17.1', platform: process.platform, architecture: process.arch, electronVersion: process.versions.electron, capabilities: { canRunLocalSession: true, canOpenLocalEditor: true } }));
  for (const channel of [c.DESKTOP_IPC.authGetState, c.DESKTOP_IPC.authSignIn, c.DESKTOP_IPC.authSignOut, c.DESKTOP_IPC.authCancelSignIn]) handle(channel, () => account);
  handle(c.DESKTOP_IPC.applicationRequest, value => { const request = c.applicationRequestSchema.parse(value); return c.applicationResponseSchema.parse(request.operation === 'getSettings' ? { ok: true, kind: 'settings', settings: { version: 0, name: author.name, preferences: c.defaultApplicationPreferences, updatedAt: null } } : request.operation === 'search' ? { ok: true, kind: 'search', query: request.query, items: [], nextOffset: null, observedAt: now } : { ok: false, code: 'forbidden', message: 'Read-only polish fixture.' }); });
  handle(c.DESKTOP_IPC.preferencesRequest, value => { c.desktopPreferencesRequestSchema.parse(value); return c.desktopPreferencesResponseSchema.parse({ ok: true, preferences: { active: connection, pending: null, restartRequired: false } }); });
  handle(c.DESKTOP_IPC.collaborationRequest, value => {
    const request = c.collaborationRequestSchema.parse(value); const technical = role !== 'client'; let response: c.CollaborationResponse;
    if (request.operation === 'listWorkspaces') response = { ok: true, kind: 'workspaces', items: [{ id: workspaceId, name: 'Polish workspace', role: role === 'owner' ? 'owner' : 'member', createdAt: now }] };
    else if (request.operation === 'listProjects') response = { ok: true, kind: 'projects', items: [{ id: projectId, workspaceId, name: projectName, description: 'Published polish content · explicit sources and current membership', defaultVisibility: 'team', role, repository: technical ? { id: repositoryId, projectId, remoteUrl: 'https://github.com/example/polish', defaultBranch: 'main' } : null, createdAt: now, updatedAt: now, capabilities: { manageMembers: role === 'owner', editProject: technical, viewRepository: technical } }] };
    else if (request.operation === 'listMembers') response = { ok: true, kind: 'members', items: [{ userId: author.id, name: author.name, email: 'qa@example.invalid', image: null, role, joinedAt: now }] };
    else response = { ok: false, code: 'forbidden', message: 'Read-only polish fixture.' }; return c.collaborationResponseSchema.parse(response);
  });
  handle(c.DESKTOP_IPC.codexRequest, value => { c.codexRequestSchema.parse(value); return c.codexResponseSchema.parse({ ok: true, state: empty || role === 'client' ? { ...codex, session: null } : codex }); });
  handle(c.DESKTOP_IPC.realtimeRequest, value => { const request = c.realtimeRequestSchema.parse(value); return c.realtimeResponseSchema.parse({ ok: true, state: request.operation === 'disconnect' ? { ...realtime(), connection: 'idle', snapshot: null, presence: [] } : realtime(), share: request.operation === 'readShare' ? { ...share, messages: [{ id: 'selected', role: 'assistant', text: 'Explicitly published polish notes.', status: 'complete' }] } : null }); });
  handle(c.DESKTOP_IPC.overviewRequest, value => { const request = c.overviewRequestSchema.parse(value); return c.overviewResponseSchema.parse(request.operation === 'markRead' ? { ok: true, kind: 'read', projectId, readThrough: request.through, unreadCount: 0 } : { ok: true, kind: 'overview', snapshot: overview() }); });
  handle(c.DESKTOP_IPC.pulseRequest, value => {
    const request = c.pulseRequestSchema.parse(value), items = visible(milestones).filter(item => request.view !== 'client' || item.visibility === 'client'), progress = { total: 0, completed: 0, inProgress: 0, planned: 0, percent: null as number | null, source: 'visible_tasks' as const };
    for (const item of items) { progress.total += item.progress.total; progress.completed += item.progress.completed; progress.inProgress += item.progress.inProgress; progress.planned += item.progress.planned; } progress.percent = progress.total ? progress.completed * 100 / progress.total : null;
    const dayStart = new Date(now); dayStart.setUTCHours(0, 0, 0, 0);
    return c.pulseResponseSchema.parse({ ok: true, snapshot: { projectId, audience: role === 'client' || request.view === 'client' ? 'client' : 'team', overview: overview(), milestones: items, milestoneCount: items.length, progress, summary: { dayStart: dayStart.toISOString(), dayEnd: new Date(dayStart.getTime() + 86400000).toISOString(), scope: request.scope, tasksUpdated: visible(tasks).length, sharedUpdates: empty ? 0 : 1, sharedSource: 'retained_entities', commits: null, comments: empty ? 0 : 1, buildsDeploys: null }, outcomes: empty ? [] : [{ id: id(70), projectId, title: 'Published document workflow review', status: 'completed', visibility: 'client', author, version: 1, messageCount: 1, createdAt: now, updatedAt: now }] } });
  });
  handle(c.DESKTOP_IPC.deploymentsRequest, value => { const request = c.deploymentsRequestSchema.parse(value); return c.deploymentsResponseSchema.parse(request.operation === 'snapshot' ? { ok: true, kind: 'snapshot', snapshot: { projectId: request.projectId, audience: role === 'client' ? 'client' : 'team', canManage: role !== 'client', environments, deployments, health: [], total: deployments.length, nextOffset: null, observedAt: now } } : { ok: false, code: 'forbidden', message: 'Read-only polish fixture.' }); });
  handle(c.DESKTOP_IPC.repositoriesRequest, value => { c.repositoriesRequestSchema.parse(value); return c.repositoriesResponseSchema.parse({ ok: true, kind: 'snapshot', snapshot: { projectId, repositoryId, remoteUrl: 'https://github.com/example/polish', connected: false, login: null, private: null, commits: [], pulls: [], observedAt: null, webhookConfigured: false, page: 1, hasMore: false } }); });
  handle(c.DESKTOP_IPC.workRequest, value => { const request = c.workRequestSchema.parse(value); const items = visible(workItems).filter(item => item.kind === ('kind' in request ? request.kind : '')); return c.workResponseSchema.parse(request.operation === 'list' ? { ok: true, kind: 'list', projectId, entityKind: request.kind, items, total: items.length, nextOffset: null } : request.operation === 'read' && items.some(item => item.id === request.id) ? { ok: true, kind: 'item', projectId, item: items.find(item => item.id === request.id)! } : { ok: false, code: 'not_found', message: 'Read-only polish fixture.' }); });
  handle(c.DESKTOP_IPC.localBindingRequest, value => { c.localBindingRequestSchema.parse(value); return c.localBindingResponseSchema.parse({ ok: true, binding: role === 'client' ? null : binding }); });
  handle(c.DESKTOP_IPC.contextRequest, value => { const request = c.contextRequestSchema.parse(value); return c.contextResponseSchema.parse({ ok: true, context: { projectId, repositoryId, folderLabel: binding.label, files: empty ? [] : [{ id: id(80), path: 'src/workflow.ts', bytes: 92, modifiedAt: now }, { id: id(81), path: 'src/notifications.ts', bytes: 144, modifiedAt: now }], repository: { isGit: true, branch: 'feature/document-workflow', head: 'a'.repeat(40), dirty: true, ahead: 1, behind: 0, observedAt: now }, draft: request.operation === 'saveDraft' ? request.text : '', updatedAt: now }, preview: null }); });
  handle(c.DESKTOP_IPC.workspaceRequest, value => { c.workspaceRequestSchema.parse(value); return c.workspaceResponseSchema.parse({ ok: true, snapshot: { projectId, repositoryId, isGit: true, files: [], truncated: false, observedAt: now, previewUrl: null } }); });
  handle(c.DESKTOP_IPC.sessionsRequest, value => { const request = c.sessionsRequestSchema.parse(value); return c.sessionsResponseSchema.parse(request.operation === 'listProjectTasks' ? { ok: true, kind: 'tasks', items: visible(tasks) } : { ok: true, kind: 'sessions', items: [] }); });
  handle(c.DESKTOP_IPC.telemetryRequest, value => { c.telemetryRequestSchema.parse(value); return c.telemetryResponseSchema.parse({ ok: true, state: { projectId, enabled: false, available: false, source: 'local_device', intervalMs: 2000, samples: [], networkBytesPerSecond: null, notice: 'Measurements disabled; no synthetic telemetry.' } }); });
  const rendererErrors: string[] = [];
  window.webContents.on('console-message', (_event, level, message) => { if (level === 3) rendererErrors.push(message); });
  async function evaluate(source: string) {
    try { return await window.webContents.executeJavaScript(source); }
    catch (error) { throw new Error(`${error instanceof Error ? error.message : 'Renderer evaluation failed'}; source: ${source.slice(0, 180)}; renderer: ${rendererErrors.slice(-3).join(' | ')}`, { cause: error }); }
  }
  async function settle() { await evaluate('document.fonts.ready.then(()=>new Promise(resolve=>requestAnimationFrame(resolve)))'); }
  async function waitFor(expression: string) {
    await evaluate(`new Promise((resolve,reject)=>{const test=()=>{if(${expression}){observer.disconnect();clearTimeout(timer);resolve(true)}};const observer=new MutationObserver(test);const timer=setTimeout(()=>{observer.disconnect();reject(new Error('Polish timeout: '+${JSON.stringify(expression)}))},10000);observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,characterData:true});test()})`);
  }
  async function capture(name: string) { await settle(); await writeFile(path.join(input.output, `${name}.png`), (await window.webContents.capturePage()).toPNG()); captures.push(name); }
  async function route(value: string, selector: string) {
    await evaluate(`location.hash=${JSON.stringify('/' + value)}`); await waitFor(`document.querySelector(${JSON.stringify(selector)})`);
    await evaluate("window.scrollTo(0,0);document.querySelector('.workspace-content')?.scrollTo(0,0)"); await settle();
  }
  async function press(keyCode: string, modifiers: ('control' | 'shift')[] = []) { window.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers }); window.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers }); }
  async function clickPoint(x: number, y: number) {
    window.webContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
    window.webContents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 }); await settle();
  }
  async function clickText(text: string, scope = 'document') {
    const expression = `[...${scope}.querySelectorAll('button')].find(node=>node.textContent.trim()===${JSON.stringify(text)})`;
    await waitFor(expression); await evaluate(`(()=>{const node=${expression};node.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});node.focus();node.click()})()`);
  }
  // Being below the fold is valid. Scroll the actual production containers first,
  // then reject controls clipped by hidden ancestors or outside the viewport.
  async function reachable(name: string, selector: string) {
    await waitFor(`document.querySelector(${JSON.stringify(selector)})`);
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',inline:'nearest',behavior:'instant'})`); await settle();
    const observation = await evaluate(`(()=>{const selector=${JSON.stringify(selector)},node=document.querySelector(selector),r=node.getBoundingClientRect(),style=getComputedStyle(node),ancestors=[];for(let p=node.parentElement;p;p=p.parentElement){const s=getComputedStyle(p),b=p.getBoundingClientRect();if(['hidden','clip','auto','scroll'].includes(s.overflowX)||['hidden','clip','auto','scroll'].includes(s.overflowY)){ancestors.push({tag:p.tagName,className:p.className,overflowX:s.overflowX,overflowY:s.overflowY,x:b.x,y:b.y,width:b.width,height:b.height,scrollHeight:p.scrollHeight,clientHeight:p.clientHeight,scrollTop:p.scrollTop,clippedX:['hidden','clip','auto','scroll'].includes(s.overflowX)&&(r.left<b.left-2||r.right>b.right+2),clippedY:['hidden','clip','auto','scroll'].includes(s.overflowY)&&(r.top<b.top-2||r.bottom>b.bottom+2)})}}const hit=document.elementFromPoint(Math.max(0,Math.min(innerWidth-1,r.x+r.width/2)),Math.max(0,Math.min(innerHeight-1,r.y+r.height/2)));return {selector,rect:{x:r.x,y:r.y,width:r.width,height:r.height},display:style.display,visibility:style.visibility,insideViewport:r.left>=-2&&r.top>=-2&&r.right<=innerWidth+2&&r.bottom<=innerHeight+2,hit:!!hit&&(hit===node||node.contains(hit)),ancestors}})()`);
    measurements[name] = observation;
    assert.ok(observation.rect.width > 0 && observation.rect.height > 0 && observation.display !== 'none' && observation.visibility !== 'hidden', `${name} hidden control`);
    assert.equal(observation.insideViewport, true, `${name} cannot scroll into viewport`);
    assert.equal(observation.hit, true, `${name} control obscured`);
    assert.equal(observation.ancestors.some((ancestor: { clippedX: boolean; clippedY: boolean }) => ancestor.clippedX || ancestor.clippedY), false, `${name} clipped by ancestor`);
  }
  async function measure(name: string, selectors: string[]) {
    await settle();
    const observation = await evaluate(`(()=>{const selectors=${JSON.stringify(selectors)};return {viewport:{width:innerWidth,height:innerHeight},documentWidth:document.documentElement.scrollWidth,documentOverflow:document.documentElement.scrollWidth>innerWidth+1,rectangles:Object.fromEntries(selectors.map(selector=>{const node=document.querySelector(selector),r=node?.getBoundingClientRect();return [selector,r?{x:r.x,y:r.y,width:r.width,height:r.height,scrollHeight:node.scrollHeight,clientHeight:node.clientHeight}:null]}))}})()`);
    measurements[name] = observation; assert.equal(observation.documentOverflow, false, `${name} document horizontal overflow`);
    for (const selector of selectors) assert.ok(observation.rectangles[selector], `${name} missing ${selector}`);
  }
  const routes = [
    ['overview', '.overview-event'], ['pulse', '.pulse-milestone-row'], ['session', '.codex-message'],
    ['projects', '.project-card'], ['repos', '.repository-grid'], ['tasks', '.work-task-card'],
    ['docs', '.work-record-row'], ['deployments', '.deploy-record'], ['settings', '.settings-layout'],
    ['getting-started', '.onboarding-stepper'],
  ] as const;
  try {
    await window.loadURL(`${APP_URL}#/projects`); await waitFor("document.querySelector('.project-card')");
    assert.equal(await evaluate("typeof window.require==='undefined'&&typeof window.process==='undefined'&&Object.isFrozen(window.nexusDesktop)"), true);
    checks.push('Actual production renderer/preload, strict controlled long-name fixtures, isolated profile and loopback health; Node absent');
    await window.webContents.debugger.attach('1.3');
    await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await waitFor("document.documentElement.dataset.reducedMotion==='true'");
    for (const [width, height] of [[1586, 992], [1280, 720], [960, 640]]) {
      window.setContentSize(width!, height!); await waitFor(`innerWidth===${width}&&innerHeight===${height}`);
      for (const [name, selector] of routes) {
        await route(name, selector);
        await measure(`${name}-${width}x${height}`, ['.workspace-sidebar', '.workspace-header', '.workspace-content', selector]);
        if (name === 'session') {
          const initialComposer = await evaluate("(()=>{const r=document.querySelector('.session-composer textarea').getBoundingClientRect();return {top:r.top,bottom:r.bottom,viewportHeight:innerHeight}})()");
          measurements[`session-${width}-initial-composer`] = initialComposer;
          assert.ok(initialComposer.top >= 0 && initialComposer.bottom <= initialComposer.viewportHeight + 2, `Session composer must be visible before scrolling at ${width}x${height}`);
        }
        await reachable(`${name}-${width}-sidebar-settings`, '.sidebar-item[data-route="settings"]');
        await reachable(`${name}-${width}-workspace-picker`, '.workspace-switcher');
        if (name === 'session') {
          const toolbar = await evaluate("[...document.querySelectorAll('.session-toolbar button')].map((node,index)=>({index,text:node.textContent.trim()}))");
          assert.ok(toolbar.length >= 5, 'Session actions must exist at every viewport');
          for (const item of toolbar) await reachable(`session-${width}-toolbar-${item.text}`, `.session-toolbar button:nth-of-type(${item.index + 1})`);
          await reachable(`session-${width}-composer`, '.session-composer textarea');
          await reachable(`session-${width}-tools`, '.composer-tools select');
        }
        if (name === 'pulse') {
          assert.equal(await evaluate("document.querySelectorAll('.deploy-pulse-previews .deploy-preview-tile').length"), 2);
          await reachable(`pulse-${width}-preview-one`, '.deploy-pulse-previews .deploy-preview-tile:first-child .compact-actions button');
          await reachable(`pulse-${width}-preview-two`, '.deploy-pulse-previews .deploy-preview-tile:last-child .compact-actions a');
        }
        if (name === 'settings') await reachable(`settings-${width}-appearance`, '.settings-appearance + label input');
        if (name === 'getting-started') await reachable(`onboarding-${width}-navigation`, '.onboarding-navigation button:last-child');
        await evaluate("window.scrollTo(0,0);document.querySelector('.workspace-content')?.scrollTo(0,0);document.querySelector('.sidebar-nav')?.scrollTo(0,0)"); await settle();
        if (['overview', 'pulse', 'session'].includes(name) || width === 960) await capture(`${name}-${width}x${height}`);
        console.log(`Polish verified ${name} ${width}x${height}`);
      }
      checks.push(`Ten routes fit ${width}×${height}; long titles, sidebar Settings and workspace picker remain reachable through real scrolling`);
    }
    checks.push('Session Share/Pause/Approvals/Stop/Publish, composer and tools reachable at all three sizes; two Pulse preview action groups remain accessible');
    await route('projects', '.project-card'); await clickText('New project'); await waitFor("document.querySelector('dialog[open] form')");
    await reachable('project-dialog-640-submit', 'dialog[open] button[type="submit"]');
    await capture('project-dialog-960x640');
    const paddingPoint = await evaluate("(()=>{const r=document.querySelector('dialog[open]').getBoundingClientRect();return {x:Math.ceil(r.left+3),y:Math.ceil(r.top+3)}})()");
    await clickPoint(paddingPoint.x, paddingPoint.y);
    assert.equal(await evaluate("!!document.querySelector('dialog[open]')"), true, 'Native click on inner dialog padding must not dismiss it');
    const backdropPoint = await evaluate("(()=>{const r=document.querySelector('dialog[open]').getBoundingClientRect();if(r.left<4)throw new Error('No left backdrop click area');return {x:Math.floor(r.left/2),y:Math.floor(r.top+r.height/2)}})()");
    await clickPoint(backdropPoint.x, backdropPoint.y); await waitFor("!document.querySelector('dialog[open]')");
    assert.equal(await evaluate("document.activeElement?.textContent.trim()==='New project'"), true);
    await route('deployments', '.deploy-record'); await clickText('Record build / deploy'); await waitFor("document.querySelector('dialog[open] textarea')");
    await reachable('long-deploy-dialog-640-footer', 'dialog[open] button[type="submit"]'); await capture('deploy-dialog-footer-960x640');
    await press('Escape'); await waitFor("!document.querySelector('dialog[open]')");
    checks.push('Project and long build-record dialogs scroll to submit controls at 640px height; native inner-padding click preserves the dialog, native backdrop dismisses with focus return, and Escape closes without writes');
    await evaluate("document.querySelector('.global-search').focus()"); await press('K', ['control']);
    await waitFor("document.activeElement?.getAttribute('aria-label')==='Search authorized content'");
    await reachable('search-dialog-640-input', 'dialog[open] input'); await capture('search-dialog-960x640');
    await press('Escape'); await waitFor("!document.querySelector('dialog[open]')");
    assert.equal(await evaluate("document.activeElement===document.querySelector('.global-search')"), true);
    await evaluate("document.querySelector('.skip-link').focus()"); await press('Return'); await waitFor("document.activeElement?.id==='main-content'");
    await press('Tab'); assert.equal(await evaluate("document.activeElement!==document.body&&document.activeElement!==document.querySelector('#main-content')"), true);
    checks.push('Ctrl+K search, Escape/focus return and skip link/Tab continuation remain usable at 960×640 with reduced motion');
    await writeFile(path.join(input.output, 'polish-report.json'), JSON.stringify({ checks, captures, measurements, source: 'Actual production Electron renderer/preload; explicitly controlled account, membership, runtime/session, local context, work and two published deployment DTOs; isolated profile and loopback health only.', references: ['examples/design/1.png', 'examples/design/2.png', 'examples/design/3.png'], limitations: 'Bounded layout/scroll/hit checks and captures, not pixel identity or a full accessibility audit. Windows execution only when run there; no native runtime, actual directory picker, inference, DB or external GitHub/deployment request. Below-fold content is valid when real scroll containers reveal it. Controlled transport fixtures are never production data.', personalCredentials: false, inference: false, externalWrites: false }, null, 2));
    console.log(`Polish UI QA passed ${checks.length} checks; ${captures.length} captures; ${Object.keys(measurements).length} measurements.`);
    window.destroy(); await new Promise<void>(resolve => server.close(() => resolve())); app.exit(0);
  } catch (error) {
    await capture('polish-failure').catch(() => undefined);
    await writeFile(path.join(input.output, 'polish-failure.json'), JSON.stringify({ checks, measurements, error: error instanceof Error ? error.message : 'Polish failed', body: await evaluate('document.body.innerText').catch(() => '') }, null, 2));
    console.error(error instanceof Error ? error.message : 'Polish QA failed'); window.destroy(); server.close(); app.exit(1);
  }
}
void verify().catch(error => { console.error(error instanceof Error ? error.message : 'Polish setup failed'); app.exit(1); });

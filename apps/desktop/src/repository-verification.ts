import { app, BrowserWindow, ipcMain, protocol, session } from 'electron';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DESKTOP_IPC, collaborationRequestSchema, collaborationResponseSchema, codexRequestSchema, codexResponseSchema, contextRequestSchema, contextResponseSchema, gitRequestSchema, localBindingRequestSchema, localBindingResponseSchema, overviewRequestSchema, overviewResponseSchema, realtimeRequestSchema, realtimeResponseSchema, repositoriesRequestSchema, repositoriesResponseSchema, sessionsRequestSchema, sessionsResponseSchema, workspaceRequestSchema, workspaceResponseSchema, type GitSnapshot, type NexusAuthState, type PullRequest, type RealtimeState, type RepositoriesRequest, type RepositoriesResponse } from '@nexus-ai/contracts';
import { DesktopGit } from './git.ts';
import { pulseRequestSchema,pulseResponseSchema,workRequestSchema,workResponseSchema } from '@nexus-ai/contracts';
import { DesktopWorkspace } from './workspace.ts';
import { APP_URL, isTrustedIpcSender, rendererAssetPath } from './security.ts';

// Disposable QA entry only. Actual renderer, preload and Git; shared GitHub/role responses are declared controlled fixtures.
const input = JSON.parse(await readFile(process.argv[2]!, 'utf8')) as { repository: string; directory: string; output: string; root: string };
app.setPath('userData', path.join(input.directory, 'profile'));
app.commandLine.appendSwitch('force-device-scale-factor', '1');
protocol.registerSchemesAsPrivileged([{ scheme: 'nexus', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
const projectId = 'd309dd11-6d7e-4bc1-bd49-292bc50c2f74'; const repositoryId = '02f71f6e-69b1-49b7-b6d8-df89167070b9'; const workspaceId = '8cda10c0-a979-44bb-a068-3a06ecdb9ca7';
const now = new Date().toISOString(); const remoteUrl = 'https://github.com/example/nexus-qa';
const account: NexusAuthState = { status: 'signed_in', user: { id: 'repository-ui-qa', name: 'Nexus QA', email: 'qa@example.invalid', emailVerified: true, image: null }, expiresAt: '2099-01-01T00:00:00.000Z', persistent: false, message: null };
const binding = { projectId, repositoryId, deviceId: workspaceId, rootPath: input.repository, label: 'Local QA repository', updatedAt: now };
const bindings = { get: async () => binding };
let qaRole: 'owner' | 'client' = 'owner'; let connected = false; let lastLocal: GitSnapshot | null = null;
const auth = { getState: async () => account, authorizeRepository: async () => qaRole === 'owner' ? { userId: account.user!.id } : { ok: false as const, code: 'forbidden', message: 'QA current role denied.' } };
const workspace = new DesktopWorkspace({ auth, bindings, openExternal: async () => undefined }); workspace.nexusStateChanged(account);
const git = new DesktopGit({ authorize: async () => qaRole === 'owner' ? { userId: account.user!.id, remoteUrl } : null, credential: async () => null, bindings, workspace }); git.nexusStateChanged(account);
const repositoryRequests: RepositoriesRequest[] = []; const checks: string[] = [];
const pulls: PullRequest[] = [];
const reviews: Extract<RepositoriesResponse, { kind: 'pull' }>['reviews'] = [];
const realtime: RealtimeState = { projectId, connection: 'online', cursor: '0', snapshot: { projectId, cursor: '0', sessions: [], shares: [] }, presence: [{ userId: account.user!.id, name: account.user!.name, role: 'owner', connections: 1, lastSeenAt: now }], pending: 0, sharing: null, lastSyncedAt: now, notice: 'Controlled QA realtime projection; no remote connection.' };
function remoteResponse(page = 1): RepositoriesResponse {
  return repositoriesResponseSchema.parse({ ok: true, kind: 'snapshot', snapshot: { projectId, repositoryId, remoteUrl, connected, login: connected ? 'nexus-qa-account' : null, private: connected ? true : null, commits: connected ? lastLocal?.commits ?? [] : [], pulls: connected ? pulls : [], observedAt: connected ? now : null, webhookConfigured: false, page, hasMore: false } });
}
function repositoryResponse(request: RepositoriesRequest): RepositoriesResponse {
  repositoryRequests.push(request);
  if (qaRole !== 'owner' || realtime.connection !== 'online') return { ok: false, code: 'forbidden', message: 'Controlled current role/offline denial.' };
  if (request.operation === 'connect') { connected = true; return remoteResponse(); }
  if (request.operation === 'disconnect') { connected = false; return remoteResponse(); }
  if (request.operation === 'snapshot' || request.operation === 'synchronize') return remoteResponse(request.page);
  if (request.operation === 'createPull') {
    const pull: PullRequest = { number: 7, title: request.title, body: request.body, state: 'open', draft: request.draft, head: request.head, headSha: lastLocal!.head!, base: request.base, author: 'nexus-qa-account', url: `${remoteUrl}/pull/7`, updatedAt: now };
    pulls.splice(0, pulls.length, pull); return { ok: true, kind: 'done', url: pull.url };
  }
  if (request.operation === 'getPull') return { ok: true, kind: 'pull', pull: pulls.find(pull => pull.number === request.number)!, files: [{ path: 'src/document-service.ts', status: 'modified', additions: 2, deletions: 1, patch: '@@ -1 +1,2 @@\n-return { title };\n+if (!userId) throw new Error("Sign in required");\n+return { title, createdBy: userId };' }], reviews, page: request.page, hasMore: false };
  if (request.operation === 'review') {
    assert.equal(request.headSha, pulls[0]!.headSha);
    reviews.push({ id: 71, author: 'nexus-qa-reviewer', state: request.event === 'APPROVE' ? 'APPROVED' : request.event, body: request.body, commitSha: request.headSha, submittedAt: now, url: `${remoteUrl}/pull/7#pullrequestreview-71` });
    return { ok: true, kind: 'done', url: `${remoteUrl}/pull/7#pullrequestreview-71` };
  }
  return { ok: false, code: 'invalid_request', message: 'Operation outside focused repository UI QA.' };
}

async function verify() {
  await app.whenReady();
  const qaSession = session.fromPartition(`t12-repository-qa-${Date.now()}`);
  const renderer = path.join(input.root, 'apps/web/dist');
  qaSession.protocol.handle('nexus', async request => { const filename = rendererAssetPath(request.url, renderer); const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' }; return new Response(new Uint8Array(await readFile(filename)), { headers: { 'Content-Type': types[path.extname(filename)] ?? 'application/octet-stream' } }); });
  qaSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  const window = new BrowserWindow({ show: false, width: 1586, height: 992, useContentSize: true, webPreferences: { preload: path.join(input.root, 'apps/desktop/dist/preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, session: qaSession, backgroundThrottling: false } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  function handle(channel: string, handler: (value: unknown) => unknown) { ipcMain.handle(channel, (event, value: unknown) => { const frame = event.senderFrame; if (!frame || !isTrustedIpcSender({ senderId: event.sender.id, mainFrame: frame === event.sender.mainFrame, url: frame.url }, window.webContents.id)) throw new Error('QA IPC denied'); return handler(value); }); }
  handle(DESKTOP_IPC.getInfo, () => ({ appVersion: '0.12.0', platform: process.platform, architecture: process.arch, electronVersion: process.versions.electron, capabilities: { canRunLocalSession: true, canOpenLocalEditor: true } }));
  for (const channel of [DESKTOP_IPC.authGetState, DESKTOP_IPC.authSignIn, DESKTOP_IPC.authCancelSignIn, DESKTOP_IPC.authSignOut]) handle(channel, () => account);
  handle(DESKTOP_IPC.localBindingRequest, value => { localBindingRequestSchema.parse(value); return localBindingResponseSchema.parse({ ok: true, binding }); });
  handle(DESKTOP_IPC.gitRequest, async value => { const result = await git.request(gitRequestSchema.parse(value)); if (result.ok) lastLocal = result.snapshot; return result; });
  handle(DESKTOP_IPC.workspaceRequest, value => workspace.request(workspaceRequestSchema.parse(value)).then(result => workspaceResponseSchema.parse(result)));
  handle(DESKTOP_IPC.repositoriesRequest, value => repositoriesResponseSchema.parse(repositoryResponse(repositoriesRequestSchema.parse(value))));
  handle(DESKTOP_IPC.workRequest,value=>{workRequestSchema.parse(value);return workResponseSchema.parse({ok:false,code:'unavailable',message:'Work data outside focused Git QA.'});});
  handle(DESKTOP_IPC.pulseRequest,value=>{
    const request=pulseRequestSchema.parse(value);const today=new Date();today.setUTCHours(0,0,0,0);const tomorrow=new Date(today);tomorrow.setUTCDate(tomorrow.getUTCDate()+1);
    return pulseResponseSchema.parse({ok:true,snapshot:{projectId,audience:'team',overview:{projectId,cursor:realtime.cursor??'0',observedAt:now,activity:[],nextBefore:null,authorizedTargets:[],notifications:[],unreadCount:0,readThrough:'0',tasks:[],activeShares:[],memberCount:1},milestones:[],milestoneCount:0,progress:{total:0,completed:0,inProgress:0,planned:0,percent:null,source:'visible_tasks'},summary:{dayStart:today.toISOString(),dayEnd:tomorrow.toISOString(),scope:request.scope,tasksUpdated:0,sharedUpdates:0,sharedSource:'retained_entities',commits:1,comments:0,buildsDeploys:null},outcomes:[]}});
  });
  handle(DESKTOP_IPC.codexRequest, value => { codexRequestSchema.parse(value); return codexResponseSchema.parse({ ok: true, state: { runtime: 'stopped', version: null, expectedVersion: '0.159.2', runtimePath: null, account: null, login: null, models: [], session: null, policy: 'readOnly', notice: 'Focused Git QA; no inference.' } }); });
  handle(DESKTOP_IPC.collaborationRequest, value => {
    const request = collaborationRequestSchema.parse(value);
    if (request.operation === 'listWorkspaces') return collaborationResponseSchema.parse({ ok: true, kind: 'workspaces', items: [{ id: workspaceId, name: 'Isolated repository QA', role: 'owner', createdAt: now }] });
    if (request.operation === 'listProjects') return collaborationResponseSchema.parse({ ok: true, kind: 'projects', items: [{ id: projectId, workspaceId, name: 'Document service', description: 'Native Git · explicit review and publication', defaultVisibility: 'team', role: qaRole, repository: qaRole === 'owner' ? { id: repositoryId, projectId, remoteUrl, defaultBranch: 'main' } : null, createdAt: now, updatedAt: now, capabilities: { manageMembers: qaRole === 'owner', editProject: qaRole === 'owner', viewRepository: qaRole === 'owner' } }] });
    if (request.operation === 'listMembers') return collaborationResponseSchema.parse({ ok: true, kind: 'members', items: [{ userId: account.user!.id, name: account.user!.name, email: account.user!.email, image: null, role: qaRole, joinedAt: now }] });
    return { ok: false, code: 'forbidden', message: 'Outside focused repository QA.' };
  });
  handle(DESKTOP_IPC.contextRequest, value => { const request = contextRequestSchema.parse(value); return contextResponseSchema.parse({ ok: true, context: { projectId, repositoryId, folderLabel: binding.label, files: [], repository: { isGit: true, branch: 'main', head: null, dirty: true, ahead: null, behind: null, observedAt: now }, draft: request.operation === 'saveDraft' ? request.text : '', updatedAt: now }, preview: null }); });
  handle(DESKTOP_IPC.sessionsRequest, value => { const request = sessionsRequestSchema.parse(value); return sessionsResponseSchema.parse(request.operation === 'listProjectTasks' ? { ok: true, kind: 'tasks', items: [] } : { ok: true, kind: 'sessions', items: [] }); });
  handle(DESKTOP_IPC.realtimeRequest, value => { const request = realtimeRequestSchema.parse(value); return realtimeResponseSchema.parse({ ok: true, state: request.operation === 'disconnect' ? { ...realtime, connection: 'idle', snapshot: null, presence: [] } : realtime, share: null }); });
  handle(DESKTOP_IPC.overviewRequest, value => { const request = overviewRequestSchema.parse(value); return overviewResponseSchema.parse(request.operation === 'markRead' ? { ok: true, kind: 'read', projectId, readThrough: request.through, unreadCount: 0 } : { ok: true, kind: 'overview', snapshot: { projectId, cursor: realtime.cursor ?? '0', observedAt: now, activity: [], nextBefore: null, authorizedTargets: [], notifications: [], unreadCount: 0, readThrough: '0', tasks: [], activeShares: [], memberCount: 1 } }); });
  const evaluate = (source: string) => window.webContents.executeJavaScript(source);
  async function waitFor(expression: string) { await evaluate(`new Promise((resolve,reject)=>{const test=()=>{if(${expression}){observer.disconnect();clearTimeout(timer);resolve(true)}};const observer=new MutationObserver(test);const timer=setTimeout(()=>{observer.disconnect();reject(new Error(${JSON.stringify('Repository QA timed out: ')}+${JSON.stringify(expression)}))},12000);observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true});test()})`); }
  async function click(label: string, scope = 'body') { await evaluate(`(()=>{const scopes=[...document.querySelectorAll(${JSON.stringify(scope)})];const root=scopes.at(-1);const button=[...root.querySelectorAll('button')].find(node=>node.textContent.trim()===${JSON.stringify(label)});if(!button||button.disabled)throw new Error('QA button unavailable: '+${JSON.stringify(label)});button.click()})()`); }
  async function field(label: string, value: string, scope = 'dialog[open]') { await evaluate(`(()=>{const root=[...document.querySelectorAll(${JSON.stringify(scope)})].at(-1);const label=[...root.querySelectorAll('label')].find(node=>node.textContent.trim().startsWith(${JSON.stringify(label)}));const field=label?.querySelector('input,textarea,select');if(!field)throw new Error('QA field unavailable: '+${JSON.stringify(label)});Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field),'value').set.call(field,${JSON.stringify(value)});field.dispatchEvent(new Event(field.tagName==='SELECT'?'change':'input',{bubbles:true}))})()`); }
  async function checkbox(selector = '.repo-check input') { await evaluate(`(()=>{const root=[...document.querySelectorAll('dialog[open]')].at(-1)??document;const field=root.querySelector(${JSON.stringify(selector)});if(!field||field.disabled)throw new Error('QA checkbox unavailable');field.click()})()`); }
  async function capture(name: string) { await evaluate('document.fonts.ready.then(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(resolve,100)))))'); await writeFile(path.join(input.output, `${name}.png`), (await window.webContents.capturePage()).toPNG()); }
  async function closeDialog() { await evaluate("[...document.querySelectorAll('dialog[open]')].at(-1).querySelector('[aria-label=\"Close dialog\"]').click()"); }
  try {
    await window.loadURL(`${APP_URL}#/code`);
    await waitFor("document.querySelector('.repo-diff')?.textContent.includes('createdBy: userId') && document.querySelectorAll('.repo-file-list input').length===1");
    assert.equal(await evaluate("typeof window.require==='undefined' && typeof window.process==='undefined'"), true);
    assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true);
    await capture('code-changes'); checks.push('Actual Git change and unified patch rendered via production preload; Node absent and 1586px document has no horizontal overflow');
    await checkbox('.repo-file-list input'); await click('Review commit · 1'); await waitFor("document.querySelector('dialog[open] h2')?.textContent==='Create local commit'");
    assert.equal(await evaluate("[...document.querySelectorAll('dialog[open] button')].find(button=>button.textContent.trim()==='Confirm create local commit').disabled"), true);
    await field('Commit message', 'Implement explicit document author'); await field('Commit author name', 'Nexus QA Author'); await field('Commit author email', 'qa-author@example.invalid');
    await capture('commit-confirmation'); checks.push('Commit preview names selected paths, repository and HEAD; explicit author/message and confirmation are required');
    await checkbox(); await click('Confirm create local commit', 'dialog[open]');
    await waitFor("!document.querySelector('dialog[open]') && document.querySelector('.repo-code-page')?.textContent.includes('Working tree clean')");
    const committed = lastLocal!; assert.equal(committed.dirty, false); assert.equal(committed.commits[0]?.title, 'Implement explicit document author'); assert.equal(committed.commits[0]?.author, 'Nexus QA Author');
    checks.push('UI selected commit creates a real native Git commit with explicit identity and leaves index/working tree clean');
    await click('Create branch'); await field('New branch name', 'feature/qa-review'); await checkbox(); await click('Confirm create branch', 'dialog[open]');
    await waitFor("!document.querySelector('dialog[open]') && document.querySelector('.domain-feedback--success')?.textContent.includes('Branch created')");
    assert.equal(lastLocal!.branch, 'main'); assert.ok(lastLocal!.branches.includes('feature/qa-review'));
    await click('Switch branch'); await field('Existing local branch', 'feature/qa-review'); await checkbox(); await click('Confirm switch branch', 'dialog[open]');
    await waitFor("!document.querySelector('dialog[open]') && document.querySelector('.repo-context-grid')?.textContent.includes('feature/qa-review')");
    assert.equal(lastLocal!.branch, 'feature/qa-review'); checks.push('Create branch preserves current branch; separately confirmed switch changes the real clean repository');
    await click('Commit history'); await waitFor("document.querySelector('.repo-history')?.textContent.includes('Implement explicit document author')"); await capture('commit-history');
    checks.push('Commit history reflects the actual native commit and real author/SHA');
    await evaluate("window.location.hash='/repos'"); await waitFor("document.querySelector('.repository-integrations input[type=password]')");
    const dummyToken = 'github_pat_controlled_qa_only_000000000';
    await field('Fine-grained personal access token', dummyToken, '.repository-integrations');
    await click('Connect my GitHub account'); await waitFor("document.querySelector('.repository-integrations')?.textContent.includes('nexus-qa-account')");
    assert.equal(repositoryRequests.filter(request => request.operation === 'connect').length, 1);
    assert.equal(await evaluate(`document.body.textContent.includes(${JSON.stringify(dummyToken)})||Object.values(localStorage).some(value=>value.includes(${JSON.stringify(dummyToken)}))`), false);
    assert.equal(await evaluate("document.querySelector('.repository-integrations input[type=password]')"), null);
    await capture('repository-connected'); checks.push('Connection token reaches strict production IPC once and is cleared; no returned token or localStorage credential (controlled GitHub response)');
    await evaluate("window.location.hash='/code'"); await waitFor("document.querySelector('.repo-context-grid')?.textContent.includes('nexus-qa-account')"); await click('Pull requests'); await click('Create pull request');
    await field('Pull request title', 'Document service authorization review'); await field('Description', '<script>window.qaExecuted=true</script>\nReview the explicitly committed author change.');
    await field('Head branch', 'feature/qa-review'); await field('Base branch', 'main'); await click('Preview pull request', 'dialog[open]');
    await waitFor("document.querySelector('.repo-publication-preview')"); assert.equal(repositoryRequests.filter(request => request.operation === 'createPull').length, 0);
    assert.equal(await evaluate('window.qaExecuted===undefined'), true); await capture('pull-publication-preview');
    await click('Confirm create pull request', 'dialog[open]'); await waitFor("document.querySelector('dialog[open] h2')?.textContent==='Pull request created'");
    assert.equal(repositoryRequests.filter(request => request.operation === 'createPull').length, 1); await click('Done', 'dialog[open]');
    checks.push('PR publication has an escaped text preview and creates exactly one controlled request after explicit confirmation');
    await click('Synchronize GitHub'); await waitFor("document.querySelector('.repo-pull-list button')?.textContent.includes('Document service authorization review')");
    await evaluate("document.querySelector('.repo-pull-list button').click()"); await waitFor("document.querySelector('.repo-pull-detail .repo-sha') && document.querySelector('.repo-pull-detail .repo-diff')");
    assert.equal(await evaluate(`document.querySelector('.repo-sha').textContent.includes(${JSON.stringify(committed.head)})`), true);
    await capture('pull-detail'); await click('Review this revision', 'dialog[open]');
    await field('Review decision', 'APPROVE'); await field('Review text', 'Reviewed this exact SHA and selected file patch.');
    assert.equal(await evaluate("[...document.querySelectorAll('dialog[open]')].at(-1).querySelector('button[type=submit]').disabled"), true);
    await checkbox(); await capture('pull-review-confirmation'); await click('Confirm submit review', 'dialog[open]');
    await waitFor("document.querySelectorAll('dialog[open]').length===1 && document.querySelector('.repo-reviews')?.textContent.includes('Reviewed this exact SHA')");
    const review = repositoryRequests.find(request => request.operation === 'review'); assert.ok(review && review.operation === 'review'); assert.equal(review.headSha, committed.head); assert.equal(review.event, 'APPROVE');
    checks.push('PR detail displays bounded patch and reviewed HEAD; review requires text/decision/confirmation and pins the controlled request to that exact SHA');
    await closeDialog();
    await evaluate("window.location.hash='#/pulse'");
    await waitFor("document.querySelector('.summary-metrics div:first-child strong')?.textContent==='1'");
    assert.equal(await evaluate("document.querySelector('.summary-metrics div:first-child small')?.textContent"),'Observed on GitHub');
    await capture('pulse-observed-commits');checks.push('Pulse reference1 displays the authorized observed commit count and GitHub source from its strict controlled DTO');
    await evaluate("window.location.hash='#/code'");await waitFor("document.querySelector('.repo-code-page')?.textContent.includes('Working changes · 0')");
    await click('Working changes · 0');
    await window.webContents.debugger.attach('1.3'); await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await waitFor("document.documentElement.dataset.reducedMotion==='true'"); await capture('code-reduced-motion');
    window.setContentSize(960, 992); await waitFor('window.innerWidth===960'); assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true); await capture('code-960');
    checks.push('Production shell, planet and Code layout respect reduced motion and avoid horizontal document overflow at 960px');
    window.setContentSize(1586, 992); await waitFor('window.innerWidth===1586');
    window.webContents.send(DESKTOP_IPC.realtimeStateChanged, { ...realtime, connection: 'offline', snapshot: null, presence: [] });
    await waitFor("document.querySelector('.repo-code-page')?.textContent.includes('Reconnect to verify access') && !document.querySelector('.repo-context-grid') && !document.querySelector('.repo-diff')");
    checks.push('Realtime outage hides local diffs, GitHub metadata and mutation controls immediately');
    qaRole = 'client'; realtime.presence[0] = { ...realtime.presence[0]!, role: 'client' }; window.webContents.send(DESKTOP_IPC.realtimeStateChanged, realtime);
    await waitFor("document.body.textContent.includes('Technical access required') && !document.querySelector('.repo-code-page')");
    checks.push('Current realtime role demotion removes technical Code data and controls without waiting for navigation');
    await writeFile(path.join(input.output, 'repository-report.json'), JSON.stringify({ checks, reference: 'examples/design/2.png; shared shell/palette/planet and diff components; new Code/Repos flows are extensions', captures: '1586x992 and 960x992 CSS px, scale1, reduced motion', filesystem: 'real temporary Git repository and actual DesktopGit/DesktopWorkspace', transport: 'production preload with strict schemas; GitHub/realtime/account responses controlled only in this disposable entry', remoteWrites: false, inference: false, personalCredentials: false, commit: { sha: committed.head, author: committed.commits[0]?.author, title: committed.commits[0]?.title }, requests: { createPull: repositoryRequests.filter(request => request.operation === 'createPull').length, review: repositoryRequests.filter(request => request.operation === 'review').length } }, null, 2));
    window.destroy(); app.exit(0);
  } catch (error) {
    await capture('repository-failure').catch(() => undefined);
    await writeFile(path.join(input.output, 'repository-failure.json'), JSON.stringify({ checks, error: error instanceof Error ? error.message : 'Repository UI QA failed', body: await evaluate('document.body.innerText').catch(() => '') }, null, 2));
    console.error(error instanceof Error ? error.message : 'Repository UI QA failed'); window.destroy(); app.exit(1);
  }
}
void verify().catch(error => { console.error(error instanceof Error ? error.message : 'Repository UI QA setup failed'); app.exit(1); });

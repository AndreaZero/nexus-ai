import { app, BrowserWindow, session } from 'electron';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { installRendererProcessRecovery } from './renderer-process-recovery.ts';

// Actual renderer termination in a disposable window, never the user's Nexus process.
const input = JSON.parse(readFileSync(process.argv[2]!, 'utf8')) as { directory: string; output: string };
const profile = path.join(input.directory, 'profile'); mkdirSync(profile, { recursive: true }); app.setPath('userData', profile);
// Keep the QA main process alive after the Close choice until its report is flushed.
app.on('window-all-closed', () => undefined);

async function verify() {
  await app.whenReady();
  const qaSession = session.fromPartition(`t15-native-recovery-${Date.now()}`);
  qaSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  qaSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !details.url.startsWith('file:') }));
  const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, session: qaSession } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  const checks: string[] = [];
  let stops = 0, prompts = 0, navigations = 0, stopped = false;
  let releaseStop: () => void = () => undefined, stopEntered: () => void = () => undefined;
  const stopStarted = new Promise<void>(resolve => { stopEntered = resolve; });
  const stopWaiting = new Promise<void>(resolve => { releaseStop = resolve; });
  let resolveChoice: (value: 'reload' | 'close') => void = () => undefined;
  let promptEntered: () => void = () => undefined;
  let promptStarted = new Promise<void>(resolve => { promptEntered = resolve; });
  const waitForLoad = () => new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Controlled renderer reload timed out')), 5000);
    window.webContents.once('did-finish-load', () => { clearTimeout(timer); resolve(); });
  });
  window.webContents.on('did-start-navigation', (_event, _url, isInPlace, isMainFrame) => { if (isMainFrame && !isInPlace) navigations++; });
  installRendererProcessRecovery(window, {
    stopExecution: async () => { stops++; if (stops === 1) { stopEntered(); await stopWaiting; } stopped = true; },
    confirm: async () => {
      assert.equal(stopped, true); prompts++; promptEntered();
      return new Promise<'reload' | 'close'>(resolve => { resolveChoice = resolve; });
    },
  });
  try {
    await window.loadFile(path.join(input.directory, 'index.html'));
    assert.equal(await window.webContents.executeJavaScript("typeof window.require==='undefined'&&typeof window.process==='undefined'&&typeof window.nexusDesktop==='undefined'"), true);
    checks.push('Disposable real Electron renderer runs sandboxed without Node, Nexus bridge, credentials or network');
    window.webContents.forcefullyCrashRenderer(); await stopStarted;
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(prompts, 0); assert.equal(navigations, 1); assert.equal(stopped, false);
    checks.push('Actual forcefullyCrashRenderer starts execution shutdown and offers no prompt or automatic reload before shutdown completes');
    releaseStop(); await promptStarted;
    assert.equal(stops, 1); assert.equal(prompts, 1); assert.equal(navigations, 1);
    await new Promise(resolve => setTimeout(resolve, 50)); assert.equal(navigations, 1); assert.equal(prompts, 1);
    checks.push('After shutdown, one injected user-confirmation prompt remains pending without reload or retry loops');
    const reloaded = waitForLoad(); resolveChoice('reload'); await reloaded;
    assert.equal(navigations, 2); assert.equal(stops, 1); assert.equal(prompts, 1);
    assert.equal(await window.webContents.executeJavaScript("document.querySelector('h1').textContent==='Controlled native recovery fixture'"), true);
    checks.push('Explicit Reload Nexus choice produces exactly one real renderer reload after stopping execution');
    stopped = false;
    promptStarted = new Promise<void>(resolve => { promptEntered = resolve; });
    window.webContents.forcefullyCrashRenderer(); await promptStarted;
    assert.equal(stops, 2); assert.equal(prompts, 2); assert.equal(stopped, true); assert.equal(navigations, 2);
    const closed = new Promise<void>(resolve => window.once('closed', () => resolve()));
    resolveChoice('close'); await closed;
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(prompts, 2); assert.equal(navigations, 2); assert.equal(window.isDestroyed(), true);
    checks.push('A second actual renderer crash stops execution again; Close window destroys it without another reload or shutdown prompt');
    await writeFile(path.join(input.output, 'renderer-process-report.json'), JSON.stringify({ passed: true, checks, platform: process.platform, electron: process.versions.electron,
      actualRendererCrashes: 2, stoppedBeforePrompt: true, automaticReloads: 0, explicitReloads: 1,
      source: 'Production installRendererProcessRecovery with actual Electron forcefullyCrashRenderer; execution stop and user confirmation are controlled callbacks',
      limitations: ['The test never crashes the maintainer application or starts Codex inference. Native system dialog rendering and real Codex process termination are separately covered by main integration and runtime tests.'] }, null, 2));
    app.exit(0);
  } catch {
    releaseStop(); resolveChoice('close'); if (!window.isDestroyed()) window.destroy();
    await writeFile(path.join(input.output, 'renderer-process-report.json'), JSON.stringify({ passed: false, checks, reason: 'Native renderer recovery assertion or fixture failed; crash details intentionally omitted.' }, null, 2));
    app.exit(1);
  }
}
void verify().catch(() => { console.error('Native renderer recovery fixture could not start.'); app.exit(1); });

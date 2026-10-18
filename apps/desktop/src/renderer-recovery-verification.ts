import { app, BrowserWindow, session } from 'electron';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Isolated QA entry: actual production React boundary, no app bridge or credentials.
const input = JSON.parse(readFileSync(process.argv[2]!, 'utf8')) as { directory: string; output: string };
const profile = path.join(input.directory, 'profile');
mkdirSync(profile, { recursive: true }); app.setPath('userData', profile);
app.commandLine.appendSwitch('force-device-scale-factor', '1');
const marker = 'PRIVATE_CONTROLLED_RENDER_FAILURE_T15';

async function verify() {
  await app.whenReady();
  const qaSession = session.fromPartition(`t15-renderer-recovery-${Date.now()}`);
  qaSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  qaSession.webRequest.onBeforeRequest((details, callback) => {
    let allowed = false;
    try {
      const filename = path.resolve(fileURLToPath(details.url));
      const relative = path.relative(input.directory, filename);
      allowed = !relative.startsWith('..') && !path.isAbsolute(relative);
    } catch { /* No network or non-file destination is allowed in this fixture. */ }
    callback({ cancel: !allowed });
  });
  const window = new BrowserWindow({ show: false, width: 1586, height: 992, useContentSize: true,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, session: qaSession, backgroundThrottling: false } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  const logs: string[] = [], checks: string[] = [];
  let navigations = 0;
  window.webContents.on('console-message', (_event, _level, message) => { if (logs.length < 100) logs.push(message); });
  window.webContents.on('did-start-navigation', (_event, _url, isInPlace, isMainFrame) => { if (isMainFrame && !isInPlace) navigations++; });
  const evaluate = (source: string) => window.webContents.executeJavaScript(source);
  async function ready() {
    await evaluate(`new Promise((resolve,reject)=>{
      const test=()=>{if(document.querySelector('.renderer-recovery')){observer.disconnect();clearTimeout(timer);resolve(true)}};
      const observer=new MutationObserver(test);
      const timer=setTimeout(()=>{observer.disconnect();reject(new Error('Recovery fallback did not mount'))},5000);
      observer.observe(document.documentElement,{subtree:true,childList:true});test();
    })`);
    await evaluate('document.fonts.ready.then(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))))');
  }
  async function capture(name: string) { await writeFile(path.join(input.output, `${name}.png`), (await window.webContents.capturePage()).toPNG()); }
  try {
    await window.loadFile(path.join(input.directory, 'index.html')); await ready();
    assert.equal(await evaluate("typeof window.require==='undefined'&&typeof window.process==='undefined'&&typeof window.nexusDesktop==='undefined'"), true);
    checks.push('Real Electron sandbox and isolated renderer mount the production React error boundary without Node or Nexus bridge');
    assert.equal(await evaluate("document.activeElement===document.querySelector('.renderer-recovery')&&document.activeElement.getAttribute('role')==='alert'&&document.activeElement.tabIndex===-1"), true);
    assert.equal(await evaluate("document.querySelector('h1')?.textContent==='This screen could not be displayed'&&document.querySelector('button')?.textContent==='Reload Nexus'"), true);
    checks.push('A controlled child render failure focuses the accessible recovery alert and exposes an explicit Reload Nexus button');
    assert.equal(await evaluate(`!document.body.innerText.includes(${JSON.stringify(marker)})&&!document.body.innerText.includes('at BrokenChild')&&window.qaCaughtCount===1`), true);
    assert.equal(logs.some(message => message.includes(marker) || message.includes('at BrokenChild')), false);
    checks.push('Private controlled error payload and component stack are absent from rendered text and captured console logs');
    assert.equal(navigations, 1);
    const attempts = await evaluate('window.qaRenderAttempts');
    await ready();
    assert.equal(navigations, 1); assert.equal(await evaluate('window.qaRenderAttempts'), attempts);
    checks.push('After settling animation frames, the failed screen performs no automatic navigation or render retry');
    await capture('renderer-recovery');
    window.setContentSize(960, 800); await ready();
    assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth&&document.querySelector('button').getBoundingClientRect().right<=innerWidth"), true);
    await capture('renderer-recovery-960');
    checks.push('Recovery remains readable and its button stays inside the 960px viewport');
    const reloaded = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Explicit reload did not finish')), 5000);
      window.webContents.once('did-finish-load', () => { clearTimeout(timer); resolve(); });
    });
    // The sole click is a QA user action, not a production recovery hook.
    await evaluate("document.querySelector('button').click()");
    await reloaded; await ready();
    assert.equal(navigations, 2);
    assert.equal(logs.some(message => message.includes(marker) || message.includes('at BrokenChild')), false);
    checks.push('The explicit Reload Nexus click causes exactly one real main-frame reload and the failing fixture returns to its recovery screen');
    await writeFile(path.join(input.output, 'renderer-recovery-report.json'), JSON.stringify({ passed: true, checks,
      source: 'Production RendererErrorBoundary.tsx with production React/createRoot and CSS; isolated controlled throwing child, no production fault injection hook',
      platform: process.platform, electron: process.versions.electron,
      automaticReloads: 0, explicitReloads: navigations - 1,
      limitations: ['Tests a caught React render failure in isolation; native renderer process termination and unsaved application state restoration are separate checks.'] }, null, 2));
    window.destroy(); app.exit(0);
  } catch {
    await writeFile(path.join(input.output, 'renderer-recovery-report.json'), JSON.stringify({ passed: false, checks, reason: 'Renderer recovery assertion or fixture operation failed; no private error payload recorded.' }, null, 2));
    window.destroy(); app.exit(1);
  }
}
void verify().catch(() => { console.error('Renderer recovery fixture could not start.'); app.exit(1); });

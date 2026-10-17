import { app, BrowserWindow, dialog, ipcMain, protocol, session, shell, safeStorage } from 'electron';
import { readFile, realpath, rm } from 'node:fs/promises';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DESKTOP_IPC, collaborationRequestSchema, collaborationResponseSchema, desktopInfoSchema, localBindingRequestSchema, localBindingResponseSchema, nexusAuthStateSchema, codexRequestSchema, codexResponseSchema, codexStateSchema } from '@nexus-ai/contracts';
import { APP_URL, developmentUrl, isTrustedIpcSender, isWithinDirectory, rendererAssetPath } from './security.js';
import { verifyShell } from './shell-verification.js';
import { DesktopAuth } from './auth.js';
import { AUTH_SCHEME } from './auth-config.js';
import { verifyDesktopAuth } from './auth-verification.js';
import { LocalBindingService, LocalBindingStorage } from './local-bindings.js';
import { DesktopCodex, codexRuntimePath } from './codex.js';
import { DesktopContext } from './context.js';
import { DesktopWorkspace } from './workspace.js';
import { EncryptedAuthStorage } from './auth-storage.js';
import { contextRequestSchema, contextResponseSchema, sessionsRequestSchema, sessionsResponseSchema, workspaceRequestSchema, workspaceResponseSchema } from '@nexus-ai/contracts';

protocol.registerSchemesAsPrivileged([
  { scheme: 'nexus', privileges: { standard: true, secure: true, supportFetchAPI: true } },
  { scheme: AUTH_SCHEME, privileges: { standard: false, secure: true } },
]);

const bundleDirectory = path.dirname(fileURLToPath(import.meta.url));
const smokeTest = process.argv.includes('--smoke-test');
const shellVerification = process.argv.includes('--verify-shell') && !app.isPackaged;
const authVerification = process.argv.includes('--verify-auth') && !app.isPackaged;
const hiddenVerification = smokeTest || shellVerification || authVerification;
const authVerificationDirectory = authVerification ? mkdtempSync(path.join(os.tmpdir(), 'nexus-desktop-auth-')) : undefined;
if (authVerificationDirectory) app.setPath('userData', authVerificationDirectory);
if (shellVerification) app.commandLine.appendSwitch('force-device-scale-factor', '1');
let mainWindow: BrowserWindow | undefined;
let desktopAuth: DesktopAuth | undefined;
let desktopCodex: DesktopCodex | undefined;
let desktopContext: DesktopContext | undefined;
let desktopWorkspace: DesktopWorkspace | undefined;

function receiveAccountCallback(value: string) {
  // Never log OS callback URLs: their fragment contains a temporary credential.
  if (!value.startsWith(`${AUTH_SCHEME}://`)) return;
  void desktopAuth?.handleCallback(value);
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
}

const primaryInstance = hiddenVerification || app.requestSingleInstanceLock();
if (!primaryInstance) app.quit();
if (primaryInstance && !hiddenVerification) {
  app.on('second-instance', (_event, commandLine) => {
    const callback = commandLine.find((argument) => argument.startsWith(`${AUTH_SCHEME}://`));
    if (callback) receiveAccountCallback(callback);
    else mainWindow?.focus();
  });
  app.on('open-url', (event, url) => {
    event.preventDefault();
    receiveAccountCallback(url);
  });
  const registered = process.defaultApp && process.argv[1]
    ? app.setAsDefaultProtocolClient(AUTH_SCHEME, process.execPath, [path.resolve(process.argv[1])])
    : app.setAsDefaultProtocolClient(AUTH_SCHEME);
  if (!registered) console.warn('Nexus account callback registration is unavailable. Install the native application and retry browser sign-in.');
}

function desktopInfo() {
  return desktopInfoSchema.parse({
    appVersion: app.getVersion(),
    platform: process.platform,
    architecture: process.arch,
    electronVersion: process.versions.electron,
    capabilities: { canRunLocalSession: true, canOpenLocalEditor: true },
  });
}

const mimeTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

async function initialize() {
  if (authVerification) {
    try {
      await verifyDesktopAuth(path.resolve(app.getAppPath(), '../../.nexus/visual/t03'));
    } finally {
      const directory = authVerificationDirectory;
      if (directory && path.resolve(directory).startsWith(path.join(path.resolve(os.tmpdir()), 'nexus-desktop-auth-'))) {
        await rm(directory, { recursive: true, force: true });
      }
    }
    app.exit(0);
    return;
  }
  const devUrl = developmentUrl(process.env['NEXUS_RENDERER_URL'], app.isPackaged);
  const rendererPath = app.isPackaged
    ? path.join(process.resourcesPath, 'renderer')
    : path.resolve(bundleDirectory, '../../web/dist');
  const rendererDirectory = devUrl ? rendererPath : await realpath(rendererPath);
  const desktopSession = session.fromPartition('persist:nexus');
  desktopSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  desktopSession.setPermissionCheckHandler(() => false);
  desktopSession.setDevicePermissionHandler(() => false);
  desktopSession.on('will-download', (event) => event.preventDefault());

  desktopSession.protocol.handle('nexus', async (request) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405 });
    let asset: string;
    try {
      asset = rendererAssetPath(request.url, rendererDirectory);
    } catch {
      return new Response(null, { status: 403 });
    }
    try {
      // A symlink must not turn a renderer asset into access to arbitrary local files.
      const resolved = await realpath(asset);
      if (!isWithinDirectory(rendererDirectory, resolved)) return new Response(null, { status: 403 });
      const data = request.method === 'HEAD' ? null : new Uint8Array(await readFile(resolved));
      return new Response(data, {
        headers: {
          'Content-Type': mimeTypes[path.extname(resolved)] ?? 'application/octet-stream',
          'X-Content-Type-Options': 'nosniff',
          // Production CSP is generated into the shared index.html by Vite.
          'Cache-Control': 'no-cache',
        },
      });
    } catch {
      return new Response(null, { status: 404 });
    }
  });

  function requireTrustedCaller(event: Electron.IpcMainInvokeEvent, args: unknown[], argumentCount = 0) {
    const frame = event.senderFrame;
    if (!mainWindow || !frame || args.length !== argumentCount || !isTrustedIpcSender({
      senderId: event.sender.id,
      mainFrame: frame === event.sender.mainFrame,
      url: frame.url,
    }, mainWindow.webContents.id, devUrl)) {
      throw new Error('Desktop request denied.');
    }
  }

  desktopAuth = new DesktopAuth((state) => {
    desktopCodex?.nexusStateChanged(state);
    desktopContext?.nexusStateChanged(state);
    desktopWorkspace?.nexusStateChanged(state);
    const window = mainWindow;
    if (window && !window.isDestroyed() && isTrustedIpcSender({
      senderId: window.webContents.id,
      mainFrame: true,
      url: window.webContents.getURL(),
    }, window.webContents.id, devUrl)) window.webContents.send(DESKTOP_IPC.authStateChanged, state);
  }, smokeTest || shellVerification);

  const bindingStorage = new LocalBindingStorage(path.join(app.getPath('userData'), 'repository-bindings.json'));
  const localBindings = new LocalBindingService(
    bindingStorage,
    (projectId, repositoryId) => desktopAuth!.authorizeRepository(projectId, repositoryId),
    async () => {
      const window = mainWindow;
      if (!window || window.isDestroyed()) throw new Error('No local folder dialog is available.');
      const selection = await dialog.showOpenDialog(window, {
        title: 'Choose the local project folder', buttonLabel: 'Use this folder', properties: ['openDirectory'],
      });
      return selection.canceled ? null : selection.filePaths[0] ?? null;
    },
  );

  desktopContext = new DesktopContext({
    userData: app.getPath('userData'), auth: desktopAuth, bindings: bindingStorage,
    storage: new EncryptedAuthStorage(path.join(app.getPath('userData'), 'session-context.bin'), safeStorage, process.platform),
    pickFiles: async rootPath => {
      const window = mainWindow;
      if (!window || window.isDestroyed()) return [];
      const selection = await dialog.showOpenDialog(window, { title: 'Select project text files', defaultPath: rootPath, properties: ['openFile', 'multiSelections'] });
      return selection.canceled ? [] : selection.filePaths;
    },
  });
  ipcMain.handle(DESKTOP_IPC.contextRequest, (event, ...args: unknown[]) => {
    requireTrustedCaller(event, args, 1);
    return desktopContext!.request(contextRequestSchema.parse(args[0])).then(result => contextResponseSchema.parse(result));
  });
  ipcMain.handle(DESKTOP_IPC.sessionsRequest, (event, ...args: unknown[]) => {
    requireTrustedCaller(event, args, 1);
    return desktopAuth!.sessionsRequest(sessionsRequestSchema.parse(args[0])).then(result => sessionsResponseSchema.parse(result));
  });

  desktopWorkspace = new DesktopWorkspace({ auth: desktopAuth, bindings: bindingStorage, openExternal: url => shell.openExternal(url) });
  ipcMain.handle(DESKTOP_IPC.workspaceRequest, (event, ...args: unknown[]) => {
    requireTrustedCaller(event, args, 1);
    return desktopWorkspace!.request(workspaceRequestSchema.parse(args[0])).then(result => workspaceResponseSchema.parse(result));
  });

  desktopCodex = new DesktopCodex({
    userData: app.getPath('userData'), clientVersion: app.getVersion(), platform: process.platform,
    executable: codexRuntimePath(app.isPackaged, process.resourcesPath, app.getAppPath(), process.platform),
    auth: desktopAuth, bindings: bindingStorage, openExternal: url => shell.openExternal(url),
    readAttachments: (...args) => desktopContext!.resolveForSend(...args),
    publish: (state) => {
      const window = mainWindow;
      if (window && !window.isDestroyed() && isTrustedIpcSender({
        senderId: window.webContents.id, mainFrame: true, url: window.webContents.getURL(),
      }, window.webContents.id, devUrl)) window.webContents.send(DESKTOP_IPC.codexStateChanged, codexStateSchema.parse(state));
    },
  });
  ipcMain.handle(DESKTOP_IPC.codexRequest, (event, ...args: unknown[]) => {
    requireTrustedCaller(event, args, 1);
    return desktopCodex!.request(codexRequestSchema.parse(args[0])).then(result => codexResponseSchema.parse(result));
  });

  ipcMain.handle(DESKTOP_IPC.collaborationRequest, (event, ...args: unknown[]) => {
    requireTrustedCaller(event, args, 1);
    return desktopAuth!.collaborationRequest(collaborationRequestSchema.parse(args[0])).then(result => collaborationResponseSchema.parse(result));
  });
  ipcMain.handle(DESKTOP_IPC.localBindingRequest, (event, ...args: unknown[]) => {
    requireTrustedCaller(event, args, 1);
    return localBindings.request(localBindingRequestSchema.parse(args[0])).then(result => localBindingResponseSchema.parse(result));
  });

  ipcMain.handle(DESKTOP_IPC.getInfo, (event, ...args: unknown[]) => {
    requireTrustedCaller(event, args);
    return desktopInfo();
  });
  for (const [channel, operation] of [
    [DESKTOP_IPC.authGetState, () => desktopAuth!.getState()],
    [DESKTOP_IPC.authSignIn, () => desktopAuth!.signIn()],
    [DESKTOP_IPC.authCancelSignIn, () => desktopAuth!.cancelSignIn()],
    [DESKTOP_IPC.authSignOut, () => desktopAuth!.signOut()],
  ] as const) {
    ipcMain.handle(channel, (event, ...args: unknown[]) => {
      requireTrustedCaller(event, args);
      return operation();
    });
  }

  async function createWindow() {
    const window = new BrowserWindow({
      width: 1586,
      height: 992,
      useContentSize: true,
      minWidth: 900,
      minHeight: 620,
      title: 'Nexus AI',
      backgroundColor: '#070a12',
      icon: path.join(app.getAppPath(), 'resources/icon.png'),
      show: false,
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(bundleDirectory, 'preload.cjs'),
        session: desktopSession,
        nodeIntegration: false,
        nodeIntegrationInWorker: false,
        nodeIntegrationInSubFrames: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        webviewTag: false,
        spellcheck: false,
        backgroundThrottling: !shellVerification,
      },
    });
    mainWindow = window;
    window.setMenuBarVisibility(false);
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event) => event.preventDefault());
    window.webContents.on('will-frame-navigate', (event) => event.preventDefault());
    window.webContents.on('will-redirect', (event) => event.preventDefault());
    window.webContents.on('will-attach-webview', (event) => event.preventDefault());
    window.on('closed', () => { if (mainWindow === window) mainWindow = undefined; });
    window.once('ready-to-show', () => { if (!hiddenVerification) window.show(); });
    await window.loadURL(devUrl ?? APP_URL);

    if (shellVerification) {
      await verifyShell(window, path.resolve(app.getAppPath(), '../../.nexus/visual/t02'));
      app.exit(0);
      return;
    }

    if (smokeTest) {
      const result: unknown = await window.webContents.executeJavaScript(`(async () => {
        const mounted = await new Promise((resolve) => {
          if (document.getElementById('root')?.childElementCount) return resolve(true);
          const timer = setTimeout(() => { observer.disconnect(); resolve(false); }, 5000);
          const observer = new MutationObserver(() => {
            if (document.getElementById('root')?.childElementCount) {
              clearTimeout(timer); observer.disconnect(); resolve(true);
            }
          });
          observer.observe(document.documentElement, { childList: true, subtree: true });
        });
        return {
        info: await window.nexusDesktop.getInfo(),
        bridgeKeys: Object.keys(window.nexusDesktop),
        authKeys: Object.keys(window.nexusDesktop.auth),
        authState: await window.nexusDesktop.auth.getState(),
        collaborationKeys: Object.keys(window.nexusDesktop.collaboration),
        localBindingKeys: Object.keys(window.nexusDesktop.localBinding),
        codexKeys: Object.keys(window.nexusDesktop.codex),
        codexState: await window.nexusDesktop.codex.request({operation:'getState'}),
        contextState: await window.nexusDesktop.context.request({operation:'get',projectId:'d309dd11-6d7e-4bc1-bd49-292bc50c2f74',repositoryId:'02f71f6e-69b1-49b7-b6d8-df89167070b9'}),
        sessionsState: await window.nexusDesktop.sessions.request({operation:'list',projectId:'d309dd11-6d7e-4bc1-bd49-292bc50c2f74'}),
        contextKeys: Object.keys(window.nexusDesktop.context), sessionsKeys: Object.keys(window.nexusDesktop.sessions),
        workspaceKeys: Object.keys(window.nexusDesktop.workspace),
        workspaceState: await window.nexusDesktop.workspace.request({operation:'getChanges',projectId:'d309dd11-6d7e-4bc1-bd49-292bc50c2f74',repositoryId:'02f71f6e-69b1-49b7-b6d8-df89167070b9'}),
        collaborationState: await window.nexusDesktop.collaboration.request({operation:'listWorkspaces'}),
        localBindingState: await window.nexusDesktop.localBinding.request({operation:'get',projectId:'d309dd11-6d7e-4bc1-bd49-292bc50c2f74',repositoryId:'02f71f6e-69b1-49b7-b6d8-df89167070b9'}),
        invalidRequestsDenied: await Promise.all([
          window.nexusDesktop.collaboration.request({operation:'listWorkspaces',url:'https://invalid.example'}),
          window.nexusDesktop.localBinding.request({operation:'select',projectId:'d309dd11-6d7e-4bc1-bd49-292bc50c2f74',repositoryId:'02f71f6e-69b1-49b7-b6d8-df89167070b9',rootPath:'/arbitrary'}),
          window.nexusDesktop.codex.request({operation:'connect',executable:'/arbitrary'}),
          window.nexusDesktop.context.request({operation:'get',projectId:'d309dd11-6d7e-4bc1-bd49-292bc50c2f74',repositoryId:'02f71f6e-69b1-49b7-b6d8-df89167070b9',path:'/arbitrary'}),
          window.nexusDesktop.sessions.request({operation:'list',projectId:'d309dd11-6d7e-4bc1-bd49-292bc50c2f74',cookie:'arbitrary'}),
          window.nexusDesktop.workspace.request({operation:'openEditor',projectId:'d309dd11-6d7e-4bc1-bd49-292bc50c2f74',repositoryId:'02f71f6e-69b1-49b7-b6d8-df89167070b9',fileId:null,path:'/arbitrary'}),
          window.nexusDesktop.codex.request({operation:'resolveApproval',projectId:'d309dd11-6d7e-4bc1-bd49-292bc50c2f74',repositoryId:'02f71f6e-69b1-49b7-b6d8-df89167070b9',approvalId:'b6981157-a6fb-4947-a392-8ed54b0d7d57',decision:'acceptForSession'}),
        ].map(promise=>promise.then(()=>false,()=>true))),
        requireType: typeof window.require,
        processType: typeof window.process,
        mounted,
        csp: Boolean(document.querySelector('meta[http-equiv="Content-Security-Policy"]'))
      }; })()`);
      if (typeof result !== 'object' || result === null) throw new Error('Smoke test returned no result.');
      const check = result as Record<string, unknown>;
      const info = desktopInfoSchema.parse(check['info']);
      nexusAuthStateSchema.parse(check['authState']);
      const collaborationState = collaborationResponseSchema.parse(check['collaborationState']);
      const localBindingState = localBindingResponseSchema.parse(check['localBindingState']);
      const codexState = codexResponseSchema.parse(check['codexState']);
      const contextState = contextResponseSchema.parse(check['contextState']);
      const sessionsState = sessionsResponseSchema.parse(check['sessionsState']);
      const workspaceState = workspaceResponseSchema.parse(check['workspaceState']);
      if (check['requireType'] !== 'undefined' || check['processType'] !== 'undefined' ||
          !check['mounted'] || !check['csp'] || JSON.stringify(check['bridgeKeys']) !== '["getInfo","collaboration","localBinding","context","sessions","workspace","codex","auth"]' ||
          JSON.stringify(check['collaborationKeys']) !== '["request"]' || JSON.stringify(check['localBindingKeys']) !== '["request"]' ||
          JSON.stringify(check['invalidRequestsDenied']) !== '[true,true,true,true,true,true,true]' || collaborationState.ok || collaborationState.code !== 'auth_required' ||
          JSON.stringify(check['contextKeys']) !== '["request"]' || JSON.stringify(check['sessionsKeys']) !== '["request"]' ||
          contextState.ok || contextState.code !== 'auth_required' || sessionsState.ok || sessionsState.code !== 'auth_required' ||
          JSON.stringify(check['workspaceKeys']) !== '["request"]' || workspaceState.ok || workspaceState.code !== 'auth_required' ||
          localBindingState.ok || localBindingState.code !== 'auth_required' ||
          JSON.stringify(check['codexKeys']) !== '["request","onStateChanged"]' || codexState.ok || codexState.code !== 'auth_required' || codexState.state.runtime !== 'stopped' ||
          JSON.stringify(check['authKeys']) !== '["getState","signIn","cancelSignIn","signOut","onStateChanged"]' ||
          !info.capabilities.canRunLocalSession || !info.capabilities.canOpenLocalEditor) {
        throw new Error('Renderer isolation, CSP, capability or mount check failed.');
      }
      console.log(`Nexus desktop smoke passed: ${info.platform}/${info.architecture}; renderer mounted; IPC validated; Node unavailable.`);
      app.exit(0);
    }
  }

  await createWindow();
  if (!hiddenVerification) void desktopAuth.getState();
  app.on('activate', () => {
    if (!mainWindow) void createWindow().catch(fail);
  });
}

function fail(error: unknown) {
  console.error('Nexus desktop failed:', error instanceof Error ? error.message : 'Unknown error');
  if (!hiddenVerification) dialog.showErrorBox('Impossibile avviare Nexus AI', 'La base desktop non è disponibile. Esegui la build dalla root del progetto e riprova. Consulta il terminale per il dettaglio.');
  app.exit(1);
}

if (hiddenVerification) {
  setTimeout(() => fail(new Error('Desktop verification timed out.')), shellVerification || authVerification ? 60_000 : 20_000).unref();
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
let runtimeShutdown = false;
app.on('before-quit', (event) => {
  desktopAuth?.dispose();
  if (desktopCodex && !runtimeShutdown) {
    event.preventDefault();
    runtimeShutdown = true;
    void desktopCodex.dispose().finally(() => app.quit());
  }
});

if (primaryInstance) void app.whenReady().then(initialize).catch(fail);

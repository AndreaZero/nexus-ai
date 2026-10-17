import { contextBridge, ipcRenderer } from 'electron';
import { DESKTOP_IPC, collaborationRequestSchema, collaborationResponseSchema, desktopInfoSchema, localBindingRequestSchema, localBindingResponseSchema, nexusAuthStateSchema, codexRequestSchema, codexResponseSchema, codexStateSchema } from '@nexus-ai/contracts';
import type { CollaborationRequest, DesktopBridge, LocalBindingRequest, NexusAuthState, CodexRequest, CodexState } from '@nexus-ai/contracts';
import { contextRequestSchema, contextResponseSchema, sessionsRequestSchema, sessionsResponseSchema, type ContextRequest, type SessionsRequest } from '@nexus-ai/contracts';

const bridge: DesktopBridge = Object.freeze({
  async getInfo() {
    return desktopInfoSchema.parse(await ipcRenderer.invoke(DESKTOP_IPC.getInfo));
  },
  collaboration: Object.freeze({
    async request(input: CollaborationRequest) {
      return collaborationResponseSchema.parse(await ipcRenderer.invoke(DESKTOP_IPC.collaborationRequest, collaborationRequestSchema.parse(input)));
    },
  }),
  localBinding: Object.freeze({
    async request(input: LocalBindingRequest) {
      return localBindingResponseSchema.parse(await ipcRenderer.invoke(DESKTOP_IPC.localBindingRequest, localBindingRequestSchema.parse(input)));
    },
  }),
  context: Object.freeze({
    async request(input: ContextRequest) {
      return contextResponseSchema.parse(await ipcRenderer.invoke(DESKTOP_IPC.contextRequest, contextRequestSchema.parse(input)));
    },
  }),
  sessions: Object.freeze({
    async request(input: SessionsRequest) {
      return sessionsResponseSchema.parse(await ipcRenderer.invoke(DESKTOP_IPC.sessionsRequest, sessionsRequestSchema.parse(input)));
    },
  }),
  codex: Object.freeze({
    async request(input: CodexRequest) {
      return codexResponseSchema.parse(await ipcRenderer.invoke(DESKTOP_IPC.codexRequest, codexRequestSchema.parse(input)));
    },
    onStateChanged(callback: (state: CodexState) => void) {
      if (typeof callback !== 'function') throw new TypeError('A Codex state listener is required.');
      const listener = (_event: Electron.IpcRendererEvent, value: unknown) => {
        const result = codexStateSchema.safeParse(value);
        if (result.success) callback(result.data);
      };
      ipcRenderer.on(DESKTOP_IPC.codexStateChanged, listener);
      return () => { ipcRenderer.removeListener(DESKTOP_IPC.codexStateChanged, listener); };
    },
  }),
  auth: Object.freeze({
    async getState() {
      return nexusAuthStateSchema.parse(await ipcRenderer.invoke(DESKTOP_IPC.authGetState));
    },
    async signIn() {
      return nexusAuthStateSchema.parse(await ipcRenderer.invoke(DESKTOP_IPC.authSignIn));
    },
    async cancelSignIn() {
      return nexusAuthStateSchema.parse(await ipcRenderer.invoke(DESKTOP_IPC.authCancelSignIn));
    },
    async signOut() {
      return nexusAuthStateSchema.parse(await ipcRenderer.invoke(DESKTOP_IPC.authSignOut));
    },
    onStateChanged(callback: (state: NexusAuthState) => void) {
      if (typeof callback !== 'function') throw new TypeError('An account state listener is required.');
      const listener = (_event: Electron.IpcRendererEvent, value: unknown) => {
        const result = nexusAuthStateSchema.safeParse(value);
        if (result.success) callback(result.data);
      };
      ipcRenderer.on(DESKTOP_IPC.authStateChanged, listener);
      return () => { ipcRenderer.removeListener(DESKTOP_IPC.authStateChanged, listener); };
    },
  }),
});

contextBridge.exposeInMainWorld('nexusDesktop', bridge);

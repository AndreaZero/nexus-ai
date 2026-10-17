import { contextBridge, ipcRenderer } from 'electron';
import { DESKTOP_IPC, collaborationRequestSchema, collaborationResponseSchema, desktopInfoSchema, localBindingRequestSchema, localBindingResponseSchema, nexusAuthStateSchema } from '@nexus-ai/contracts';
import type { CollaborationRequest, DesktopBridge, LocalBindingRequest, NexusAuthState } from '@nexus-ai/contracts';

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

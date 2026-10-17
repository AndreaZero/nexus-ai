import { contextBridge, ipcRenderer } from 'electron';
import { DESKTOP_IPC, desktopInfoSchema } from '@nexus-ai/contracts';
import type { DesktopBridge } from '@nexus-ai/contracts';

const bridge: DesktopBridge = Object.freeze({
  async getInfo() {
    return desktopInfoSchema.parse(await ipcRenderer.invoke(DESKTOP_IPC.getInfo));
  },
});

contextBridge.exposeInMainWorld('nexusDesktop', bridge);

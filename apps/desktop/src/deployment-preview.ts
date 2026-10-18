import {BrowserWindow,session} from 'electron';
import {randomUUID} from 'node:crypto';
import {deploymentUrlSchema} from '@nexus-ai/contracts';
const windows=new Set<BrowserWindow>();
export function closeDeploymentPreviews(){for(const window of windows)if(!window.isDestroyed())window.close();}
/** External project pages have a fresh ephemeral session and never receive Nexus preload/cookies. */
export async function openDeploymentPreview(value:string):Promise<void>{
 const url=deploymentUrlSchema.parse(value);const origin=new URL(url).origin;
 const partition=`nexus-preview-${randomUUID()}`;const isolated=session.fromPartition(partition,{cache:false});
 isolated.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));isolated.setPermissionCheckHandler(()=>false);
 const preview=new BrowserWindow({width:1280,height:820,show:false,title:'Nexus AI · Project preview',autoHideMenuBar:true,webPreferences:{partition,sandbox:true,contextIsolation:true,nodeIntegration:false,nodeIntegrationInSubFrames:false,webSecurity:true,devTools:false,navigateOnDragDrop:false,safeDialogs:true}});
 windows.add(preview);preview.on('closed',()=>{windows.delete(preview);void isolated.clearStorageData().catch(()=>undefined);});
 const allowed=(target:string)=>{const parsed=deploymentUrlSchema.safeParse(target);return parsed.success&&new URL(parsed.data).origin===origin;};
 preview.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 preview.webContents.on('will-navigate',(event,target)=>{if(!allowed(target))event.preventDefault();});
 preview.webContents.on('will-redirect',(event,target)=>{if(!allowed(target))event.preventDefault();});
 preview.webContents.on('will-attach-webview',event=>event.preventDefault());
 try{await preview.loadURL(url);if(!preview.isDestroyed())preview.show();}catch{if(!preview.isDestroyed())preview.close();throw new Error('Project preview could not be opened. Check its URL and connection.');}
}

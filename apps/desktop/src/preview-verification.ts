import {app,BrowserWindow,session} from 'electron';
import {createServer} from 'node:http';
import assert from 'node:assert/strict';
import {openDeploymentPreview,closeDeploymentPreviews} from './deployment-preview.ts';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
const directory=path.join(process.argv[2]!,'profile');mkdirSync(directory,{recursive:true});app.setPath('userData',directory);
app.commandLine.appendSwitch('no-proxy-server');
const server=createServer((_request,response)=>{assert.equal(_request.headers.cookie?.includes('controlled-nexus-session')??false,false);response.setHeader('Content-Type','text/html');response.end('<!doctype html><title>Isolated preview QA</title><p>Local project fixture</p>');});
async function verify(){try{
 await app.whenReady();console.log('Preview QA ready.');await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();if(!address||typeof address==='string')throw new Error('Fixture listener unavailable');const base=`http://127.0.0.1:${address.port}`;
 await session.defaultSession.cookies.set({url:base,name:'nexus-qa',value:'controlled-nexus-session'});
 app.on('browser-window-created',(_event,window)=>{window.on('show',()=>window.hide());});
 console.log('Preview QA opening local fixture.');await openDeploymentPreview(base);const preview=BrowserWindow.getAllWindows()[0];assert.ok(preview);
 const result=await preview.webContents.executeJavaScript('({node:typeof window.require,process:typeof window.process,bridge:typeof window.nexusDesktop,origin:location.origin})');assert.deepEqual(result,{node:'undefined',process:'undefined',bridge:'undefined',origin:base});
 assert.deepEqual(await preview.webContents.session.cookies.get({url:base}),[]);assert.equal(preview.webContents.session.isPersistent(),false);
 await preview.webContents.executeJavaScript("window.open('https://example.invalid')");assert.equal(BrowserWindow.getAllWindows().length,1);
 await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Preview close event timed out')),5000);preview.once('closed',()=>{clearTimeout(timer);resolve();});closeDeploymentPreviews();});assert.equal(BrowserWindow.getAllWindows().length,0);console.log('Preview isolation passed: real Electron, no Node/preload/Nexus cookies, ephemeral partition, popup denied, close on account loss.');
 await new Promise<void>(resolve=>server.close(()=>resolve()));app.exit(0);
}catch(error){closeDeploymentPreviews();server.close();console.error('Preview isolation failed:',error instanceof Error?error.message:'Unknown QA error');app.exit(1);}}
void verify();

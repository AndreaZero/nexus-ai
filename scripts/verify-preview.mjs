import {mkdtemp,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import os from 'node:os';
const root=fileURLToPath(new URL('../',import.meta.url));const requireDesktop=createRequire(path.join(root,'apps/desktop/package.json'));const {build}=requireDesktop('esbuild');const electron=requireDesktop('electron');
const directory=await mkdtemp(path.join(os.tmpdir(),'nexus-preview-runner-'));
try{const main=path.join(directory,'verify.mjs');await build({bundle:true,platform:'node',target:'node22',format:'esm',external:['electron'],entryPoints:[path.join(root,'apps/desktop/src/preview-verification.ts')],outfile:main,logLevel:'silent'});
 const code=await new Promise((resolve,reject)=>{const child=spawn(electron,[main,directory],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe'],env:Object.fromEntries(Object.entries(process.env).filter(([key])=>key!=='ELECTRON_RUN_AS_NODE'))});for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>process.stdout.write(chunk));const timer=setTimeout(()=>{console.error('Preview QA exceeded20s deadline.');child.kill();},20000);child.once('error',reject);child.once('close',code=>{clearTimeout(timer);resolve(code);});});if(code!==0)process.exitCode=1;
}finally{if(path.dirname(directory)===os.tmpdir()&&path.basename(directory).startsWith('nexus-preview-runner-'))await rm(directory,{recursive:true,force:true});}

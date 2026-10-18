import {createHash,randomUUID} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {writeFile,rename,rm} from 'node:fs/promises';
import path from 'node:path';
import {connectionSettingsSchema,desktopPreferencesRequestSchema,type DesktopPreferencesResponse,type NexusAuthState} from '@nexus-ai/contracts';
import {publicServiceUrl} from './auth-config.ts';

export type ConnectionSettings={serverUrl:string;webUrl:string};
function connection(value:unknown):ConnectionSettings {
 const parsed=connectionSettingsSchema.parse(value);
 return {serverUrl:publicServiceUrl(parsed.serverUrl),webUrl:publicServiceUrl(parsed.webUrl)};
}
const equal=(a:ConnectionSettings,b:ConnectionSettings)=>a.serverUrl===b.serverUrl&&a.webUrl===b.webUrl;

/** Device-wide endpoint choices contain no credentials. Each authority has its own encrypted profile. */
export class DesktopPreferences {
 readonly active:ConnectionSettings;
 readonly profileDirectory:string;
 private readonly defaults:ConnectionSettings;
 private readonly file:string;
 private pending:ConnectionSettings|null=null;
 private writes:Promise<unknown>=Promise.resolve();
 private readonly authState:()=>Promise<NexusAuthState>;
 private readonly restart:()=>void;
 constructor(baseDirectory:string,defaults:ConnectionSettings,authState:()=>Promise<NexusAuthState>,restart:()=>void) {
  this.authState=authState;this.restart=restart;
  this.defaults=connection(defaults);
  this.file=path.join(baseDirectory,'connection-settings.json');
  let saved:ConnectionSettings|null=null;
  try {saved=connection(JSON.parse(readFileSync(this.file,'utf8')));} catch(error) {
   if((error as NodeJS.ErrnoException).code!=='ENOENT')throw new Error('Saved connection settings are invalid. Restore connection-settings.json to continue.',{cause:error});
  }
  this.active=Object.freeze(saved??this.defaults);
  mkdirSync(baseDirectory,{recursive:true});
  const marker=path.join(baseDirectory,'profile-authority.json');
  let legacyAuthority:string;
  try{legacyAuthority=publicServiceUrl(JSON.parse(readFileSync(marker,'utf8')).serverUrl);}catch(error){
   if((error as NodeJS.ErrnoException).code!=='ENOENT')throw new Error('Saved profile authority is invalid. Restore profile-authority.json to continue.',{cause:error});
   legacyAuthority=this.defaults.serverUrl;
   writeFileSync(marker,JSON.stringify({serverUrl:legacyAuthority})+'\n',{encoding:'utf8',mode:0o600,flag:'wx'});
  }
  this.profileDirectory=this.active.serverUrl===legacyAuthority?baseDirectory:path.join(baseDirectory,'profiles',createHash('sha256').update(this.active.serverUrl).digest('hex'));
  mkdirSync(this.profileDirectory,{recursive:true});
 }
 private response():DesktopPreferencesResponse {
  return{ok:true,preferences:{active:{...this.active},pending:this.pending?{...this.pending}:null,restartRequired:this.pending!==null}};
 }
 request(input:unknown):Promise<DesktopPreferencesResponse> {
  const operation=this.writes.then(()=>this.execute(input));this.writes=operation.catch(()=>undefined);return operation;
 }
 private async execute(input:unknown):Promise<DesktopPreferencesResponse> {
  const parsed=desktopPreferencesRequestSchema.safeParse(input);
  if(!parsed.success)return{ok:false,code:'invalid_request',message:'Invalid device settings request.'};
  if(parsed.data.operation==='read')return this.response();
  let next:ConnectionSettings;
  try{next=parsed.data.operation==='saveConnection'?connection(parsed.data.connection):this.defaults;}catch{return{ok:false,code:'invalid_request',message:'Use an HTTPS origin or exact HTTP loopback origin, without credentials, paths or parameters.'};}
  // Fresh server-backed auth check; unavailable/signing-in states do not permit a server switch.
  let state:NexusAuthState;
  try{state=await this.authState();}catch{return{ok:false,code:'unavailable',message:'Account status unavailable. Sign out before changing the connection.'};}
  if(state.status!=='signed_out')return{ok:false,code:'forbidden',message:'Sign out of Nexus before changing or restarting the account connection.'};
  if(parsed.data.operation==='restart') {
   if(!this.pending)return this.response();
   this.restart();return this.response();
  }
  const temporary=`${this.file}.${randomUUID()}.tmp`;
  try{
   await writeFile(temporary,JSON.stringify(next)+'\n',{encoding:'utf8',mode:0o600,flag:'wx'});
   // Recheck after the disk operation in case browser sign-in completed while writing.
   if((await this.authState()).status!=='signed_out')return{ok:false,code:'forbidden',message:'Your account changed. Sign out and retry the connection change.'};
   await rename(temporary,this.file);
   this.pending=equal(next,this.active)?null:next;
   return this.response();
  }catch{return{ok:false,code:'unavailable',message:'Connection settings could not be saved. Check local storage and retry.'};}
  finally{await rm(temporary,{force:true}).catch(()=>undefined);}
 }
}

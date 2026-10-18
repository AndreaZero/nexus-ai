import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type {NexusAuthState} from '@nexus-ai/contracts';
import {DesktopPreferences} from '../src/preferences.ts';
import {publicServiceUrl} from '../src/auth-config.ts';
import {requestApplication} from '../src/application-transport.ts';

const defaults={serverUrl:'http://127.0.0.1:3001',webUrl:'http://127.0.0.1:3001'};
const out:NexusAuthState={status:'signed_out',user:null,expiresAt:null,persistent:false,message:null};
async function fixture(run:(directory:string)=>Promise<void>){const directory=await mkdtemp(path.join(os.tmpdir(),'nexus-preferences-'));try{await run(directory);}finally{assert.equal(path.dirname(directory),path.resolve(os.tmpdir()));assert.ok(path.basename(directory).startsWith('nexus-preferences-'));await rm(directory,{recursive:true,force:true});}}

test('connection origins reject raw URL normalization tricks and secret-bearing paths',()=>{
 for(const value of ['http://127.1','http://2130706433','http://0177.0.0.1','http://%31%32%37.0.0.1','http://localhost','http://127.0.0.1:0','http://127.0.0.1:65536','https://host.test/path','https://host.test/../','https://u:p@host.test','https://host.test?token=x','https://host.test/#x','https://ho\nst.test','https://host.test\\evil',' https://host.test'])assert.throws(()=>publicServiceUrl(value),value);
 assert.equal(publicServiceUrl('https://Host.test:443/'),'https://host.test');assert.equal(publicServiceUrl('http://[::1]:3001/'),'http://[::1]:3001');
});

test('saved endpoint is pending until explicit restart and reload uses a distinct stable authority profile',async()=>fixture(async directory=>{
 let restarted=0;const prefs=new DesktopPreferences(directory,defaults,async()=>out,()=>{restarted++;});assert.equal(prefs.profileDirectory,directory);
 const changed={serverUrl:'https://nexus.example.test/',webUrl:'https://portal.example.test/'};
 const result=await prefs.request({operation:'saveConnection',connection:changed});assert.ok(result.ok);if(!result.ok)return;assert.equal(result.preferences.active.serverUrl,defaults.serverUrl);assert.equal(result.preferences.pending?.serverUrl,'https://nexus.example.test');assert.equal(restarted,0);
 await prefs.request({operation:'restart'});assert.equal(restarted,1);
 const reloaded=new DesktopPreferences(directory,defaults,async()=>out,()=>undefined);assert.notEqual(reloaded.profileDirectory,directory);assert.equal(path.dirname(reloaded.profileDirectory),path.join(directory,'profiles'));assert.equal(reloaded.active.webUrl,'https://portal.example.test');
 const again=new DesktopPreferences(directory,defaults,async()=>out,()=>undefined);assert.equal(again.profileDirectory,reloaded.profileDirectory);
 const reset=await reloaded.request({operation:'resetConnection'});assert.ok(reset.ok);const legacy=new DesktopPreferences(directory,defaults,async()=>out,()=>undefined);assert.equal(legacy.profileDirectory,directory);assert.deepEqual(legacy.active,defaults);
 assert.deepEqual(JSON.parse(await readFile(path.join(directory,'connection-settings.json'),'utf8')),defaults);
}));

test('changing compiled defaults never reuses the legacy account and Codex profile for another server',async()=>fixture(async directory=>{
 new DesktopPreferences(directory,defaults,async()=>out,()=>undefined);
 const replacement={serverUrl:'https://another.example.test',webUrl:'https://another.example.test'};
 const other=new DesktopPreferences(directory,replacement,async()=>out,()=>undefined);assert.notEqual(other.profileDirectory,directory);assert.deepEqual(other.active,replacement);
}));

test('signed-in, pending and unavailable auth cannot change endpoint or restart',async()=>fixture(async directory=>{
 let state:NexusAuthState=out;let restarted=0;const prefs=new DesktopPreferences(directory,defaults,async()=>state,()=>{restarted++;});
 await prefs.request({operation:'saveConnection',connection:{serverUrl:'https://a.example.test',webUrl:'https://a.example.test'}});
 const persisted=await readFile(path.join(directory,'connection-settings.json'),'utf8');
 for(const status of ['signed_in','signing_in','unavailable'] as const){state={...out,status};for(const operation of ['resetConnection','restart'] as const){const result=await prefs.request({operation});assert.ok(!result.ok&&result.code==='forbidden');}}
 assert.equal(restarted,0);assert.equal(await readFile(path.join(directory,'connection-settings.json'),'utf8'),persisted);
}));

test('account change during save leaves the persisted endpoint intact; malformed files fail closed',async()=>fixture(async directory=>{
 let reads=0;const prefs=new DesktopPreferences(directory,defaults,async()=>++reads===1?out:{...out,status:'signing_in'},()=>undefined);
 const result=await prefs.request({operation:'saveConnection',connection:{serverUrl:'https://a.example.test',webUrl:'https://a.example.test'}});assert.ok(!result.ok&&result.code==='forbidden');await assert.rejects(readFile(path.join(directory,'connection-settings.json'),'utf8'));
 await writeFile(path.join(directory,'connection-settings.json'),'{bad');assert.throws(()=>new DesktopPreferences(directory,defaults,async()=>out,()=>undefined),/invalid/);
}));

test('application transport fixes route/origin, omits ambient credentials and rejects mismatched search',async()=>{
 let calls=0;const fetcher:typeof fetch=async(url,init)=>{calls++;assert.equal(String(url),'https://account.example.test/api/application');assert.equal(init?.credentials,'omit');assert.equal(init?.redirect,'error');assert.equal((init?.headers as Record<string,string>)['Cookie'],'controlled-cookie');assert.equal((init?.headers as Record<string,string>)['Origin'],'io.github.andreazero.nexusai:/');return Response.json({ok:true,kind:'search',query:'different',items:[],nextOffset:null,observedAt:new Date().toISOString()});};
 const result=await requestApplication('https://account.example.test','controlled-cookie',{operation:'search',query:'query',projectId:null,kind:null,offset:0,limit:30},fetcher);assert.ok(!result.ok&&result.code==='unavailable');assert.equal(calls,1);
 const noAuth=await requestApplication('https://account.example.test','',{operation:'getSettings'},fetcher);assert.ok(!noAuth.ok&&noAuth.code==='auth_required');assert.equal(calls,1);
});

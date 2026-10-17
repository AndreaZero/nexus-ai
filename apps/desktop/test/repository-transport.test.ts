import assert from 'node:assert/strict';
import test from 'node:test';
import { requestGitCredential,requestRepositories } from '../src/repository-transport.ts';
import { AUTH_SCHEME } from '../src/auth-config.ts';
const scope={projectId:'00000000-0000-4000-8000-000000000001',repositoryId:'00000000-0000-4000-8000-000000000002'};
const input={operation:'snapshot' as const,...scope,page:1};
const snapshot={...scope,remoteUrl:'https://github.com/nexus/qa',connected:true,login:'qa-user',private:true,commits:[],pulls:[],observedAt:null,webhookConfigured:false,page:1,hasMore:false};

test('repository transport binds fixed endpoint, account cookie, Origin, response scope and page',async()=>{
  let calls=0;
  const fetcher=async(url:unknown,options?:RequestInit)=>{
    calls++;assert.equal(String(url),'http://127.0.0.1:3001/api/repositories');assert.equal(options?.redirect,'error');assert.equal(options?.cache,'no-store');
    assert.equal(new Headers(options?.headers).get('origin'),`${AUTH_SCHEME}:/`);assert.equal(new Headers(options?.headers).get('cookie'),'own-cookie');
    return Response.json({ok:true,kind:'snapshot',snapshot});
  };
  assert.equal((await requestRepositories('http://127.0.0.1:3001','own-cookie',input,fetcher as typeof fetch)).ok,true);
  assert.equal((await requestRepositories('http://127.0.0.1:3001','',input,fetcher as typeof fetch)).ok,false);assert.equal(calls,1);
  for(const patch of [{projectId:scope.repositoryId},{repositoryId:scope.projectId},{page:2}]){
    const mismatch=await requestRepositories('http://127.0.0.1:3001','own-cookie',input,(async()=>Response.json({ok:true,kind:'snapshot',snapshot:{...snapshot,...patch}})) as typeof fetch);assert.equal(mismatch.ok,false);
  }
});

test('repository response credentials, mismatched activity and unsafe JSON sizes never cross bridge boundary',async()=>{
  const fixtures=[{ok:true,kind:'snapshot',snapshot,token:'must-never-cross'}, {ok:true,kind:'activity',id:scope.projectId,activityKind:'commit',url:'https://github.com/nexus/qa/commit/a',sha:'a'.repeat(40),pullNumber:null}];
  for(const fixture of fixtures){const value=await requestRepositories('http://127.0.0.1:3001','cookie',input,(async()=>Response.json(fixture)) as typeof fetch);assert.equal(value.ok,false);assert.equal(JSON.stringify(value).includes('must-never-cross'),false);}
  const large=await requestRepositories('http://127.0.0.1:3001','cookie',input,(async()=>new Response('{}',{headers:{'Content-Length':String(9*1048576)}})) as typeof fetch);assert.equal(large.ok,false);
});

test('main-only credential lease uses a separate fixed endpoint and returns no raw errors',async()=>{
  const token='github_pat_controlled_test_not_real';
  const fetcher=async(url:unknown,options?:RequestInit)=>{
    assert.equal(String(url),'http://127.0.0.1:3001/api/repositories/credential');assert.deepEqual(JSON.parse(String(options?.body)),scope);
    assert.equal(new Headers(options?.headers).get('origin'),`${AUTH_SCHEME}:/`);return Response.json({token,remoteUrl:snapshot.remoteUrl});
  };
  assert.equal((await requestGitCredential('http://127.0.0.1:3001','cookie',scope.projectId,scope.repositoryId,fetcher as typeof fetch))?.token,token);
  assert.equal(await requestGitCredential('http://127.0.0.1:3001','cookie',scope.projectId,scope.repositoryId,(async()=>{throw new Error(token);}) as typeof fetch),null);
});

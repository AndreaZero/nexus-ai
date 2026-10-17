import assert from 'node:assert/strict';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createDatabaseBoundary, readDatabaseConfig } from '../packages/db/dist/index.js';
import { buildServer } from '../apps/server/dist/app.js';
import { readServerConfig } from '../apps/server/dist/config.js';
import { createRepositoriesService } from '../apps/server/dist/repositories.js';
import { DESKTOP_AUTH_ORIGIN } from '../apps/server/dist/auth.js';
import { repositoriesResponseSchema } from '../packages/contracts/dist/index.js';

// Actual local PostgreSQL/HTTP/account/Mailpit + controlled official GitHub API boundary.
// Never uses maintainer credentials and never creates remote PRs or reviews.
const root=fileURLToPath(new URL('../',import.meta.url));
const output=path.join(root,'.nexus/visual/t12');await mkdir(output,{recursive:true});
const env=parseEnv(await readFile(path.join(root,'.env'),'utf8'));
const prefix=`nexus-t12-qa-${randomUUID()}`,users=[],mailIds=new Set(),checks=[];
let database,app,base,workspaceId,stage='configuration';
async function post(route,body,cookie='',origin=base,extra={}){
  return fetch(new URL(route,base),{method:'POST',redirect:'manual',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json',Origin:origin,...(cookie?{Cookie:cookie}:{}),...extra},body:typeof body==='string'?body:JSON.stringify(body)});
}
async function account(label){
  const email=`${prefix}-${label}@nexus.local`,password=randomBytes(32).toString('base64url');users.push({email});
  const signup=await post('/auth/sign-up/email',{name:`T12 QA ${label}`,email,password});assert.equal(signup.status,200);
  const data=await signup.json();let link;
  for(let attempt=0;attempt<4&&!link;attempt++){
    const messages=await(await fetch(`http://127.0.0.1:8025/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)).json();
    const id=messages.messages?.[0]?.ID;
    if(id){mailIds.add(id);const message=await(await fetch(`http://127.0.0.1:8025/api/v1/message/${id}`)).json();link=message.Text?.match(/https?:\/\/[^\s<>"]+/)?.[0];}
    else await new Promise(resolve=>setTimeout(resolve,150));
  }
  assert.ok(link);assert.equal(new URL(link).origin,base);assert.ok([200,302,303].includes((await fetch(link,{redirect:'manual'})).status));
  const login=await post('/auth/sign-in/email',{email,password});assert.equal(login.status,200);
  const value={id:data.user.id,email,cookie:login.headers.getSetCookie().map(row=>row.split(';',1)[0]).join('; ')};users[users.length-1]=value;return value;
}
async function collab(user,request){const value=await(await post('/api/collaboration',request,user.cookie)).json();assert.equal(value.ok,true);return value;}
function success(value,kind){assert.equal(value.ok,true);if(kind)assert.equal(value.kind,kind);return value;}
function denied(value,code){assert.equal(value.ok,false);assert.equal(value.code,code);}
try{
  const target=new URL(env.DATABASE_URL);assert.ok(['127.0.0.1','localhost','[::1]'].includes(target.hostname));assert.equal(target.pathname,'/nexus_ai_dev');assert.equal(env.SMTP_HOST,'127.0.0.1');
  database=createDatabaseBoundary(readDatabaseConfig(env));assert.equal(await database.check(),'connected');
  const {createServer}=await import('node:net');const probe=createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));base=`http://127.0.0.1:${port}`;
  app=await buildServer(readServerConfig({...env,NEXUS_SERVER_PORT:String(port),BETTER_AUTH_URL:base,NEXUS_WEB_URL:base,NEXUS_LOG_LEVEL:'silent'}));await app.listen({host:'127.0.0.1',port});
  const owner=await account('owner'),member=await account('member'),outsider=await account('outsider');
  workspaceId=(await collab(owner,{operation:'createWorkspace',name:prefix})).item.id;
  const projectId=(await collab(owner,{operation:'createProject',workspaceId,name:'T12 isolated GitHub boundary',description:'',defaultVisibility:'team'})).item.id;
  const repositoryId=(await collab(owner,{operation:'setRepository',projectId,remoteUrl:'https://github.com/nexus-qa/controlled',defaultBranch:'main'})).item.id;
  await database.pool.query("INSERT INTO workspace_member(workspace_id,user_id,role) VALUES($1,$2,'member'),($1,$3,'member')",[workspaceId,member.id,outsider.id]);
  await database.pool.query("INSERT INTO project_member(project_id,user_id,role) VALUES($1,$2,'developer')",[projectId,member.id]);
  const scope={projectId,repositoryId},now=new Date().toISOString(),sha='a'.repeat(40),sha2='b'.repeat(40),token=`github_pat_${randomBytes(32).toString('hex')}`,hookSecret=randomBytes(32).toString('base64url');
  let pulls=[],reviews=[],remotePosts=0,failAfterPost=false;
  const pull=()=>({number:7,title:'QA selected change',body:'QA published summary',state:'open',draft:false,merged_at:null,head:{ref:'feature/qa',sha},base:{ref:'main'},user:{login:'qa-owner'},html_url:'https://github.com/nexus-qa/controlled/pull/7',updated_at:now});
  const upstream=async(url,options)=>{
    assert.equal(new URL(url).origin,'https://api.github.com');assert.equal(options.redirect,'error');assert.ok(options.headers.Authorization||options.headers.authorization);
    const pathname=new URL(url).pathname;let result;
    if(options.method==='POST'){
      remotePosts++;const body=JSON.parse(options.body);
      if(pathname.endsWith('/reviews')){result={id:10,user:{login:'qa-owner'},state:body.event==='APPROVE'?'APPROVED':'COMMENTED',body:body.body,commit_id:body.commit_id,submitted_at:now,html_url:'https://github.com/nexus-qa/controlled/pull/7#pullrequestreview-10'};reviews.push(result);}
      else{result={...pull(),body:body.body};pulls.push(result);}
      if(failAfterPost){failAfterPost=false;throw new Error('Controlled transport interruption after upstream accepted write');}
    }else if(pathname==='/user')result={id:8001,login:'qa-owner'};
    else if(pathname==='/repos/nexus-qa/controlled')result={id:7001,private:true,full_name:'nexus-qa/controlled'};
    else if(pathname.endsWith('/commits'))result=[{sha,commit:{message:'QA observed commit',author:{name:'QA Owner',date:now}},author:{login:'qa-owner'},html_url:`https://github.com/nexus-qa/controlled/commit/${sha}`}];
    else if(pathname.endsWith('/reviews'))result=reviews;
    else if(pathname.endsWith('/files'))result=[{filename:'src/qa.ts',status:'modified',additions:1,deletions:1,patch:'@@ -1 +1 @@\n-before\n+after'}];
    else if(/\/pulls\/7$/.test(pathname))result=pulls[0]??pull();
    else if(pathname.endsWith('/pulls'))result=pulls;
    else throw new Error('Unexpected controlled upstream request');
    return new Response(JSON.stringify(result),{status:200,headers:{'Content-Type':'application/json'}});
  };
  const service=createRepositoriesService(database,env.BETTER_AUTH_SECRET,undefined,upstream);
  const execute=(user,fields)=>service.execute({id:user.id,email:user.email},{...scope,...fields});
  stage='connection isolation and HTTP authorization';
  success(await execute(owner,{operation:'connect',token}),'snapshot');
  const cipher=(await database.pool.query('SELECT token_cipher FROM repository_connection WHERE repository_id=$1',[repositoryId])).rows[0].token_cipher;assert.equal(cipher.includes(token),false);
  assert.equal((await execute(member,{operation:'snapshot',page:1})).snapshot.connected,false);
  denied(await execute(outsider,{operation:'snapshot',page:1}),'forbidden');
  assert.equal((await post('/api/repositories/credential',scope,owner.cookie)).status,403);
  const lease=await(await post('/api/repositories/credential',scope,owner.cookie,DESKTOP_AUTH_ORIGIN)).json();assert.equal(lease.token,token);
  assert.equal((await post('/api/repositories',{...scope,operation:'snapshot',page:1,url:'https://invalid.example'},owner.cookie)).status,400);
  assert.equal((await post('/api/repositories',{...scope,operation:'snapshot',page:1},owner.cookie,'https://invalid.example')).status,403);
  checks.push('Actual verified accounts/PG, encrypted token, per-account connection, current roles, strict schema/Origin, desktop-only credential lease');
  stage='sync feeds and audience';
  const sync=success(await execute(owner,{operation:'synchronize',page:1}),'snapshot');assert.equal(sync.snapshot.commits.length,1);assert.equal(JSON.stringify(sync).includes(token),false);
  const snapshot=repositoriesResponseSchema.parse(await(await post('/api/repositories',{...scope,operation:'snapshot',page:1},owner.cookie)).json());success(snapshot,'snapshot');assert.equal(snapshot.snapshot.commits[0].sha,sha);
  const overview=await(await post('/api/overview',{operation:'snapshot',projectId,filter:'commits'},owner.cookie)).json();success(overview,'overview');assert.equal(overview.snapshot.activity.length,1);
  const resolved=success(await execute(owner,{operation:'resolveActivity',id:overview.snapshot.activity[0].target.id}),'activity');assert.equal(resolved.sha,sha);assert.equal(resolved.pullNumber,null);
  const pulse=await(await post('/api/pulse',{operation:'snapshot',projectId},owner.cookie)).json();assert.equal(pulse.snapshot.summary.commits,1);
  await database.pool.query("UPDATE project_member SET role='client' WHERE project_id=$1 AND user_id=$2",[projectId,member.id]);
  denied(await execute(member,{operation:'snapshot',page:1}),'forbidden');
  const clientOverview=await(await post('/api/overview',{operation:'snapshot',projectId,filter:'commits'},member.cookie)).json();assert.deepEqual(clientOverview.snapshot.activity,[]);
  const clientPulse=await(await post('/api/pulse',{operation:'snapshot',projectId},member.cookie)).json();assert.equal(clientPulse.snapshot.summary.commits,null);
  checks.push('Explicit controlled GitHub sync into real PG/HTTP/feed/Pulse, observed commit count, technical-only projection and role downgrade');
  stage='PR receipts review head and uncertain recovery';
  const create={operation:'createPull',requestId:randomUUID(),title:'QA selected change',body:'QA published summary',head:'feature/qa',base:'main',draft:true};
  failAfterPost=true;denied(await execute(owner,create),'uncertain');const recovered=success(await execute(owner,create),'done');assert.ok(recovered.url.endsWith('/pull/7'));assert.equal(remotePosts,1);
  success(await execute(owner,create),'done');assert.equal(remotePosts,1);
  denied(await execute(owner,{...create,title:'Different content'}),'conflict');
  const detail=success(await execute(owner,{operation:'getPull',number:7,page:1}),'pull');assert.equal(detail.files[0].patch.includes('+after'),true);
  denied(await execute(owner,{operation:'review',requestId:randomUUID(),number:7,headSha:sha2,event:'APPROVE',body:'Reviewed old head'}),'conflict');
  const review={operation:'review',requestId:randomUUID(),number:7,headSha:sha,event:'COMMENT',body:'Reviewed this exact commit'};
  success(await execute(owner,review),'done');success(await execute(owner,review),'done');assert.equal(remotePosts,2);
  checks.push('Durable PR receipt before controlled POST, lost-response reconciliation without duplicate, payload conflict, PR patches, exact-head review and replay');
  stage='raw webhook HTTP signature replay and wrong repository';
  success(await execute(owner,{operation:'configureWebhook',secret:hookSecret}),'done');
  const payload=JSON.stringify({repository:{id:7001,full_name:'nexus-qa/controlled'},commits:[{id:sha2,message:'QA webhook observed commit',timestamp:now,author:{username:'qa-owner'}}]});
  const delivery=randomUUID(),signature=`sha256=${createHmac('sha256',hookSecret).update(payload).digest('hex')}`;
  const hook=(body=payload,id=delivery,sig=signature)=>post(`/api/repositories/webhook/${repositoryId}`,body,'',base,{'x-github-event':'push','x-github-delivery':id,'x-hub-signature-256':sig});
  assert.equal((await hook(payload,randomUUID(),'sha256='+'0'.repeat(64))).status,401);
  assert.equal((await hook()).status,200);assert.equal((await hook()).status,200);
  const changed=payload+' ';assert.equal((await hook(changed,delivery,`sha256=${createHmac('sha256',hookSecret).update(changed).digest('hex')}`)).status,409);
  const wrong=JSON.stringify({repository:{id:7002,full_name:'other/repo'},commits:[]});assert.equal((await hook(wrong,randomUUID(),`sha256=${createHmac('sha256',hookSecret).update(wrong).digest('hex')}`)).status,409);
  assert.equal(Number((await database.pool.query('SELECT count(*) FROM repository_delivery WHERE repository_id=$1',[repositoryId])).rows[0].count),1);
  const repeated=JSON.stringify({repository:{id:7001,full_name:'nexus-qa/controlled'},commits:[{id:sha2,message:'QA webhook commit title corrected',timestamp:now,author:{username:'qa-owner'}}]});
  assert.equal((await hook(repeated,randomUUID(),`sha256=${createHmac('sha256',hookSecret).update(repeated).digest('hex')}`)).status,200);
  const coalesced=await(await post('/api/overview',{operation:'snapshot',projectId,filter:'commits'},owner.cookie)).json();assert.equal(coalesced.snapshot.activity.length,2);assert.equal(new Set(coalesced.snapshot.activity.map(item=>item.target.id)).size,2);
  const rawRows=JSON.stringify((await database.pool.query('SELECT title,url,sha FROM repository_activity WHERE repository_id=$1',[repositoryId])).rows);assert.equal(rawRows.includes(token),false);assert.equal(rawRows.includes('QA webhook commit title corrected'),true);
  checks.push('Actual HTTP raw-body HMAC verification, invalid signature denied, delivery replay exactly once, changed payload/wrong GitHub ID denied');
  stage='disconnect revocation and repository replacement';
  success(await execute(owner,{operation:'disconnect'}),'snapshot');assert.equal(await service.credential(owner,projectId,repositoryId),null);
  await collab(owner,{operation:'setRepository',projectId,remoteUrl:'https://github.com/nexus-qa/replaced',defaultBranch:'main'});
  assert.equal(Number((await database.pool.query('SELECT count(*) FROM repository_activity WHERE repository_id=$1',[repositoryId])).rows[0].count),0);
  assert.equal((await hook()).status,404);
  const after=await(await post('/api/overview',{operation:'snapshot',projectId,filter:'commits'},owner.cookie)).json();assert.deepEqual(after.snapshot.activity,[]);
  checks.push('Disconnect removes own lease; URL replacement atomically removes credentials/cache/webhook/receipts/activity and old feed targets');
  await writeFile(path.join(output,'repositories-report.json'),JSON.stringify({passed:true,checks,completedAt:new Date().toISOString(),transport:'actual PostgreSQL/Mailpit/HTTP; controlled GitHub API responses and write interruption',remoteMutations:false},null,2));
  console.log(`Repository verification passed: ${checks.length} PG/HTTP scenarios; controlled GitHub writes, no personal credentials.`);
}catch(error){
  const location=error?.stack?.split('\n').find(line=>line.includes('verify-repositories.mjs:'))?.trim();
  console.error(`Repository verification failed at ${stage}.${location?' '+location:''} No private values printed.`);
  await writeFile(path.join(output,'repositories-report.json'),JSON.stringify({passed:false,stage,location,checks},null,2));process.exitCode=1;
}finally{
  await app?.close();
  if(database?.pool){if(workspaceId)await database.pool.query('DELETE FROM workspace WHERE id=$1 AND name=$2',[workspaceId,prefix]);for(const user of users){await database.pool.query('DELETE FROM "user" WHERE email=$1',[user.email]);await database.pool.query('DELETE FROM verification WHERE identifier=$1',[user.email]);}}
  await database?.close();
  if(mailIds.size)await fetch('http://127.0.0.1:8025/api/v1/messages',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({IDs:[...mailIds]}),signal:AbortSignal.timeout(3000)}).catch(()=>{});
}

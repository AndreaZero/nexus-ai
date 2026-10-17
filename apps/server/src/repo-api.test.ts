import assert from 'node:assert/strict';
import test from 'node:test';
import { buildServer } from './app.js';
import { readServerConfig } from './config.js';
import { DESKTOP_AUTH_ORIGIN } from './auth.js';
const scope={projectId:'00000000-0000-4000-8000-000000000001',repositoryId:'00000000-0000-4000-8000-000000000002'};
test('repository API rejects browser credential leases, arbitrary fields and missing current account',async context=>{
  const lines:string[]=[];const app=await buildServer(readServerConfig({NEXUS_LOG_LEVEL:'debug'}),line=>lines.push(line));context.after(()=>app.close());
  for(const origin of ['http://127.0.0.1:3001','https://invalid.example']){
    const response=await app.inject({method:'POST',url:'/api/repositories/credential',headers:{origin},payload:scope});assert.equal(response.statusCode,403);assert.equal(response.headers['cache-control'],'no-store');
  }
  const arbitrary=await app.inject({method:'POST',url:'/api/repositories',headers:{origin:DESKTOP_AUTH_ORIGIN},payload:{operation:'connect',...scope,token:'github_pat_private_input_never_log',url:'https://invalid.example'}});assert.equal(arbitrary.statusCode,400);
  const unavailable=await app.inject({method:'POST',url:'/api/repositories',headers:{origin:DESKTOP_AUTH_ORIGIN},payload:{operation:'snapshot',...scope,page:1}});assert.equal(unavailable.statusCode,503);
  assert.equal(lines.join('').includes('github_pat_private_input_never_log'),false);assert.match(lines.join(''),/\/api\/repositories/);
});

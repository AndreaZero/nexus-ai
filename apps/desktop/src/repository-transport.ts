import { z } from 'zod';
import { repositoriesRequestSchema, repositoriesResponseSchema, type RepositoriesRequest, type RepositoriesResponse } from '@nexus-ai/contracts';
import { AUTH_SCHEME, publicServiceUrl } from './auth-config.ts';
import { readBoundedJson } from './overview-transport.ts';

/** Fixed account endpoint. Tokens are write-only renderer input; no response contains credentials. */
export async function requestRepositories(server: string, cookie: string, input: RepositoriesRequest, fetcher: typeof fetch = fetch): Promise<RepositoriesResponse> {
  const parsed = repositoriesRequestSchema.safeParse(input);
  if (!parsed.success) return { ok:false,code:'invalid_request',message:'Invalid repository request.' };
  if (!cookie) return { ok:false,code:'auth_required',message:'Sign in to Nexus AI.' };
  try {
    const response=await fetcher(new URL('/api/repositories',publicServiceUrl(server)),{method:'POST',redirect:'error',credentials:'omit',cache:'no-store',headers:{'Content-Type':'application/json',Origin:`${AUTH_SCHEME}:/`,Cookie:cookie},body:JSON.stringify(parsed.data),signal:AbortSignal.timeout(30000)});
    if(response.redirected) throw new Error();
    const value=repositoriesResponseSchema.parse(await readBoundedJson(response,8*1048576));
    if(!response.ok&&value.ok) throw new Error();
    if(value.ok){
      const request=parsed.data;
      if(value.kind==='snapshot'){
        if(!['snapshot','connect','disconnect','synchronize'].includes(request.operation)||value.snapshot.projectId!==request.projectId||value.snapshot.repositoryId!==request.repositoryId||'page'in request&&value.snapshot.page!==request.page) throw new Error();
      } else if(value.kind==='pull'){
        if(!['getPull','createPull','review'].includes(request.operation)||'number'in request&&value.pull.number!==request.number||'page'in request&&value.page!==request.page) throw new Error();
      } else if(value.kind==='activity'){
        if(request.operation!=='resolveActivity'||request.id!==value.id)throw new Error();
      } else if(['snapshot','getPull','synchronize','resolveActivity'].includes(request.operation)) throw new Error();
    }
    return value;
  }catch{return{ok:false,code:'unavailable',message:'Repository service unavailable. Check your connection and retry. If a publication was pending, refresh GitHub before starting another.'};}
}

const lease=z.object({token:z.string().min(20).max(500).regex(/^[A-Za-z0-9_]+$/),remoteUrl:z.url()}).strict();
/** Main-only; no bridge operation, renderer input or persisted token. Browser origins are rejected by server. */
export async function requestGitCredential(server:string,cookie:string,projectId:string,repositoryId:string,fetcher:typeof fetch=fetch):Promise<{token:string;remoteUrl:string}|null>{
  try{
    const response=await fetcher(new URL('/api/repositories/credential',publicServiceUrl(server)),{method:'POST',redirect:'error',credentials:'omit',cache:'no-store',headers:{'Content-Type':'application/json',Origin:`${AUTH_SCHEME}:/`,Cookie:cookie},body:JSON.stringify({projectId,repositoryId}),signal:AbortSignal.timeout(10000)});
    if(!response.ok||response.redirected) return null;
    return lease.parse(await readBoundedJson(response,2048));
  }catch{return null;}
}

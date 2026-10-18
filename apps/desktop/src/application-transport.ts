import {applicationRequestSchema,applicationResponseSchema,type ApplicationRequest,type ApplicationResponse} from '@nexus-ai/contracts';
import {AUTH_SCHEME,publicServiceUrl} from './auth-config.ts';
import {readBoundedJson} from './overview-transport.ts';

export async function requestApplication(server:string,cookie:string,input:ApplicationRequest,fetcher:typeof fetch=fetch):Promise<ApplicationResponse> {
 const parsed=applicationRequestSchema.safeParse(input);
 if(!parsed.success)return{ok:false,code:'invalid_request',message:'Invalid application request.'};
 if(!cookie)return{ok:false,code:'auth_required',message:'Sign in to Nexus AI.'};
 try {
  const response=await fetcher(new URL('/api/application',publicServiceUrl(server)),{method:'POST',redirect:'error',credentials:'omit',cache:'no-store',headers:{'Content-Type':'application/json',Origin:`${AUTH_SCHEME}:/`,Cookie:cookie},body:JSON.stringify(parsed.data),signal:AbortSignal.timeout(15000)});
  if(response.redirected)throw new Error();
  const value=applicationResponseSchema.parse(await readBoundedJson(response,1048576));
  if(!response.ok&&value.ok)throw new Error();
  if(value.ok){
   const req=parsed.data;
   if(req.operation==='search') {
    if(value.kind!=='search'||value.query!==req.query||value.items.some(item=>req.projectId&&item.projectId!==req.projectId||req.kind&&item.kind!==req.kind))throw new Error();
   } else if(value.kind!=='settings')throw new Error();
  }
  return value;
 } catch {return{ok:false,code:'unavailable',message:'Application service unavailable. Check the connection and retry.'};}
}

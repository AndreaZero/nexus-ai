import {deploymentsRequestSchema,deploymentsResponseSchema,type DeploymentsRequest,type DeploymentsResponse} from '@nexus-ai/contracts';
import {AUTH_SCHEME,publicServiceUrl} from './auth-config.ts';
import {readBoundedJson} from './overview-transport.ts';
export async function requestDeployments(server:string,cookie:string,input:DeploymentsRequest,fetcher:typeof fetch=fetch):Promise<DeploymentsResponse>{
 const parsed=deploymentsRequestSchema.safeParse(input);if(!parsed.success)return{ok:false,code:'invalid_request',message:'Invalid deployment request.'};
 if(!cookie)return{ok:false,code:'auth_required',message:'Sign in to Nexus AI.'};
 try{
  const response=await fetcher(new URL('/api/deployments',publicServiceUrl(server)),{method:'POST',redirect:'error',credentials:'omit',cache:'no-store',headers:{'Content-Type':'application/json',Origin:`${AUTH_SCHEME}:/`,Cookie:cookie},body:JSON.stringify(parsed.data),signal:AbortSignal.timeout(15000)});
  if(response.redirected)throw new Error();const value=deploymentsResponseSchema.parse(await readBoundedJson(response,16*1048576));if(!response.ok&&value.ok)throw new Error();
  if(value.ok){const req=parsed.data;
   if(req.operation==='snapshot'){if(value.kind!=='snapshot'||value.snapshot.projectId!==req.projectId||req.view==='client'&&value.snapshot.audience!=='client')throw new Error();}
   else if(req.operation==='readDeployment'){if(value.kind!=='deployment'||value.item.projectId!==req.projectId||value.item.id!==req.id)throw new Error();}
   else if(value.kind!=='changed'||req.id&&req.id!==value.id)throw new Error();
  }return value;
 }catch{return{ok:false,code:'unavailable',message:'Deployment service unavailable. Check the connection and retry.'};}
}

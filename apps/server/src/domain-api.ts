import type {FastifyInstance,FastifyReply,FastifyRequest} from 'fastify';
import {createRealtimeBudget} from './realtime-rate.js';
interface Schema<T>{safeParse(input:unknown):{success:true;data:T}|{success:false};parse(input:unknown):T;}
/** Shared strict domain boundary; identity is supplied only by the current server session. */
export function installDomainApi<T,R>(app:FastifyInstance,options:{path:string;origins:readonly string[];request:Schema<T>;response:Schema<R>;authenticate(request:FastifyRequest,reply:FastifyReply):Promise<{id:string;email:string}|null>;execute(actor:{id:string;email:string},input:T):Promise<R>;bodyLimit?:number}){
 const budget=createRealtimeBudget();
 app.post(options.path,{bodyLimit:options.bodyLimit??512*1024},async(request,reply)=>{
  reply.header('Cache-Control','no-store');reply.header('Referrer-Policy','no-referrer');
  const fail=(status:number,code:string,message:string)=>reply.code(status).send({ok:false,code,message});
  const ip=budget.consume(`ip:${request.ip}`,600);if(!ip.allowed){reply.header('Retry-After',String(ip.retryAfterSeconds));return fail(429,'unavailable','Too many requests. Retry shortly.');}
  if(!options.origins.includes(request.headers.origin??''))return fail(403,'forbidden','Request origin denied.');
  if(request.headers['content-type']?.split(';')[0]?.trim().toLowerCase()!=='application/json')return fail(400,'invalid_request','JSON required.');
  const parsed=options.request.safeParse(request.body);if(!parsed.success)return fail(400,'invalid_request','Invalid request.');
  try{
   const actor=await options.authenticate(request,reply);if(!actor)return fail(401,'auth_required','Sign in with a verified Nexus account.');
   const account=budget.consume(`actor:${actor.id}`,300);if(!account.allowed){reply.header('Retry-After',String(account.retryAfterSeconds));return fail(429,'unavailable','Too many requests. Retry shortly.');}
   return reply.send(options.response.parse(await options.execute(actor,parsed.data)));
  }catch{app.log.error({event:'request.error',requestId:request.id,category:'internal'});return fail(503,'unavailable','Service unavailable. Check the connection and retry.');}
 });
}

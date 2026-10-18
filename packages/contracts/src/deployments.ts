import {z} from 'zod';
export const deploymentUrlSchema=z.string().min(1).max(2000).refine(value=>{if(value.includes('\\')||[...value].some(character=>character.charCodeAt(0)<=32||character.charCodeAt(0)===127))return false;try{const url=new URL(value);return !url.username&&!url.password&&!url.hash&&!url.search&&(url.protocol==='https:'||(url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname)));}catch{return false;}});
export const healthCheckSchema=z.enum(['build','tests','coverage','performance','security']);
const scope={projectId:z.uuid()};
const identity={id:z.uuid(),...scope,version:z.number().int().positive(),createdAt:z.iso.datetime(),updatedAt:z.iso.datetime()};
export const deploymentEnvironmentSchema=z.object({...identity,name:z.string().min(1).max(100),kind:z.enum(['development','staging','production']),visibility:z.enum(['team','client']),previewUrl:deploymentUrlSchema.nullable(),requiredChecks:z.array(healthCheckSchema).max(5)}).strict();
const deploymentFields={environmentId:z.uuid(),title:z.string().trim().min(1).max(200),status:z.enum(['queued','building','succeeded','failed','cancelled']),commitSha:z.string().regex(/^[a-f0-9]{40,64}$/).nullable(),branch:z.string().max(200).nullable(),buildUrl:deploymentUrlSchema.nullable(),previewUrl:deploymentUrlSchema.nullable(),notes:z.string().max(4000),thumbnail:z.string().max(350000).regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/).nullable()};
export const deploymentSchema=z.object({...identity,...deploymentFields,source:z.literal('manual'),authorId:z.string().max(128),observedAt:z.iso.datetime()}).strict();
export const healthObservationSchema=z.object({...identity,environmentId:z.uuid(),check:healthCheckSchema,status:z.enum(['pass','warn','fail']),value:z.number().finite().nullable(),unit:z.string().max(40).nullable(),summary:z.string().max(300),sourceUrl:deploymentUrlSchema.nullable(),source:z.literal('manual'),observedAt:z.iso.datetime(),expiresAt:z.iso.datetime(),stale:z.boolean()}).strict();
export const environmentHealthSchema=z.object({environmentId:z.uuid(),status:z.enum(['healthy','degraded','unhealthy','unknown']),score:z.number().min(0).max(100).nullable(),required:z.array(healthCheckSchema).max(5),observations:z.array(healthObservationSchema).max(5),computedAt:z.iso.datetime()}).strict();
export const deploymentsSnapshotSchema=z.object({...scope,audience:z.enum(['team','client']),canManage:z.boolean(),environments:z.array(deploymentEnvironmentSchema).max(30),deployments:z.array(deploymentSchema).max(100),health:z.array(environmentHealthSchema).max(30),total:z.number().int().nonnegative(),nextOffset:z.number().int().nonnegative().nullable(),observedAt:z.iso.datetime()}).strict();
export const deploymentsRequestSchema=z.discriminatedUnion('operation',[
 z.object({operation:z.literal('snapshot'),...scope,view:z.enum(['auto','client']).default('auto'),offset:z.number().int().min(0).max(100000).default(0),limit:z.number().int().min(1).max(100).default(30)}).strict(),
 z.object({operation:z.literal('readDeployment'),...scope,id:z.uuid(),view:z.enum(['auto','client']).default('auto')}).strict(),
 z.object({operation:z.literal('saveEnvironment'),...scope,requestId:z.uuid(),id:z.uuid().nullable(),expectedVersion:z.number().int().nonnegative(),name:z.string().trim().min(1).max(100),kind:z.enum(['development','staging','production']),visibility:z.enum(['team','client']),previewUrl:deploymentUrlSchema.nullable(),requiredChecks:z.array(healthCheckSchema).max(5)}).strict(),
 z.object({operation:z.literal('deleteEnvironment'),...scope,requestId:z.uuid(),id:z.uuid(),expectedVersion:z.number().int().positive()}).strict(),
 z.object({operation:z.literal('saveDeployment'),...scope,requestId:z.uuid(),id:z.uuid().nullable(),expectedVersion:z.number().int().nonnegative(),...deploymentFields,observedAt:z.iso.datetime()}).strict(),
 z.object({operation:z.literal('deleteDeployment'),...scope,requestId:z.uuid(),id:z.uuid(),expectedVersion:z.number().int().positive()}).strict(),
 z.object({operation:z.literal('saveObservation'),...scope,requestId:z.uuid(),id:z.uuid().nullable(),expectedVersion:z.number().int().nonnegative(),environmentId:z.uuid(),check:healthCheckSchema,status:z.enum(['pass','warn','fail']),value:z.number().finite().nullable(),unit:z.string().max(40).nullable(),summary:z.string().max(300),sourceUrl:deploymentUrlSchema.nullable(),observedAt:z.iso.datetime(),ttlSeconds:z.number().int().min(60).max(604800)}).strict(),
]);
export const deploymentErrorSchema=z.object({ok:z.literal(false),code:z.enum(['auth_required','forbidden','invalid_request','not_found','conflict','unavailable']),message:z.string().max(1000)}).strict();
export const deploymentsResponseSchema=z.union([deploymentErrorSchema,z.object({ok:z.literal(true),kind:z.literal('snapshot'),snapshot:deploymentsSnapshotSchema}).strict(),z.object({ok:z.literal(true),kind:z.literal('deployment'),item:deploymentSchema}).strict(),z.object({ok:z.literal(true),kind:z.literal('changed'),id:z.uuid(),version:z.number().int().nonnegative()}).strict()]);
export const environmentProbeRequestSchema=z.object({operation:z.literal('observe'),...scope,url:deploymentUrlSchema,consent:z.literal(true)}).strict();
export const environmentProbeResponseSchema=z.union([deploymentErrorSchema,z.object({ok:z.literal(true),observation:z.object({...scope,url:deploymentUrlSchema,status:z.enum(['reachable','unreachable']),httpStatus:z.number().int().min(100).max(599).nullable(),latencyMs:z.number().nonnegative(),observedAt:z.iso.datetime(),expiresAt:z.iso.datetime(),source:z.literal('local_http')}).strict()}).strict()]);
export const deploymentPreviewRequestSchema=z.object({...scope,id:z.uuid()}).strict();
export type DeploymentsRequest=z.infer<typeof deploymentsRequestSchema>;
export type DeploymentsResponse=z.infer<typeof deploymentsResponseSchema>;
export type Deployment=z.infer<typeof deploymentSchema>;
export type DeploymentEnvironment=z.infer<typeof deploymentEnvironmentSchema>;
export type DeploymentsSnapshot=z.infer<typeof deploymentsSnapshotSchema>;
export type HealthObservation=z.infer<typeof healthObservationSchema>;
export type EnvironmentHealth=z.infer<typeof environmentHealthSchema>;
export type EnvironmentProbeRequest=z.infer<typeof environmentProbeRequestSchema>;
export type EnvironmentProbeResponse=z.infer<typeof environmentProbeResponseSchema>;
export type DeploymentPreviewRequest=z.infer<typeof deploymentPreviewRequestSchema>;

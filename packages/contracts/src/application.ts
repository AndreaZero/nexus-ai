import {z} from 'zod';
export const applicationPreferencesSchema=z.object({notificationsEnabled:z.boolean(),notificationCategories:z.array(z.enum(['sessions','tasks','documents','comments','commits','deployments'])).max(6),defaultVisibility:z.enum(['team','client']),defaultModelId:z.string().min(1).max(200).nullable(),defaultEffort:z.string().min(1).max(30).nullable()}).strict();
export const defaultApplicationPreferences={notificationsEnabled:true,notificationCategories:['sessions','tasks','documents','comments','commits','deployments'],defaultVisibility:'team',defaultModelId:null,defaultEffort:null} satisfies z.infer<typeof applicationPreferencesSchema>;
export const applicationSettingsSchema=z.object({version:z.number().int().nonnegative(),name:z.string().min(1).max(200),preferences:applicationPreferencesSchema,updatedAt:z.iso.datetime().nullable()}).strict();
export const searchKindSchema=z.enum(['project','task','milestone','document','update','deliverable','shared_session','live_share','deployment','environment']);
export const searchHitSchema=z.object({id:z.uuid(),workspaceId:z.uuid(),projectId:z.uuid(),projectName:z.string().max(200),kind:searchKindSchema,title:z.string().max(300),excerpt:z.string().max(500)}).strict();
export const applicationRequestSchema=z.discriminatedUnion('operation',[
 z.object({operation:z.literal('search'),query:z.string().trim().min(2).max(200),projectId:z.uuid().nullable().default(null),kind:searchKindSchema.nullable().default(null),offset:z.number().int().min(0).max(10000).default(0),limit:z.number().int().min(1).max(50).default(30)}).strict(),
 z.object({operation:z.literal('getSettings')}).strict(),
 z.object({operation:z.literal('saveSettings'),expectedVersion:z.number().int().nonnegative(),name:z.string().trim().min(1).max(200),preferences:applicationPreferencesSchema}).strict(),
]);
export const applicationResponseSchema=z.union([
 z.object({ok:z.literal(true),kind:z.literal('search'),query:z.string().max(200),items:z.array(searchHitSchema).max(50),nextOffset:z.number().int().nonnegative().nullable(),observedAt:z.iso.datetime()}).strict(),
 z.object({ok:z.literal(true),kind:z.literal('settings'),settings:applicationSettingsSchema}).strict(),
 z.object({ok:z.literal(false),code:z.enum(['auth_required','forbidden','invalid_request','conflict','unavailable']),message:z.string().max(1000)}).strict(),
]);
export type ApplicationRequest=z.infer<typeof applicationRequestSchema>;
export type ApplicationResponse=z.infer<typeof applicationResponseSchema>;
export type ApplicationPreferences=z.infer<typeof applicationPreferencesSchema>;
export type ApplicationSettings=z.infer<typeof applicationSettingsSchema>;
export type SearchHit=z.infer<typeof searchHitSchema>;

export const connectionSettingsSchema=z.object({serverUrl:z.string().max(2000),webUrl:z.string().max(2000)}).strict();
export const desktopPreferencesSchema=z.object({active:connectionSettingsSchema,pending:connectionSettingsSchema.nullable(),restartRequired:z.boolean()}).strict();
export const desktopPreferencesRequestSchema=z.discriminatedUnion('operation',[
 z.object({operation:z.literal('read')}).strict(),
 z.object({operation:z.literal('saveConnection'),connection:connectionSettingsSchema}).strict(),
 z.object({operation:z.literal('resetConnection')}).strict(),
 z.object({operation:z.literal('restart')}).strict(),
]);
export const desktopPreferencesResponseSchema=z.union([z.object({ok:z.literal(true),preferences:desktopPreferencesSchema}).strict(),z.object({ok:z.literal(false),code:z.enum(['invalid_request','forbidden','unavailable']),message:z.string().max(1000)}).strict()]);
export type DesktopPreferencesRequest=z.infer<typeof desktopPreferencesRequestSchema>;
export type DesktopPreferencesResponse=z.infer<typeof desktopPreferencesResponseSchema>;

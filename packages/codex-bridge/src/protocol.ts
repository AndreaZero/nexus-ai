import type { ClientRequest } from '../generated/ClientRequest.js';
import type { InitializeResponse } from '../generated/InitializeResponse.js';
import type { GetAccountResponse } from '../generated/v2/GetAccountResponse.js';
import type { LoginAccountResponse } from '../generated/v2/LoginAccountResponse.js';
import type { CancelLoginAccountResponse } from '../generated/v2/CancelLoginAccountResponse.js';
import type { LogoutAccountResponse } from '../generated/v2/LogoutAccountResponse.js';
import type { ModelListResponse } from '../generated/v2/ModelListResponse.js';
import type { ThreadStartResponse } from '../generated/v2/ThreadStartResponse.js';
import type { ThreadResumeResponse } from '../generated/v2/ThreadResumeResponse.js';
import type { ThreadReadResponse } from '../generated/v2/ThreadReadResponse.js';
import type { TurnStartResponse } from '../generated/v2/TurnStartResponse.js';
import type { TurnInterruptResponse } from '../generated/v2/TurnInterruptResponse.js';
import type { WindowsSandboxSetupStartResponse } from '../generated/v2/WindowsSandboxSetupStartResponse.js';

/** Deliberately smaller than the provider API; renderer never imports provider types. */
export interface CodexResponses {
  initialize: InitializeResponse;
  'account/read': GetAccountResponse;
  'account/login/start': LoginAccountResponse;
  'account/login/cancel': CancelLoginAccountResponse;
  'account/logout': LogoutAccountResponse;
  'model/list': ModelListResponse;
  'thread/start': ThreadStartResponse;
  'thread/resume': ThreadResumeResponse;
  'thread/read': ThreadReadResponse;
  'turn/start': TurnStartResponse;
  'turn/interrupt': TurnInterruptResponse;
  'windowsSandbox/setupStart': WindowsSandboxSetupStartResponse;
}
export type CodexMethod = Exclude<keyof CodexResponses, 'initialize'>;
export type CodexParams<M extends keyof CodexResponses> = Extract<ClientRequest, { method: M }>['params'];
export type CodexResponse<M extends keyof CodexResponses> = CodexResponses[M];

export const CLIENT_METHODS: ReadonlySet<string> = new Set<CodexMethod>([
  'account/read', 'account/login/start', 'account/login/cancel', 'account/logout',
  'model/list', 'thread/start', 'thread/resume', 'thread/read', 'turn/start',
  'turn/interrupt', 'windowsSandbox/setupStart',
]);

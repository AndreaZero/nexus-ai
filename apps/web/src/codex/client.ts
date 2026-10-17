import { codexRequestSchema, codexResponseSchema } from '@nexus-ai/contracts';
import type { CodexRequest, CodexResponse } from '@nexus-ai/contracts';

/** This transport exists only in Electron. No credential or local-runtime HTTP proxy. */
export async function codexRequest(request: CodexRequest): Promise<CodexResponse> {
  if (!window.nexusDesktop?.codex) throw new Error('Open the desktop app to connect your local Codex runtime.');
  const parsed = codexRequestSchema.safeParse(request);
  if (!parsed.success) throw new Error('Check the request fields and try again.');
  try { return codexResponseSchema.parse(await window.nexusDesktop.codex.request(parsed.data)); }
  catch { throw new Error('Codex could not be reached. Reconnect the local runtime and retry.'); }
}

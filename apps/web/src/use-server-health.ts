import { useEffect, useState } from 'react';
import { healthResponseSchema } from '@nexus-ai/contracts';
import type { HealthResponse } from '@nexus-ai/contracts';
import { getServerUrl } from './server-url.js';

type ServerConfiguration = { status: 'configured'; url: URL } | { status: 'not_configured' | 'invalid' };

function getConfiguration(): ServerConfiguration {
  try {
    const url = getServerUrl(window.nexusDesktop?.configuration?.serverUrl ?? import.meta.env['VITE_NEXUS_SERVER_URL'] as string | undefined, import.meta.env.DEV);
    return url ? { status: 'configured', url } : { status: 'not_configured' };
  } catch {
    return { status: 'invalid' };
  }
}

const configuration = getConfiguration();

export type HealthState =
  | { status: 'not_configured' | 'invalid' | 'checking' }
  | { status: 'healthy'; response: HealthResponse; checkedAt: Date }
  | { status: 'offline'; reason: 'timeout' | 'network' | 'response' };

export function useServerHealth() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<HealthState>(() => ({
    status: configuration.status === 'configured' ? 'checking' : configuration.status,
  }));

  useEffect(() => {
    if (configuration.status !== 'configured') return;
    const controller = new AbortController();
    let active = true;
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 8_000);

    const check = async () => {
      try {
        const response = await fetch(new URL('health', configuration.url), {
          signal: controller.signal,
          credentials: 'omit',
          cache: 'no-store',
          redirect: 'error',
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) {
          if (active) setState({ status: 'offline', reason: 'response' });
          return;
        }
        const body: unknown = await response.json();
        const result = healthResponseSchema.safeParse(body);
        if (active) {
          setState(result.success
            ? { status: 'healthy', response: result.data, checkedAt: new Date() }
            : { status: 'offline', reason: 'response' });
        }
      } catch (error) {
        if (active) setState({ status: 'offline', reason: timedOut ? 'timeout' : error instanceof SyntaxError ? 'response' : 'network' });
      } finally {
        window.clearTimeout(timeout);
      }
    };
    void check();

    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [attempt]);

  return {
    state,
    endpoint: configuration.status === 'configured' ? configuration.url.href : null,
    retry: () => {
      setState({ status: 'checking' });
      setAttempt((value) => value + 1);
    },
  };
}

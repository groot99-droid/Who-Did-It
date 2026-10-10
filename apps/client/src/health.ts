import { BUILD_VERSION } from '@wdi/shared/version';

export interface Health {
  ok: boolean;
  build: string;
  [key: string]: unknown;
}

export const SERVER_URL: string = (import.meta.env.VITE_SERVER_URL || 'http://localhost:2567').replace(
  /\/+$/,
  '',
);
export { BUILD_VERSION } from '@wdi/shared/version';

export const REFRESH_MESSAGE = 'A new version is out: refresh to update.';

/** The server and this page were built from different commits, so joins would be refused (ARCHITECTURE 5.10). */
export const isStale = (health: Health): boolean => health.build !== BUILD_VERSION;

/** One-shot `/health` read for a failed join: resolves true when the page is out of date. */
export async function buildIsStale(): Promise<boolean> {
  try {
    return isStale(await fetchHealth(AbortSignal.timeout(TIMEOUT_MS)));
  } catch {
    return false;
  }
}

const POLL_MS = 2000;
const TIMEOUT_MS = 6000;

async function fetchHealth(signal: AbortSignal): Promise<Health> {
  const res = await fetch(`${SERVER_URL}/health`, { signal, cache: 'no-store' });
  if (!res.ok) throw new Error(`health ${res.status}`);
  const body = (await res.json()) as Health;
  if (typeof body.ok !== 'boolean' || typeof body.build !== 'string') throw new Error('bad health body');
  return body;
}

/**
 * Polls `/health` until the server answers. Render Free spins down after 15 idle
 * minutes and takes about a minute to wake, so failures are expected and retried.
 */
export async function waitForHealth(onAttempt: (n: number) => void, signal: AbortSignal): Promise<Health> {
  for (let attempt = 1; !signal.aborted; attempt++) {
    onAttempt(attempt);
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), TIMEOUT_MS);
    const onAbort = () => timeout.abort();
    signal.addEventListener('abort', onAbort, { once: true });
    try {
      return await fetchHealth(timeout.signal);
    } catch {
      // still asleep, retry
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
    }
    await new Promise<void>((resolve) => setTimeout(resolve, POLL_MS));
  }
  throw new Error('health poll aborted');
}

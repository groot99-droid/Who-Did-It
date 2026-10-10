/** localStorage wrapper: reads and writes can throw (private windows, blocked storage). */
function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export function getItem(key: string): string | null {
  return safe(() => localStorage.getItem(key), null);
}

export function setItem(key: string, value: string): void {
  safe(() => localStorage.setItem(key, value), undefined);
}

export function removeItem(key: string): void {
  safe(() => localStorage.removeItem(key), undefined);
}

const DEVICE_KEY = 'wdi:deviceId';

/** Stable random id per browser; used by the server for room bans (5.3). Not a secret. */
export function deviceId(): string {
  let id = getItem(DEVICE_KEY);
  if (id === null || id.length < 8) {
    id = crypto.randomUUID();
    setItem(DEVICE_KEY, id);
  }
  return id;
}

const tokenKey = (code: string) => `wdi:rt:${code}`;

/** Reconnection token per room code; cleared on consented leave or game over (5.9). */
export const reconnectTokens = {
  get: (code: string) => getItem(tokenKey(code)),
  set: (code: string, token: string) => setItem(tokenKey(code), token),
  clear: (code: string) => removeItem(tokenKey(code)),
};

// The device record of achievements (round 10, E1; GDD 3.28): the ids earned on this device, each with the day it was
// earned, under one localStorage key. Storage can be missing, empty or blocked; then nothing is shown as earned and
// nothing else is lost. The server keeps nothing: the record never leaves the device until accounts exist.

export const ACHV_KEY = 'wdi:achv';

type Reader = Pick<Storage, 'getItem'>;
type Writer = Pick<Storage, 'getItem' | 'setItem'>;

function safeStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

/** Earned achievement ids and the day (`YYYY-MM-DD`) each was earned. */
export function readEarned(storage: Reader | undefined = safeStorage()): Record<string, string> {
  try {
    const raw = storage?.getItem(ACHV_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        (e): e is [string, string] => typeof e[1] === 'string',
      ),
    );
  } catch {
    return {};
  }
}

/** Records an achievement as earned; returns true when it was new on this device (an old one is kept as it was). */
export function markEarned(
  id: string,
  storage: Writer | undefined = safeStorage(),
  now: Date = new Date(),
): boolean {
  try {
    const earned = readEarned(storage);
    if (id in earned) return false;
    earned[id] = now.toISOString().slice(0, 10);
    storage?.setItem(ACHV_KEY, JSON.stringify(earned));
    return true;
  } catch {
    return true; // a blocked store forgets, but the player still earned it just now
  }
}

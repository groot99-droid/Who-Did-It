/**
 * The opening cinematic's rules without Phaser (round 6, DECISIONS A98), so the unit tests can load them: when it
 * plays, the session flag, and the `intro` row of the video manifest.
 */
export const INTRO_SEEN_KEY = 'wdi:introSeen';
/** The manifest key of the cinematic in `assets/video/manifest.json` (6N writes the row). */
export const INTRO_KEY = 'intro';
/** After the tap, how long the video may take to start before the scene gives up on it. */
export const INTRO_STALL_MS = 8000;

export interface IntroEnv {
  reducedMotion: boolean;
  saveData: boolean;
  search: string;
  /** `?mock=1`: the mock e2e, which does not want a cinematic in front of every spec. */
  mock: boolean;
  /** A reload on `#/lobby/CODE` is rejoining a party, not opening the game. */
  resuming: boolean;
  seen: boolean;
}

/** Off under reduced motion, the data saver, `?intro=0`, a rejoin, a repeat in the session, and the mock unless `?intro=1`. */
export function introAllowed(env: IntroEnv): boolean {
  if (env.reducedMotion || env.saveData || env.resuming || env.seen) return false;
  const flag = new URLSearchParams(env.search).get('intro');
  if (flag === '0') return false;
  return !env.mock || flag === '1';
}

const readSeen = (): boolean => {
  try {
    return sessionStorage.getItem(INTRO_SEEN_KEY) === '1';
  } catch {
    return false;
  }
};

export const markSeen = (): void => {
  try {
    sessionStorage.setItem(INTRO_SEEN_KEY, '1');
  } catch {
    // blocked storage: the cinematic may play again on a reload, nothing worse
  }
};

export function readIntroEnv(mock: boolean, resuming: boolean): IntroEnv {
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return {
    reducedMotion: typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
    saveData: conn?.saveData === true,
    search: location.search,
    mock,
    resuming,
    seen: readSeen(),
  };
}

export interface IntroRow {
  /** Relative to `assets/video/`. */
  url: string;
  poster?: string;
}

/** The `intro` row of the video manifest, or null when the manifest or the row is missing or damaged. */
export function parseIntroRow(raw: unknown): IntroRow | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const entries = (raw as { entries?: unknown }).entries;
  if (!Array.isArray(entries)) return null;
  for (const e of entries as Array<Record<string, unknown>>) {
    if (e?.key !== INTRO_KEY || typeof e.url !== 'string' || e.url === '') continue;
    return { url: e.url, ...(typeof e.poster === 'string' && e.poster !== '' ? { poster: e.poster } : {}) };
  }
  return null;
}

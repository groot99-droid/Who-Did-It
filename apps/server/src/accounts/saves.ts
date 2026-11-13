/**
 * The story save port (docs/accounts/plan.md 5, A1). The story engine decides when to save (a chapter break) and
 * what (break state, never a world snapshot), then calls a `SaveStore`; the device store is the guest's, and an
 * account store replaces it behind the same interface. A save holds no secret of a live match: the story is seeded
 * and fixed (GDD 3.34), so a resume starts the next chapter from its break.
 */

export interface ChapterSummary {
  chapterId: string;
  failed?: boolean;
  counters?: Record<string, number>;
}

export interface StorySave {
  v: 1;
  storyId: string;
  /** The arc chapter a Continue starts; null when the story is finished. */
  nextChapterId: string | null;
  /** Arc chapter ids, in order. */
  finished: string[];
  /** What the last finished chapter hands on (arc.md 5, `HandOn`), for the client's end screen; the engine re-derives it. */
  handOn: unknown[];
  /** Section ids whose single replay is spent (A515). */
  replayUsed: string[];
  summaries: ChapterSummary[];
  rev: number;
  savedAt: number;
}

/** Who is saving: the seat's private channel, and the save the client sent back with `story.start {resume}`. */
export interface SaveCtx {
  seat: string;
  send(type: string, payload: unknown): void;
  resume?: unknown;
}

export interface SaveStore {
  get(ctx: SaveCtx, storyId: string): StorySave | null;
  put(ctx: SaveCtx, save: StorySave): 'ok' | 'stale';
  clear(ctx: SaveCtx, storyId: string): void;
}

export const STORY_SAVED = 'story.saved';

const ID = /^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/;
const MAX_LIST = 64;
const isId = (v: unknown): v is string => typeof v === 'string' && ID.test(v);
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const idList = (v: unknown): string[] | null =>
  Array.isArray(v) && v.length <= MAX_LIST && v.every(isId) ? (v as string[]) : null;

function summaryOf(v: unknown): ChapterSummary | null {
  if (!isObj(v) || !isId(v.chapterId)) return null;
  const out: ChapterSummary = { chapterId: v.chapterId };
  if (v.failed !== undefined) {
    if (typeof v.failed !== 'boolean') return null;
    out.failed = v.failed;
  }
  if (v.counters !== undefined) {
    if (!isObj(v.counters)) return null;
    const entries = Object.entries(v.counters);
    if (entries.length > MAX_LIST || !entries.every(([k, n]) => isId(k) && Number.isFinite(n))) return null;
    out.counters = Object.fromEntries(
      entries.map(([k, n]) => [k, Math.max(0, Math.min(1e6, Math.trunc(n as number)))]),
    );
  }
  return out;
}

/** Parses an untrusted save: the shape, the id forms and the sizes; null when anything does not hold. */
export function parseStorySave(raw: unknown): StorySave | null {
  if (!isObj(raw) || raw.v !== 1 || !isId(raw.storyId)) return null;
  const next = raw.nextChapterId;
  if (next !== null && !isId(next)) return null;
  const finished = idList(raw.finished);
  const replayUsed = idList(raw.replayUsed);
  if (finished === null || replayUsed === null) return null;
  if (!Array.isArray(raw.handOn) || raw.handOn.length > 16) return null;
  if (!Array.isArray(raw.summaries) || raw.summaries.length > MAX_LIST) return null;
  const summaries = raw.summaries.map(summaryOf);
  if (summaries.some((s) => s === null)) return null;
  const { rev, savedAt } = raw;
  if (typeof rev !== 'number' || !Number.isInteger(rev) || rev < 0 || rev > 1e9) return null;
  if (typeof savedAt !== 'number' || !Number.isFinite(savedAt) || savedAt < 0) return null;
  return {
    v: 1,
    storyId: raw.storyId,
    nextChapterId: next,
    finished,
    handOn: raw.handOn.filter(isObj),
    replayUsed,
    summaries: summaries as ChapterSummary[],
    rev,
    savedAt,
  };
}

/**
 * The guest's store (plan 5, option A): `put` sends the save to the player's own client, which keeps it on the device;
 * `get` reads the save the client sent back and re-validates it. Unsigned on purpose: a forged save only lets a person
 * skip ahead in their own single-player story, and nothing it holds feeds anything but the story.
 */
export class DeviceSaveStore implements SaveStore {
  get(ctx: SaveCtx, storyId: string): StorySave | null {
    const save = parseStorySave(ctx.resume);
    return save !== null && save.storyId === storyId ? save : null;
  }
  put(ctx: SaveCtx, save: StorySave): 'ok' | 'stale' {
    ctx.send(STORY_SAVED, { save });
    return 'ok';
  }
  clear(): void {
    // the device holds the only copy; the client clears it when the story is finished or restarted
  }
}

const device = new DeviceSaveStore();

/** The store for a connection: the device's for a guest (an account store joins it with accounts, plan A9). */
export const saveStoreFor = (_ctx: SaveCtx): SaveStore => device;

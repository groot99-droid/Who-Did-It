import type { ServerMessages } from '../../net/protocol';

/** Story mode's client state (docs/story/README.md 3): the card that is up and the chapter's goals. Pure, no DOM. */
export type StoryCard = ServerMessages['story.card'];
export type StoryGoals = ServerMessages['story.goals'];

export interface StoryState {
  card: StoryCard | null;
  goals: StoryGoals | null;
  /** Chapters whose end card was shown in this story, in order (the chapter list marks them finished). */
  ended: string[];
}

export const emptyStory = (): StoryState => ({ card: null, goals: null, ended: [] });

/** A card replaces the one before it; an end card also clears the goals, which belong to the chapter that closed. */
export function onCard(state: StoryState, card: StoryCard): StoryState {
  const ended =
    card.kind === 'end' && !state.ended.includes(card.chapterId)
      ? [...state.ended, card.chapterId]
      : state.ended;
  return { card, goals: card.kind === 'end' ? null : state.goals, ended };
}

/** Goals of another chapter replace the old ones; a resend of the same chapter updates the done marks. */
export const onGoals = (state: StoryState, goals: StoryGoals): StoryState => ({ ...state, goals });

/** `story.continue` closed the card that was up. */
export const closeCard = (state: StoryState): StoryState => ({ ...state, card: null });

/** The label of a card's button: Begin on the chapter's title card, Continue on the rest, and an end card with no `next` closes the story. */
export function cardButton(
  card: StoryCard,
): 'story.card.begin' | 'story.card.continue' | 'story.card.next' | 'story.card.finish' {
  if (card.kind === 'title') return 'story.card.begin';
  if (card.kind !== 'end') return 'story.card.continue';
  return card.next ? 'story.card.next' : 'story.card.finish';
}

/** A counter key as a row label: `loavesBaked` or `loaves_baked` -> "Loaves baked". The content names the keys; the client adds no words. */
export function summaryLabel(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_.-]+/g, ' ')
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export const summaryRows = (card: StoryCard): Array<{ key: string; label: string; value: number }> =>
  Object.entries(card.summary ?? {}).map(([key, value]) => ({ key, label: summaryLabel(key), value }));

export const goalsLeft = (goals: StoryGoals | null): number =>
  goals?.goals.filter((g) => !g.done).length ?? 0;

/** What the title screen's chapter list shows of a story (from `story.json`, through `@wdi/content`). */
export interface StoryCatalogEntry {
  id: string;
  title: string;
  blurb: string;
  chapters: Array<{ id: string; title: string; setup: string; summary?: string }>;
}

const FINISHED_KEY = 'wdi:story:finished';

/** Chapter ids finished on this device; storage can be missing or blocked, and then nothing is remembered. */
export function readFinished(storage: Pick<Storage, 'getItem'> | undefined = safeStorage()): string[] {
  try {
    const raw = storage?.getItem(FINISHED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function markFinished(
  chapterId: string,
  storage: Pick<Storage, 'getItem' | 'setItem'> | undefined = safeStorage(),
): void {
  try {
    const now = readFinished(storage);
    if (!now.includes(chapterId)) storage?.setItem(FINISHED_KEY, JSON.stringify([...now, chapterId]));
  } catch {
    /* a blocked store forgets; the story still plays */
  }
}

function safeStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

/**
 * The chapter list's rows (Q-S4): chapters play in order, so a chapter is open once the one before it is finished, and a
 * finished chapter can be replayed.
 */
export function chapterRows(
  story: StoryCatalogEntry,
  finished: readonly string[],
): Array<{ id: string; title: string; setup: string; n: number; state: 'done' | 'next' | 'locked' }> {
  let nextFound = false;
  return story.chapters.map((c, i) => {
    const done = finished.includes(c.id);
    const state = done ? 'done' : !nextFound ? 'next' : 'locked';
    if (!done) nextFound = true;
    return { ...c, n: i + 1, state };
  });
}

/** What the server says of a chapter in the save's `summaries` (proposed shape; anything else is ignored). */
export interface ChapterOutcome {
  chapterId: string;
  failed: boolean;
  counters: Record<string, number>;
}

export function parseOutcomes(summaries: readonly unknown[]): ChapterOutcome[] {
  const out: ChapterOutcome[] = [];
  for (const x of summaries) {
    if (typeof x !== 'object' || x === null) continue;
    const o = x as Record<string, unknown>;
    if (typeof o.chapterId !== 'string') continue;
    const counters: Record<string, number> = {};
    if (typeof o.counters === 'object' && o.counters !== null)
      for (const [k, v] of Object.entries(o.counters)) if (typeof v === 'number') counters[k] = v;
    out.push({ chapterId: o.chapterId, failed: o.failed === true, counters });
  }
  return out;
}

export interface EndScreenChapter {
  id: string;
  n: number;
  title: string;
  summary: string;
  failed: boolean;
  rows: Array<{ key: string; label: string; value: number }>;
}

/**
 * The end screen's chapters (A515: a dedicated screen with the chapter summaries): every chapter of the story in order,
 * its one-line summary from the content, the counters the server saved and the ones this session's end cards showed
 * (these win), and whether it was lost. A chapter with no outcome and no counters is listed with its summary only.
 */
export function endScreenChapters(
  story: StoryCatalogEntry,
  outcomes: readonly ChapterOutcome[],
  seen: Readonly<Record<string, Record<string, number>>>,
): EndScreenChapter[] {
  return story.chapters.map((c, i) => {
    const o = outcomes.find((x) => x.chapterId === c.id);
    const counters = { ...(o?.counters ?? {}), ...(seen[c.id] ?? {}) };
    return {
      id: c.id,
      n: i + 1,
      title: c.title,
      summary: c.summary ?? c.setup,
      failed: o?.failed ?? false,
      rows: Object.entries(counters).map(([key, value]) => ({ key, label: summaryLabel(key), value })),
    };
  });
}

/** Story-tree achievements the device has earned, in the file's order (titles from `achievements.json`). */
export function earnedStoryAchievements(
  file: { achievements: Record<string, { id: string; tree: string; title: string }> },
  earned: Readonly<Record<string, string>>,
): Array<{ id: string; title: string }> {
  return Object.values(file.achievements)
    .filter((a) => a.tree === 'story' && earned[a.id] !== undefined)
    .map((a) => ({ id: a.id, title: a.title }));
}

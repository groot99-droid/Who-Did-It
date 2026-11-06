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

/** The label of a title, beat or end card's button. An end card with no `next` closes the story. */
export function cardButton(
  card: StoryCard,
): 'story.card.begin' | 'story.card.continue' | 'story.card.next' | 'story.card.finish' {
  if (card.kind === 'title') return 'story.card.begin';
  if (card.kind === 'beat') return 'story.card.continue';
  return card.next ? 'story.card.next' : 'story.card.finish';
}

/** A counter key as a row label: `loaves_baked` -> "Loaves baked". The content names the keys; the client adds no words. */
export function summaryLabel(key: string): string {
  const words = key.replace(/[_.-]+/g, ' ').trim();
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
  chapters: Array<{ id: string; title: string; setup: string }>;
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

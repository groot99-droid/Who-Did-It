import { describe, expect, it } from 'vitest';
import {
  cardButton,
  chapterRows,
  closeCard,
  emptyStory,
  goalsLeft,
  markFinished,
  onCard,
  onGoals,
  readFinished,
  summaryLabel,
  summaryRows,
  type StoryCard,
  type StoryCatalogEntry,
} from './model';

const title: StoryCard = { kind: 'title', chapterId: 'c1', title: 'T', lines: ['a'] };
const end: StoryCard = { kind: 'end', chapterId: 'c1', lines: [], summary: { loaves_baked: 3 }, next: 'N' };

function memory(): Pick<Storage, 'getItem' | 'setItem'> {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
}

describe('story state', () => {
  it('a card replaces the card before it, and closing it keeps the goals', () => {
    let s = onGoals(emptyStory(), { chapterId: 'c1', goals: [{ id: 'g', text: 'x', done: false }] });
    s = onCard(s, title);
    expect(s.card).toEqual(title);
    s = closeCard(s);
    expect(s.card).toBeNull();
    expect(s.goals?.chapterId).toBe('c1');
  });

  it('an end card clears the goals of the chapter that closed and records it once', () => {
    let s = onGoals(emptyStory(), { chapterId: 'c1', goals: [] });
    s = onCard(onCard(s, end), end);
    expect(s.goals).toBeNull();
    expect(s.ended).toEqual(['c1']);
  });

  it('counts the goals left', () => {
    expect(goalsLeft(null)).toBe(0);
    expect(
      goalsLeft({
        chapterId: 'c',
        goals: [
          { id: 'a', text: '', done: true },
          { id: 'b', text: '', done: false },
        ],
      }),
    ).toBe(1);
  });
});

describe('story cards', () => {
  it('names the button by kind; an end card without a next chapter closes the story', () => {
    expect(cardButton(title)).toBe('story.card.begin');
    expect(cardButton({ kind: 'beat', chapterId: 'c', lines: [] })).toBe('story.card.continue');
    expect(cardButton(end)).toBe('story.card.next');
    expect(cardButton({ kind: 'end', chapterId: 'c', lines: [] })).toBe('story.card.finish');
  });

  it('turns summary counters into labelled rows without adding words', () => {
    expect(summaryLabel('loaves_baked')).toBe('Loaves baked');
    expect(summaryLabel('doorsOpened')).toBe('Doors opened');
    expect(summaryRows(end)).toEqual([{ key: 'loaves_baked', label: 'Loaves baked', value: 3 }]);
    expect(summaryRows(title)).toEqual([]);
  });
});

describe('chapter list', () => {
  const story: StoryCatalogEntry = {
    id: 's',
    title: 'S',
    blurb: '',
    chapters: [1, 2, 3].map((n) => ({ id: `c${n}`, title: `C${n}`, setup: '' })),
  };

  it('opens chapters in order and allows replaying a finished one', () => {
    expect(chapterRows(story, []).map((r) => r.state)).toEqual(['next', 'locked', 'locked']);
    expect(chapterRows(story, ['c1']).map((r) => r.state)).toEqual(['done', 'next', 'locked']);
    expect(chapterRows(story, ['c1', 'c2', 'c3']).map((r) => r.state)).toEqual(['done', 'done', 'done']);
  });

  it('remembers finished chapters, and forgets nothing when storage is missing or broken', () => {
    const store = memory();
    markFinished('c1', store);
    markFinished('c1', store);
    expect(readFinished(store)).toEqual(['c1']);
    expect(readFinished(undefined)).toEqual([]);
    expect(readFinished({ getItem: () => '{not json' })).toEqual([]);
    expect(() =>
      markFinished('c1', {
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => undefined,
      }),
    ).not.toThrow();
  });
});

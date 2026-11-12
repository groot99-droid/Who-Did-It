import { describe, expect, it } from 'vitest';
import { StoryTracker } from '../story';

const card = (kind: 'title' | 'beat' | 'end', chapterId: string) => ({ kind, chapterId });

describe('the story bot’s tracker', () => {
  it('a whole story: title, beats and end of each chapter in order', () => {
    const t = new StoryTracker(2);
    for (const id of ['ch1', 'ch2']) {
      t.card(card('title', id));
      t.card(card('beat', id));
      t.card(card('end', id));
    }
    expect(t.done).toBe(true);
    expect(t.ok).toBe(true);
    expect(t.started).toEqual(['ch1', 'ch2']);
  });

  it('flags a chapter that starts before the last one ends, and a beat outside a chapter', () => {
    const t = new StoryTracker(2);
    t.card(card('title', 'ch1'));
    t.card(card('title', 'ch2'));
    expect(t.problems).toHaveLength(1);
    const u = new StoryTracker(1);
    u.card(card('beat', 'ch1'));
    expect(u.problems).toHaveLength(1);
    expect(u.ok).toBe(false);
  });

  it('is not done until every chapter has ended', () => {
    const t = new StoryTracker(3);
    t.card(card('title', 'a'));
    t.card(card('end', 'a'));
    expect(t.done).toBe(false);
  });
});

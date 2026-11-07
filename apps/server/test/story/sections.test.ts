import { type ArcStory, storyArc } from '@wdi/content';
import type { ColyseusTestServer } from '@colyseus/testing';
import { Phase } from '@wdi/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { unitsOf } from '../../src/sim/story/units';
import { bootAutoServer } from '../autoHelpers';
import { humanRole, humanSeat, humanSeatCount, play, startStoryRoom } from './fixture';

// Sections (docs/story/arc.md E1, E7; GDD 3.34): a chapter is sections in order. The first opens with the chapter's
// card, a later one with its own; a break inside a chapter is a handover with no end card unless the section names
// one; the chapter's last section ends with the chapter's end card. A `say` is spoken by the seat holding a card.

let colyseus: ColyseusTestServer;
beforeAll(async () => {
  colyseus = await bootAutoServer();
});
afterAll(async () => colyseus.shutdown());

const REAL = storyArc.stories.hollowmere_winter!;
const ID = 'sections_probe';

/** The real story's Baker and Watchman as two sections of one chapter, short enough to play whole. */
function probe(): ArcStory {
  const [baker, watchman] = REAL.chapters[0]!.sections;
  const short = (s: NonNullable<typeof baker>, extra: ArcStory['chapters'][0]['sections'][0]['beats']) => {
    const { endCard: _drop, ...rest } = s;
    return {
      ...rest,
      goals: [{ id: 'g1', text: 'Wait a moment', trigger: { tick: 10 } }],
      beats: extra,
      end: { tick: 40 },
    };
  };
  const chapter = REAL.chapters[0]!;
  return {
    ...REAL,
    id: ID,
    chapters: [
      {
        ...chapter,
        id: 'probe_chapter',
        title: 'Probe Chapter',
        sections: [
          short(baker!, [
            {
              id: 'said',
              trigger: { tick: 0 },
              action: {
                seq: [
                  { say: { text: 'The watch is awake.', by: 'watchman' } },
                  { say: { text: 'Moll sees it all.', speaker: 'Mother Moll', portrait: 'villager' } },
                ],
              },
              oncePerChapter: true,
            },
          ]),
          short(watchman!, [
            {
              id: 'watch',
              trigger: { tick: 0 },
              action: { card: 'beat', line: 'The second section.' },
              oncePerChapter: true,
            },
          ]),
        ],
      },
    ],
  };
}

describe('unitsOf', () => {
  it('flattens chapters into sections in play order, marking the first and last of each chapter', () => {
    const units = unitsOf(REAL);
    expect(units.map((u) => u.id)).toEqual(REAL.chapters.flatMap((c) => c.sections.map((s) => s.id)));
    for (const ch of REAL.chapters) {
      const own = units.filter((u) => u.chapter === ch);
      expect(own.map((u) => u.first)).toEqual(own.map((_, i) => i === 0));
      expect(own.map((u) => u.last)).toEqual(own.map((_, i) => i === own.length - 1));
      expect(own.at(-1)!.endCard).toBe(ch.end); // the chapter's end card sits on its last section
    }
    expect(units[0]!.startPhase).toEqual(REAL.chapters[0]!.startPhase);
  });
});

describe('sections in a room', () => {
  it('opens with the chapter card, hands over with no card between two sections, ends with the chapter card', async () => {
    storyArc.stories[ID] = probe();
    try {
      const sr = await startStoryRoom(colyseus, { storyId: ID });
      const roles: string[] = [];
      const res = play(sr, {
        maxTicks: 4000,
        policy: () => {
          const r = humanRole(sr);
          if (roles.at(-1) !== r) roles.push(r);
        },
      });
      expect(res.finished).toBe(true);
      expect(roles).toEqual(['baker', 'watchman']);
      expect(humanSeatCount(sr)).toBe(1);

      const cards = sr.cards.map((c) => c.card);
      const titles = cards.filter((c) => c.kind === 'title');
      expect(titles.map((c) => c.title)).toEqual(['Probe Chapter', probe().chapters[0]!.sections[1]!.title]);
      expect(cards.filter((c) => c.kind === 'end')).toHaveLength(1); // the chapter's, none between its sections
      expect(cards.at(-1)!.kind).toBe('end');
      const order = cards.map((c) => (c.kind === 'beat' ? c.lines[0] : c.kind));
      expect(order.indexOf('The second section.')).toBeGreaterThan(order.indexOf('title'));
      expect(order.indexOf('end')).toBeGreaterThan(order.indexOf('The second section.'));

      const chapterEnds = sr.events.filter((e) => e.kind === 'story.chapterEnd');
      expect(chapterEnds.map((e) => e.data?.chapter)).toEqual(probe().chapters[0]!.sections.map((s) => s.id));
      expect(chapterEnds.every((e) => e.data?.failed === false)).toBe(true);
    } finally {
      delete storyArc.stories[ID];
    }
  });

  it('speaks a line as the seat that holds the card, under its public name and look', async () => {
    storyArc.stories[ID] = probe();
    try {
      const sr = await startStoryRoom(colyseus, { storyId: ID });
      play(sr, { maxTicks: 600, until: (r) => r.cards.some((c) => c.card.lines[0] === 'Moll sees it all.') });
      const lines = sr.cards.map((c) => c.card).filter((c) => c.kind === 'beat');
      const watch = lines.find((c) => c.lines[0] === 'The watch is awake.')!;
      const holder = [...sr.room.state.players.values()].find((p) => p.priv.role.roleId === 'watchman')!;
      expect(humanSeat(sr)).not.toBe([...sr.room.state.players].find(([, p]) => p === holder)![0]);
      expect(watch.title).toBe(holder.name);
      expect(watch.portrait).toBe(holder.look || 'watchman'); // the card's look before the deal publishes looks
      const moll = lines.find((c) => c.lines[0] === 'Moll sees it all.')!;
      expect([moll.title, moll.portrait]).toEqual(['Mother Moll', 'villager']);
      expect(sr.room.state.phase).not.toBe(Phase.lobby);
    } finally {
      delete storyArc.stories[ID];
    }
  });
});

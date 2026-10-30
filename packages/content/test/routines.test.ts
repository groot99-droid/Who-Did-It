import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  content,
  interactions,
  routines,
  RoutinesFile,
  SCENE_IDS,
  scenes,
  validateContent,
  type Content,
} from '../src/index.js';
import { dataDir } from './helpers.js';

// NPC routines (GDD 3.12, round-5 npc/data.md 1-2 and tests.md 8): the shipped file, one broken copy per validator
// rule with its exact message, and the classification of every prop kind of today's 15 scenes.

function broken(edit: (c: Content) => void): string[] {
  const copy = structuredClone(content);
  edit(copy);
  return validateContent(copy);
}

const has = (msg: string) => expect.arrayContaining([msg]);

/** data.md section 1: the activity (or `ignore`) of every prop kind on 2026-10-17. */
const TABLE: Record<string, 'work' | 'trade' | 'social' | 'rest' | 'ignore'> = {
  taskSource: 'work',
  pump: 'work',
  flourBin: 'work',
  oven: 'work',
  basin: 'work',
  goat: 'work',
  fence: 'work',
  window: 'work',
  noticeBoard: 'social',
  dartboard: 'social',
  bell: 'social',
  decor: 'social',
  lamp: 'social',
  lanternPost: 'rest',
  kitChest: 'ignore',
  teachingClue: 'ignore',
  keyCache: 'ignore',
  gasPocket: 'ignore',
  lockedDoor: 'ignore',
  wakeTable: 'ignore',
  plate: 'ignore',
  deadLoaf: 'ignore',
  ledger: 'trade', // round 10, C2b: the Clerk's labour errand, worked while a seat owes the line
  // Round 8 (8J, 8K): set dressing is scenery, never a station; its art resolves by id tail (SPRITES 3).
  dressing: 'ignore',
  // Round 8 (GDD 3.23, 8D): the economy statics are no NPC station.
  altar: 'ignore',
  mailbag: 'ignore',
  rack: 'ignore',
  hq: 'ignore',
  blackMarket: 'ignore',
  counter: 'trade', // round 10, D1
  bank: 'ignore',
  // Round 10 (A7, GDD 3.32): a seat sleeps in a bed; no NPC works one.
  bed: 'ignore',
  cot: 'ignore',
  innBed: 'ignore',
};

function classOf(kind: string): string | undefined {
  if (routines.ignore.includes(kind)) return 'ignore';
  return Object.entries(routines.activities).find(([, a]) => a.kinds.includes(kind))?.[0];
}

describe('routines.json (GDD 3.12)', () => {
  it('C1: the shipped file parses and validates', () => {
    const raw: unknown = JSON.parse(readFileSync(`${dataDir}routines.json`, 'utf8'));
    expect(RoutinesFile.safeParse(raw).success).toBe(true);
    const errors = validateContent(content);
    expect(errors.filter((e) => e.includes('routines.json') || e.includes('npc.'))).toEqual([]);
  });

  it('holds the logic table on gather classes and the shop on counters (D1), and lights an exterior with lantern posts', () => {
    // Round 10 (D1): the holds name class ids of interactions.json as well as prop kinds.
    expect(new Set(Object.values(routines.holds))).toEqual(new Set(['interact', 'shop', 'errand'])); // C2b
    for (const key of Object.keys(routines.holds)) expect(interactions.classes[key], key).toBeDefined();
    expect(routines.lightKinds).toEqual(['lanternPost']);
    expect(routines.phaseClasses).toEqual({
      day: ['grace', 'day', 'immunity'],
      night: ['dusk', 'night', 'finalNight'],
    });
    expect(routines.activities.work?.phases).toEqual(['day']);
    expect(routines.activities.social?.phases).toEqual(['day', 'night']);
    expect(routines.activities.rest?.phases).toEqual(['night']);
  });

  it("C3: every prop kind of today's 15 scenes is classified as data.md section 1 says", () => {
    for (const [kind, expected] of Object.entries(TABLE)) expect(classOf(kind), kind).toBe(expected);
    for (const id of SCENE_IDS.slice(0, 15)) {
      for (const prop of scenes[id].props) {
        expect(TABLE[prop.kind], `${id} ${prop.id} (${prop.kind})`).toBeDefined();
        expect(classOf(prop.kind), `${id} ${prop.id}`).toBe(TABLE[prop.kind]);
      }
    }
  });

  it('the npc rows have one weights row per phase class, each summing to 1', () => {
    const { weights } = content.balance.npc.routine;
    expect(Object.keys(weights).sort()).toEqual(Object.keys(routines.phaseClasses).sort());
    for (const row of Object.values(weights)) expect(row.work + row.stroll + row.idle).toBeCloseTo(1, 9);
  });
});

describe('C2: validateContent rejects (routines)', () => {
  it('rule 1: a world phase in no class, and one in both', () => {
    expect(
      broken((c) => {
        c.routines.phaseClasses.day = ['day', 'immunity'];
      }),
    ).toEqual(has('routines.json phaseClasses: grace is in no class'));
    expect(
      broken((c) => {
        c.routines.phaseClasses.day.push('dusk');
      }),
    ).toEqual(has('routines.json phaseClasses: dusk is in both classes'));
  });

  it('rule 2: a kind in two activities, and one in an activity and ignore', () => {
    expect(
      broken((c) => {
        c.routines.activities.social!.kinds.push('pump');
      }),
    ).toEqual(has('routines.json: kind "pump" is listed twice'));
    expect(
      broken((c) => {
        c.routines.ignore.push('bell');
      }),
    ).toEqual(has('routines.json: kind "bell" is listed twice'));
  });

  it('rule 3: a scene prop of an unclassified kind', () => {
    expect(
      broken((c) => {
        c.scenes.overworld.props.find((p) => p.id === 'ov.pump')!.kind = 'foundry';
      }),
    ).toEqual(has('routines.json: prop kind "foundry" (ov.pump) is neither a station nor ignored'));
  });

  it('rule 4: a holds key that is not a station kind, and an unknown light kind', () => {
    expect(
      broken((c) => {
        c.routines.holds.kitChest = 'task';
      }),
    ).toEqual(has('routines.json holds: "kitChest" is not a station kind'));
    expect(
      broken((c) => {
        c.routines.lightKinds.push('moonstone');
      }),
    ).toEqual(has('routines.json lightKinds: "moonstone" is unknown'));
  });

  it('rule 5: a station prop with no floor tile next to it', () => {
    expect(
      broken((c) => {
        const oven = c.scenes.bakery.props.find((p) => p.id === 'bk.oven')!;
        oven.x = 0;
        oven.y = 0;
      }),
    ).toEqual(has('scene bakery: station bk.oven has no floor tile next to it'));
  });

  it('rule 6: a span with min > max, and a weights row summing to 0.9', () => {
    expect(
      broken((c) => {
        c.balance.npc.routine.idleS = { min: 9, max: 2 };
      }),
    ).toEqual(has('balance.json npc.routine.idleS: min > max'));
    expect(
      broken((c) => {
        c.balance.npc.vote.windowFrac = { min: 0.9, max: 0.3 };
      }),
    ).toEqual(has('balance.json npc.vote.windowFrac: min > max'));
    expect(
      broken((c) => {
        c.balance.npc.routine.weights.day.idle = 0.1;
      }),
    ).toEqual(has('balance.json npc.routine.weights.day: weights sum to 0.9'));
  });
});

describe('RoutinesFile rejects', () => {
  it('an unknown hold, an unknown world phase and an unknown field', () => {
    const raw = structuredClone(routines) as unknown as Record<string, unknown>;
    expect(RoutinesFile.safeParse({ ...raw, holds: { pump: 'dance' } }).success).toBe(false);
    expect(
      RoutinesFile.safeParse({ ...raw, phaseClasses: { day: ['dawn'], night: ['night'] } }).success,
    ).toBe(false);
    expect(RoutinesFile.safeParse({ ...raw, extra: 1 }).success).toBe(false);
  });
});

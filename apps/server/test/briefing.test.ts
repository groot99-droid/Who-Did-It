import type { ColyseusTestServer } from '@colyseus/testing';
import { balance, roles } from '@wdi/content';
import { ClueKind, Phase, S2C, TICK_RATE } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { applyEffect, ensureBody } from '../src/sim/body';
import { removeClue, spawnClue } from '../src/sim/Clues';
import { matchEvents } from '../src/sim/auto/log';
import { briefingLine, briefingsOf } from '../src/sim/law/Briefing';
import { figuresOf } from '../src/sim/townsfolk/figures';
import {
  type Party,
  advance,
  allTownsfolk,
  bootNpcServer,
  holdPhase,
  lobbyOf,
  pauseClock,
  start,
  toWorld,
} from './npcHelpers';

/**
 * The Constables' briefing (round 10, B2; GDD 3.31; seams.md 3 row 8): `law.briefingAfterS` after a collectible
 * clue appears, every client gets the same public line naming the clue's kind, its scene and, for an "anyone" clue,
 * its trait; never a seat, a handle, a card, a role's reading, or Forged or Verified.
 */

const S = (s: number): number => Math.round(s * TICK_RATE);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootNpcServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

/** Two humans by day on HollowMere, every card a Townsfolk. */
async function world(): Promise<Party> {
  const party = await lobbyOf(colyseus, 2);
  await start(party);
  await toWorld(party);
  pauseClock(party.room);
  allTownsfolk(party.room);
  holdPhase(party, Phase.day, 3600);
  advance(party, 1);
  return party;
}

const briefings = (party: Party, i: number): string[] =>
  party.humans[i]!.log.filter(
    (m) =>
      m.type === S2C.chatMsg &&
      (m.payload as { channel?: string }).channel === 'system' &&
      (m.payload as { text: string }).text.startsWith("Constables' briefing"),
  ).map((m) => (m.payload as { text: string }).text);

const clue = (party: Party, kind: number, value: number, tx = 4) =>
  spawnClue(party.room, 'bakery', { kind, value, dir: 0, tx, ty: 4 })!;

/** Steps past the briefing window and lets the messages arrive. */
async function pastWindow(party: Party): Promise<void> {
  advance(party, S(balance.law.briefingAfterS) + 2);
  await sleep(150);
}

describe("the Constables' briefing (GDD 3.31)", () => {
  it('posts the same line to every client at law.briefingAfterS, naming the kind, the scene and the trait', async () => {
    const party = await world();
    const id = clue(party, ClueKind.footprints, 2);
    advance(party, S(balance.law.briefingAfterS) - 2);
    await sleep(100);
    expect(briefings(party, 0)).toEqual([]);
    advance(party, 3);
    await sleep(150);
    const line = "Constables' briefing: footprints in Crumb's Ovens, tall.";
    expect(briefingLine({ sceneId: 'bakery', kind: ClueKind.footprints, value: 2 }, true)).toBe(line);
    expect(briefings(party, 0)).toEqual([line]);
    expect(briefings(party, 1)).toEqual(briefings(party, 0));
    expect(briefingsOf(party.room).map((b) => b.line)).toEqual([line]);
    // The event carries the clue, its kind, its scene and its trait: no seat, no maker.
    const event = matchEvents(party.room).find((e) => e.kind === 'briefing')!;
    expect(event.seat).toBeUndefined();
    expect(event).toMatchObject({
      sceneId: 'bakery',
      data: { clueId: id, kind: ClueKind.footprints, trait: 'tall' },
    });
    // Never a seat id, a name, a handle, a card, Forged or Verified.
    const lower = line.toLowerCase();
    for (const [sid, p] of party.room.state.players) {
      expect(line).not.toContain(sid);
      expect(line).not.toContain(p.name);
      if (p.priv.avatar) expect(line).not.toContain(p.priv.avatar);
    }
    for (const role of Object.values(roles.roles)) expect(lower).not.toContain(role.id);
    for (const word of ['forged', 'verified', 'planted']) expect(lower).not.toContain(word);
  });

  it("briefs a role's clue by kind and place only, never its reading", () => {
    // The snagged felt's hat is the Detective's to read (GDD 3.4 Reader).
    expect(briefingLine({ sceneId: 'bakery', kind: ClueKind.felt, value: 1 }, true)).toBe(
      "Constables' briefing: snagged felt in Crumb's Ovens.",
    );
    expect(briefingLine({ sceneId: 'overworld', kind: ClueKind.fur, value: 0 }, true)).toBe(
      "Constables' briefing: fur in HollowMere.",
    );
  });

  it('briefs nothing for a clue gone or collected before its time', async () => {
    const party = await world();
    const gone = clue(party, ClueKind.footprints, 2, 3);
    const taken = clue(party, ClueKind.thread, 0, 6);
    advance(party, 2);
    removeClue(party.room, gone);
    party.room.state.scenes.get('bakery')!.clues.get(taken)!.claimed = true;
    await pastWindow(party);
    expect(briefings(party, 0)).toEqual([]);
  });

  it('never briefs a kind no one can collect, and posts the same words once per window', async () => {
    const party = await world();
    spawnClue(party.room, 'bakery', {
      kind: ClueKind.hungerPrints,
      value: 2,
      dir: 0,
      tx: 3,
      ty: 3,
      decayS: null,
    });
    clue(party, ClueKind.footprints, 2, 4);
    clue(party, ClueKind.footprints, 2, 5);
    await pastWindow(party);
    expect(briefings(party, 0)).toHaveLength(1);
  });

  it('posts while a Constable is knocked out, and stops while none is alive', async () => {
    const party = await world();
    for (const f of figuresOf(party.room).values()) {
      if (f.kind === 'constable')
        applyEffect(party.room, f.id, ensureBody(party.room, f.id, true), 'knockedOut');
    }
    clue(party, ClueKind.thread, 0);
    await pastWindow(party);
    expect(briefings(party, 0)).toHaveLength(1);
    for (const f of figuresOf(party.room).values()) if (f.kind === 'constable') f.dead = true;
    clue(party, ClueKind.thread, 1);
    await pastWindow(party);
    expect(briefings(party, 0)).toHaveLength(1);
  });
});

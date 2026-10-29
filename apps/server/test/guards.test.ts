import type { ColyseusTestServer } from '@colyseus/testing';
import { balance, looks } from '@wdi/content';
import { Phase, TICK_RATE, TILE_PX } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { avatarOf } from '../src/sim/Avatars';
import { runInvariants } from '../src/sim/auto/invariants';
import { bodyOf, handleBodyAbility, hasEffect, setBodyRng } from '../src/sim/body';
import { isGuard } from '../src/sim/law/Guards';
import { simOf } from '../src/sim/RoomSim';
import { type Figure, figuresOf } from '../src/sim/townsfolk/figures';
import { sceneIndex, sceneKey } from '../src/sim/World';
import {
  type Party,
  advance,
  allTownsfolk,
  bootNpcServer,
  holdPhase,
  lobbyOf,
  pauseClock,
  placeSeat,
  setRole,
  start,
  toWorld,
} from './npcHelpers';

/**
 * The guard figures (round 10, B1; GDD 3.24 and 3.31, F4 2.2): two Constables on every map and the Company Clerk,
 * each keeping a post within `guard.leashTiles`, with health, fighting back when struck. They read only who struck
 * them, never a card, and a Constable's look is its own: never a card's and never the villager family's.
 */

const S = (s: number): number => Math.round(s * TICK_RATE);
const never = (): number => 0.999;
const leashPx = balance.guard.leashTiles * TILE_PX;

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootNpcServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

/** One human and three NPC seats by day on HollowMere, every card a Townsfolk, the body's chances never rolling. */
async function world(): Promise<Party> {
  const party = await lobbyOf(colyseus, 1);
  await start(party);
  await toWorld(party);
  pauseClock(party.room);
  allTownsfolk(party.room);
  holdPhase(party, Phase.day, 3600);
  setBodyRng(party.room, never);
  advance(party, 1);
  return party;
}

const guardsOf = (party: Party): Figure[] => [...figuresOf(party.room).values()].filter(isGuard);
const constables = (party: Party): Figure[] => guardsOf(party).filter((f) => f.kind === 'constable');
/** A guard's post: the first stand of its first station. */
const postOf = (f: Figure) => {
  const s = f.stations[0]!;
  const stand = s.stands[0]!;
  return { idx: sceneIndex(s.scene), x: (stand.x + 0.5) * TILE_PX, y: (stand.y + 0.5) * TILE_PX };
};
const onLeash = (f: Figure): boolean => {
  const post = postOf(f);
  return f.sceneIdx === post.idx && Math.hypot(f.x - post.x, f.y - post.y) <= leashPx + TILE_PX;
};
/** Stands the human one tile from the guard, in its scene. */
function besideGuard(party: Party, f: Figure): string {
  const human = party.humans[0]!.id;
  placeSeat(party, human, sceneKey(f.sceneIdx), Math.floor(f.x / TILE_PX) + 1, Math.floor(f.y / TILE_PX));
  return human;
}
const strike = (party: Party, id: string, f: Figure): void =>
  handleBodyAbility(party.room, id, { abilityId: 'strike', targetId: f.handle });

describe('guard figures (GDD 3.24, 3.31)', () => {
  it('spawns two Constables and the Clerk as guards beyond the townsfolk count, each on its own leash', async () => {
    const party = await world();
    const room = party.room;
    const all = [...figuresOf(room).values()];
    const guards = guardsOf(party);
    expect(constables(party)).toHaveLength(2);
    expect(guards.map((f) => f.kind).sort()).toEqual(['clerk', 'constable', 'constable']);
    expect(all.length - guards.length).toBe(balance.townsfolk.count[simOf(room).profile]);
    for (const f of constables(party)) {
      const avatar = avatarOf(room, f.handle as string)!;
      expect(avatar.lookOf).toBe('constable');
      expect(avatar.seat).toBe('');
      expect(Object.keys(looks.looks)).not.toContain(avatar.lookOf);
      expect(Object.keys(looks.villagers)).not.toContain(avatar.lookOf);
    }
    // The two Constables keep different posts; every guard's route lies in its post's scene within the leash.
    const [c1, c2] = constables(party);
    expect(c1!.stations[0]!.propId).not.toBe(c2!.stations[0]!.propId);
    for (const f of guards) {
      const first = f.stations[0]!;
      for (const s of f.stations) {
        expect(s.scene).toBe(first.scene);
        expect(Math.hypot(s.x - first.x, s.y - first.y)).toBeLessThanOrEqual(balance.guard.leashTiles);
      }
      expect(f.home).toBe(first.scene);
    }
    expect(runInvariants(room).filter((x) => x.name === 'figureNotSeat')).toEqual([]);
  });

  it('keeps to its post by day and by night', async () => {
    const party = await world();
    let off = 0;
    advance(party, S(240), () => {
      for (const f of guardsOf(party)) if (!onLeash(f)) off++;
    });
    holdPhase(party, Phase.night, 3600);
    advance(party, S(120), () => {
      for (const f of guardsOf(party)) if (!onLeash(f)) off++;
    });
    expect(off).toBe(0);
    for (const f of guardsOf(party)) expect(f.act?.kind).toBe('home');
  });

  it('takes a fist on its body and fights back while the striker stays on its leash', async () => {
    const party = await world();
    const room = party.room;
    const f = constables(party)[0]!;
    const human = besideGuard(party, f);
    strike(party, human, f);
    expect(bodyOf(room, f.id)!.hp).toBe(balance.body.maxHp - balance.body.damage.strike.dmg);
    advance(party, S(2));
    expect(bodyOf(room, human)!.hp).toBeLessThan(balance.body.maxHp);
    // Out of the leash, it lets the striker go and walks back to its post.
    const hp = bodyOf(room, human)!.hp;
    const post = postOf(f);
    placeSeat(
      party,
      human,
      sceneKey(post.idx),
      Math.floor(post.x / TILE_PX) + balance.guard.leashTiles + 4,
      Math.floor(post.y / TILE_PX),
    );
    advance(party, S(10));
    expect(bodyOf(room, human)!.hp).toBeGreaterThanOrEqual(hp);
    expect(onLeash(f)).toBe(true);
  });

  it('is knocked out at zero health, stands down, and gets up again', async () => {
    const party = await world();
    const room = party.room;
    const f = constables(party)[0]!;
    const human = besideGuard(party, f);
    bodyOf(room, f.id)!.hp = 1;
    strike(party, human, f);
    expect(hasEffect(bodyOf(room, f.id)!, 'knockedOut')).toBe(true);
    const x = f.x;
    advance(party, S(3));
    expect(bodyOf(room, human)!.hp).toBe(balance.body.maxHp);
    expect(f.x).toBe(x);
    advance(party, S(balance.body.koS + 1));
    expect(hasEffect(bodyOf(room, f.id)!, 'knockedOut')).toBe(false);
  });

  it('reads who struck it, never a card: a Killer and a Townsfolk take the same blows', async () => {
    const taken: number[][] = [];
    for (const roleId of ['townsfolk', 'killer']) {
      const party = await world();
      const room = party.room;
      const f = constables(party)[0]!;
      const human = besideGuard(party, f);
      setRole(room, human, roleId);
      strike(party, human, f);
      const hp: number[] = [];
      advance(party, S(4), () => hp.push(bodyOf(room, human)!.hp));
      taken.push(hp);
    }
    expect(taken[0]).toEqual(taken[1]);
  });
});

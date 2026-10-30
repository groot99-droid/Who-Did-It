import type { ColyseusTestServer } from '@colyseus/testing';
import { balance } from '@wdi/content';
import { PairPhase, Phase, TICK_RATE, TILE_PX } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { isGuard } from '../src/sim/law/Guards';
import { handlePairAnswer, handlePairAsk, pairedWith, pairingMemory, shielded } from '../src/sim/law/Pairing';
import { simOf } from '../src/sim/RoomSim';
import { type Figure, figuresOf } from '../src/sim/townsfolk/figures';
import { sceneIndex, sceneKey } from '../src/sim/World';
import {
  type Party,
  advance,
  allTownsfolk,
  bootNpcServer,
  errors,
  holdPhase,
  lobbyOf,
  pauseClock,
  placeSeat,
  start,
  toWorld,
} from './npcHelpers';

/**
 * Walk with me (round 10, B8a; GDD 3.31, `world-mode.md` 3.1 and R6; seams.md 3 row 10): an ask at night, one drawn
 * delay for every answer, a human's prompt held to it, an NPC's yes on the roll, a guard's no, the follow, the
 * shield against a third party only, and the ends.
 */

const S = (s: number): number => Math.round(s * TICK_RATE);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const maxTicks = S(balance.pairing.answerS.max) + 1;

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootNpcServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

/** Two humans at night on HollowMere, side by side in the cellar. */
async function night(): Promise<Party> {
  const party = await lobbyOf(colyseus, 2);
  await start(party);
  await toWorld(party);
  pauseClock(party.room);
  allTownsfolk(party.room);
  holdPhase(party, Phase.night, 3600);
  const [a, b] = party.humans.map((h) => h.id) as [string, string];
  placeSeat(party, a, 'cellar', 4, 4);
  placeSeat(party, b, 'cellar', 5, 4);
  advance(party, 1);
  return party;
}

const priv = (party: Party, id: string) => party.room.state.players.get(id)!.priv;
const handleOf = (party: Party, id: string) => priv(party, id).avatar;
const ids = (party: Party) => party.humans.map((h) => h.id) as [string, string];
/** A villager, stood beside the first human in the cellar. */
function villagerBeside(party: Party): Figure {
  const f = [...figuresOf(party.room).values()].find((x) => !isGuard(x) && x.kind !== 'constable')!;
  f.sceneIdx = sceneIndex('cellar');
  f.x = 4.5 * TILE_PX;
  f.y = 5.5 * TILE_PX;
  advance(party, 1); // re-handled into the cellar by its tick
  return f;
}

describe('Walk with me (GDD 3.31)', () => {
  it('holds a human answer until the drawn delay, then pairs both; the handles are handles, never seat ids', async () => {
    const party = await night();
    const [a, b] = ids(party);
    handlePairAsk(party.room, a, { targetId: handleOf(party, b) });
    const ask = pairingMemory(party.room).asks.get(a)!;
    const span = ask.dueTick - party.room.state.tick;
    expect(span).toBeGreaterThanOrEqual(S(balance.pairing.answerS.min) - 1);
    expect(span).toBeLessThanOrEqual(maxTicks);
    advance(party, 1);
    expect(priv(party, a).pair.state).toBe(PairPhase.asking);
    expect(priv(party, b).pair.state).toBe(PairPhase.asked);
    expect(priv(party, b).pair.handle).toBe(handleOf(party, a));
    handlePairAnswer(party.room, b, { yes: true });
    advance(party, 1);
    expect(priv(party, a).pair.state).toBe(PairPhase.asking); // held until the delay
    advance(party, maxTicks);
    expect(priv(party, a).pair.state).toBe(PairPhase.paired);
    expect(priv(party, b).pair.state).toBe(PairPhase.paired);
    for (const id of [a, b]) {
      expect(priv(party, id).pair.handle).not.toBe(a);
      expect(priv(party, id).pair.handle).not.toBe(b);
    }
    expect(pairedWith(party.room, a)).toBe(b);
    // A partner elsewhere: the handle empties, and the pair ends after `apartS`.
    placeSeat(party, b, 'overworld', 30, 20);
    advance(party, 2);
    expect(priv(party, a).pair.handle).toBe('');
    expect(pairedWith(party.room, a)).toBeNull();
    advance(party, S(balance.pairing.apartS) + 1);
    expect(priv(party, a).pair.state).toBe(PairPhase.none);
  });

  it('a silent prompt is a no at the delay; a no shows the asker the declined line and the target nothing', async () => {
    const party = await night();
    const [a, b] = ids(party);
    handlePairAsk(party.room, a, { targetId: handleOf(party, b) });
    advance(party, maxTicks + 1);
    expect(priv(party, a).pair.state).toBe(PairPhase.declined);
    expect(priv(party, b).pair.state).toBe(PairPhase.none);
  });

  it('refuses by day and while already asking; a busy target answers no at the delay, never with a refusal', async () => {
    const party = await night();
    const [a, b] = ids(party);
    holdPhase(party, Phase.day, 3600);
    advance(party, 1);
    handlePairAsk(party.room, a, { targetId: handleOf(party, b) });
    holdPhase(party, Phase.night, 3600);
    advance(party, 1);
    handlePairAsk(party.room, a, { targetId: handleOf(party, b) });
    handlePairAsk(party.room, a, { targetId: handleOf(party, b) });
    await sleep(150);
    expect(errors(party.humans[0]!)).toHaveLength(2); // the day's PHASE_CLOSED and the second ask's BUSY
    // b, already asked, asks nobody's leave: a third seat's ask on b would be blocked; here b asks a, who is asking.
    handlePairAsk(party.room, b, { targetId: handleOf(party, a) });
    await sleep(150);
    expect(errors(party.humans[1]!)).toHaveLength(0);
    expect(pairingMemory(party.room).asks.get(b)?.blocked).toBe(true);
    advance(party, maxTicks + 1);
    expect(priv(party, b).pair.state).toBe(PairPhase.declined);
  });

  it('a townsperson says yes on the roll and follows; a guard always says no', async () => {
    const party = await night();
    const [a] = ids(party);
    const f = villagerBeside(party);
    handlePairAsk(party.room, a, { targetId: f.handle });
    pairingMemory(party.room).asks.get(a)!.roll = 0;
    advance(party, maxTicks + 1);
    expect(pairedWith(party.room, a)).toBe(f.id);
    expect(priv(party, a).pair.handle).toBe(f.handle);
    placeSeat(party, a, 'cellar', 10, 4);
    advance(party, S(8));
    expect(f.sceneIdx).toBe(sceneIndex('cellar'));
    const p = simOf(party.room).players.get(a)!;
    expect(Math.hypot(f.x - p.x, f.y - p.y)).toBeLessThanOrEqual(
      (balance.pairing.followTiles + 0.5) * TILE_PX,
    );
    // A guard, asked with a sure roll, keeps its post.
    const [, b] = ids(party);
    const guard = [...figuresOf(party.room).values()].find((x) => x.kind === 'constable')!;
    placeSeat(
      party,
      b,
      sceneKey(guard.sceneIdx),
      Math.floor(guard.x / TILE_PX) + 1,
      Math.floor(guard.y / TILE_PX),
    );
    advance(party, 1);
    handlePairAsk(party.room, b, { targetId: guard.handle });
    pairingMemory(party.room).asks.get(b)!.roll = 0;
    advance(party, maxTicks + 1);
    expect(pairedWith(party.room, b)).toBeNull();
    expect(priv(party, b).pair.state).toBe(PairPhase.declined);
  });

  it('shields a seat from a third party only, while the partner shares its scene; dawn ends every pair', async () => {
    const party = await night();
    const [a] = ids(party);
    const f = villagerBeside(party);
    handlePairAsk(party.room, a, { targetId: f.handle });
    pairingMemory(party.room).asks.get(a)!.roll = 0;
    advance(party, maxTicks + 1);
    expect(shielded(party.room, a, 'someone-else')).toBe(true);
    expect(shielded(party.room, a, f.id)).toBe(false); // no shield against the partner itself
    holdPhase(party, Phase.day, 3600);
    advance(party, 1);
    expect(pairedWith(party.room, a)).toBeNull();
    expect(priv(party, a).pair.state).toBe(PairPhase.none);
  });
});

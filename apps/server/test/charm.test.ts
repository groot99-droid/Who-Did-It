import type { ColyseusTestServer } from '@colyseus/testing';
import { EffectId, Phase, TILE_PX } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { matchEvents } from '../src/sim/auto/log';
import { bodyOf, grantCharm, hasEffect, setBodyRng } from '../src/sim/body';
import { handleKill } from '../src/sim/Kill';
import { simOf } from '../src/sim/RoomSim';
import { sceneKey } from '../src/sim/World';
import {
  type Party,
  advance,
  allTownsfolk,
  bootNpcServer,
  holdPhase,
  lobbyOf,
  pauseClock,
  placeSeat,
  send,
  setRole,
  start,
  toWorld,
} from './npcHelpers';

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootNpcServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

/** Two humans and two NPC seats, all Townsfolk, by night; the second human holds the Knife beside the first. */
async function knifeParty(): Promise<{ party: Party; victim: string; killer: string }> {
  const party = await lobbyOf(colyseus, 2);
  for (let i = 0; i < 2; i++) await send(party.humans[0]!, 'lobby.addNpc', {}, 40);
  await start(party);
  await toWorld(party);
  pauseClock(party.room);
  allTownsfolk(party.room);
  setBodyRng(party.room, () => 0.999);
  holdPhase(party, Phase.night, 900);
  const victim = party.humans[0]!.id;
  const killer = party.humans[1]!.id;
  setRole(party.room, killer, 'killer');
  const p = simOf(party.room).players.get(victim)!;
  placeSeat(party, killer, sceneKey(p.sceneIdx), Math.floor(p.x / TILE_PX) + 1, Math.floor(p.y / TILE_PX));
  advance(party, 1);
  return { party, victim, killer };
}

function strike(party: Party, killer: string, victim: string): void {
  const room = party.room;
  room.state.players.get(killer)!.priv.cooldownEndTick.set('kill', 0);
  handleKill(room, killer, { abilityId: 'kill', targetId: room.state.players.get(victim)!.priv.avatar });
}

const wireIds = (party: Party, seat: string): number[] =>
  party.room.state.players.get(seat)!.priv.body.effects.map((e) => e.id);

describe('the well’s charm (GDD 3.22, Charmed; stations.md 4)', () => {
  it('is held silently: on the seat’s own private row only, no status bit, one at a time', async () => {
    const { party, victim } = await knifeParty();
    const room = party.room;
    const bitsBefore = room.state.players.get(victim)!.presence.statusBits;
    expect(grantCharm(room, victim)).toBe(true);
    expect(grantCharm(room, victim)).toBe(false);
    advance(party, 1);
    expect(wireIds(party, victim)).toContain(EffectId.charm);
    expect(room.state.players.get(victim)!.presence.statusBits).toBe(bitsBefore);
    for (const [id, player] of room.state.players)
      if (id !== victim) expect(player.priv.body.effects.map((e) => e.id)).not.toContain(EffectId.charm);
  });

  it('the first killing Knife strike spends it and leaves the seat Wounded at 1 health, as a voided strike; the next one kills', async () => {
    const { party, victim, killer } = await knifeParty();
    const room = party.room;
    grantCharm(room, victim);
    const before = matchEvents(room).length;
    strike(party, killer, victim);
    const p = simOf(room).players.get(victim)!;
    const body = bodyOf(room, victim)!;
    expect(p.dead).toBe(false);
    expect(body.hp).toBe(1);
    expect(hasEffect(body, 'wounded')).toBe(true);
    expect(hasEffect(body, 'charm')).toBe(false);
    // A strike was made, as for a Remedy: the Knife rests and the striker is bloody; no kill, no body, no death.
    expect(room.state.players.get(killer)!.priv.cooldownEndTick.get('kill')).toBeGreaterThan(room.state.tick);
    expect(simOf(room).players.get(killer)!.bloodyUntilTick).toBeGreaterThan(room.state.tick);
    const kinds = matchEvents(room)
      .slice(before)
      .map((e) => e.kind);
    expect(kinds).not.toContain('kill');
    expect(kinds).not.toContain('body.hit');
    expect(simOf(room).deaths.find((d) => d.playerId === victim)).toBeUndefined();
    advance(party, 1);
    expect(wireIds(party, victim)).not.toContain(EffectId.charm);
    strike(party, killer, victim);
    expect(p.dead).toBe(true);
    expect(simOf(room).deaths.find((d) => d.playerId === victim)).toMatchObject({
      cause: 'knife',
      killerId: killer,
    });
  });

  it('a Bandage voids the strike first, so the charm is kept for a strike that would kill', async () => {
    const { party, victim, killer } = await knifeParty();
    const room = party.room;
    grantCharm(room, victim);
    const p = simOf(room).players.get(victim)!;
    p.bandagedUntilTick = room.state.tick + 100;
    strike(party, killer, victim);
    const body = bodyOf(room, victim)!;
    expect(p.bandagedUntilTick).toBe(0);
    expect(hasEffect(body, 'charm')).toBe(true);
    expect(body.hp).toBe(body.maxHp);
  });
});

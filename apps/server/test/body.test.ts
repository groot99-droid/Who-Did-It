import type { ColyseusTestServer } from '@colyseus/testing';
import { balance, effects, mobs } from '@wdi/content';
import { EffectId, EffectState, Phase, TICK_RATE, TILE_PX } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PartyRoom } from '../src/rooms/PartyRoom';
import { matchEvents } from '../src/sim/auto/log';
import {
  bodies,
  bodyBlocksAct,
  bodyOf,
  bodySpeedPxPerTick,
  applyEffect,
  cureWith,
  hasEffect,
  hurt,
  hurtByCreature,
  setBodyRng,
} from '../src/sim/body';
import { StatusBit } from '../src/sim/constants';
import { handleKill } from '../src/sim/Kill';
import { speedPxPerTick } from '../src/sim/Movement';
import { simOf } from '../src/sim/RoomSim';
import { sceneKey } from '../src/sim/World';
import { until } from './flowHelpers';
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
  stateOf,
  toWorld,
} from './npcHelpers';

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootNpcServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

const b = balance.body;
const S = (s: number): number => Math.round(s * TICK_RATE);
const never = (): number => 0.999; // no chance lands
const always = (): number => 0; // every chance lands

/** Two humans and two NPC seats, every one a Townsfolk, by day on the test's own steps, with no creature near. */
async function party4(): Promise<Party> {
  const party = await lobbyOf(colyseus, 2);
  for (let i = 0; i < 2; i++) await send(party.humans[0]!, 'lobby.addNpc', {}, 40);
  await start(party);
  await toWorld(party);
  pauseClock(party.room);
  allTownsfolk(party.room);
  holdPhase(party, Phase.day, 900);
  setBodyRng(party.room, never);
  return party;
}
const me = (party: Party): string => party.humans[0]!.id;
const other = (party: Party): string => party.humans[1]!.id;
const sim = (party: Party, id: string) => simOf(party.room).players.get(id)!;
const presenceOf = (room: PartyRoom, id: string) => room.state.players.get(id)!.presence;
/** The `death` event of a seat (the phase stage drains `sim.deaths` on the tick they happen). */
const deathOf = (room: PartyRoom, id: string) =>
  matchEvents(room).find((e) => e.kind === 'death' && e.seat === id)?.data;

describe('bodies (GDD 3.22)', () => {
  it('deals every seat a whole body at Start, on its own Private.body only; the lobby has none', async () => {
    const party = await lobbyOf(colyseus, 2);
    advance(party, 1);
    expect(bodies(party.room).size).toBe(0);
    await start(party);
    await toWorld(party);
    pauseClock(party.room);
    advance(party, 1);
    const [a, c] = party.humans;
    for (const id of party.room.state.players.keys()) {
      expect(bodyOf(party.room, id)).toMatchObject({ hp: b.maxHp, stamina: b.maxStamina, figure: false });
      expect(party.room.state.players.get(id)!.priv.body.toJSON()).toEqual({
        hp: b.maxHp,
        maxHp: b.maxHp,
        stamina: b.maxStamina,
        maxStamina: b.maxStamina,
        effects: [],
      });
    }
    expect(await until(() => stateOf(a!).players.get(a!.id)?.priv?.body?.hp === b.maxHp)).toBe(true);
    expect(stateOf(a!).players.get(c!.id)!.priv).toBeUndefined();
    expect(stateOf(c!).players.get(a!.id)!.priv).toBeUndefined();
  });

  it('lands every row of the damage table: the damage, the effects by chance, body.hit, and the row’s cause at zero', async () => {
    const party = await party4();
    const room = party.room;
    const id = me(party);
    const body = bodyOf(room, id)!;
    // Fists and the mugging blow: small damage, Dazed and Weakened only when the chance lands.
    expect(hurt(room, id, b.damage.strike, { source: 'strike', by: other(party) })).toBe('hurt');
    expect(body.hp).toBe(b.maxHp - b.damage.strike.dmg);
    expect(body.effects.size).toBe(0);
    setBodyRng(room, always);
    expect(hurt(room, id, b.damage.mugging, { source: 'mugging' })).toBe('hurt');
    expect([...body.effects.keys()].sort()).toEqual(Object.keys(b.damage.mugging.effects).sort());
    // The slingshot always stuns: no move, no act, the `stunned` bit on the figure and nothing else public.
    expect(hurt(room, id, b.damage.slingshot, { source: 'slingshot' })).toBe('hurt');
    expect(hasEffect(body, 'stunned')).toBe(true);
    expect(bodyBlocksAct(room, id)).toBe(true);
    expect(bodySpeedPxPerTick(room, id, { seq: 1, dx: 1, dy: 0, sprint: true, sneak: false, tick: 0 })).toBe(
      0,
    );
    advance(party, 1);
    const bits = presenceOf(room, id).statusBits;
    expect(bits & StatusBit.stunned).toBe(StatusBit.stunned);
    expect(bits & StatusBit.dazed).toBe(StatusBit.dazed);
    expect(bits & (StatusBit.bleeding | StatusBit.poisoned | StatusBit.down)).toBe(0); // Weakened has no bit
    const hits = matchEvents(room).filter((e) => e.kind === 'body.hit');
    expect(hits.map((e) => e.data?.source)).toEqual(['strike', 'mugging', 'slingshot']);
    expect(hits[0]!.data).toMatchObject({
      target: id,
      by: other(party),
      dmg: b.damage.strike.dmg,
      effects: [],
    });
    // The creatures: each row's damage and effects; the wolf's death is `wolf`, any other creature's `creature`.
    const seats = [...room.state.players.keys()].filter((s) => s !== id);
    const victims: Record<string, string> = { wolf: seats[0]!, rat: seats[1]!, boar: seats[2]! };
    for (const [kind, seat] of Object.entries(victims)) {
      const def = mobs.mobs[kind]!;
      const v = bodyOf(room, seat)!;
      expect(hurtByCreature(room, seat, def)).toBe(false);
      expect(v.hp).toBe(b.maxHp - def.dmg);
      expect([...v.effects.keys()].sort()).toEqual(Object.keys(def.effects).sort());
      v.hp = 1;
      expect(hurtByCreature(room, seat, def)).toBe(true);
      expect(sim(party, seat).dead).toBe(true);
      expect(bodyOf(room, seat)).toBeUndefined(); // a ghost has no body
    }
    const deaths = simOf(room).deaths;
    expect(deaths.find((d) => d.playerId === victims.wolf)).toMatchObject({ cause: 'wolf' });
    expect(deaths.find((d) => d.playerId === victims.rat)).toMatchObject({ cause: 'creature' });
    expect(deaths.find((d) => d.playerId === victims.boar)).toMatchObject({ cause: 'creature' });
    expect(deaths.every((d) => d.killerId === undefined)).toBe(true);
    // The Knife is not a row: `hurt` never sees it, and a kill needs no health to be low.
    expect(b.damage).not.toHaveProperty('kill');
  });

  it('Bleeding drains health, blocks regeneration and stops at 1 health; a bandage stops it', async () => {
    const party = await party4();
    const room = party.room;
    const id = me(party);
    const body = bodyOf(room, id)!;
    applyEffect(room, id, body, 'bleeding');
    advance(party, S(10));
    expect(body.hp).toBeCloseTo(b.maxHp - effects.effects.bleeding.hpPerS! * 10, 0);
    expect(presenceOf(room, id).statusBits & StatusBit.bleeding).toBe(StatusBit.bleeding);
    expect(cureWith(room, id, body, 'bandage')).toEqual(['bleeding']);
    const hp = body.hp;
    advance(party, S(b.regenAfterS + 5));
    expect(body.hp).toBeGreaterThan(hp); // regeneration is back
    expect(
      matchEvents(room)
        .filter((e) => e.kind === 'body.effect')
        .map((e) => e.data?.on),
    ).toEqual([true, false]);
    // Left to bleed from low health: the drain stops at 1 health and the seat lives, Wounded (round 10, A6).
    const victim = other(party);
    const v = bodyOf(room, victim)!;
    v.hp = 2;
    applyEffect(room, victim, v, 'bleeding');
    advance(party, S(10));
    expect(sim(party, victim).dead).toBe(false);
    expect(v.hp).toBe(1);
    expect(hasEffect(v, 'wounded')).toBe(true);
    expect(deathOf(room, victim)).toBeUndefined();
  });

  it('Poisoned drains to 1 health at most and spreads Weakened by its chance', async () => {
    const party = await party4();
    const room = party.room;
    const id = me(party);
    const body = bodyOf(room, id)!;
    applyEffect(room, id, body, 'poisoned');
    advance(party, S(4));
    expect(body.hp).toBeCloseTo(b.maxHp - effects.effects.poisoned.hpPerS! * 4, 0);
    expect(hasEffect(body, 'weakened')).toBe(false);
    setBodyRng(room, always);
    advance(party, 1);
    expect(hasEffect(body, 'weakened')).toBe(true);
    body.hp = 1;
    advance(party, S(3));
    expect(sim(party, id).dead).toBe(false);
    expect(body.hp).toBe(1);
    expect(deathOf(room, id)).toBeUndefined();
  });

  it('health regenerates only after regenAfterS without a hit; Wounded follows the threshold', async () => {
    const party = await party4();
    const room = party.room;
    const id = me(party);
    const body = bodyOf(room, id)!;
    body.hp = b.woundedBelow - 1;
    hurt(room, id, { dmg: 0, effects: {}, kills: false }, { source: 'strike' });
    advance(party, 1);
    expect(hasEffect(body, 'wounded')).toBe(true);
    expect(presenceOf(room, id).statusBits & StatusBit.limp).toBe(StatusBit.limp);
    expect(
      bodySpeedPxPerTick(room, id, { seq: 1, dx: 1, dy: 0, sprint: false, sneak: false, tick: 0 }),
    ).toBeCloseTo(speedPxPerTick(false, false) * effects.effects.wounded.speedFactor!);
    advance(party, S(b.regenAfterS) - 2);
    expect(body.hp).toBe(b.woundedBelow - 1);
    advance(party, S(5));
    expect(body.hp).toBeGreaterThan(b.woundedBelow);
    expect(hasEffect(body, 'wounded')).toBe(false);
    advance(party, S(b.maxHp / b.regenHpPerS));
    expect(body.hp).toBe(b.maxHp);
  });

  it('running spends stamina to Fatigued, which forbids running until fatigueRecover; standing restores it', async () => {
    const party = await party4();
    const room = party.room;
    const id = me(party);
    const p = sim(party, id);
    const body = bodyOf(room, id)!;
    const run = (tick: number): void => {
      p.input = { seq: tick, dx: 1, dy: 0, sprint: true, sneak: false, tick };
    };
    run(room.state.tick);
    advance(party, S(b.maxStamina / b.runCostPerS) + 2, run);
    expect(body.stamina).toBeLessThan(1); // empty, then the walk's first two ticks of rest
    expect(hasEffect(body, 'fatigued')).toBe(true);
    expect(presenceOf(room, id).statusBits & StatusBit.fatigued).toBe(StatusBit.fatigued);
    expect(bodySpeedPxPerTick(room, id, p.input!)).toBe(speedPxPerTick(false, false)); // asks to run, walks
    advance(party, S(1), run);
    expect(hasEffect(body, 'fatigued')).toBe(true); // walking regains a little, not enough
    p.input = null;
    advance(party, S(b.fatigueRecover / b.staminaRegenPerS) + 2);
    expect(hasEffect(body, 'fatigued')).toBe(false);
    expect(body.stamina).toBeGreaterThanOrEqual(b.fatigueRecover);
    expect(room.state.players.get(id)!.priv.body.stamina).toBe(Math.floor(body.stamina));
  });

  it('zero health from fists knocks out, never kills: down, no move or act, the hold dropped, body.ko; it wakes Dazed', async () => {
    const party = await party4();
    const room = party.room;
    const id = me(party);
    const p = sim(party, id);
    const body = bodyOf(room, id)!;
    p.hold = { action: 'task', targetId: 'x', startTick: room.state.tick };
    body.hp = b.damage.strike.dmg;
    expect(hurt(room, id, b.damage.strike, { source: 'strike', by: other(party) })).toBe('down');
    expect(hasEffect(body, 'knockedOut')).toBe(true);
    expect(p.hold).toBeNull();
    expect(p.dead).toBe(false);
    expect(bodyBlocksAct(room, id)).toBe(true);
    expect(hurt(room, id, b.damage.strike, { source: 'strike' })).toBe('none'); // no second knockout
    advance(party, 1);
    expect(presenceOf(room, id).statusBits & StatusBit.down).toBe(StatusBit.down);
    expect(room.state.scenes.get('overworld')!.bodies.size).toBe(0);
    expect(simOf(room).meetingRequests).toEqual([]);
    expect(matchEvents(room).find((e) => e.kind === 'body.ko')?.data).toEqual({
      target: id,
      by: other(party),
    });
    advance(party, S(b.koS));
    expect(hasEffect(body, 'knockedOut')).toBe(false);
    expect(hasEffect(body, 'dazed')).toBe(true);
    expect(body.hp).toBeGreaterThanOrEqual(b.koWakeHp);
    expect(body.hp).toBeLessThan(b.koWakeHp + 1); // up at koWakeHp, then regenerating
    expect(matchEvents(room).some((e) => e.kind === 'body.wake')).toBe(true);
    expect(
      room.state.players
        .get(id)!
        .priv.body.effects.map((e) => e.id)
        .sort(),
    ).toEqual([EffectId.dazed, EffectId.wounded].sort());
  });

  it('a meeting wakes a knocked-out seat early, and freezes every body while it lasts', async () => {
    const party = await party4();
    const room = party.room;
    const id = me(party);
    const body = bodyOf(room, id)!;
    body.hp = 1;
    hurt(room, id, b.damage.slingshot, { source: 'slingshot' });
    expect(hasEffect(body, 'knockedOut')).toBe(true);
    const bleeder = bodyOf(room, other(party))!;
    applyEffect(room, other(party), bleeder, 'bleeding');
    simOf(room).meetingRequests.push({ reason: 'bell', callerId: other(party) });
    advance(party, 1);
    expect(room.state.phase).toBe(Phase.meetingDiscussion);
    expect(hasEffect(body, 'knockedOut')).toBe(false);
    expect(hasEffect(body, 'dazed')).toBe(true);
    const hp = bleeder.hp;
    advance(party, S(5));
    expect(bleeder.hp).toBe(hp);
  });

  it('timed effects wear off; the Knife is untouched and takes the body with the ghost', async () => {
    const party = await party4();
    const room = party.room;
    const id = me(party);
    const body = bodyOf(room, id)!;
    applyEffect(room, id, body, 'dazed');
    advance(party, S(effects.effects.dazed.durationS) + 1);
    expect(hasEffect(body, 'dazed')).toBe(false);
    const killer = other(party);
    holdPhase(party, Phase.night, 900); // the Knife's phases (abilities.json)
    setRole(room, killer, 'killer');
    room.state.players.get(killer)!.priv.cooldownEndTick.set('kill', 0);
    const p = sim(party, id);
    placeSeat(party, killer, sceneKey(p.sceneIdx), Math.floor(p.x / TILE_PX) + 1, Math.floor(p.y / TILE_PX));
    advance(party, 1);
    handleKill(room, killer, { abilityId: 'kill', targetId: room.state.players.get(id)!.priv.avatar });
    expect(p.dead).toBe(true);
    expect(simOf(room).deaths.find((d) => d.playerId === id)).toMatchObject({
      cause: 'knife',
      killerId: killer,
    });
    advance(party, 1);
    expect(bodyOf(room, id)).toBeUndefined();
    expect(room.state.players.get(id)!.priv.body.toJSON()).toMatchObject({ hp: 0, maxHp: 0 });
  });

  it('leaves a foreign effect row (8D’s Indebted) alone: a tick, its own effects coming and going, a knockout and a death never touch it', async () => {
    const party = await party4();
    const room = party.room;
    const id = me(party);
    const body = bodyOf(room, id)!;
    const wire = room.state.players.get(id)!.priv.body;
    const foreign = new EffectState();
    foreign.id = EffectId.indebted;
    foreign.untilTick = 0;
    foreign.stacks = 3;
    wire.effects.push(foreign);
    const stillThere = () =>
      expect(wire.effects.toArray().filter((e) => e.id === EffectId.indebted)).toMatchObject([
        { untilTick: 0, stacks: 3 },
      ]);
    advance(party, S(2));
    stillThere();
    applyEffect(room, id, body, 'dazed');
    advance(party, 1);
    stillThere();
    expect(wire.effects.toArray().map((e) => e.id)).toEqual([EffectId.indebted, EffectId.dazed]);
    advance(party, S(effects.effects.dazed.durationS) + 1);
    stillThere();
    expect(wire.effects.toArray().map((e) => e.id)).toEqual([EffectId.indebted]);
    body.hp = b.damage.strike.dmg;
    expect(hurt(room, id, b.damage.strike, { source: 'strike', by: other(party) })).toBe('down');
    advance(party, 1);
    expect(hasEffect(body, 'knockedOut')).toBe(true);
    stillThere();
    advance(party, S(b.koS) + 1);
    expect(hasEffect(body, 'knockedOut')).toBe(false);
    stillThere();
    expect(
      hurt(room, id, { dmg: b.maxHp, effects: {}, kills: true }, { source: 'wolf', cause: 'creature' }),
    ).toBe('dead');
    advance(party, 2);
    expect(sim(party, id).dead).toBe(true);
    expect(bodyOf(room, id)).toBeUndefined();
    expect(wire.toJSON()).toMatchObject({ hp: 0, maxHp: 0 });
    stillThere();
    expect(wire.effects.length).toBe(1);
  });
});

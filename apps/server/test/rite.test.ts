import { ColyseusTestServer, boot } from '@colyseus/testing';
import { balance, scenes } from '@wdi/content';
import { EffectId, Phase, S2C } from '@wdi/shared';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createServer } from '../src/server';
import { avatarMemory, avatarOf } from '../src/sim/Avatars';
import { hasEffect, speedFactorOf } from '../src/sim/body/effects';
import { bodyOf } from '../src/sim/body/state';
import { markDead } from '../src/sim/Death';
import { runInvariants } from '../src/sim/auto/invariants';
import { simOf } from '../src/sim/RoomSim';
import { mediumHandle, riteDone } from '../src/sim/rite/rite';
import { avatarsHeld } from './avatarHelpers';
import { eventsOf, playerOf, setPhase, sleep, teleport } from './killHelpers';
import { type Match, startMatch } from './simHelpers';

// Story R3 (docs/story/rite.md 4, DECISIONS A602; GDD 3.20): the Medium stands at the rite site, an NPC with no seat,
// and the martyr's shade takes the rite there: a hold that runs `rite.holdS`, cannot be interrupted and costs nothing.

let colyseus: ColyseusTestServer;
const holdS = balance.rite.holdS;
beforeAll(async () => {
  process.env.WDI_DEBUG = '1';
  colyseus = await boot(createServer({ ipBurst: 1e5, ipPerMin: 1e8, globalPerMin: 1e8 }));
});
afterAll(async () => {
  delete process.env.WDI_DEBUG;
  await colyseus.shutdown();
});
beforeEach(async () => {
  await colyseus.cleanup();
  balance.rite.holdS = 0.5; // a short rite for the test clock
});
afterEach(() => void (balance.rite.holdS = holdS));

const { scene: SITE, spawn: SPAWN } = balance.rite.site;
type Rite = { stage: string; medium?: string; endsTick?: number };
const riteOf = (m: Match, i: number) => eventsOf(m.bots[i]!, S2C.rite) as Rite[];
type Killed = { roles: Record<string, string> };
const killedOf = (m: Match, i: number) => eventsOf(m.bots[i]!, S2C.killed) as Killed[];
const errorsOf = (m: Match, i: number) => eventsOf(m.bots[i]!, S2C.error) as { reason?: string }[];
const hold = (m: Match, i: number, targetId: string) =>
  m.bots[i]!.room.send('act.hold', { action: 'rite', targetId, on: true });

/** Bot0 is dealt the Vicar in the Vicar look, Bot1 holds the Knife; it is night. */
async function night(): Promise<Match> {
  const m = await startMatch(colyseus, 5, { Bot0: 'vicar', Bot1: 'killer' });
  playerOf(m, m.bots[0]!).look = 'vicar';
  setPhase(m, Phase.night);
  await sleep(150);
  return m;
}
const site = () => {
  const sp = scenes[SITE as 'forest_deep'].spawns.find((s) => s.id === SPAWN)!;
  return { x: sp.x, y: sp.y };
};

describe("the Medium's rite (story R3)", () => {
  it('the Medium stands at the site as a figure: no seat, no ghost tag, seen by the living near it', async () => {
    const m = await night();
    const handle = mediumHandle(m.room)!;
    expect(handle).toBeTruthy();
    expect(avatarMemory(m.room).sceneOf.get(handle)).toBe(SITE);
    expect(avatarMemory(m.room).seatOf.has(handle)).toBe(false);
    expect(avatarOf(m.room, handle)).toEqual(expect.objectContaining({ lookOf: 'villager', seat: '' }));
    const { x, y } = site();
    teleport(m, m.bots[2]!, SITE as 'forest_deep', x - 1, y);
    await sleep(400);
    const held = avatarsHeld(m.bots[2]!).filter((h) => h.handle === handle);
    expect(held).toHaveLength(1);
    expect(held[0]!.avatar.seat).toBeFalsy();
    // The Knife never finds it: a strike at its handle names no seat.
    m.bots[1]!.room.send('act.ability', { ability: 'kill', targetId: handle });
    await sleep(200);
    expect(mediumHandle(m.room)).toBe(handle);
  });

  it('only the shade is told; far away it is refused, at the Medium the rite runs and cannot be stopped', async () => {
    const m = await night();
    const handle = mediumHandle(m.room)!;
    markDead(m.room, m.bots[0]!.id, 'knife', m.bots[1]!.id);
    await sleep(200);
    expect(riteOf(m, 0)).toEqual([{ stage: 'open', medium: handle }]);
    for (const i of [1, 2, 3, 4]) expect(riteOf(m, i)).toEqual([]);

    hold(m, 0, handle); // still where it died
    await sleep(200);
    expect(errorsOf(m, 0).at(-1)?.reason).toBe('NOTHING_THERE');
    const { x, y } = site();
    teleport(m, m.bots[0]!, SITE as 'forest_deep', x + 4, y);
    hold(m, 0, handle);
    await sleep(200);
    expect(errorsOf(m, 0).at(-1)?.reason).toBe('TOO_FAR');

    teleport(m, m.bots[0]!, SITE as 'forest_deep', x + 1, y);
    hold(m, 0, handle);
    await sleep(150);
    const begun = riteOf(m, 0).find((r) => r.stage === 'begun');
    expect(begun?.endsTick).toBeGreaterThan(m.room.state.tick - 10);
    // A release and a walk change nothing: it stands until the rite is done.
    const at = { x: simOf(m.room).players.get(m.bots[0]!.id)!.x };
    m.bots[0]!.room.send('act.hold', { action: 'rite', targetId: handle, on: false });
    m.bots[0]!.room.send('input.move', { seq: 1, dx: 1, dy: 0 });
    await sleep(Math.ceil(balance.rite.holdS * 1000) - 200);
    expect(simOf(m.room).players.get(m.bots[0]!.id)!.x).toBe(at.x);
    m.bots[0]!.room.send('input.move', { seq: 2, dx: 0, dy: 0 });
    await sleep(500);
    expect(riteOf(m, 0).map((r) => r.stage)).toEqual(['open', 'begun', 'done']);
    expect(riteDone(m.room, m.bots[0]!.id)).toBe(true);

    hold(m, 0, handle); // once a match
    await sleep(150);
    expect(errorsOf(m, 0).at(-1)?.reason).toBe('ALREADY_DONE');
    for (const i of [1, 2, 3, 4]) expect(riteOf(m, i)).toEqual([]);
  });

  it('refuses the living and an ordinary ghost', async () => {
    const m = await night();
    const handle = mediumHandle(m.room)!;
    const { x, y } = site();
    teleport(m, m.bots[2]!, SITE as 'forest_deep', x + 1, y);
    playerOf(m, m.bots[3]!).look = 'doctor';
    markDead(m.room, m.bots[3]!.id, 'knife', m.bots[1]!.id);
    teleport(m, m.bots[3]!, SITE as 'forest_deep', x, y + 1);
    await sleep(150);
    hold(m, 2, handle);
    hold(m, 3, handle);
    await sleep(200);
    expect(errorsOf(m, 2).at(-1)?.reason).toBe('NOT_IN_PLAY');
    expect(errorsOf(m, 3).at(-1)?.reason).toBe('NOT_IN_PLAY');
    expect(riteOf(m, 2)).toEqual([]);
    expect(riteOf(m, 3)).toEqual([]);
  });
});

const bodyFailures = (m: Match) => runInvariants(m.room).filter((f) => f.name === 'bodyBounds');

describe("the martyr's return (story R4)", () => {
  /** The shade (Bot0) at the Medium: begins the rite and waits for it to be done. */
  async function rite(m: Match): Promise<void> {
    const { x, y } = site();
    teleport(m, m.bots[0]!, SITE as 'forest_deep', x + 1, y);
    hold(m, 0, mediumHandle(m.room)!);
    await sleep(Math.ceil(balance.rite.holdS * 1000) + 300);
  }
  const toDay = async (m: Match) => {
    setPhase(m, Phase.day);
    await sleep(200);
  };

  it('a rite before the day: back at the site at the day, alive, whole, its cooldowns where they stood', async () => {
    const m = await night();
    const vicar = m.bots[0]!.id;
    const priv = playerOf(m, m.bots[0]!).priv;
    priv.cooldownEndTick.set('confession', m.room.state.tick + 100);
    markDead(m.room, vicar, 'knife', m.bots[1]!.id);
    const died = m.room.state.tick;
    await rite(m);
    expect(playerOf(m, m.bots[0]!).alive).toBe(true); // the roster never showed it dead: no meeting yet
    expect(simOf(m.room).players.get(vicar)!.dead).toBe(true);
    await toDay(m);
    const p = simOf(m.room).players.get(vicar)!;
    expect({ dead: p.dead, placed: p.placed }).toEqual({ dead: false, placed: true });
    expect(avatarMemory(m.room).sceneOf.get(avatarMemory(m.room).handleOf.get(vicar)!)).toBe(SITE);
    expect(priv.body.hp).toBe(balance.body.maxHp * balance.rite.buff.maxHpFactor); // R5's buff
    expect(priv.cooldownEndTick.get('confession')).toBeGreaterThan(died + 100);
    expect(riteOf(m, 0).at(-1)).toEqual({ stage: 'returned' });
    for (const i of [1, 2, 3, 4]) expect(riteOf(m, i)).toEqual([]);
    for (const room of m.room.state.scenes.values()) expect(room.bodies.has(`body_${vicar}`)).toBe(false);
  });

  it('no rite, or a rite too late: no return; the shade is a ghost at the day and the Medium refuses it', async () => {
    const m = await night();
    markDead(m.room, m.bots[0]!.id, 'knife', m.bots[1]!.id);
    await sleep(150);
    await toDay(m);
    expect(simOf(m.room).players.get(m.bots[0]!.id)!.dead).toBe(true);
    expect(Object.keys(killedOf(m, 0).at(-1)!.roles)).toHaveLength(5);
    await rite(m);
    expect(errorsOf(m, 0).at(-1)?.reason).toBe('NOT_IN_PLAY');
    expect(riteOf(m, 0).map((r) => r.stage)).toEqual(['open']);
  });

  it('a cover in the Vicar look comes back the same way', async () => {
    const m = await startMatch(colyseus, 5, { Bot0: 'drifter', Bot1: 'killer' });
    playerOf(m, m.bots[0]!).look = 'vicar';
    setPhase(m, Phase.night);
    await sleep(150);
    markDead(m.room, m.bots[0]!.id, 'knife', m.bots[1]!.id);
    await rite(m);
    await toDay(m);
    expect(simOf(m.room).players.get(m.bots[0]!.id)!.dead).toBe(false);
    expect(riteOf(m, 0).at(-1)).toEqual({ stage: 'returned' });
  });

  // Story R5 (GDD 3.20 and 3.22, DECISIONS A604): the 10X Vicar's speed and health from the return to the next dusk.
  it('the return day: the buff raises speed and maximum health, and dusk takes it off', async () => {
    const m = await night();
    const vicar = m.bots[0]!.id;
    markDead(m.room, vicar, 'knife', m.bots[1]!.id);
    await rite(m);
    await toDay(m);
    const body = bodyOf(m.room, vicar)!;
    const { speedFactor, maxHpFactor } = balance.rite.buff;
    expect(hasEffect(body, 'ascended')).toBe(true);
    expect(speedFactorOf(body)).toBeCloseTo(speedFactor);
    expect({ hp: body.hp, maxHp: body.maxHp }).toEqual({
      hp: balance.body.maxHp * maxHpFactor,
      maxHp: balance.body.maxHp * maxHpFactor,
    });
    const priv = playerOf(m, m.bots[0]!).priv;
    expect([...priv.body.effects].map((e) => e.id)).toContain(EffectId.ascended);
    for (const i of [1, 2, 3, 4])
      expect([...playerOf(m, m.bots[i]!).priv.body.effects].map((e) => e.id)).not.toContain(
        EffectId.ascended,
      );
    expect(bodyFailures(m)).toEqual([]);

    setPhase(m, Phase.dusk);
    await sleep(200);
    expect(hasEffect(body, 'ascended')).toBe(false);
    expect(speedFactorOf(body)).toBe(1);
    expect({ hp: body.hp, maxHp: body.maxHp }).toEqual({ hp: balance.body.maxHp, maxHp: balance.body.maxHp });
    expect(bodyFailures(m)).toEqual([]);
  });

  it('no rite, no buff: a seat that never returned wears nothing', async () => {
    const m = await night();
    markDead(m.room, m.bots[0]!.id, 'knife', m.bots[1]!.id);
    await toDay(m);
    expect(bodyOf(m.room, m.bots[0]!.id)).toBeUndefined();
    for (const bot of m.bots) {
      const body = bodyOf(m.room, bot.id);
      if (body) expect(hasEffect(body, 'ascended')).toBe(false);
    }
  });
});

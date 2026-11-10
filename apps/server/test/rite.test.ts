import { ColyseusTestServer, boot } from '@colyseus/testing';
import { balance, scenes } from '@wdi/content';
import { Phase, S2C } from '@wdi/shared';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createServer } from '../src/server';
import { avatarMemory, avatarOf } from '../src/sim/Avatars';
import { markDead } from '../src/sim/Death';
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

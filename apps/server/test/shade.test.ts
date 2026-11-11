import { ColyseusTestServer, boot } from '@colyseus/testing';
import { Phase, S2C } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createServer } from '../src/server';
import { markDead } from '../src/sim/Death';
import { martyrOf } from '../src/sim/Memorial';
import { isShade, martyrSeatOf, shadeOf } from '../src/sim/rite/shade';
import { avatarMemory } from '../src/sim/Avatars';
import { avatarsHeld } from './avatarHelpers';
import { eventsOf, playerOf, setPhase, sleep, teleport } from './killHelpers';
import { type Match, startMatch } from './simHelpers';

// Story R2 (docs/story/rite.md 4, DECISIONS A600 R-Q3 and R-Q4; GDD 3.8, 3.20): the martyr is a shade from its death,
// not a ghost. It follows the public look, keeps a living seat's view and hears no ghost, until the next day.

let colyseus: ColyseusTestServer;
beforeAll(async () => {
  process.env.WDI_DEBUG = '1';
  colyseus = await boot(createServer({ ipBurst: 1e5, ipPerMin: 1e8, globalPerMin: 1e8 }));
});
afterAll(async () => {
  delete process.env.WDI_DEBUG;
  await colyseus.shutdown();
});
beforeEach(async () => colyseus.cleanup());

type Killed = { roles: Record<string, string>; shade?: boolean; cutsceneId?: string };
const killedOf = (m: Match, i: number) => eventsOf(m.bots[i]!, S2C.killed) as Killed[];

/** Bot0 is dealt `card` and walks as `look`; Bot1 holds the Knife; the rest are Villagers. It is night. */
async function deal(card: string, look: string, n = 5): Promise<Match> {
  const m = await startMatch(colyseus, n, { Bot0: card, Bot1: 'killer' });
  playerOf(m, m.bots[0]!).look = look;
  setPhase(m, Phase.night);
  await sleep(100);
  return m;
}
const knife = (m: Match, i: number) => markDead(m.room, m.bots[i]!.id, 'knife', m.bots[1]!.id);

describe("the martyr's shade (story R2)", () => {
  it('a Vicar struck by the Knife is sent no roles until the next day, then becomes a ghost', async () => {
    const m = await deal('vicar', 'vicar');
    const vicar = m.bots[0]!.id;
    knife(m, 0);
    await sleep(200);
    expect(isShade(m.room, vicar)).toBe(true);
    expect(killedOf(m, 0)).toEqual([expect.objectContaining({ roles: {}, shade: true })]);

    // The meeting's reveal mourns the shade: it is the match's martyr (its due waits for the rite, R4).
    setPhase(m, Phase.reveal);
    await sleep(200);
    expect(martyrSeatOf(m.room)).toBe(vicar);
    expect(martyrOf(m.room)).toBeNull();

    setPhase(m, Phase.day);
    await sleep(200);
    expect(shadeOf(m.room)).toBeNull();
    const [, late] = killedOf(m, 0);
    expect(late?.shade).toBeUndefined();
    expect(late?.cutsceneId).toBeUndefined();
    expect(Object.keys(late?.roles ?? {}).sort()).toEqual(m.bots.map((b) => b.id).sort());
  });

  it('follows the look: a cover in the Vicar look is a shade, a dealt Vicar in another look is a ghost', async () => {
    const cover = await deal('doctor', 'vicar');
    knife(cover, 0);
    await sleep(200);
    expect(isShade(cover.room, cover.bots[0]!.id)).toBe(true);
    expect(killedOf(cover, 0)[0]).toEqual(expect.objectContaining({ roles: {}, shade: true }));

    const plain = await deal('vicar', 'doctor');
    knife(plain, 0);
    await sleep(200);
    expect(shadeOf(plain.room)).toBeNull();
    expect(Object.keys(killedOf(plain, 0)[0]!.roles)).toHaveLength(5);

    // Another cause makes no shade, even in the Vicar look.
    const poisoned = await deal('vicar', 'vicar');
    markDead(poisoned.room, poisoned.bots[0]!.id, 'poison');
    await sleep(200);
    expect(shadeOf(poisoned.room)).toBeNull();
  });

  it('one shade per match: a second Knife death in the Vicar look is a ghost', async () => {
    const m = await deal('vicar', 'vicar');
    playerOf(m, m.bots[2]!).look = 'vicar';
    knife(m, 0);
    knife(m, 2);
    await sleep(200);
    expect(shadeOf(m.room)).toBe(m.bots[0]!.id);
    expect(killedOf(m, 2)[0]!.shade).toBeUndefined();
    expect(Object.keys(killedOf(m, 2)[0]!.roles)).toHaveLength(5);
  });

  it('keeps a living view: no ghost figure, no ghost tag, no ghost line, and it cannot speak', async () => {
    const m = await deal('vicar', 'vicar');
    for (const i of [0, 2, 3]) teleport(m, m.bots[i]!, 'forest', 7 + i, 1);
    knife(m, 2); // an ordinary ghost first (another look)
    knife(m, 0); // then the shade
    await sleep(400);
    const memory = avatarMemory(m.room);
    const held = avatarsHeld(m.bots[0]!);
    const seats = held.map((h) => memory.seatOf.get(h.handle));
    expect(seats).toContain(m.bots[0]!.id); // its own figure
    expect(seats).toContain(m.bots[3]!.id); // the living beside it
    expect(seats).not.toContain(m.bots[2]!.id); // never the ghost
    expect(held.every((h) => !h.avatar.seat)).toBe(true); // no ghost-only seat
    // The ghost sees the shade, as the dead see every dead seat.
    expect(avatarsHeld(m.bots[2]!).map((h) => memory.seatOf.get(h.handle))).toContain(m.bots[0]!.id);

    m.bots[2]!.room.send('chat.say', { text: 'who did it?' });
    m.bots[0]!.room.send('chat.say', { text: 'it was me' });
    await sleep(300);
    expect(eventsOf(m.bots[0]!, S2C.chatMsg)).toEqual([]);
    expect(eventsOf(m.bots[2]!, S2C.chatMsg)).toEqual([expect.objectContaining({ channel: 'ghost' })]);
    expect(eventsOf(m.bots[0]!, S2C.error)).toEqual([expect.objectContaining({ reason: 'NOT_IN_PLAY' })]);
  });
});

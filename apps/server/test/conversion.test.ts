import { ColyseusTestServer, boot } from '@colyseus/testing';
import { balance } from '@wdi/content';
import { Phase, S2C } from '@wdi/shared';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createServer } from '../src/server';
import { markDead } from '../src/sim/Death';
import { addFaith, isConverted } from '../src/sim/economy/conversion';
import { bellOf, hubOf } from '../src/sim/MapSites';
import { peacefulOf } from '../src/sim/routes/peaceful';
import { eventsOf, playerOf, setPhase, sleep, teleport } from './killHelpers';
import { type Match, startMatch } from './simHelpers';

// Story I9 (GDD 3.23, DECISIONS A606): conversion at `conversion.faithAt`, the sermon at the bell, the Vicar's private
// count and the Peaceful route, which is recorded and never ends the match.

let colyseus: ColyseusTestServer;
const { sermonS, listenS, sermonCooldownS } = balance.conversion;
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
  balance.conversion.sermonS = 0.6; // a short sermon for the test clock
  balance.conversion.listenS = 0.3;
  balance.conversion.sermonCooldownS = 0.8;
});
afterEach(() => {
  balance.conversion.sermonS = sermonS;
  balance.conversion.listenS = listenS;
  balance.conversion.sermonCooldownS = sermonCooldownS;
});

type Conversion = { kind: string; heard?: number };
const conversionOf = (m: Match, i: number) => eventsOf(m.bots[i]!, S2C.conversion) as Conversion[];
const errorsOf = (m: Match, i: number) => eventsOf(m.bots[i]!, S2C.error) as { reason?: string }[];
const priv = (m: Match, i: number) => playerOf(m, m.bots[i]!).priv!;
const preach = (m: Match, i: number) =>
  m.bots[i]!.room.send('act.hold', { action: 'sermon', targetId: 'bell', on: true });

/** Bot0 is dealt the Vicar in the Vicar look, Bot1 holds the Knife; it is day. */
async function day(): Promise<Match> {
  const m = await startMatch(colyseus, 4, { Bot0: 'vicar', Bot1: 'killer' });
  playerOf(m, m.bots[0]!).look = 'vicar';
  setPhase(m, Phase.day);
  await sleep(150);
  return m;
}
/** Puts bot `i` on the hub, `dx` tiles east of the bell. */
function atBell(m: Match, i: number, dx: number): void {
  const bell = bellOf(m.room)!;
  teleport(m, m.bots[i]!, hubOf(m.room) as never, bell.x + dx, bell.y + 1);
}

describe('conversion (story I9)', () => {
  it('a seat is converted at faithAt, is told alone, and the Vicar counts it without a name', async () => {
    const m = await day();
    addFaith(m.room, m.bots[2]!.id, balance.conversion.faithAt - 1);
    await sleep(150);
    expect(isConverted(m.room, m.bots[2]!.id)).toBe(false);
    addFaith(m.room, m.bots[2]!.id, 1);
    await sleep(200);
    expect(isConverted(m.room, m.bots[2]!.id)).toBe(true);
    expect(conversionOf(m, 2)).toEqual([{ kind: 'converted' }]);
    for (const i of [0, 1, 3]) expect(conversionOf(m, i)).toEqual([]);
    expect(priv(m, 0).converted).toBe(1);
    for (const i of [1, 2, 3]) expect(priv(m, i).converted).toBe(0);
    // Spending Faith later does not undo it.
    priv(m, 2).faith = 0;
    await sleep(150);
    expect(isConverted(m.room, m.bots[2]!.id)).toBe(true);
  });

  it('the sermon gives Faith to those within range for listenS, again after the cooldown, a listener once a day', async () => {
    const m = await day();
    atBell(m, 0, 0);
    atBell(m, 2, 2); // within sermonTiles
    atBell(m, 3, balance.conversion.sermonTiles + 3); // too far
    atBell(m, 1, balance.conversion.sermonTiles + 4);
    await sleep(150);
    preach(m, 0);
    await sleep(1200);
    expect(priv(m, 2).faith).toBe(balance.conversion.sermonFaith);
    expect(priv(m, 3).faith).toBe(0);
    expect(priv(m, 0).faith).toBe(0);
    expect(conversionOf(m, 0).at(-1)).toEqual({ kind: 'sermon', heard: 1 });
    preach(m, 0); // within sermonCooldownS of the last one
    await sleep(100);
    expect(errorsOf(m, 0).at(-1)?.reason).toBe('COOLDOWN');
    await sleep(900);
    preach(m, 0); // after it: a second sermon, but a listener is paid once a day
    await sleep(1200);
    expect(conversionOf(m, 0).at(-1)).toEqual({ kind: 'sermon', heard: 0 });
    expect(priv(m, 2).faith).toBe(balance.conversion.sermonFaith);
  });

  it('only the Vicar look preaches, by day, at the bell; leaving it breaks a sermon with nothing given', async () => {
    const m = await day();
    atBell(m, 1, 0);
    preach(m, 1);
    await sleep(200);
    expect(errorsOf(m, 1).at(-1)?.reason).toBe('NOT_YOUR_POWER');
    atBell(m, 0, 30);
    await sleep(100);
    preach(m, 0);
    await sleep(200);
    expect(errorsOf(m, 0).at(-1)?.reason).toBe('TOO_FAR');
    atBell(m, 0, 0);
    atBell(m, 2, 1);
    await sleep(150);
    preach(m, 0);
    await sleep(150);
    atBell(m, 0, 4); // it walks off the bell
    await sleep(1200);
    expect(priv(m, 2).faith).toBe(0);
    expect(conversionOf(m, 0)).toEqual([]);
  });

  it('a cover in the Vicar look preaches with the same effect, so a listener learns nothing', async () => {
    const m = await startMatch(colyseus, 4, { Bot0: 'vicar', Bot1: 'killer' });
    playerOf(m, m.bots[3]!).look = 'vicar'; // Bot3 wears the look but holds another card
    for (const i of [0, 1]) atBell(m, i, balance.conversion.sermonTiles + 4);
    setPhase(m, Phase.day);
    await sleep(150);
    atBell(m, 3, 0);
    atBell(m, 2, 1);
    await sleep(150);
    preach(m, 3);
    await sleep(1200);
    expect(priv(m, 2).faith).toBe(balance.conversion.sermonFaith);
  });

  it('Peaceful: every other living seat converted is recorded and told to the dealt Vicar; the match goes on', async () => {
    const m = await day();
    markDead(m.room, m.bots[3]!.id, 'knife', m.bots[1]!.id); // the dead need not convert
    const others = [...m.room.state.players.keys()].filter(
      (id) => id !== m.bots[0]!.id && id !== m.bots[3]!.id,
    );
    for (const id of others.slice(1)) addFaith(m.room, id, balance.conversion.faithAt);
    await sleep(250);
    expect(peacefulOf(m.room)).toBeNull(); // one living seat (an NPC seat counts too) is not converted yet
    addFaith(m.room, others[0]!, balance.conversion.faithAt);
    await sleep(250);
    expect(peacefulOf(m.room)).toEqual(expect.objectContaining({ seat: m.bots[0]!.id }));
    expect(conversionOf(m, 0)).toEqual([{ kind: 'peaceful' }]);
    expect(m.room.state.phase).toBe(Phase.day);
  });
});

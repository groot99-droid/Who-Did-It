import { ColyseusTestServer, boot } from '@colyseus/testing';
import { ErrorCode, Phase } from '@wdi/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from '../src/server';
import { ACT_TICKS, act, errorCodes, setPhase } from './killHelpers';
import { startMatch, stateOf } from './simHelpers';

/**
 * Round 10, x16: `act` waits for the room's tick, not the wall clock. The server and the bots share this process's
 * event loop, so a stall here is a late step there: the old 200 ms sleep could end before the server had read the
 * message, let alone answered it (the `act()` flake of x15, `expected [] to include 427`).
 */

let colyseus: ColyseusTestServer;
beforeAll(async () => {
  colyseus = await boot(createServer({ ipBurst: 1e5, ipPerMin: 1e8, globalPerMin: 1e8 }));
});
afterAll(async () => {
  await colyseus.shutdown();
});

/** Holds the event loop (the server's and the bots', in this one process) for `ms`. */
function stall(ms: number): void {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // busy
  }
}

describe('act() waits for the room, not the clock (x16)', () => {
  it('returns with the refusal in hand when the server steps late', async () => {
    const m = await startMatch(colyseus, 1);
    setPhase(m, Phase.day);
    const a = m.bots[0]!;
    // The next timer callback holds the loop past the old 200 ms with the message on the wire, unread.
    setTimeout(() => stall(350), 0);
    await act(a, 'act.payRent', {}); // away from every counter: refused with outOfRange
    expect(errorCodes(a)).toContain(ErrorCode.outOfRange);
  });

  it('never returns before its floor, and only once the ticks have gone by', async () => {
    const m = await startMatch(colyseus, 1);
    setPhase(m, Phase.day);
    const a = m.bots[0]!;
    const seen = stateOf(a).tick;
    const t0 = Date.now();
    await act(a, 'act.payRent', {});
    expect(Date.now() - t0).toBeGreaterThanOrEqual(200);
    expect(stateOf(a).tick - seen).toBeGreaterThan(ACT_TICKS);
    expect(errorCodes(a)).toContain(ErrorCode.outOfRange);
  });
});

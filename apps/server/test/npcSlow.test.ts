import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ColyseusTestServer } from '@colyseus/testing';
import { Phase, Winner } from '@wdi/shared';
import { metrics } from '../src/services/Metrics';
import { simOf } from '../src/sim/RoomSim';
import { until } from './flowHelpers';
import { openRun } from './killHelpers';
import {
  allTownsfolk,
  bootNpcServer,
  lobbyOf,
  npcSeats,
  placeSeat,
  send,
  setRole,
  start,
  toWorld,
} from './npcHelpers';
import { sleep } from './simHelpers';

// Gated: these take minutes. `WDI_SLOW=1 pnpm --filter @wdi/server test` runs them (A41).
const slow = process.env.WDI_SLOW === '1';

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => {
  ({ colyseus, release } = await bootNpcServer());
});
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

describe.skipIf(!slow)('NPC at scale and under a Knife (WDI_SLOW)', () => {
  it('keeps the tick p95 under 15 ms with 1 client and 9 NPCs for 30 s of day', async () => {
    const party = await lobbyOf(colyseus, 1);
    for (let i = 0; i < 9; i++) await send(party.humans[0]!, 'lobby.addNpc', {}, 40);
    await start(party);
    await toWorld(party);
    allTownsfolk(party.room);
    party.room.state.phase = Phase.day;
    party.room.state.phaseEndsTick = party.room.state.tick + 20 * 3600;
    expect(npcSeats(party.room)).toHaveLength(9);
    const seen: number[] = [];
    const record = metrics.recordTick.bind(metrics);
    metrics.recordTick = (ms: number) => {
      seen.push(ms);
      record(ms);
    };
    try {
      await sleep(30_000);
    } finally {
      metrics.recordTick = record;
    }
    seen.sort((a, b) => a - b);
    const p95 = seen[Math.min(seen.length - 1, Math.ceil(seen.length * 0.95) - 1)] ?? 0;
    expect(seen.length).toBeGreaterThan(400);
    expect(p95).toBeLessThan(15);
  }, 60_000);

  it('an NPC Killer on Normal wins at least one of five matches', async () => {
    let cabalWins = 0;
    for (let game = 0; game < 5 && cabalWins === 0; game++) {
      const party = await lobbyOf(colyseus, 3);
      await start(party);
      await toWorld(party);
      const [killer] = npcSeats(party.room).map((p) => p.id) as [string];
      allTownsfolk(party.room);
      setRole(party.room, killer, 'killer');
      // Each human waits alone in a different scene off the overworld; the Knife is ready; it is night.
      const sim = simOf(party.room);
      const homes = ['bakery', 'tavern_bar', 'widow_parlour'] as const;
      party.humans.forEach((h, i) => {
        const home = homes[i] ?? 'bakery';
        const at = openRun(home, 1);
        placeSeat(party, h.id, home, at.x, at.y);
      });
      party.room.state.players.get(killer)?.priv.cooldownEndTick.set('kill', 0);
      party.room.state.phase = Phase.night;
      party.room.state.phaseEndsTick = party.room.state.tick + 20 * 3600;
      await until(() => party.room.state.winner !== Winner.none || sim.deaths.length > 99, 120_000);
      if (party.room.state.winner === Winner.cabal) cabalWins++;
      await colyseus.cleanup();
    }
    expect(cabalWins).toBeGreaterThanOrEqual(1);
  }, 700_000);
});

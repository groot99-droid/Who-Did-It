import type { ColyseusTestServer } from '@colyseus/testing';
import { scenes } from '@wdi/content';
import { Phase } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { avatarMemory } from '../src/sim/Avatars';
import { avatarsHeld } from './avatarHelpers';
import { bootFlowServer, sim, startParty, until } from './flowHelpers';
import { setPhase, teleport } from './killHelpers';
import { type Bot, type Match, sleep, stateOf } from './simHelpers';

// Round 10, V3 (seams.md 3 row 39; the orchestrator's grant): a hidden seat is indistinguishable from an absent one
// to every other client, and Check and Burst Out reveal only what any watcher would see.

vi.setConfig({ testTimeout: 40_000 });

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootFlowServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

const SCENE = 'widow_bedroom';
const SPOT = scenes.widow_bedroom.spots.find((s) => s.id === 'wb.wardrobe')!;
const HIDER = 0;
const CHECKER = 1;
const WATCHER = 2;

/** Every message each bot is sent, by type. */
function recordMessages(m: Match): Map<string, Array<{ type: string; payload: unknown }>> {
  const log = new Map<string, Array<{ type: string; payload: unknown }>>();
  for (const bot of m.bots) {
    const mine: Array<{ type: string; payload: unknown }> = [];
    log.set(bot.id, mine);
    bot.room.onMessage('*', (type: string | number | object, payload: unknown) => {
      mine.push({ type: String(type), payload });
    });
  }
  return log;
}

const heldSeats = (m: Match, bot: Bot): string[] =>
  avatarsHeld(bot).map((h) => avatarMemory(m.room).seatOf.get(h.handle) ?? '?');

async function party(): Promise<Match> {
  const m = await startParty(colyseus, 4);
  setPhase(m, Phase.day);
  for (let i = 0; i < 4; i++)
    teleport(m, m.bots[i]!, SCENE, SPOT.x + (i % 2), SPOT.y + 1 + Math.floor(i / 2));
  await until(() => avatarsHeld(m.bots[WATCHER]!).length >= 3);
  return m;
}

describe('hiding leaks nothing (V3)', () => {
  it('a hider is in no other client’s view and no other client holds its private view', async () => {
    const m = await party();
    const hider = m.bots[HIDER]!;
    expect(heldSeats(m, m.bots[WATCHER]!)).toContain(hider.id);
    const log = recordMessages(m);
    hider.room.send('act.hide', { spotId: SPOT.id });
    expect(await until(() => m.room.state.players.get(hider.id)?.priv.hiding === SPOT.id)).toBe(true);
    await sleep(500);
    for (const i of [CHECKER, WATCHER, 3]) {
      const bot = m.bots[i]!;
      expect(heldSeats(m, bot)).not.toContain(hider.id);
      // No other seat's private view (so not `hiding`) and no presence reaches a client.
      stateOf(bot).players.forEach((p, id) => {
        if (id !== bot.id) expect(p.priv).toBeUndefined();
      });
    }
    // The hider's own client holds the field; no message to anyone else names the spot or the hider.
    expect(stateOf(hider).players.get(hider.id)?.priv?.hiding).toBe(SPOT.id);
    for (const i of [CHECKER, WATCHER, 3]) {
      const text = JSON.stringify(log.get(m.bots[i]!.id));
      expect(text).not.toContain(SPOT.id);
      expect(text).not.toContain(hider.id);
    }
  });

  it('Check and Burst Out show a watcher only the figure and the noise, never the spot, a seat or the entry', async () => {
    const m = await party();
    const hider = m.bots[HIDER]!;
    const checker = m.bots[CHECKER]!;
    hider.room.send('act.hide', { spotId: SPOT.id });
    expect(await until(() => m.room.state.players.get(hider.id)?.priv.hiding === SPOT.id)).toBe(true);
    const log = recordMessages(m);
    // A Burst Out mid-Check: the checker is stunned, the hider walks back into every view.
    checker.room.send('act.check', { spotId: SPOT.id });
    await sleep(300);
    hider.room.send('act.burst', { spotId: SPOT.id });
    expect(await until(() => m.room.state.players.get(hider.id)?.priv.hiding === '')).toBe(true);
    expect(await until(() => heldSeats(m, m.bots[WATCHER]!).includes(hider.id))).toBe(true);
    // A completed Check: the entry is the hider's alone, and nobody else's Notebook or message holds it.
    hider.room.send('act.hide', { spotId: SPOT.id });
    expect(await until(() => m.room.state.players.get(hider.id)?.priv.hiding === SPOT.id, 8000)).toBe(true);
    sim(m, CHECKER).busyUntilTick = 0;
    m.room.state.players.get(checker.id)!.priv.cooldownEndTick.clear();
    await sleep(2500); // the Stun from the burst wears off
    checker.room.send('act.check', { spotId: SPOT.id });
    expect(await until(() => (m.room.state.players.get(hider.id)?.priv.notebook.length ?? 0) > 0, 8000)).toBe(
      true,
    );
    await sleep(300);
    expect(m.room.state.players.get(checker.id)?.priv.notebook.length).toBe(0);
    for (const i of [WATCHER, 3]) {
      const bot = m.bots[i]!;
      expect(stateOf(bot).players.get(m.bots[HIDER]!.id)?.priv).toBeUndefined();
      const sent = log.get(bot.id)!;
      // Only noise rings (kind and a position) reach a watcher; none names the spot, the checker or the hider.
      for (const { type, payload } of sent) {
        const text = JSON.stringify(payload);
        expect(text).not.toContain(SPOT.id);
        expect(text).not.toContain(hider.id);
        expect(text).not.toContain(checker.id);
        if (type === 'noise')
          expect(Object.keys(payload as object).sort()).toEqual(['kind', 'sceneId', 'x', 'y']);
      }
    }
  });
});

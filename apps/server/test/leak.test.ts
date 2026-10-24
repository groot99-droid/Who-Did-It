import type { ColyseusTestServer } from '@colyseus/testing';
import { balance, clues } from '@wdi/content';
import { Phase, TILE_PX } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { avatarMemory } from '../src/sim/Avatars';
import { clockOf } from '../src/sim/auto/clock';
import { StatusBit } from '../src/sim/constants';
import { simOf } from '../src/sim/RoomSim';
import { canSee } from '../src/sim/Sight';
import { avatarsHeld } from './avatarHelpers';
import { bootFlowServer, murder, sim, skipPhase, startParty, until } from './flowHelpers';
import { setPhase, teleport } from './killHelpers';
import { fixSeeds } from './seedHelpers';
import { type Bot, type Match, sleep, stateOf } from './simHelpers';

// Round 8, 8L (docs/round8/teardown.md 1, A170 and A190): what a client receives is what it may know. After every
// patch a living client decodes and every message it is sent, across a seeded match by day, across the night
// boundary and at night: no other seat's presence or private view (card, cover, cooldowns), no avatar it could not
// see, no Blood out of range, no ghost-only `seat`; and no message names another seat's card, cover or cooldowns.

vi.setConfig({ testTimeout: 40_000 });

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootFlowServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

const NEAR_PX = clues.clues.blood!.params!.visibleTiles! * TILE_PX;
const NIGHT = balance.vision.nightTiles;
/** Payload keys that would carry a seat's secret. */
const SECRET_KEYS = new Set(['roleId', 'role', 'team', 'cover', 'coverId', 'cooldowns', 'priv', 'notebook']);
/** Payload keys that name a seat. */
const SEAT_KEYS = new Set(['id', 'seat', 'seatId', 'playerId', 'targetId']);

type Decoded = { triggerChanges?: (changes: unknown[]) => void };

/** Every leak found, as text, and how many patches were checked against a settled server. */
interface Audit {
  leaks: string[];
  checked: number;
  /** Patches of an earlier tick than this are not compared: the test moved something after they were encoded. */
  settledFrom: number;
}

/** The leaks in what bot `i`'s client holds now, judged by the server's state on the same tick. */
function stateLeaks(m: Match, bot: Bot): string[] {
  const out: string[] = [];
  const viewer = simOf(m.room).players.get(bot.id);
  if (!viewer || viewer.dead) return out; // a ghost sees everything (GDD 3.17)
  const state = stateOf(bot);
  state.players.forEach((p, id) => {
    if (id === bot.id) return;
    if (p.priv !== undefined) out.push(`priv of ${id}`);
    if (p.presence !== undefined) out.push(`presence of ${id}`);
  });
  const memory = avatarMemory(m.room);
  for (const { handle, avatar } of avatarsHeld(bot)) {
    if (avatar.seat) out.push(`seat on ${handle}`);
    const seatId = memory.seatOf.get(handle);
    if (seatId === undefined || seatId === bot.id || memory.handleOf.get(seatId) !== handle) continue; // a tail
    const target = simOf(m.room).players.get(seatId)!;
    if (target.dead) out.push(`the dead ${seatId}`);
    else if (!canSee(m.room, viewer, target)) out.push(`unseen ${seatId} in phase ${m.room.state.phase}`);
    const far = Math.hypot(target.x - viewer.x, target.y - viewer.y) > NEAR_PX;
    if (far && ((avatar.nearBits ?? 0) | avatar.statusBits) & StatusBit.bloody)
      out.push(`Blood of ${seatId} far`);
  }
  return out;
}

/** The leaks in one message to bot `i`: an object naming another seat beside a secret key. */
function messageLeaks(viewerId: string, type: string, payload: unknown): string[] {
  if (type === 'gameOver') return []; // the cards are shown at game over (GDD 3.8)
  const out: string[] = [];
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (v === null || typeof v !== 'object') return;
    const o = v as Record<string, unknown>;
    const other = [...SEAT_KEYS].some((k) => typeof o[k] === 'string' && o[k] !== '' && o[k] !== viewerId);
    if (other) for (const k of Object.keys(o)) if (SECRET_KEYS.has(k)) out.push(`${type}.${k}`);
    Object.values(o).forEach(walk);
  };
  walk(payload);
  return out;
}

/** Hooks every bot: its decoder checks after each decoded patch, its message hook checks each message. */
function audit(m: Match): Audit {
  const a: Audit = { leaks: [], checked: 0, settledFrom: m.room.state.tick + 1 };
  for (const bot of m.bots) {
    const decoder = (bot.room as unknown as { serializer: { decoder: Decoded } }).serializer.decoder;
    const prev = decoder.triggerChanges;
    decoder.triggerChanges = (changes) => {
      prev?.(changes);
      const tick = stateOf(bot).tick;
      if (tick < a.settledFrom || tick !== m.room.state.tick) return; // only against the tick it was encoded on
      a.checked++;
      for (const leak of stateLeaks(m, bot)) a.leaks.push(`tick ${tick} to ${bot.id}: ${leak}`);
    };
    bot.room.onMessage('*', (type: string | number | object, payload: unknown) => {
      for (const leak of messageLeaks(bot.id, String(type), payload))
        a.leaks.push(`message to ${bot.id}: ${leak}`);
    });
  }
  return a;
}

/** A test move: patches encoded before it are no longer judged against the server. */
const moved = (m: Match, a: Audit) => (a.settledFrom = m.room.state.tick + 1);

describe('the leak audit (8L)', () => {
  it('a seeded match: by day, across nightfall and at night, no client is sent what it may not know', async () => {
    const m = await startParty(colyseus, 6);
    fixSeeds(m.room, { deal: [1, 2, 3, 4], traits: [5, 6, 7, 8], npcPlay: [9, 10, 11, 12] });
    setPhase(m, Phase.day);
    // A row along the forest's open top row: one within the night radius, two beyond it, one within Blood range.
    teleport(m, m.bots[0]!, 'forest', 7, 1);
    teleport(m, m.bots[1]!, 'forest', 8, 1);
    teleport(m, m.bots[2]!, 'forest', 7 + Math.floor(NIGHT) - 1, 1);
    teleport(m, m.bots[3]!, 'forest', 7 + Math.ceil(NIGHT) + 6, 1);
    teleport(m, m.bots[4]!, 'forest', 35, 1);
    teleport(m, m.bots[5]!, 'tavern_bar', 4, 4);
    sim(m, 0).bloodyUntilTick = m.room.state.tick + 20 * 3600;
    const a = audit(m);
    moved(m, a);
    // Wait on the count rather than the clock: a loaded runner can judge no patch at all in a fixed half second.
    expect(await until(() => a.checked > 10, 10_000)).toBe(true);
    const byDay = a.checked;

    // Day to dusk to night through the phase clock itself (`runPhases`), the boundary A190 closes.
    await skipPhase(m);
    expect(m.room.state.phase).toBe(Phase.dusk);
    await skipPhase(m);
    expect(m.room.state.phase).toBe(Phase.night);
    expect(await until(() => a.checked > byDay + 10, 10_000)).toBe(true);
    const seenBy0 = avatarsHeld(m.bots[0]!).map((h) => avatarMemory(m.room).seatOf.get(h.handle));
    expect(seenBy0.sort()).toEqual([0, 1, 2].map((i) => m.bots[i]!.id).sort()); // night is narrower

    // A death at night: the ghost's own view widens, nobody else's.
    murder(m, 3, 0);
    expect(await until(() => avatarsHeld(m.bots[3]!).length >= 4)).toBe(true);
    await sleep(300);

    // On through the clock for three more boundaries: into the day and back to a night, now with a ghost.
    const seen = new Set<number>();
    for (let i = 0; i < 3; i++) {
      await skipPhase(m);
      seen.add(m.room.state.phase);
      await sleep(200);
    }
    expect(seen.has(Phase.day) && seen.has(Phase.night)).toBe(true);

    expect(a.leaks).toEqual([]);
  });

  it('the audit itself catches a leak: a hand-made Blood bit in the shared statusBits', async () => {
    const m = await startParty(colyseus, 4);
    setPhase(m, Phase.day);
    teleport(m, m.bots[0]!, 'forest', 7, 1);
    teleport(m, m.bots[1]!, 'forest', 35, 1);
    const a = audit(m);
    moved(m, a);
    expect(await until(() => avatarsHeld(m.bots[1]!).length > 0)).toBe(true);
    // The audit judges a patch only on the tick it was encoded. A loaded runner decodes ticks late, so the clock
    // stops here: patches still go out, and every one is decoded on the server's current tick.
    clockOf(m.room).paused = true;
    // White-box: bypass `writeAvatar` for seat 0's avatar every few ms, as a regression would.
    const timer = setInterval(() => {
      const handle = avatarMemory(m.room).handleOf.get(m.bots[0]!.id) ?? '';
      const avatar = m.room.state.scenes.get('forest')?.avatars.get(handle);
      if (avatar) avatar.statusBits |= StatusBit.bloody;
    }, 5);
    expect(await until(() => a.leaks.some((l) => l.includes('Blood')))).toBe(true);
    clearInterval(timer);
    clockOf(m.room).paused = false;
  });
});

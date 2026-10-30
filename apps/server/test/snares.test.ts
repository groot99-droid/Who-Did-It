import type { ColyseusTestServer } from '@colyseus/testing';
import { abilities, balance, scenes } from '@wdi/content';
import { NoteKind, Phase, TICK_RATE, TILE_PX } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bodyOf } from '../src/sim/body/state';
import { addStack, count } from '../src/sim/Inventory';
import { handleSnareAbility, heldBySnare } from '../src/sim/snares';
import { bootFlowServer, idOf, sim, startParty, until } from './flowHelpers';
import { act, openRun, setPhase, teleport } from './killHelpers';
import { type Bot, type Match, move, sleep, stateOf } from './simHelpers';

// Round 10, K6 (GDD 3.5, seams.md 3 row 31): anyone holding a Snare sets it on its tile; the next walker onto the tile
// is held, then Slowed, and the layer's own Notebook names the drawn look. A set snare reaches only its layer's view and the views of seats within `snare.seeTiles`.

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootFlowServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

const SCENE = 'forest' as const;
const reasons = (bot: Bot): string[] =>
  bot.events.filter((e) => e.type === 'error').map((e) => (e.payload as { reason: string }).reason);
const snaresHeld = (bot: Bot): string[] => [...(stateOf(bot).scenes.get(SCENE)?.snares.keys() ?? [])];
const give = (m: Match, i: number, item: string, qty = 1): void => {
  addStack(m.room.state.players.get(idOf(m, i))!, item, qty);
};

/** Four seats in the day, in the forest: 0 the layer on a run's first tile, the others far along it. */
async function inForest(): Promise<{ m: Match; x: number; y: number }> {
  const m = await startParty(colyseus, 4);
  setPhase(m, Phase.day);
  const { x, y } = openRun(SCENE, 8);
  teleport(m, m.bots[0]!, SCENE, x, y);
  for (const i of [1, 2, 3]) teleport(m, m.bots[i]!, SCENE, x + 7, y);
  return { m, x, y };
}

describe('Setting a snare (K6)', () => {
  it('refuses without a Snare, on a tile that holds one, on a portal and outside a verb phase', async () => {
    const { m, x, y } = await inForest();
    await act(m.bots[0]!, 'act.ability', { abilityId: 'snare' });
    expect(reasons(m.bots[0]!)).toEqual(['NEED_ITEM']);
    give(m, 0, 'snare', 3);
    await act(m.bots[0]!, 'act.ability', { abilityId: 'snare' });
    await act(m.bots[0]!, 'act.ability', { abilityId: 'snare' });
    expect(reasons(m.bots[0]!)).toEqual(['NEED_ITEM', 'ALREADY_DONE']);
    expect(count(m.room.state.players.get(idOf(m, 0))!, 'snare')).toBe(2);
    const portal = scenes[SCENE].portals[0]!;
    const p = sim(m, 0);
    p.x = (portal.x + 0.5) * TILE_PX;
    p.y = (portal.y + 0.5) * TILE_PX;
    handleSnareAbility(m.room, idOf(m, 0));
    teleport(m, m.bots[0]!, SCENE, x + 2, y);
    setPhase(m, Phase.meetingDiscussion);
    await act(m.bots[0]!, 'act.ability', { abilityId: 'snare' });
    expect(reasons(m.bots[0]!)).toEqual(['NEED_ITEM', 'ALREADY_DONE', 'NO_WAY', 'PHASE_CLOSED']);
    expect(count(m.room.state.players.get(idOf(m, 0))!, 'snare')).toBe(2);
  });

  it('reaches the layer and the seats within seeTiles, and no other client, not even for one patch', async () => {
    const { m, x, y } = await inForest();
    teleport(m, m.bots[1]!, SCENE, x + Math.floor(balance.snare.seeTiles), y); // within reach of the tile
    let farSaw = false;
    const watch = setInterval(() => {
      if (snaresHeld(m.bots[2]!).length + snaresHeld(m.bots[3]!).length > 0) farSaw = true;
    }, 5);
    give(m, 0, 'snare');
    await act(m.bots[0]!, 'act.ability', { abilityId: 'snare' });
    expect(
      await until(() => snaresHeld(m.bots[0]!).length === 1 && snaresHeld(m.bots[1]!).length === 1),
    ).toBe(true);
    // The layer walks away and keeps it; the close seat walks away and loses it.
    teleport(m, m.bots[0]!, SCENE, x + 6, y);
    teleport(m, m.bots[1]!, SCENE, x + 6, y);
    expect(await until(() => snaresHeld(m.bots[1]!).length === 0)).toBe(true);
    expect(snaresHeld(m.bots[0]!)).toHaveLength(1);
    // A seat entering the scene from elsewhere, far from it: the scene's view comes without the snare.
    const other = scenes[SCENE].portals[0]!.to as typeof SCENE;
    teleport(m, m.bots[3]!, other, scenes[other].portals[0]!.x, scenes[other].portals[0]!.y);
    await sleep(300);
    teleport(m, m.bots[3]!, SCENE, x + 7, y);
    await sleep(300);
    clearInterval(watch);
    expect(farSaw).toBe(false);
    // The prop carries its place only: no layer, no seat.
    const prop = [...stateOf(m.bots[0]!).scenes.get(SCENE)!.snares.values()][0]!;
    expect(Object.keys(prop.toJSON()).sort()).toEqual(['id', 'x', 'y']);
  });
});

describe('A snare springs (K6)', () => {
  it('holds the next walker, Slows it, logs the drawn look for the layer alone, and is spent', async () => {
    const { m, x, y } = await inForest();
    m.room.state.players.get(idOf(m, 1))!.look = 'baker';
    give(m, 0, 'snare');
    await act(m.bots[0]!, 'act.ability', { abilityId: 'snare' });
    await sleep(150);
    expect(heldBySnare(m.room, idOf(m, 0))).toBe(false); // the layer stood on it: safe until it steps off
    teleport(m, m.bots[0]!, SCENE, x + 3, y);
    teleport(m, m.bots[1]!, SCENE, x, y);
    expect(await until(() => heldBySnare(m.room, idOf(m, 1)))).toBe(true);
    expect(bodyOf(m.room, idOf(m, 1))?.effects.has('slowed')).toBe(true);
    const before = { x: sim(m, 1).x, y: sim(m, 1).y };
    move(m.bots[1]!, 1, 0);
    await sleep(300);
    expect({ x: sim(m, 1).x, y: sim(m, 1).y }).toEqual(before);
    const notes = m.room.state.players
      .get(idOf(m, 0))!
      .priv.notebook.filter((e) => e.note === NoteKind.snared);
    expect(notes).toHaveLength(1);
    expect(notes[0]!.of).toBe('baker');
    for (const i of [1, 2, 3])
      expect(
        m.room.state.players.get(idOf(m, i))!.priv.notebook.some((e) => e.note === NoteKind.snared),
      ).toBe(false);
    expect(m.room.state.scenes.get(SCENE)!.snares.size).toBe(0);
    // The hold ends after `holdS`; Slowed stays for its row's time.
    const holdTicks = Math.round(abilities.abilities.snare!.params!.holdS! * TICK_RATE);
    expect(await until(() => !heldBySnare(m.room, idOf(m, 1)), (holdTicks / TICK_RATE) * 1000 + 2000)).toBe(
      true,
    );
    expect(bodyOf(m.room, idOf(m, 1))?.effects.has('slowed')).toBe(true);
  });
});

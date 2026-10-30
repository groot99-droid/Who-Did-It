import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ColyseusTestServer } from '@colyseus/testing';
import { balance, interactions } from '@wdi/content';
import { C2S, TICK_RATE } from '@wdi/shared';
import { addStack } from '../src/sim/Inventory';
import { hiveOf } from '../src/sim/npc/hive';
import {
  advance,
  bootNpcServer,
  pauseClock,
  placeSeat,
  send,
  standardParty,
  type Human,
  type Party,
} from './npcHelpers';
import { sleep } from './simHelpers';

// Round 10, x2 (A253; GDD 3.7 and 3.14): an axe's chop and a pickaxe's smash sound at the tool walls. The pulse
// reaches a seat within the key's radius in the same scene, never the seat that made it, and the NPC board hears it
// too; the pulse names a scene, a point and a kind, never a seat. Before x2 the modes carried `noise: null`.

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootNpcServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

const ticks = (s: number) => Math.round(s * TICK_RATE);
type Pulse = { sceneId: string; x: number; y: number; kind: string };
const pulses = (h: Human): Pulse[] => h.log.filter((m) => m.type === 'noise').map((m) => m.payload as Pulse);

interface Wall {
  prop: string;
  interaction: string;
  tool: string;
  noise: 'chop' | 'smash';
  worker: [number, number];
  near: [number, number];
  far: [number, number];
}
// The forest's woodpile sits at (23, 22) and its first boulder at (16, 12); the listeners stand on the same row,
// one inside the key's radius and one outside it, in the same scene.
const WALLS: Wall[] = [
  {
    prop: 'fo.woodpile',
    interaction: 'chopLumber',
    tool: 'axe',
    noise: 'chop',
    worker: [23, 23],
    near: [29, 22],
    far: [34, 22],
  },
  {
    prop: 'fo.boulder_0',
    interaction: 'breakBoulder',
    tool: 'pickaxe',
    noise: 'smash',
    worker: [16, 13],
    near: [22, 12],
    far: [28, 12],
  },
];

async function party(w: Wall): Promise<Party> {
  const p = await standardParty(colyseus, 'S1', false, 3);
  pauseClock(p.room);
  const [worker, near, far] = p.humans as [Human, Human, Human];
  placeSeat(p, worker.id, 'forest', ...w.worker);
  placeSeat(p, near.id, 'forest', ...w.near);
  placeSeat(p, far.id, 'forest', ...w.far);
  const seat = p.room.state.players.get(worker.id)!;
  seat.priv.inventory.slots.clear();
  addStack(seat, w.tool, 1);
  advance(p, 1);
  for (const h of p.humans) h.log.length = 0;
  return p;
}

describe('chop and smash sound (x2)', () => {
  for (const w of WALLS) {
    it(`the ${w.tool} on ${w.prop} rings ${w.noise} for ${balance.noise[w.noise]} tiles, not for its maker`, async () => {
      const p = await party(w);
      const [worker, near, far] = p.humans as [Human, Human, Human];
      const mode = interactions.interactions[w.interaction]!.modes[0]!;
      await send(worker, C2S.hold, { action: 'interact', targetId: w.prop, on: true }, 60);
      advance(p, 1);
      advance(p, ticks(mode.holdS!) - 2);
      await sleep(80);
      expect(pulses(near)).toEqual([]);
      advance(p, 2);
      await sleep(120);
      const heard = pulses(near);
      expect(heard).toHaveLength(1);
      expect(heard[0]).toEqual({
        sceneId: 'forest',
        x: expect.any(Number),
        y: expect.any(Number),
        kind: w.noise,
      });
      expect(Object.keys(heard[0]!).sort()).toEqual(['kind', 'sceneId', 'x', 'y']);
      expect(pulses(far)).toEqual([]);
      expect(pulses(worker)).toEqual([]);
      const fact = [...hiveOf(p.room).all('noise')].find((f) => f.what === w.noise);
      expect(fact).toMatchObject({ kind: 'noise', sceneId: 'forest', what: w.noise });
    });
  }

  it('every cut mode of the table rings chop and every break mode smash, and both keys carry a radius', () => {
    expect(balance.noise.chop).toBeGreaterThan(0);
    expect(balance.noise.smash).toBeGreaterThan(balance.noise.chop - 1);
    for (const [id, it] of Object.entries(interactions.interactions)) {
      for (const mode of it.modes) {
        if (mode.tool?.tag === 'cut') expect(mode.noise, `${id} cut`).toBe('chop');
        if (mode.tool?.tag === 'break') expect(mode.noise, `${id} break`).toBe('smash');
      }
    }
  });
});

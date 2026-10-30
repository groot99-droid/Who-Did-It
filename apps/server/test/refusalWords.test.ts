import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ColyseusTestServer } from '@colyseus/testing';
import { roles, scenes } from '@wdi/content';
import { C2S, TILE_PX, type RefusalFrame, type SceneStateType } from '@wdi/shared';
import { hubOf } from '../src/sim/MapSites';
import { simOf } from '../src/sim/RoomSim';
import { advance, bootNpcServer, pauseClock, placeSeat, send, standardParty, type Party } from './npcHelpers';
import { sleep } from './simHelpers';

/**
 * The refusal words 10G's sweep left for 10X (A233): each test here failed before its fix. Every refusal still
 * carries a reason (A1); these pin the reason and its args at the sites whose words were wrong.
 */
let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => {
  ({ colyseus, release } = await bootNpcServer());
});
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

/** The error frames a human received, in order. */
const frames = (p: Party): RefusalFrame[] =>
  p.humans[0]!.log.filter((m) => m.type === 'error').map((m) => m.payload as RefusalFrame);

async function party(): Promise<Party> {
  const p = await standardParty(colyseus, 'S1');
  pauseClock(p.room);
  return p;
}

/** Sends one message, lets the step consume it and waits for the refusal to reach the client. */
async function act(p: Party, type: string, payload: unknown): Promise<void> {
  await send(p.humans[0]!, type, payload, 60);
  advance(p, 1);
  await sleep(80);
}

describe('refusal words (A233)', () => {
  it('refuses a gather out of reach as too far, with no target: a node is not always a pile', async () => {
    const p = await party();
    const human = p.humans[0]!;
    let placed: { sceneKey: string; id: string } | undefined;
    p.room.state.scenes.forEach((scene: SceneStateType, sceneKey: string) => {
      if (placed || scene.nodes.size === 0) return;
      const row = [...scene.nodes.values()][0] as { id: string };
      const spot = scenes[sceneKey as keyof typeof scenes].nodes?.find((n) => n.id === row.id);
      if (!spot) return;
      placeSeat(p, human.id, sceneKey as never, spot.x, spot.y);
      placed = { sceneKey, id: row.id };
    });
    if (!placed) throw new Error('no node on the wire');
    advance(p, 1);
    simOf(p.room).players.get(human.id)!.x += 10 * TILE_PX;
    await act(p, C2S.hold, { action: 'gather', targetId: placed.id, on: true });
    expect(frames(p).map((f) => [f.reason, f.args])).toEqual([['TOO_FAR', undefined]]);
  });

  it('refuses the Kill from a seat without the power as not its power, naming no item and no role', async () => {
    const p = await party();
    const human = p.humans[0]!;
    const unarmed = Object.keys(roles.roles).find((id) => !roles.roles[id]!.abilities.includes('kill'))!;
    p.room.state.players.get(human.id)!.priv.role.roleId = unarmed;
    await act(p, C2S.ability, { abilityId: 'kill', targetId: 'nonesuch' });
    expect(frames(p).map((f) => [f.reason, f.args])).toEqual([['NOT_YOUR_POWER', undefined]]);
  });

  it('refuses a spent Emergency Bell as used up for the match, not for the night', async () => {
    const p = await party();
    const human = p.humans[0]!;
    const hub = hubOf(p.room);
    const bell = scenes[hub].props.find((q) => q.kind === 'bell')!;
    placeSeat(p, human.id, hub, bell.x, bell.y + 1);
    const roleId = p.room.state.players.get(human.id)!.priv.role.roleId;
    simOf(p.room).players.get(human.id)!.bellPulls = roles.roles[roleId]?.bellPulls ?? 0;
    await act(p, C2S.bell, {});
    expect(frames(p).map((f) => [f.reason, f.args])).toEqual([['SPENT', { what: 'match' }]]);
  });
});

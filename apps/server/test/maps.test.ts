import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ColyseusTestServer } from '@colyseus/testing';
import { maps, scenes } from '@wdi/content';
import { C2S, ErrorCode, Phase, TILE_PX } from '@wdi/shared';
import { enterImmunity } from '../src/sim/Meeting';
import { simOf } from '../src/sim/RoomSim';
import { sceneIndex } from '../src/sim/World';
import { resetToLobby } from '../src/sim/Win';
import { until } from './flowHelpers';
import { bootNpcServer, errors, lobbyOf, placeSeat, send, start, toWorld, type Party } from './npcHelpers';

// GDD 3.13: the leader picks the map in the lobby; the room then plays it (round 5, Session 5J).
let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => {
  ({ colyseus, release } = await bootNpcServer());
});
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

const camp = scenes.bp_camp;
const yard = (spawn: string) => camp.spawns.find((s) => s.id === spawn)!;
const propAt = (id: string) => camp.props.find((p) => p.id === id)!;

/** Each seat's scene and tile. */
const placements = (party: Party) =>
  [...simOf(party.room).players.values()].map((p) => ({
    scene: p.sceneIdx,
    tile: `${Math.floor(p.x / TILE_PX)},${Math.floor(p.y / TILE_PX)}`,
  }));
const yardTiles = new Set(
  maps.blackpine.startSpawns.map((ref) => ref.split('.')[1]!).map((id) => `${yard(id).x},${yard(id).y}`),
);

async function blackpineMatch(n: number): Promise<Party> {
  const party = await lobbyOf(colyseus, n);
  await send(party.humans[0]!, C2S.lobbySettings, { map: 'blackpine' });
  await start(party);
  await toWorld(party);
  return party;
}

describe('lobby.settings {map} (GDD 3.13)', () => {
  it('takes a known map from the leader and refuses an unknown id or a guest', async () => {
    const party = await lobbyOf(colyseus, 2);
    const [leader, guest] = [party.humans[0]!, party.humans[1]!];
    expect(party.room.state.settings.map).toBe('hollowmere');
    await send(leader, C2S.lobbySettings, { map: 'blackpine' });
    expect(party.room.state.settings.map).toBe('blackpine');
    await send(leader, C2S.lobbySettings, { map: 'atlantis' });
    await send(leader, C2S.lobbySettings, { map: 7 });
    await send(guest, C2S.lobbySettings, { map: 'hollowmere' });
    expect(party.room.state.settings.map).toBe('blackpine');
    expect(errors(leader)).toEqual([ErrorCode.cannot, ErrorCode.cannot]);
    expect(errors(guest)).toEqual([ErrorCode.cannot]);
  });

  it('keeps the pick through the return to the lobby', async () => {
    const party = await blackpineMatch(4);
    resetToLobby(party.room);
    expect(party.room.state.phase).toBe(Phase.lobby);
    expect(party.room.state.settings.map).toBe('blackpine');
  });
});

describe('a match on Blackpine (GDD 3.13, WORLD 4.10)', () => {
  it('places the seats on the yard spawns of the camp and lays the teaching clue there', async () => {
    const party = await blackpineMatch(4);
    for (const p of placements(party)) {
      expect(p.scene).toBe(sceneIndex('bp_camp'));
      expect(yardTiles.has(p.tile), p.tile).toBe(true);
    }
    const clue = party.room.state.scenes.get('bp_camp')!.clues.get('clue_teaching');
    const at = propAt('bc.teaching_clue');
    expect(clue).toBeDefined();
    expect([clue!.x, clue!.y]).toEqual([(at.x + 0.5) * TILE_PX, (at.y + 0.5) * TILE_PX]);
    expect(party.room.state.scenes.get('overworld')!.clues.size).toBe(0);
  });

  it('spreads everyone over the yard when a meeting ends', async () => {
    const party = await blackpineMatch(4);
    for (const h of party.humans) placeSeat(party, h.id, 'bp_woods', 50, 22);
    enterImmunity(party.room);
    for (const p of placements(party)) {
      expect(p.scene).toBe(sceneIndex('bp_camp'));
      expect(yardTiles.has(p.tile), p.tile).toBe(true);
    }
  });

  it('rings the Bell only at the shift bell on the camp', async () => {
    const party = await blackpineMatch(4);
    const [a, b] = [party.humans[0]!, party.humans[1]!];
    party.room.state.phase = Phase.day;
    party.room.state.phaseEndsTick = party.room.state.tick + 20 * 3600;
    placeSeat(party, b.id, 'overworld', 28, 21); // beside Hollowmere's bell: not this map's hub
    await send(b, C2S.bell, {});
    expect(errors(b)).toEqual([ErrorCode.outOfRange]);
    const bell = propAt('bc.bell');
    placeSeat(party, a.id, 'bp_camp', bell.x, bell.y + 1);
    await send(a, C2S.bell, {});
    expect(errors(a)).toEqual([]);
    expect(await until(() => party.room.state.phase !== Phase.day)).toBe(true);
  });
});

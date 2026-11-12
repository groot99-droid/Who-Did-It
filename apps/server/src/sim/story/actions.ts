import { type SceneId, type StoryAction, scenes } from '@wdi/content';
import { ClueKind, TILE_PX } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { spawnClue } from '../Clues';
import { emitSim } from '../events/bus';
import { npcMemory } from '../npc/memory';
import { isSceneId, sceneIndex, tileCentre } from '../World';
import { holderOf } from './handover';

/** What an action asks of the story runner: it raises cards itself; the rest happens here. */
export interface ActionHost {
  room: PartyRoom;
  humanId: string;
  card(
    line: string,
    speaker: string | undefined,
    portrait: string | undefined,
    goalId: string | undefined,
  ): void;
}

const spawnOf = (sceneId: SceneId, id: string | undefined) => {
  const list = scenes[sceneId].spawns;
  return list.find((s) => s.id === id) ?? list[0];
};

/** `goTo`: the NPC seat that holds the card `roleId` travels to a spawn of `scene` (across scenes, as a hunt does). */
function npcOrder(
  host: ActionHost,
  roleId: string,
  order: string,
  args: Record<string, unknown> | undefined,
): void {
  const { room } = host;
  const seat = holderOf(room, host.humanId, roleId);
  const scene = args?.scene;
  if (order !== 'goTo' || seat === null || typeof scene !== 'string' || !isSceneId(scene)) return;
  const spawn = spawnOf(scene, undefined);
  if (spawn === undefined) return;
  const brain = npcMemory(room).brain(seat);
  brain.path = null;
  brain.act = {
    kind: 'travel',
    untilTick: room.state.tick + 60 * 20,
    stationId: '',
    goal: { scene: sceneIndex(scene), x: tileCentre(spawn.x, TILE_PX), y: tileCentre(spawn.y, TILE_PX) },
    hunt: true,
  };
}

/** `spawn`: a clue kind at `<sceneId>[:<spawnId>]`. An item id is announced on the bus and left to the economy. */
function spawnAt(host: ActionHost, kind: string, at: string): void {
  const [sceneId, spawnId] = at.split(':');
  if (sceneId === undefined || !isSceneId(sceneId)) return;
  const clue = (ClueKind as Record<string, number>)[kind];
  const spawn = spawnOf(sceneId, spawnId);
  if (clue !== undefined && spawn !== undefined)
    spawnClue(host.room, sceneId, { kind: clue, value: 0, dir: 0, tx: spawn.x, ty: spawn.y });
  else emitSim(host.room, { tick: host.room.state.tick, kind: 'story.spawn', sceneId, data: { kind } });
}

/** Runs one action once. */
export function runAction(host: ActionHost, action: StoryAction): void {
  if ('seq' in action) for (const a of action.seq) runAction(host, a);
  else if ('card' in action) host.card(action.line, action.speaker, action.portrait, action.goal);
  else if ('npcOrder' in action)
    npcOrder(host, action.npcOrder.npcId, action.npcOrder.order, action.npcOrder.args);
  else if ('spawn' in action) spawnAt(host, action.spawn.kind, action.spawn.at);
  else if ('cutscene' in action)
    emitSim(host.room, { tick: host.room.state.tick, kind: 'story.cutscene', data: { id: action.cutscene } });
  else
    emitSim(host.room, {
      tick: host.room.state.tick,
      kind: 'story.questStep',
      data: { ...action.questStep },
    });
}

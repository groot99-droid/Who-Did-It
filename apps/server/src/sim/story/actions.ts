import { type ArcAction, type ArcLine, type SceneId, roles, scenes } from '@wdi/content';
import { ClueKind, S2C, TILE_PX } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { spawnClue } from '../Clues';
import { emitSim } from '../events/bus';
import { npcMemory } from '../npc/memory';
import { simOf } from '../RoomSim';
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
    spoken?: boolean,
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

/**
 * `say` (arc E7): a spoken line. `by` names a card: the seat holding it speaks under its public name and look as they
 * stand now (so a cover shows as the cover); with no holder at the table the card's own name and look stand in.
 * `speaker` and `portrait` name a figure with no seat and win over the seat's.
 */
function say(host: ActionHost, line: ArcLine['say']): void {
  const seat = line.by === undefined ? null : holderOf(host.room, host.humanId, line.by);
  const held = seat === null ? undefined : host.room.state.players.get(seat);
  const card = roles.roles[held?.priv.role.roleId ?? line.by ?? ''];
  const name = line.speaker ?? held?.name ?? card?.name;
  // The look the table sees (`publishLooks`): a cover shows as its cover, never as the card it hides.
  const worn = card?.cover === true ? held?.priv.coverLook : card?.look;
  const look = line.portrait ?? (held?.look || worn || undefined);
  host.card(line.text, name, look, line.goal, true);
}

/** Runs one action once. */
export function runAction(host: ActionHost, action: ArcAction): void {
  if ('seq' in action) for (const a of action.seq) runAction(host, a);
  else if ('say' in action) say(host, action.say);
  else if ('card' in action) host.card(action.line, action.speaker, action.portrait, action.goal);
  else if ('npcOrder' in action)
    npcOrder(host, action.npcOrder.npcId, action.npcOrder.order, action.npcOrder.args);
  else if ('spawn' in action) spawnAt(host, action.spawn.kind, action.spawn.at);
  else if ('cutscene' in action) {
    emitSim(host.room, { tick: host.room.state.tick, kind: 'story.cutscene', data: { id: action.cutscene } });
    host.room.broadcast(S2C.cutscene, { id: action.cutscene, scope: 'all' }); // E12: it plays, it is not an event only
  } else if ('meeting' in action) {
    simOf(host.room).meetingRequests.push({ reason: 'bell', callerId: host.humanId }); // E12: the reveal plays the memorial
  } else
    emitSim(host.room, {
      tick: host.room.state.tick,
      kind: 'story.questStep',
      data: { ...action.questStep },
    });
}

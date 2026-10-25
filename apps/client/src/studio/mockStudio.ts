// Round 9 (9T): `#/studio?mock=1`, the Studio on an in-memory room so the page runs without a server. It walks the
// figure in the world frame with no collision; the real rules are the server's.
import mitt from 'mitt';
import { SCENE_IDS } from '@wdi/content';
import { TILE_PX } from '@wdi/shared/constants';
import type { StudioC2SPayloads, StudioC2SType } from '@wdi/shared/protocol';
import type { StudioLink, StudioLinkEvents, StudioSnapshot } from '../admin/StudioNet';
import { spawnsOf } from './model';

/** Every payload field at once: the mock reads whichever the message carries. */
type Loose = Partial<
  StudioC2SPayloads['studio.move'] &
    StudioC2SPayloads['studio.noclip'] &
    StudioC2SPayloads['studio.teleport'] &
    StudioC2SPayloads['studio.profile'] &
    StudioC2SPayloads['studio.time'] &
    StudioC2SPayloads['studio.clock'] &
    StudioC2SPayloads['studio.spawn'] &
    StudioC2SPayloads['studio.give']
>;

const SPEED_PX_PER_TICK = 4;
const SPRINT_X = 1.6;
const TICK_MS = 50;

export function createMockStudio(): StudioLink {
  const bus = mitt<StudioLinkEvents>();
  const s: StudioSnapshot = {
    tick: 0,
    sceneId: SCENE_IDS[0] ?? 'overworld',
    profile: 'large',
    x: 10 * TILE_PX,
    y: 10 * TILE_PX,
    tx: 10,
    ty: 10,
    yaw: 0,
    moving: false,
    noclip: false,
    scale: 1,
    paused: false,
    time: { phase: 'day', t: 0.5 },
    spawns: [],
    items: [],
  };
  let move = { dx: 0, dy: 0, sprint: false };
  let nextId = 1;
  const say = (line: string) => bus.emit('log', [line]);
  const timer = setInterval(() => {
    if (!s.paused) {
      s.tick += 1;
      const len = Math.hypot(move.dx, move.dy);
      s.moving = len > 0;
      if (s.moving) {
        const v = (SPEED_PX_PER_TICK * s.scale * (move.sprint ? SPRINT_X : 1)) / len;
        s.x = Math.max(0, s.x + move.dx * v);
        s.y = Math.max(0, s.y + move.dy * v);
        s.yaw = Math.atan2(move.dy, move.dx);
        s.tx = Math.floor(s.x / TILE_PX);
        s.ty = Math.floor(s.y / TILE_PX);
      }
    }
    bus.emit('snapshot', { ...s, spawns: [...s.spawns], items: [...s.items] });
  }, TICK_MS);

  const handle = <K extends StudioC2SType>(type: K, p: StudioC2SPayloads[K]): void => {
    const q = p as Loose;
    switch (type) {
      case 'studio.move':
        move = { dx: q.dx ?? 0, dy: q.dy ?? 0, sprint: Boolean(q.sprint) };
        return;
      case 'studio.noclip':
        s.noclip = Boolean(q.on);
        return;
      case 'studio.teleport': {
        const id = q.sceneId ?? s.sceneId;
        if (!(SCENE_IDS as readonly string[]).includes(id)) return bus.emit('refused', 'no such scene');
        if (q.spawnId !== undefined && !spawnsOf(id).includes(q.spawnId)) {
          return bus.emit('refused', 'bad teleport');
        }
        s.sceneId = id;
        s.spawns = [];
        s.x = (q.x ?? 10) * TILE_PX + TILE_PX / 2;
        s.y = (q.y ?? 10) * TILE_PX + TILE_PX / 2;
        say(`teleport ${id}`);
        return;
      }
      case 'studio.profile':
        s.profile = q.profile ?? s.profile;
        return;
      case 'studio.time':
        s.time = { phase: q.phase ?? s.time.phase, t: q.t ?? 0.5 };
        return;
      case 'studio.clock':
        if (q.scale !== undefined) s.scale = q.scale;
        if (q.paused !== undefined) s.paused = Boolean(q.paused);
        if (q.step !== undefined) s.tick += Number(q.step);
        return;
      case 'studio.spawn':
        s.spawns.push({
          id: `sp${nextId++}`,
          kind: q.kind ?? 'mob',
          ref: q.ref ?? '',
          x: s.tx,
          y: s.ty,
        });
        return;
      case 'studio.clearSpawns':
        s.spawns = [];
        return;
      case 'studio.give':
        s.items = [...s.items, q.itemId ?? ''];
        return;
      default:
        return;
    }
  };
  return {
    bus,
    send: handle,
    close: () => clearInterval(timer),
  };
}

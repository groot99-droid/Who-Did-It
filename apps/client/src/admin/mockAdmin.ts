// Round 6, Session 6D (docs/round6/auto-admin.md 8): a scripted `admin.snapshot` feed under `?mock=1#/admin` for the
// Playwright suite. It speaks the same `AdminLink` as the live room, answers the clock commands the way the server
// does (scale, pause, step), and leaves every message it receives on `window.__wdiAdminSent` for the specs to read.
import mitt from 'mitt';
import type {
  AdminC2SPayloads,
  AdminC2SType,
  AdminSeat,
  ClockScale,
  SimEventWire,
} from '@wdi/shared/protocol';
import type { AdminLink, AdminLinkEvents, AdminSnapshot } from './AdminNet';

/** Real milliseconds per mock tick at 1x; the live room ticks at the same pace. */
export const MOCK_TICK_MS = 100;

interface Script {
  id: string;
  name: string;
  roleId: string;
  look: string;
  coverOf?: string;
  sceneId: string;
  cx: number;
  cy: number;
  /** Walk radius in world px; 0 stands still. */
  r: number;
  brain?: AdminSeat['brain'];
}

/** Eight seats over seven scenes, so six viewports show and one scene queues. One Killer wears the Baker's look. */
const CAST: Script[] = [
  {
    id: 's1',
    name: 'Wren',
    roleId: 'killer',
    look: 'baker',
    coverOf: 'killer',
    sceneId: 'overworld',
    cx: 640,
    cy: 640,
    r: 160,
    brain: { mode: 'walk', goal: 'bakery', striking: false, flee: false },
  },
  {
    id: 's2',
    name: 'Moss',
    roleId: 'detective',
    look: 'detective',
    sceneId: 'overworld',
    cx: 760,
    cy: 560,
    r: 90,
    brain: { mode: 'idle', goal: '', striking: false, flee: false },
  },
  { id: 's3', name: 'Tam', roleId: 'doctor', look: 'doctor', sceneId: 'tavern_bar', cx: 420, cy: 420, r: 80 },
  { id: 's4', name: 'Iris', roleId: 'baker', look: 'baker', sceneId: 'bakery', cx: 380, cy: 380, r: 60 },
  {
    id: 's5',
    name: 'Fenn',
    roleId: 'townsfolk',
    look: 'townsfolk',
    sceneId: 'chapel',
    cx: 400,
    cy: 440,
    r: 70,
  },
  {
    id: 's6',
    name: 'Odd',
    roleId: 'accomplice',
    look: 'townsfolk',
    coverOf: 'accomplice',
    sceneId: 'forest',
    cx: 700,
    cy: 700,
    r: 140,
  },
  {
    id: 's7',
    name: 'Pike',
    roleId: 'watchman',
    look: 'watchman',
    sceneId: 'manor_hall',
    cx: 460,
    cy: 460,
    r: 0,
  },
  { id: 's8', name: 'Lark', roleId: 'child', look: 'child', sceneId: 'manor_hall', cx: 540, cy: 400, r: 0 },
];

/** Where a scripted seat stands at `tick`: a slow circle round its centre. */
export function seatAt(s: Script, tick: number): { x: number; y: number } {
  const a = tick / 12 + s.cx;
  return { x: Math.round(s.cx + Math.cos(a) * s.r), y: Math.round(s.cy + Math.sin(a) * s.r) };
}

/** What the script does at a tick: events for the log pane and one invariant failure. */
export const MOCK_KILL_TICK = 25;
export const MOCK_INVARIANT_TICK = 40;

export interface MockAdmin extends AdminLink {
  /** The messages received so far, oldest first. */
  readonly sent: Array<{ type: string; payload: unknown }>;
  /** Advances `n` ticks at once (the specs use it instead of waiting). */
  advance(n: number): void;
}

export function createMockAdmin(opts: { timer?: boolean } = {}): MockAdmin {
  const bus = mitt<AdminLinkEvents>();
  const sent: MockAdmin['sent'] = [];
  let tick = 0;
  let scale: ClockScale = 1;
  let paused = false;
  let phase = 1;
  let owed = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  let failed = false;

  const seats = (): AdminSeat[] =>
    CAST.map((s) => {
      const p = s.r === 0 ? { x: s.cx, y: s.cy } : seatAt(s, tick);
      return {
        id: s.id,
        name: s.name,
        roleId: s.roleId,
        look: s.look,
        ...(s.coverOf === undefined ? {} : { coverOf: s.coverOf }),
        sceneId: s.sceneId,
        x: p.x,
        y: p.y,
        dead: s.id === 's5' && tick >= MOCK_KILL_TICK,
        ...(s.brain === undefined ? {} : { brain: s.brain }),
      };
    });

  const emitSnapshot = (): void => {
    const snap: AdminSnapshot = {
      tick,
      phase,
      scale,
      paused,
      effectiveScale: paused ? 0 : scale,
      seats: seats(),
      invariants: failed
        ? [{ name: 'noNpcStuck', tick: MOCK_INVARIANT_TICK, detail: 's7 held goal manor_hall for 20 s' }]
        : [],
    };
    bus.emit('snapshot', snap);
  };

  const step = (): void => {
    tick += 1;
    const events: SimEventWire[] = [];
    if (tick === 1) events.push({ tick, kind: 'start' });
    if (tick === MOCK_KILL_TICK)
      events.push({ tick, kind: 'kill', seat: 's1', sceneId: 'chapel', data: { victim: 's5' } });
    if (tick === MOCK_INVARIANT_TICK) {
      failed = true;
      bus.emit('invariant', { name: 'noNpcStuck', tick, detail: 's7 held goal manor_hall for 20 s' });
    }
    if (events.length > 0) bus.emit('event', events);
  };

  const advance = (n: number): void => {
    for (let i = 0; i < n; i++) step();
    emitSnapshot();
  };

  const run = (): void => {
    if (paused) return;
    owed += scale;
    const n = Math.floor(owed);
    owed -= n;
    if (n > 0) advance(n);
  };

  const link: MockAdmin = {
    bus,
    sent,
    advance,
    send<K extends AdminC2SType>(type: K, payload: AdminC2SPayloads[K]): void {
      sent.push({ type, payload });
      if (type === 'admin.clock') {
        const c = payload as AdminC2SPayloads['admin.clock'];
        if (c.scale !== undefined) scale = c.scale;
        if (c.paused !== undefined) paused = c.paused;
        if (c.step !== undefined && paused) advance(c.step);
      } else if (type === 'admin.start') {
        phase = 1;
        paused = false;
      } else if (type === 'admin.reset') {
        tick = 0;
        phase = 0;
        paused = true;
        failed = false;
        emitSnapshot();
      }
    },
    close(): void {
      if (timer !== null) clearInterval(timer);
      timer = null;
      bus.emit('closed', { reason: 'closed' });
    },
  };
  if (opts.timer !== false) {
    timer = setInterval(run, MOCK_TICK_MS);
    queueMicrotask(emitSnapshot);
  }
  return link;
}

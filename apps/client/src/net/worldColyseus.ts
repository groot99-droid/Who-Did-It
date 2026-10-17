import mitt, { type Emitter } from 'mitt';
import type { Room } from '@colyseus/sdk';
import type { HoldAction, NightRevealEntry } from '@wdi/shared/protocol';
import type {
  BodySnap,
  ClueSnap,
  DoorSnap,
  NightWindow,
  NotebookSnap,
  MoveCmd,
  NoisePulse,
  PlayerSnap,
  PresenceSnap,
  PropSnap,
  SceneEnter,
  WorldFeed,
  WorldFeedEvents,
} from './world';

// Reads the live room. The state is the shared schema of @wdi/shared; the client keeps loose structural
// types here so it does not pull the schema runtime into the bundle.

type PresenceState = PresenceSnap;
interface PlayerState {
  id: string;
  name: string;
  traits: { height: number; scarf: number; hat: number };
  alive: boolean;
  presence?: PresenceState;
  priv?: {
    notebook?: { forEach(cb: (e: NotebookSnap) => void): void };
    cabalMates?: { forEach(cb: (id: string) => void): void };
    nightReveal?: { forEach(cb: (e: NightRevealEntry) => void): void };
  };
}
interface Collection<T> {
  forEach(cb: (item: T, id: string) => void): void;
}
interface SceneStateLike {
  doors: Collection<DoorSnap>;
  bodies?: Collection<BodySnap>;
  clues?: Collection<ClueSnap>;
  props?: Collection<PropSnap>;
}
interface GameStateLike {
  tick: number;
  phase: number;
  phaseEndsTick: number;
  startTick: number;
  players: Collection<PlayerState> & { get(id: string): PlayerState | undefined };
  scenes: { forEach(cb: (s: SceneStateLike, id: string) => void): void };
  settings?: { mode?: number };
}

export class ColyseusWorldFeed implements WorldFeed {
  readonly bus: Emitter<WorldFeedEvents> = mitt<WorldFeedEvents>();

  constructor(private readonly room: Room) {
    room.onMessage('sceneEnter', (m: SceneEnter) => this.bus.emit('sceneEnter', m));
    room.onMessage('noise', (m: NoisePulse) => this.bus.emit('noise', m));
    room.onMessage('killed', (m: WorldFeedEvents['killed']) => {
      this.ghost = true;
      this.bus.emit('killed', m);
    });
    room.onMessage('clueFound', (m: WorldFeedEvents['clueFound']) => this.bus.emit('clueFound', m));
    room.onMessage('phaseChange', (m: WorldFeedEvents['phaseChange']) => {
      // The night's windows live in the Conductor; a phase change ends any window this feed still holds.
      this.window = null;
      this.bus.emit('phaseChange', m);
    });
    room.onMessage('nightWake', (m: NightWindow) => {
      this.window = m;
      this.bus.emit('nightWake', m);
    });
    room.onMessage('nightReveal', (m: WorldFeedEvents['nightReveal']) => this.bus.emit('nightReveal', m));
    room.onMessage('nightSleep', () => {
      this.window = null;
      this.bus.emit('nightSleep', {});
    });
  }

  /** The open night window (quick mode); set by `nightWake`, cleared by `nightSleep` and a phase change. */
  private window: NightWindow | null = null;

  /** Set by the private `killed` message or a false roster `alive`; cleared when the lobby returns. */
  private ghost = false;

  /** The room this feed reads; the router compares it to spot a reconnect to a new room. */
  get sessionRoom(): Room {
    return this.room;
  }

  get selfId(): string {
    return this.room.sessionId;
  }

  private get state(): GameStateLike {
    return this.room.state as unknown as GameStateLike;
  }

  snapshot(): PlayerSnap[] {
    const out: PlayerSnap[] = [];
    this.state.players.forEach((p) => {
      const pr = p.presence;
      out.push({
        id: p.id,
        name: p.name,
        traits: { height: p.traits?.height ?? 0, scarf: p.traits?.scarf ?? 0, hat: p.traits?.hat ?? 0 },
        alive: p.alive,
        presence: pr
          ? {
              x: pr.x,
              y: pr.y,
              yaw: pr.yaw,
              animId: pr.animId,
              statusBits: pr.statusBits,
              transitUntilTick: pr.transitUntilTick,
            }
          : null,
      });
    });
    return out;
  }

  doors(): DoorSnap[] {
    const out: DoorSnap[] = [];
    // The view holds a single SceneState: the one this client is standing in.
    this.state.scenes.forEach((scene) =>
      scene.doors.forEach((d) => out.push({ id: d.id, state: d.state, swingUntilTick: d.swingUntilTick })),
    );
    return out;
  }

  mode(): 'main' | 'onub' {
    return this.state.settings?.mode === 1 ? 'onub' : 'main';
  }

  props(): PropSnap[] {
    const out: PropSnap[] = [];
    this.state.scenes.forEach((scene) =>
      scene.props?.forEach((p) => out.push({ id: p.id, kind: p.kind, turned: p.turned, of: p.of })),
    );
    return out;
  }

  mates(): string[] {
    const out: string[] = [];
    this.state.players.get(this.selfId)?.priv?.cabalMates?.forEach((id) => out.push(id));
    return out;
  }

  nightReveal(): NightRevealEntry[] {
    const out: NightRevealEntry[] = [];
    this.state.players
      .get(this.selfId)
      ?.priv?.nightReveal?.forEach((e) => out.push({ slot: e.slot, of: e.of, roleId: e.roleId }));
    return out;
  }

  wake(): NightWindow | null {
    return this.window;
  }

  bodies(): BodySnap[] {
    const out: BodySnap[] = [];
    this.state.scenes.forEach((scene) =>
      scene.bodies?.forEach((b) => out.push({ id: b.id, of: b.of, x: b.x, y: b.y, hidden: b.hidden })),
    );
    return out;
  }

  clues(): ClueSnap[] {
    const out: ClueSnap[] = [];
    this.state.scenes.forEach((scene) =>
      scene.clues?.forEach((c) =>
        out.push({ id: c.id, kind: c.kind, value: c.value, dir: c.dir, x: c.x, y: c.y, claimed: c.claimed }),
      ),
    );
    return out;
  }

  notebook(): NotebookSnap[] {
    const out: NotebookSnap[] = [];
    this.state.players.get(this.selfId)?.priv?.notebook?.forEach((e) =>
      out.push({
        id: e.id,
        clueKind: e.clueKind,
        value: e.value,
        sceneId: e.sceneId,
        tick: e.tick,
        status: e.status,
      }),
    );
    return out;
  }

  dead(): boolean {
    const s = this.state;
    if (s.phase === 0) this.ghost = false;
    else if (s.players.get(this.selfId)?.alive === false) this.ghost = true;
    return this.ghost;
  }

  clock() {
    const s = this.state;
    return { tick: s.tick, phase: s.phase, phaseEndsTick: s.phaseEndsTick, startTick: s.startTick };
  }

  sendMove(cmd: MoveCmd): void {
    this.room.send('input.move', cmd);
  }

  enterPortal(portalId: string): void {
    this.room.send('act.enterPortal', { portalId });
  }

  kill(targetId: string): void {
    this.ability('kill', targetId);
  }

  ability(id: string, targetId?: string, targetId2?: string): void {
    this.room.send('act.ability', {
      abilityId: id,
      ...(targetId === undefined ? {} : { targetId }),
      ...(targetId2 === undefined ? {} : { targetId2 }),
    });
  }

  hold(action: HoldAction, targetId: string, on: boolean): void {
    this.room.send('act.hold', { action, targetId, on });
  }

  reportBody(bodyId: string): void {
    this.room.send('act.reportBody', { bodyId });
  }

  bell(): void {
    this.room.send('act.bell', {});
  }

  dispose(): void {
    this.bus.all.clear();
  }
}

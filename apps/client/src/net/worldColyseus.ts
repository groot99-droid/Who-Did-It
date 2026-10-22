import mitt, { type Emitter } from 'mitt';
import type { Room } from '@colyseus/sdk';
import type { HoldAction } from '@wdi/shared/protocol';
import type {
  AvatarSnap,
  BodySnap,
  CoverState,
  ClueSnap,
  DoorSnap,
  NotebookSnap,
  MoveCmd,
  NoisePulse,
  PlayerSnap,
  PresenceSnap,
  SceneEnter,
  WorldFeed,
  WorldFeedEvents,
  MobSnap,
  NodeSnap,
  QuestSnap,
} from './world';

// Reads the live room. The state is the shared schema of @wdi/shared; the client keeps loose structural
// types here so it does not pull the schema runtime into the bundle.

type PresenceState = PresenceSnap;
interface PlayerState {
  id: string;
  name: string;
  traits: { height: number; scarf: number; hat: number };
  alive: boolean;
  look?: string;
  presence?: PresenceState;
  priv?: {
    notebook?: { forEach(cb: (e: NotebookSnap) => void): void };
    avatar?: string;
    coverLook?: string;
    mateLooks?: { forEach(cb: (look: string, seat: string) => void): void };
  };
}
interface AvatarState {
  lookOf: string;
  height: number;
  x: number;
  y: number;
  yaw: number;
  animId: number;
  statusBits: number;
  transitUntilTick: number;
  seat?: string;
}
interface Collection<T> {
  forEach(cb: (item: T, id: string) => void): void;
}
interface SceneStateLike {
  doors: Collection<DoorSnap>;
  bodies?: Collection<BodySnap>;
  clues?: Collection<ClueSnap>;
  avatars?: Collection<AvatarState>;
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
    room.onMessage('phaseChange', (m: WorldFeedEvents['phaseChange']) => this.bus.emit('phaseChange', m));
    room.onMessage('aim', (m: WorldFeedEvents['aim']) => this.bus.emit('aim', m));
    room.onMessage('vfx', (m: WorldFeedEvents['vfx']) => this.bus.emit('vfx', m));
    // Round 6 (locked): the cutscene and mini-game messages reach the bus; 6J and 6I consume them.
    room.onMessage('cutscene', (m: WorldFeedEvents['cutscene']) => this.bus.emit('cutscene', m));
    room.onMessage('minigameStart', (m: WorldFeedEvents['minigameStart']) =>
      this.bus.emit('minigameStart', m),
    );
  }

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
      // Others arrive as avatars (round 5); a presence on any other row is never read.
      const pr = p.id === this.selfId ? p.presence : undefined;
      out.push({
        id: p.id,
        name: p.name,
        traits: { height: p.traits?.height ?? 0, scarf: p.traits?.scarf ?? 0, hat: p.traits?.hat ?? 0 },
        alive: p.alive,
        look: p.look ?? '',
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

  avatars(): AvatarSnap[] {
    const out: AvatarSnap[] = [];
    // The view holds the avatars of one scene only: the one this client is standing in.
    this.state.scenes.forEach((scene) =>
      scene.avatars?.forEach((a, handle) =>
        out.push({
          handle,
          lookOf: a.lookOf,
          height: a.height,
          x: a.x,
          y: a.y,
          yaw: a.yaw,
          animId: a.animId,
          statusBits: a.statusBits,
          transitUntilTick: a.transitUntilTick,
          ...(a.seat ? { seat: a.seat } : {}),
        }),
      ),
    );
    return out;
  }

  selfHandle(): string {
    return this.state.players.get(this.selfId)?.priv?.avatar ?? '';
  }

  coverState(): CoverState {
    const priv = this.state.players.get(this.selfId)?.priv;
    const mates: Record<string, string> = {};
    priv?.mateLooks?.forEach((look, seat) => (mates[seat] = look));
    return { look: priv?.coverLook ?? '', mates };
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

  ability(id: string, targetId?: string): void {
    this.room.send('act.ability', { abilityId: id, ...(targetId === undefined ? {} : { targetId }) });
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

  // Round 6 (6I fills the readers from `SceneState.nodes`, `SceneState.mobs` and `Private.quests`).
  nodes(): NodeSnap[] {
    return [];
  }

  mobs(): MobSnap[] {
    return [];
  }

  quests(): QuestSnap[] {
    return [];
  }

  minigameResult(taskId: string, answer: unknown): void {
    this.room.send('minigame.result', { taskId, answer });
  }

  dispose(): void {
    this.bus.all.clear();
  }
}

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
  TaskSnap,
  StackSnap,
  CivicAct,
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
    notebook?: { forEach(cb: (e: Required<NotebookSnap>) => void): void };
    inventory?: { slots?: { forEach(cb: (s: StackSnap) => void): void } };
    quests?: { forEach(cb: (q: QuestSnap) => void): void };
    tasks?: { forEach(cb: (t: TaskSnap) => void): void };
    purse?: number;
    faith?: number; // round 8, 8D
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
  /** Round 8 (8L): the bits seen only from close by (Blood); the server sends them only in range. */
  nearBits?: number;
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
  nodes?: Collection<NodeSnap>;
  mobs?: Collection<MobSnap>;
}
interface GameStateLike {
  tick: number;
  taskBar?: number;
  /** Round 8, 8D: `GameState.hq`, station id to bought tier. */
  hq?: { forEach(cb: (tier: number, id: string) => void): void };
  phase: number;
  phaseEndsTick: number;
  startTick: number;
  players: Collection<PlayerState> & { get(id: string): PlayerState | undefined };
  scenes: { forEach(cb: (s: SceneStateLike, id: string) => void): void };
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
    // Round 8 (8B): inspect's three private messages.
    for (const type of ['inspect.result', 'inspect.noticed', 'inspect.hunch'] as const)
      room.onMessage(type, (m: never) => this.bus.emit(type, m));
    // Round 8, 8C (locked): the shop a `shop` hold opened.
    room.onMessage('shop.open', (m: WorldFeedEvents['shopOpen']) => this.bus.emit('shopOpen', m));
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
          statusBits: a.statusBits | (a.nearBits ?? 0),
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
        note: e.note,
        of: e.of,
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

  // Round 6 (6I): the scene's nodes and mobs, and this seat's own quests and inventory.
  nodes(): NodeSnap[] {
    const out: NodeSnap[] = [];
    this.state.scenes.forEach((scene) =>
      scene.nodes?.forEach((n, id) =>
        out.push({ id: n.id || id, resource: n.resource, x: n.x, y: n.y, active: n.active }),
      ),
    );
    return out;
  }

  mobs(): MobSnap[] {
    const out: MobSnap[] = [];
    this.state.scenes.forEach((scene) =>
      scene.mobs?.forEach((m, id) =>
        out.push({
          id: m.id || id,
          kind: m.kind,
          x: m.x,
          y: m.y,
          yaw: m.yaw,
          animId: m.animId,
          state: m.state,
        }),
      ),
    );
    return out;
  }

  quests(): QuestSnap[] {
    const out: QuestSnap[] = [];
    this.state.players
      .get(this.selfId)
      ?.priv?.quests?.forEach((q) => out.push({ id: q.id, progress: q.progress, done: q.done }));
    return out;
  }

  inventory(): StackSnap[] {
    const out: StackSnap[] = [];
    this.state.players
      .get(this.selfId)
      ?.priv?.inventory?.slots?.forEach((s) => out.push({ defId: s.defId, qty: s.qty }));
    return out;
  }

  tasks(): TaskSnap[] {
    const out: TaskSnap[] = [];
    this.state.players
      .get(this.selfId)
      ?.priv?.tasks?.forEach((t) => out.push({ id: t.id, done: t.done, fake: t.fake }));
    return out;
  }

  taskBar(): number {
    return this.state.taskBar ?? 0;
  }

  // Round 8, 8C (locked; GDD 3.23): the purse and the shop's trades.
  purse(): number {
    return this.state.players.get(this.selfId)?.priv?.purse ?? 0;
  }

  buy(shopId: string, itemId: string, qty: number): void {
    this.room.send('act.buy', { shopId, itemId, qty });
  }

  sell(shopId: string, itemId: string, qty: number): void {
    this.room.send('act.sell', { shopId, itemId, qty });
  }

  // Round 8, 8D (GDD 3.23): Faith, the public HQ tiers and the civic acts.
  faith(): number {
    return this.state.players.get(this.selfId)?.priv?.faith ?? 0;
  }

  hqTiers(): Record<string, number> {
    const out: Record<string, number> = {};
    this.state.hq?.forEach((tier, id) => (out[id] = tier));
    return out;
  }

  civic(type: CivicAct, payload: object): void {
    this.room.send(type, payload);
  }

  questAccept(questId: string): void {
    this.room.send('quest.accept', { questId });
  }

  questTurnIn(questId: string): void {
    this.room.send('quest.turnIn', { questId });
  }

  light(on: boolean): void {
    this.room.send('act.light', { on });
  }

  minigameResult(taskId: string, answer: unknown): void {
    this.room.send('minigame.result', { taskId, answer });
  }

  inspect(targetId: string): void {
    this.room.send('act.inspect', { targetId });
  }

  dispose(): void {
    this.bus.all.clear();
  }
}

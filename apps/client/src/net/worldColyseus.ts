import mitt, { type Emitter } from 'mitt';
import type { Room } from '@colyseus/sdk';
import balance from '@wdi/content/data/balance.json';
import type { HoldAction } from '@wdi/shared/protocol';
import { paintTarget } from '@wdi/shared/rules';
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
  OwnBodySnap,
  OwnEffectSnap,
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
    inventory?: {
      slots?: { forEach(cb: (s: StackSnap & { slot: number }) => void): void };
      selected?: number;
    };
    quests?: { forEach(cb: (q: QuestSnap) => void): void };
    body?: Omit<OwnBodySnap, 'effects'> & { effects: { forEach(cb: (e: OwnEffectSnap) => void): void } };
    tasks?: { forEach(cb: (t: TaskSnap) => void): void };
    purse?: number;
    faith?: number; // round 8, 8D
    asleep?: boolean; // round 10, A7
    inBed?: number;
    inBedOf?: number;
    onLine?: boolean; // round 10, C1
    fare?: number; // round 10, C2
    paintTown?: boolean; // round 10, C5
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
      // Round 10, C1b (seams.md 3, row 6): a death on the line names no role, and it makes no ghost.
      const onLine = Object.keys(m.roles ?? {}).length === 0;
      this.ghost = !onLine;
      this.line = onLine;
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
    room.onMessage('coopHold', (m: WorldFeedEvents['coopHold']) => this.bus.emit('coopHold', m));
    room.onMessage('shout', (m: WorldFeedEvents['shout']) => this.bus.emit('shout', m)); // round 8, 8R
    room.onMessage('mugPrompt', (m: WorldFeedEvents['mugPrompt']) => this.bus.emit('mugPrompt', m));
  }

  /** Set by the private `killed` message or a false roster `alive`; cleared when the lobby returns. */
  private ghost = false;
  /** Round 10, C1b: the seat has been on the line since its death, so its `killed` made no ghost. */
  private line = false;

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
    const self = s.players.get(this.selfId);
    const next = ghostAfter(
      { ghost: this.ghost, line: this.line },
      { phase: s.phase, alive: self?.alive, onLine: self?.priv?.onLine === true },
    );
    this.ghost = next.ghost;
    this.line = next.line;
    return this.ghost;
  }

  onLine(): boolean {
    return this.state.players.get(this.selfId)?.priv?.onLine === true;
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
      ?.priv?.inventory?.slots?.forEach((s) => out.push({ defId: s.defId, qty: s.qty, slot: s.slot }));
    return out;
  }

  selectedSlot(): number {
    return this.state.players.get(this.selfId)?.priv?.inventory?.selected ?? 0;
  }

  /** Round 8 (8A): the own `Private.body`; null while the row is empty (`maxHp` 0: the lobby, the card, a ghost). */
  body(): OwnBodySnap | null {
    const b = this.state.players.get(this.selfId)?.priv?.body;
    if (!b || b.maxHp <= 0) return null;
    const effects: OwnEffectSnap[] = [];
    b.effects.forEach((e) => effects.push({ id: e.id, untilTick: e.untilTick, stacks: e.stacks }));
    return { hp: b.hp, maxHp: b.maxHp, stamina: b.stamina, maxStamina: b.maxStamina, effects };
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
  paintTarget(): number {
    if (this.state.players.get(this.selfId)?.priv?.paintTown !== true) return 0;
    let seats = 0;
    this.state.players.forEach(() => seats++);
    return paintTarget(balance.paintTown.winUnique, seats - 2);
  }

  fare(): number {
    return this.state.players.get(this.selfId)?.priv?.fare ?? 0;
  }

  purse(): number {
    return this.state.players.get(this.selfId)?.priv?.purse ?? 0;
  }

  buy(shopId: string, itemId: string, qty: number): void {
    this.room.send('act.buy', { shopId, itemId, qty });
  }

  sell(shopId: string, itemId: string, qty: number): void {
    this.room.send('act.sell', { shopId, itemId, qty });
  }

  // Round 10 (A7, GDD 3.32): the own sleep state; the counts are written only while asleep.
  sleeping(): { asleep: boolean; inBed: number; inBedOf: number } {
    const priv = this.state.players.get(this.selfId)?.priv;
    return { asleep: priv?.asleep ?? false, inBed: priv?.inBed ?? 0, inBedOf: priv?.inBedOf ?? 0 };
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

  invMove(from: number, to: number): void {
    this.room.send('inv.move', { from, to });
  }

  invSelect(slot: number): void {
    this.room.send('inv.select', { slot });
  }

  craftGrid(size: 2 | 3, cells: Array<string | null>): void {
    this.room.send('craft.grid', { size, cells });
  }

  minigameResult(taskId: string, answer: unknown): void {
    this.room.send('minigame.result', { taskId, answer });
  }

  inspect(targetId: string): void {
    this.room.send('act.inspect', { targetId });
  }

  mug(choice: 'pay' | 'fight' | 'flee'): void {
    this.room.send('act.mug', { choice });
  }

  dispose(): void {
    this.bus.all.clear();
  }
}

/**
 * The ghost flag after a read of the own seat (round 10, C1b; GDD 3.22). A `killed` or a false roster `alive` makes a
 * ghost, the lobby clears it, and a seat on the line is no ghost: its `alive` may read false after a meeting, and when
 * the morning train brings it back the flag its `killed` set is cleared.
 */
export function ghostAfter(
  was: { ghost: boolean; line: boolean },
  now: { phase: number; alive: boolean | undefined; onLine: boolean },
): { ghost: boolean; line: boolean } {
  if (now.phase === 0) return { ghost: false, line: false };
  if (now.onLine) return { ghost: false, line: true };
  if (was.line) return { ghost: now.alive === false, line: false };
  return { ghost: was.ghost || now.alive === false, line: false };
}

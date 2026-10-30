import type { Emitter } from 'mitt';
import type { ErrorPayload, HoldAction, S2CPayloads } from '@wdi/shared/protocol';

// What the World scene needs from the network. `ColyseusWorldFeed` reads the room state, the mock feed
// (?mock=1) simulates the same data locally; the scene cannot tell them apart. Kept apart from
// NetworkService.ts (lobby) so the two features do not share a file.

export interface PresenceSnap {
  x: number;
  y: number;
  yaw: number;
  animId: number;
  statusBits: number;
  transitUntilTick: number;
}

export interface PlayerSnap {
  id: string;
  name: string;
  /** Trait indices as dealt: height S/M/T, scarf red/green/blue, hat cap/bowler/bare (GDD 3.1). */
  traits: { height: number; scarf: number; hat: number };
  /** Public roster flag; it flips for a victim only when the next meeting opens (A30). */
  alive: boolean;
  /** Public look id (`looks.json`): '' until the role card closes, then fixed for the match (GDD 3.17). */
  look: string;
  /** Set for this client's own seat only (round 5): every other seat walks as an avatar, see `avatars()`. */
  presence: PresenceSnap | null;
}

/**
 * A walking figure in this client's scene (GDD 3.17), keyed by an opaque handle that is re-rolled on every scene
 * entry and death, and when an impersonation applies or drops. `lookOf` is the seat whose name, look, scarf and hat
 * glyph are drawn; `height` is always the walker's own. `seat` (the true seat) is set for a ghost viewer only.
 */
export interface AvatarSnap {
  handle: string;
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

/** A cover role's own pick and its Cabal mates' picks, read live from the private view (empty for everyone else). */
export interface CoverState {
  /** The look this seat will walk as; '' for a seat that is not a cover role. */
  look: string;
  /** Cabal mate seat id -> the look it currently has picked. */
  mates: Record<string, string>;
}

/** A body in the scene this client stands in. `x`/`y` are pixel centres, used unscaled. */
export interface BodySnap {
  id: string;
  /** The dead player's id: the body wears their public traits. */
  of: string;
  x: number;
  y: number;
  hidden: boolean;
}

/** A clue in the scene this client stands in. `kind` is a `ClueKind`, `dir` an index of `DIRECTIONS`. */
export interface ClueSnap {
  id: string;
  kind: number;
  value: number;
  dir: number;
  x: number;
  y: number;
  claimed: boolean;
}

/** One of this player's own Notebook entries; `sceneId` is an index into the frozen scene id list. */
export interface NotebookSnap {
  id: string;
  clueKind: number;
  value: number;
  sceneId: number;
  tick: number;
  status: number;
  /** `NoteKind` of a power or vendetta note (0 a clue entry) and the seat it is about ('' for a clue). */
  note?: number;
  of?: string;
}

export interface DoorSnap {
  id: string;
  state: number;
  swingUntilTick: number;
}

export interface SceneEnter {
  sceneId: string;
  spawn: string;
  facing: string;
}

export interface NoisePulse {
  sceneId: string;
  x: number;
  y: number;
  kind: string;
}

export interface MoveCmd {
  seq: number;
  dx: number;
  dy: number;
  sprint: boolean;
  sneak: boolean;
}

export type WorldFeedEvents = {
  sceneEnter: SceneEnter;
  noise: NoisePulse;
  error: ErrorPayload;
  /** Private: this player was killed and is now a ghost. */
  killed: { sceneId: string; cause: string; roles: Record<string, string>; cutsceneId?: string };
  /** Private: a collect finished; the entry is in `notebook()`. */
  clueFound: { entryId: string };
  phaseChange: { phase: number; endsTick: number };
  /** The puff of a disguise a Knife strike dropped, at (x, y) in `sceneId`; it names no handle or seat (GDD 3.17). */
  vfx: { sceneId: string; x: number; y: number; kind: 'disguise' };
  /** Private, a dying Gamekeeper: pick a seat with `ability('lastShot', seatId)` before `endsTick` (GDD 3.2). */
  aim: { endsTick: number };
  /** Mock only: the mock world's report or bell asks the mock network to open a meeting (round 3, M | N seam). */
  meetingRequest: { reason: 'body' | 'bell'; callerId: string; bodyOf?: string };
  /** Round 6 (6J): play a cutscene; the router keeps an opening under `REG_CUTSCENE` for the World. */
  cutscene: { id: string; scope?: 'all' };
  /** Private, round 6 (6H, 6I): a station task's mini-game opened; answered with `minigameResult`. */
  minigameStart: { taskId: string; kind: string; public: unknown };
  /** Private, round 8 (8B, GDD 3.22): what the eye read of the inspected avatar. */
  'inspect.result': S2CPayloads['inspect.result'];
  /** Private, round 8: a look of `lookId` looked this player over. */
  'inspect.noticed': S2CPayloads['inspect.noticed'];
  /** Private, round 8: a card-blind hunch, an `inspect.hunch.*` copy id. */
  'inspect.hunch': S2CPayloads['inspect.hunch'];
  /** Private, round 8, 8C (locked; GDD 3.23): a `shop` hold opened this shop (`S2C.shopOpen`). */
  shopOpen: {
    shopId: string;
    /** Round 10, C3: `left`, a stall's stock today (seams.md row 15). */
    stock: Array<{ itemId: string; price: number; left?: number }>;
    buys: Array<{ itemId: string; price: number }>;
  };
  /** Private, round 7 (7M, GDD 3.5): the hands on the co-op hold this seat is in and its shared progress (0 to 1). */
  coopHold: { taskId: string; holders: number; progress: number };
  /** Private, round 8 (8R, GDD 3.12): an NPC shouted for a body here; to the nearest Detective and Doctor only. */
  shout: S2CPayloads['shout'];
  /** Private, round 8 (8E, GDD 3.24): a mugger's demand; `muggerId` is its avatar handle, the answer is due by `endsTick`. */
  mugPrompt: { muggerId: string; endsTick: number };
};

/** Round 6 (M5b): a resource node of the scene this client is in (`SceneState.nodes`). */
export interface NodeSnap {
  id: string;
  resource: string;
  x: number;
  y: number;
  active: boolean;
}

/** Round 6 (M5b): a creature of the scene this client is in (`SceneState.mobs`); no seat, no handle. */
export interface MobSnap {
  id: string;
  kind: string;
  x: number;
  y: number;
  yaw: number;
  animId: number;
  state: number;
}

/** Round 6 (M5b): one inventory slot of this player's own pockets (`Private.inventory.slots`). */
export interface StackSnap {
  defId: string;
  qty: number;
  /** Round 10 (A12): the slot number of `rules/inventory.ts`; absent in a mock that keeps the stacks in a list. */
  slot?: number;
}

/** Round 6 (M5b): one of this player's own quests (`Private.quests`). */
export interface QuestSnap {
  id: string;
  progress: number;
  done: boolean;
}

/** Round 8 (8A, GDD 3.22): one effect on this seat's body (`Private.body.effects`): the wire id, the tick it wears off (0 while it lasts), its stacks. */
export interface OwnEffectSnap {
  id: number;
  untilTick: number;
  stacks: number;
}

/** Round 8 (8A, GDD 3.22): this seat's own `Private.body`, in the units of `balance.json` `body`; own view only. */
export interface OwnBodySnap {
  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
  effects: readonly OwnEffectSnap[];
}

/** Round 7 (7M, GDD 3.5): one entry of this player's own task list, real or a fake one for the alibi theatre. */
export interface TaskSnap {
  id: string;
  done: boolean;
  fake: boolean;
}

/** Round 8, 8D (GDD 3.23): the civic acts a client sends through `WorldFeed.civic`. */
export type CivicAct = 'act.donate' | 'act.faith' | 'act.notice' | 'act.hq' | 'act.payRent';

export interface WorldFeed {
  readonly bus: Emitter<WorldFeedEvents>;
  readonly selfId: string;
  /** Everyone on the roster; `presence` is set for the own seat only. Cheap enough to call per frame. */
  snapshot(): PlayerSnap[];
  /** Every avatar of the scene this client stands in, its own included (empty outside the world phases). */
  avatars(): AvatarSnap[];
  /** This client's own avatar handle in its scene; '' while it is not placed. */
  selfHandle(): string;
  /** A cover role's pick and its mates' picks; `{look: '', mates: {}}` for any other seat. */
  coverState(): CoverState;
  /**
   * This seat's own vendetta from the private view (GDD 3.20 "On the card"; round 10, 10Y, A354): a Killer's vendetta
   * id, for the Accomplice the ids of its Killers' vendettas joined by commas, '' for everyone else.
   */
  vendetta(): string;
  /** Doors of the scene this client is in. */
  doors(): DoorSnap[];
  clock(): { tick: number; phase: number; phaseEndsTick: number; startTick: number };
  /** Bodies of the scene this client is in. */
  bodies(): BodySnap[];
  /** Clues of the scene this client is in. */
  clues(): ClueSnap[];
  /** This player's own Notebook entries, oldest first. */
  notebook(): NotebookSnap[];
  /** Round 6 (6I reads them live): the nodes and mobs of the scene this client is in, and its own quests. */
  nodes(): NodeSnap[];
  mobs(): MobSnap[];
  quests(): QuestSnap[];
  /** Round 7 (7M): this player's own task list, in deal order (`Private.tasks`). */
  tasks(): TaskSnap[];
  /** Round 7 (7M): the village's work, the public task bar of GDD 3.5 (`GameState.taskBar`, 0 to 100). */
  taskBar(): number;
  /** Round 6 (6I): this player's own inventory slots, in slot order. */
  inventory(): StackSnap[];
  /** Round 10 (A12): the held hotbar slot, `Private.inventory.selected`. */
  selectedSlot(): number;
  /** Round 8 (8A): this seat's own body, or null while the row is empty (the lobby, the card, a ghost). */
  body(): OwnBodySnap | null;
  /** Round 8, 8C (locked; GDD 3.23): this player's own purse, `Private.purse`. */
  purse(): number;
  /** Round 10 (C2b, GDD 3.23): the Scrip this seat owes the line (`Private.fare`), 0 when it owes none. */
  fare(): number;
  /**
   * Round 10 (C5, GDD 3.8): in Paint The Town Red, the unique count the two Killers need (`paintTarget` over the
   * public roster), read only while this seat's `Private.paintTown` is set; 0 otherwise.
   */
  paintTarget(): number;
  /** Round 8, 8C (locked): `act.buy` and `act.sell` at the shop a `shop` hold opened. */
  buy(shopId: string, itemId: string, qty: number): void;
  sell(shopId: string, itemId: string, qty: number): void;
  /** Round 8, 8D (GDD 3.23): this player's own Faith, `Private.faith`. */
  faith(): number;
  /** Round 10 (A7, GDD 3.32): whether this seat sleeps and, while it does, how many active players are in bed of how many. */
  sleeping(): { asleep: boolean; inBed: number; inBedOf: number };
  /** Round 8, 8D: each HQ station's bought tier by station id (`GameState.hq`, public; a station absent is unbuilt). */
  hqTiers(): Record<string, number>;
  /** Round 8, 8D: one of the civic acts at the altar, the black market, a station or a bank counter. */
  civic(type: CivicAct, payload: object): void;
  /** Round 6 (6I): `quest.accept { questId }`. */
  questAccept(questId: string): void;
  /** Round 6 (6I): `quest.turnIn { questId }`. */
  questTurnIn(questId: string): void;
  /** Round 6 (6I): `act.light { on }`, light or douse the carried lantern or torch. */
  light(on: boolean): void;
  /** Round 10 (A12): `inv.move { from, to }`, a stack to another slot of the own inventory. */
  invMove(from: number, to: number): void;
  /** Round 10 (A12): `inv.select { slot }`, the held hotbar slot. */
  invSelect(slot: number): void;
  /** Round 10 (A13): `craft.grid { size, cells }`, the crafting grid row by row. */
  craftGrid(size: 2 | 3, cells: Array<string | null>): void;
  /** Round 6 (6I): the answer to a `minigameStart`. */
  minigameResult(taskId: string, answer: unknown): void;
  /** Round 8 (8B): `act.inspect { targetId }`, an avatar handle in reach. */
  inspect(targetId: string): void;
  /** Round 8 (8E, GDD 3.24): the answer to a `mugPrompt` (`act.mug`). */
  mug(choice: 'pay' | 'fight' | 'flee'): void;
  /**
   * True once this player has been killed or their roster `alive` is false. Held here, never in the
   * scene, so it survives World restarts; resets when the phase returns to the lobby.
   */
  dead(): boolean;
  /**
   * Round 10 (C1b, GDD 3.22): this seat died by day and waits for the morning train (`Private.onLine`). It is not a
   * ghost then: `dead()` is false, and the On-the-line screen stands in for the world until the train.
   */
  onLine(): boolean;
  sendMove(cmd: MoveCmd): void;
  enterPortal(portalId: string): void;
  /** `targetId` is an avatar handle (GDD 3.17); the server resolves it to a seat. */
  kill(targetId: string): void;
  /** `targetId` is an avatar handle for a `target: 'player'` ability (Bandage), a seat id for `target: 'seat'`. */
  ability(id: string, targetId?: string): void;
  /** Starts (`on`) or ends a hold; the server re-validates it every tick. */
  hold(action: HoldAction, targetId: string, on: boolean): void;
  reportBody(bodyId: string): void;
  bell(): void;
  /** Mock only: re-emits `sceneEnter` for the current scene after a mock meeting (round 3, M | N seam). */
  resume?(): void;
  dispose(): void;
}

/** Phaser registry key under which the router publishes the active feed. */
export const REG_WORLD = 'worldFeed';
export const REG_ROLE_CHIP = 'roleChip';
/** Phaser registry key of the World's `InputController`; the router stops it between screens. */
export const REG_INPUT = 'worldInput';

// Message names, payloads and error codes of docs/ARCHITECTURE.md 5.5.
import type { ErrorCode, RefusalArgs, RefusalReason } from './refusals';

export const C2S = {
  move: 'input.move',
  interact: 'act.interact',
  ability: 'act.ability',
  hold: 'act.hold',
  hide: 'act.hide',
  check: 'act.check',
  burst: 'act.burst',
  enterPortal: 'act.enterPortal',
  reportBody: 'act.reportBody',
  bell: 'act.bell',
  present: 'act.present',
  /** Round 6 (M5b, GDD 3.15): light or put out the carried light; `sim/mobs/light.ts` (6G) handles it. */
  light: 'act.light',
  /** Round 8 (GDD 3.24): the answer to a `mugPrompt`; `sim/townsfolk/mug.ts` (8E) handles it. */
  mug: 'act.mug',
  /** Round 10, D9c (GDD 3.24, seams.md 3 row 16): ask a figure about the town or the time; `sim/townsfolk/talk.ts`. */
  talkAsk: 'talk.ask',
  /** Round 10, A12 (GDD 3.30): move a stack between two slots of the own inventory; `sim/InventoryMoves.ts`. */
  invMove: 'inv.move',
  /** Round 10, A12 (GDD 3.30): pick the held hotbar slot. */
  invSelect: 'inv.select',
  /** Round 10, A13 (GDD 3.30): the crafting grid's cells; `sim/Craft.ts`. */
  craftGrid: 'craft.grid',
  /** Round 10, B8 (GDD 3.31, seams.md 3 row 10): ask a figure in reach to walk with you; `sim/law/Pairing.ts`. */
  pairAsk: 'pair.ask',
  /** Round 10, B8: answer an ask (`yes`), or end a pair (`yes: false` while paired). */
  pairAnswer: 'pair.answer',
  /** Round 10, B3 (GDD 3.31, seams.md 3 row 13): open a petition at a notice board; `sim/law/Petition.ts`. */
  petitionOpen: 'petition.open',
  /** Round 10, B3: sign the open petition. */
  petitionSign: 'petition.sign',
  vote: 'meeting.vote',
  say: 'chat.say',
  /** Round 8 (GDD 3.8 "Meeting notes", 8T): a line for the meeting notes, which carry no speaker. */
  note: 'chat.note',
  quick: 'chat.quick',
  ping: 'world.ping',
  roleReady: 'role.ready',
  netPing: 'net.ping',
  lobbyStart: 'lobby.start',
  lobbyReady: 'lobby.ready',
  lobbySettings: 'lobby.settings',
  lobbyAddNpc: 'lobby.addNpc',
  lobbyRemoveNpc: 'lobby.removeNpc',
  /** Main mode, role card, a cover role: the look it will walk as (GDD 3.17). */
  coverPick: 'role.cover',
  /** Round 6 (M5b, GDD 3.16): accept a quest from the giver in reach; Session 6H reads it. */
  questAccept: 'quest.accept',
  /** Round 6 (M5b, GDD 3.16): turn a quest in at its giver; Session 6H reads it. */
  questTurnIn: 'quest.turnIn',
  /** Round 6 (M5b, GDD 3.16): the answer to a `minigameStart`; Session 6H reads it. */
  minigameResult: 'minigame.result',
  /** Round 8 (GDD 3.22 "Inspect"): study the seat in reach; `sim/inspect/` (8B) handles it. */
  inspect: 'act.inspect',
  /** Round 8 (GDD 3.23, 8C): buy from the shop the seat holds open; Session 8C reads it. */
  buy: 'act.buy',
  /** Round 8 (GDD 3.23, 8C): sell to the shop the seat holds open; Session 8C reads it. */
  sell: 'act.sell',
  /** Round 8 (GDD 3.23, 8C): deposit to or withdraw from the bank a `bank` hold opened; Session 8C reads it. */
  bank: 'act.bank',
  /** Round 8 (GDD 3.23, 8D): Scrip into Faith at an altar in reach. */
  donate: 'act.donate',
  /** Round 8 (GDD 3.23, 8D): an Indulgence or a Parish Seal at an altar; a held Seal presented at a meeting. */
  faith: 'act.faith',
  /** Round 8 (GDD 3.23, 8D): show, burn or fence a Blackmail Notice (its Notebook entry id). */
  notice: 'act.notice',
  /** Round 8 (GDD 3.23, 8D): invest in the next tier of the HQ station in reach. */
  hq: 'act.hq',
  /** Round 8 (GDD 3.23, 8D): pay the rent due, at the bank or to the Company Clerk in reach. */
  payRent: 'act.payRent',
} as const;

export const S2C = {
  roleReveal: 'roleReveal',
  sceneEnter: 'sceneEnter',
  clueFound: 'clueFound',
  killed: 'killed',
  chatMsg: 'chat.msg',
  phaseChange: 'phaseChange',
  meetingStart: 'meetingStart',
  voteResult: 'voteResult',
  gameOver: 'gameOver',
  noise: 'noise',
  error: 'error',
  vfx: 'vfx',
  aim: 'aim',
  shot: 'shot',
  inherit: 'inherit',
  /** Round 6 (M5c, GDD 3.18): play a cutscene; sent by Session 6J, nothing sends it before. */
  cutscene: 'cutscene',
  /** Round 6 (M5b, GDD 3.16): a station task's mini-game; sent by Session 6H, nothing sends it before. */
  minigameStart: 'minigameStart',
  /** Round 8 (GDD 3.22 "Inspect"), private to the inspector: what the eye can see. Sent by 8B. */
  inspectResult: 'inspect.result',
  /** Round 8, private to the inspected seat: a look of `lookId` looked you over. Sent by 8B. */
  inspectNoticed: 'inspect.noticed',
  /** Round 8, private to the inspected seat: a card-blind hunch from a `relations.json` row's note. Sent by 8B. */
  inspectHunch: 'inspect.hunch',
  /** Round 8 (GDD 3.23, 8C): a `shop` hold opened a shop; sent by Session 8C. */
  shopOpen: 'shop.open',
  coopHold: 'coopHold',
  /** Round 8 (GDD 3.12, 8R), private to the nearest living Detective and Doctor: an NPC shouted for a body here. */
  shout: 'shout',
  /** Round 8 (GDD 3.24): a mugger's demand, private to the target; sent by Session 8E's `mug.ts`. */
  mugPrompt: 'mugPrompt',
} as const;

export type C2SType = (typeof C2S)[keyof typeof C2S];
export type S2CType = (typeof S2C)[keyof typeof S2C];

/** `gather` and `craft` are round 6 (M5b, GDD 3.14); the server refuses them until Session 6F lands. */
export type HoldAction =
  | 'drag'
  | 'collect'
  | 'task'
  | 'inspect'
  | 'autopsy'
  | 'gather'
  | 'craft'
  // Round 8 (GDD 3.23, 8C): a shop counter and the bank.
  | 'shop'
  | 'bank'
  // Round 8 (GDD 3.23, 8D): the chapel altar, the Train's mailbag, the tally rack.
  | 'altar'
  | 'mailbag'
  | 'rack'
  // Round 10 (GDD 3.23, C2b; seams.md 3 row 11): the Clerk's labour errand at a `ledger` prop clears a fare.
  | 'errand'
  // Round 10 (A10): any prop the logic table answers for (`interactions.json`).
  | 'interact'
  // Round 10 (A7, GDD 3.32): lie down in a bed, a cot or an inn bed in reach.
  | 'sleep'
  // Round 10 (B4, GDD 3.31): cuff a figure drawn as the hunted accused, by its handle.
  | 'cuff';
/** The main-mode mini-game kinds (GDD 3.16), played at task stations. */
export type MinigameKind = 'crates' | 'pour' | 'slide' | 'stoke' | 'tap' | 'lockpick';
/**
 * Why a meeting opened (GDD 3.3); `missing` is the roll-call of M4; `final` is the forced meeting after the Final
 * Night hunt.
 */
export type MeetingReason = 'body' | 'bell' | 'missing' | 'final';
/**
 * How a player died; `vanished` is the disconnect death of GDD 3.8 (M7); `poison` is Nightshade, `shot` the
 * Gamekeeper's Last Shot (GDD 3.2); `wolf` is a mob kill in the dark (GDD 3.15, round 6, Session 6G). Round 8
 * (GDD 3.22, Session 8A): `creature` is a kill by any other creature. Round 10 (A6) retires `bled` and `sickened`:
 * Bleeding and Poisoned stop at 1 health, so only the Knife, a vote and a creature's bite end a life; the two ids
 * are never reused.
 */
export type DeathCause = 'knife' | 'ejected' | 'vanished' | 'poison' | 'shot' | 'wolf' | 'creature';
/**
 * Chat channels the server derives (GDD 3.5); the client never chooses one. Round 8 (GDD 3.8, 8T): `notes` is the
 * meeting notes, reached only by `chat.note`, whose lines carry no speaker.
 */
export type ChatChannel = 'meeting' | 'ghost' | 'cabal' | 'system' | 'notes';
/** Round 8 (GDD 3.22 "Inspect"): what a glance tells of health, never the number. */
export type InspectHealth = 'unhurt' | 'bruised' | 'badlyHurt';
/** Round 8: the purse's jingle; `unknown` until a purse exists (8C) or when its bands are not set. */
export type InspectPurse = 'unknown' | 'light' | 'fair' | 'heavy';

/** Colyseus room name registered by the server (ARCHITECTURE 5.3). */
export const ROOM_NAME = 'party';

/** Faction ids as `roles.json` `factions` names them. */
export type TeamId = 'village' | 'cabal' | 'neutral';
/** Trait value ids exactly as `traits.json` defines them, in schema index order (GDD 3.1). */
export type HeightId = 'short' | 'mid' | 'tall';
export type ScarfId = 'red' | 'green' | 'blue';
export type HatId = 'cap' | 'bowler' | 'bare';
export const TRAIT_IDS = {
  height: ['short', 'mid', 'tall'],
  scarf: ['red', 'green', 'blue'],
  hat: ['cap', 'bowler', 'bare'],
} as const satisfies Record<string, readonly string[]>;

export interface TraitIds {
  height: HeightId;
  scarf: ScarfId;
  hat: HatId;
}

/** Card keys for the ability rows in card order. A UI binding, not a rules number. */
export const ABILITY_KEYS = ['Q', 'R', 'F'] as const;

export interface RoleRevealAbility {
  /** Ability id from `abilities.json`. */
  id: string;
  name: string;
  key: string;
  /** Seconds; 0 when the ability has no cooldown. For Kill it is the cooldown of this party size. */
  cooldown: number;
  /** Uses per match, or null when unlimited. */
  uses: number | null;
}

export interface RoleRevealItem {
  /** Item id from `items.json`. */
  defId: string;
  name: string;
  qty: number;
  tooltip: string;
}

export interface RoleRevealTeammate {
  id: string;
  name: string;
}

/** Private: delivered only to its owner (ARCHITECTURE 5.4). `teammates` is empty outside the Cabal. */
export interface RoleRevealPayload {
  roleId: string;
  team: TeamId;
  goal: string;
  abilities: RoleRevealAbility[];
  inventory: RoleRevealItem[];
  cardText: string;
  beware: string;
  teammates: RoleRevealTeammate[];
  traits: TraitIds;
  /** Main mode only. The match's deck, card role ids in deck order; identical for every seat (GDD 3.1). */
  deck?: string[];
  /** Main mode only. The look this seat walks as: its card's, or a cover role's first hint (GDD 3.17). */
  look?: string;
  /**
   * Main mode only. Manifest key of this seat's card portrait (`portrait_<card's look>`; a cover role's own card
   * art).
   */
  portrait?: string;
  /**
   * Main mode only, cover roles only: the hints, undealt card role ids, first hint first (GDD 3.17, `coverHints`
   * in `rules/deck.ts`). Absent for every other seat.
   */
  coverHints?: string[];
}

export interface C2SPayloads {
  /** 20 Hz; one applied per tick, newest wins; the vector is normalised server-side. */
  'input.move': { seq: number; dx: number; dy: number; sprint: boolean; sneak: boolean };
  'act.interact': { targetId: string };
  /**
   * `targetId` names the target per the ability's `target`: `player` (Kill, Bandage) an avatar handle, `seat`
   * (Impersonate, the night powers, Last Shot) a seat id.
   */
  /** `kind` and `value` are Plant Clue's (round 10, V1a): a plantable clue id and the trait index it shows. */
  'act.ability': { abilityId: string; targetId?: string; kind?: string; value?: number };
  /** Re-validated every tick. */
  /** Round 10 (A10): `via` names the item an `interact` hold should use when a prop takes several verbs. */
  'act.hold': { action: HoldAction; targetId: string; on: boolean; via?: string };
  'act.hide': { spotId: string };
  'act.check': { spotId: string };
  'act.burst': { spotId: string };
  /** Request / response. */
  'act.enterPortal': { portalId: string };
  'act.reportBody': { bodyId: string };
  'act.bell': Record<string, never>;
  'act.present': { entryId: string };
  /** Round 6: `on` lights the carried Lantern or Torch, or puts it out; refused 422 without one. */
  'act.light': { on: boolean };
  /** A living player's id, or `"skip"`. Changeable until the vote closes (A30). */
  'meeting.vote': { targetId: string };
  'chat.say': { text: string };
  'chat.note': { text: string };
  'chat.quick': { phraseId: string };
  'world.ping': { x: number; y: number };
  /** Round 8 (GDD 3.23, 8D): whole Scrip, at most `economy.json` `faith.donateMax`. */
  'act.donate': { amount: number };
  'act.faith': { kind: 'indulgence' | 'seal' };
  /** `itemId` is the notice's Notebook entry id. */
  'act.notice': { itemId: string; op: 'show' | 'burn' | 'fence' };
  'act.hq': { stationId: string };
  'act.payRent': Record<string, never>;
  /** Deprecated alias of `lobby.ready {ready: true}`. */
  'role.ready': Record<string, never>;
  'net.ping': { t: number };
  /** Leader only, phase lobby, at least 1 human (GDD 3.12). Refused with error 422 otherwise. */
  'lobby.start': Record<string, never>;
  /**
   * Lobby: the Ready tick. Role card: dismisses the card; the match begins when all are ready or
   * `phases.roleRevealS` passes.
   */
  'lobby.ready': { ready: boolean };
  /**
   * Leader only, phase lobby: `npcDifficulty` an `NpcLevel` (A39); `map` a map id of `MAP_IDS` (GDD 3.13). All
   * or nothing; refused 422 / 425.
   */
  'lobby.settings': { npcDifficulty?: number; map?: string };
  /** Leader only, phase lobby: one NPC seat up to `players.max` (GDD 3.12). */
  'lobby.addNpc': Record<string, never>;
  /** Leader only, phase lobby: removes the most recently added NPC seat; none left is 422. No id, so it never tells a seat apart (A39). */
  'lobby.removeNpc': Record<string, never>;
  /**
   * Main mode, role card only, a cover role: picks the look it will walk as (a look of a non-cover card of the
   * deck); changeable until the card closes (GDD 3.17). Refused 425 outside the card, 422 otherwise.
   */
  'role.cover': { lookId: string };
  /** Round 6 (M5b, GDD 3.16): a `quests.json` id whose giver stands in reach. Refused 422 until Session 6H lands. */
  'quest.accept': { questId: string };
  /** Round 6 (M5b, GDD 3.16): an accepted quest whose wants the inventory holds, at its giver. Refused 422 until 6H. */
  'quest.turnIn': { questId: string };
  /**
   * Round 6 (M5b, GDD 3.16): the answer to the `minigameStart` of `taskId`; the server checks it against the
   * solution it kept and completes the task. Refused 422 until Session 6H lands.
   */
  'minigame.result': { taskId: string; answer: unknown };
  /** Round 8 (GDD 3.22): an avatar handle in reach, in any world phase; refused 422, 424 or 427. */
  'act.inspect': { targetId: string };
  /**
   * Round 8 (GDD 3.23, 8C): `qty` of `itemId` from `shopId`, which a `shop` hold opened and whose counter is still in
   * reach, at its `ask` each, paid from the purse. Refused 422 when the purse or the inventory falls short.
   */
  'act.buy': { shopId: string; itemId: string; qty: number };
  /** Round 8 (GDD 3.23, 8C): `qty` of `itemId` from the inventory to `shopId`, at its `pay` each, into the purse. */
  'act.sell': { shopId: string; itemId: string; qty: number };
  /**
   * Round 8 (GDD 3.23, 8C): moves `amount` Scrip between the purse and the bank, at the bank counter a `bank` hold
   * opened and that stays in reach. Refused 422 when the side it draws on holds less.
   */
  'act.bank': { op: 'deposit' | 'withdraw'; amount: number };
  /**
   * Round 8 (GDD 3.24): the target's answer to its open `mugPrompt`. Refused 422 with no prompt open; `flee` and
   * `fight` are refused until the fists land (DECISIONS A180).
   */
  'act.mug': { choice: 'pay' | 'fight' | 'flee' };
  /**
   * Round 10, D9c (GDD 3.24, seams.md 3 row 16): `targetId` is a figure's avatar handle in reach; `ask` is `town`
   * (a tip off the rumour ledger) or `time`. The answer is one system chat line to the asker alone, after a fixed
   * delay. Refused `NO_TARGET` for a seat's handle or an unknown one, `TOO_FAR`, `COOLDOWN` (per figure),
   * `NOT_IN_PLAY` for a ghost, `PHASE_CLOSED`, `BAD_REQUEST` for another `ask`.
   */
  'talk.ask': { targetId: string; ask: 'town' | 'time' };
  /**
   * Round 10, A12 (GDD 3.30): the stack in slot `from` goes to slot `to` (slot numbers of `rules/inventory.ts`):
   * into an empty slot, onto a stack of its item as far as it fits, or swapped. Refused `BAD_REQUEST` when `to`
   * does not take the item (the belt takes tools, gear its own slot) or `from` is empty.
   */
  'inv.move': { from: number; to: number };
  /** Round 10, A12 (GDD 3.30): the hotbar slot whose item is held; refused `BAD_REQUEST` outside the hotbar. */
  'inv.select': { slot: number };
  /** Round 10, B8 (GDD 3.31, seams.md 3 row 10): `targetId` is the asked figure's avatar handle in the asker's scene. */
  'pair.ask': { targetId: string };
  'pair.answer': { yes: boolean };
  /** `accused` a roster seat id; `charge` a `laws.json` crime id; `entries` the opener's Notebook entry ids. */
  'petition.open': { accused: string; charge: string; entries: string[] };
  'petition.sign': { id: string };
  /**
   * Round 10, A13 (GDD 3.30): the crafting grid, row by row: `size` 2 (the pocket square) or 3 (at a workbench) and
   * `size * size` cells, each an item id or null. The server matches a recipe, takes the inputs and gives the product
   * inside `step()`. Refused `GRID_BOUND` for a role-bound item, `GRID_NO_RECIPE` when nothing matches,
   * `NEED_MATERIALS` when the seat holds fewer than the cells show, `NEED_STATION` for a 3x3 away from a workbench.
   */
  'craft.grid': { size: 2 | 3; cells: Array<string | null> };
}

export interface S2CPayloads {
  /** Private. */
  roleReveal: RoleRevealPayload;
  /** Private. */
  sceneEnter: { sceneId: string; spawn: string; facing: string };
  /** Private. */
  clueFound: { entryId: string };
  /** Private: the player is now a ghost; `roles` lists every seat's role id (ghosts see all roles, GDD 3.7). */
  killed: { sceneId: string; cause: DeathCause; roles: Record<string, string>; cutsceneId?: string };
  /** Private: routed per recipient; `from` is a player id, `''` on `system` and `notes` (no speaker). */
  'chat.msg': { from: string; text: string; channel: ChatChannel };
  phaseChange: { phase: number; endsTick: number };
  meetingStart: { reason: MeetingReason; callerId: string; bodyOf?: string; missing: string[] };
  /** `tally` counts votes per target id and `"skip"`; voters are never named (GDD 3.8). */
  voteResult: { tally: Record<string, number>; ejectedId?: string; role?: string };
  /**
   * `roles` are the final roles; `alsoWon` lists an ejected Drifter among the winners, `undealt` the cards nobody
   * held (GDD 3.1, 3.8). Round 10 (C5, seams.md row 18): `paintTown`, in a Paint The Town Red match only, the
   * unique count the win needed and each Killer seat's unique and total kills.
   */
  gameOver: {
    winner: number;
    roles: Record<string, string>;
    summary: string;
    alsoWon?: string[];
    undealt?: string[];
    paintTown?: { target: number; killers: Array<{ seatId: string; unique: number; total: number }> };
  };
  noise: { sceneId: string; x: number; y: number; kind: string };
  /** Where the shout rang; names no seat, no card and no body. */
  shout: { sceneId: string; x: number; y: number };
  /**
   * A refusal, to the refused client only (round 10, A1; docs/round9/failures.md 6.1). `reason` is a
   * `RefusalReason` (append-only), `args` its ids and numbers, `interaction` the logic-table entry that refused;
   * `code` is `REASON_CODE[reason]`. The client shows the reason's line, never `msg`, which stays for logs and for
   * a server site not yet converted.
   */
  error: { code: ErrorCode; msg: string; reason?: RefusalReason; args?: RefusalArgs; interaction?: string };
  /**
   * To every client whose view holds that scene: the puff of a disguise a Knife strike dropped, at (x, y). Names no
   * handle or seat. Sent only from `handleKill` (GDD 3.17).
   */
  vfx: { sceneId: string; x: number; y: number; kind: 'disguise' };
  /** Private, a dying Gamekeeper: pick a seat with `act.ability {abilityId: 'lastShot'}` before `endsTick` (GDD 3.2). */
  aim: { endsTick: number };
  /** Private, an Accomplice: the Knife passed to you (GDD 3.2 Inherit); nothing public changes. */
  inherit: Record<string, never>;
  /** Public, only during a reveal: the ejected Gamekeeper shot `targetId`, whose role was `role` (GDD 3.2). */
  shot: { fromId: string; targetId: string; role: string };
  /**
   * Round 6 (M5c, GDD 3.18): play the cutscene `id` of `packages/content/data/cutscenes/`. Broadcast once for a
   * map's opening at `beginPlay`; `scope: 'all'` marks a memorial every client plays (round 7). The server never
   * waits for a client to finish it. A death's cutscene travels on `killed.cutsceneId` instead.
   */
  cutscene: { id: string; scope?: 'all' };
  /**
   * Private, round 6 (M5b, GDD 3.16): a station task's hold opened its mini-game; `public` is the puzzle without
   * its solution (`rules/minigames.ts generate`). Answered with `minigame.result`.
   */
  minigameStart: { taskId: string; kind: MinigameKind; public: unknown };
  /**
   * Private, round 8 (GDD 3.22): the inspected avatar's drawn look and what the eye reads of it. `signs` are copy ids
   * of `ui/copy/inspect.ts` taken only from the avatar's public status bits; `light` is a burning light in hand. Never
   * a card, a cover, a vendetta or an inventory.
   */
  'inspect.result': {
    targetId: string;
    lookId: string;
    signs: string[];
    health: InspectHealth;
    purse: InspectPurse;
    light: boolean;
    tool?: string;
  };
  /** Private, round 8: the look the inspector is drawn as. */
  'inspect.noticed': { lookId: string };
  /** Private, round 8: an `inspect.hunch.*` copy id. */
  'inspect.hunch': { copyId: string };
  /**
   * Private, round 8 (GDD 3.23, 8C): a `shop` hold on a counter opened `shopId`; `stock` is what it sells at each
   * price, `buys` what it pays for. Answered with `act.buy` and `act.sell`. Round 10 (C3, seams.md row 15): a shop
   * with an `owner` gives each stock row how many it has `left` today, the same for every opener.
   */
  'shop.open': {
    shopId: string;
    stock: Array<{ itemId: string; price: number; left?: number }>;
    buys: Array<{ itemId: string; price: number }>;
  };
  /** Private, round 7 (7M, GDD 3.5): the co-op hold's shared progress, 0..1, and how many hands hold, on change. */
  coopHold: { taskId: string; holders: number; progress: number };
  /**
   * Private, round 8 (GDD 3.24): a mugger demands the purse; `muggerId` is its avatar handle in the target's
   * scene (never a seat or a figure id), the answer is due by `endsTick` (`act.mug`).
   */
  mugPrompt: { muggerId: string; endsTick: number };
}

export type ErrorPayload = S2CPayloads['error'];

/** Per-type rate limits in messages per second (5.5 "Limit" column). */
export const RATE_LIMITS: Partial<Record<C2SType, number>> = {
  'input.move': 25,
  'act.interact': 5,
  'act.ability': 5,
  'act.hold': 5,
  'act.hide': 5,
  'act.check': 5,
  'act.burst': 5,
  'act.enterPortal': 2,
  'act.reportBody': 2,
  'act.bell': 2,
  'act.present': 2,
  'act.light': 5,
  'meeting.vote': 2,
  'chat.say': 2,
  'chat.note': 2,
  'chat.quick': 2,
  'world.ping': 2,
  'lobby.start': 2,
  'lobby.ready': 2,
  'lobby.settings': 2,
  'lobby.addNpc': 2,
  'lobby.removeNpc': 2,
  'role.cover': 4,
  'quest.accept': 2,
  'quest.turnIn': 2,
  'minigame.result': 2,
  'act.inspect': 5,
  'act.buy': 5,
  'act.sell': 5,
  'act.bank': 5,
  'act.donate': 5,
  'act.faith': 5,
  'act.notice': 5,
  'act.hq': 5,
  'act.payRent': 5,
  'act.mug': 5,
  'talk.ask': 5,
  'inv.move': 10,
  'inv.select': 10,
  'craft.grid': 5,
  'pair.ask': 2,
  'pair.answer': 2,
  'petition.open': 2,
  'petition.sign': 2,
};

// Round 10, A1: the codes live beside the refusal reasons that derive them (`REASON_CODE`).
export { ErrorCode } from './refusals';

/** Every joinById failure (missing, locked, full, version mismatch) returns exactly this (5.3). */
export const JOIN_ERROR_CODE = 404;
export const JOIN_ERROR_MESSAGE = 'party not found or unavailable';

/** Options a client passes to `create("party", ...)` and `joinById(code, ...)`. */
export interface JoinOptions {
  name: string;
  build: string;
  deviceId: string;
  /** Round 7 (GDD 3.21): the device's profile code; absent for a device without a profile and for the bots. */
  profile?: string;
}

/** Party visibility chosen at Create (GDD 3.21). */
export type PartyVisibility = 'open' | 'private';

/**
 * One row of `GET /parties` (GDD 3.21): a lobby-phase, unlocked room. `players` counts the seats taken and `map` is
 * a `MAP_IDS` entry. No seat id, device id, role or invited list ever appears.
 */
export interface PartyListing {
  code: string;
  leader: string;
  players: number;
  max: number;
  map: string;
  visibility: PartyVisibility;
}

/** Options for `create("party", ...)` only; `joinById` keeps `JoinOptions`. */
export interface CreateOptions extends JoinOptions {
  visibility: PartyVisibility;
  /** Profile codes the leader invited, capped by balance.json `party.invitedMax`; ignored for an open party. */
  invited?: string[];
}

// Round 10, A1: refusal reasons and the error frame (docs/round9/failures.md 4 to 6).
export * from './refusals';

// Round 6: the admin wire (docs/round6/auto-admin.md 6), accepted by the `admin` room only.
export * from './admin';

// Round 9: the Studio wire (docs/round9/admin-studio.md 2), accepted by the `studio` room only.
export * from './studio';
// Round 9: the Studio's HTTP routes (docs/round9/admin-studio.md 5).
export * from './studioHttp';

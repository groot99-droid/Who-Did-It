# Deck wire: public looks, avatars, covers and Impersonate (round 5, 5F; with 5G's rules wire)

The exact schema and protocol additions, the server rules that resolve them, the privacy invariants as
testable statements, and the tests. Rules text is `docs/GDD.md` (3.1 to 3.3, 3.17); content rows are
`deck-data.md`. Sections 1 to 3 and the hooks of section 8 landed in the round-5 pre-seed, on top of 265bda9,
additively (DECISIONS A50, ruling X1): the pre-seed removes nothing and makes nothing required that the code at
265bda9 reads, so every test of 265bda9 still passes after it. Each removal belongs to the session that owns it and is
listed in that session's table "Contract phase: what this session removes" (section 10). The shared
schema and protocol are locked during the round; 5F builds sections 4 and 7; 5G builds section 5.

Contents: 1 schema, 2 shared constants, pure rules and random streams, 3 protocol, 4 server rules (5F),
5 rules wire (5G), 6 privacy invariants, 7 tests, 8 hooks, locked call sites and seams, 9 text for
ARCHITECTURE and SPRITES, 10 contract phase.

**As landed (2026-10-17).** The pre-seed follows sections 1, 2, 3 and 8, with these differences; the sections below
say the same where they touch them.

- The constants of section 2 (`NoteKind`, `SPENT_TONIGHT`, `AVATAR_HANDLE_BYTES`, `ClueKind.hungerPrints`,
  `StatusBit.ghost`) landed with section 1, which refers to them. `sfc32` and the streams of 2.2 landed one step
  earlier, with the ONUB amendment (`onub-contract.md` section 13).
- `mainRevealFields(room, seat)` is spread at the `roleReveal` send in `startMatch` (`lobby.ts:334`), not inside
  `buildRoleReveal`, which has no `room` argument and which tests call directly.
- During the role card `lobby.ready {ready: false}` is ignored (at 265bda9 it un-readied the seat; no client sends
  it), so the locked call sites hold no `player.ready` write; `markCardReady`'s stub writes it until 5F lands.
- `enterScene` writes `priv.sceneId` for every seat (`Portals.ts:90`). `resetCoversForLobby` stays a no-op until 5F
  fills it, so the value is stale in the lobby, where nothing reads it yet.
- `onMeetingOpenNight` and `onMeetingOpenDisguise` are called in the main mode only, behind `!isOnub(room)`.
- `nearestAvatar` (`view/targets.ts`) and its `World.ts` call site (4.7, 8.3) did not land: they need 5F's
  `WorldFeed.avatars()`, which the pre-seed does not add.
- The empty client hook slots (the lobby deck list, the HUD deck chip, the main end panel) show only once they have
  content, so the stubs change no layout.
- The NPC seat bodies moved to `sim/npc/seats.ts` (`npc.md` section 5); `addNpcSeat` gained the optional `id`, and
  Add NPC draws its name from the `npcNames` stream.
- `roleRevealS` is 20 (`deck-data.md` 4.1); no test hard-codes it.

`seams.md` lists every hook with its locked call site (file:line).

---

## 1. Schema (`packages/shared/src/schema/index.ts`)

```ts
export const SCHEMA_VERSION = 2;

/**
 * View tags (Visibility.ts): `presence` and `priv` are the numeric tags 1 and 2 of today, granted one by
 * one as before; `ghost` reveals an avatar's true seat to a ghost's view only (GDD 3.17).
 */
export const VIEW_TAG = { presence: 1, priv: 2, ghost: 3 } as const;

// --- SceneScoped -----------------------------------------------------------------------------

/**
 * A walking figure in a scene, keyed in `SceneState.avatars` by an opaque handle that is re-rolled on
 * every scene entry and every death, and when an impersonation applies or drops (GDD 3.17). There is no
 * cover flag and no disguise flag: an impersonation is an avatar like any other. Empty until 5F fills it.
 */
export const Avatar = schema(
  {
    /** Seat whose name, look and scarf are drawn: the walker's own, or the seat it impersonates. */
    lookOf: str(),
    /** Height trait index drawn: always the walker's own. */
    height: u8(),
    x: i16(),
    y: i16(),
    z: i8(),
    yaw: f32(),
    animId: u8(),
    statusBits: u16(),
    transitUntilTick: u32(),
    /** The walker's true seat; only a ghost's view receives it. */
    seat: t.string().default('').view(VIEW_TAG.ghost),
  },
  'Avatar',
);

export const SceneState = schema(
  {
    doors: t.map(Door),
    spots: t.map(Spot),
    bodies: t.map(Body),
    clues: t.map(Clue),
    props: t.map(Prop),
    /** Each entry is added to a view one by one (Visibility.ts), never with the scene. */
    avatars: t.map(Avatar).view(),
  },
  'SceneState',
);

// --- Own client only -------------------------------------------------------------------------

export const NotebookEntry = schema(
  {
    id: str(),
    clueKind: u8(),
    value: u8(),
    sceneId: u8(),
    tick: u32(),
    status: u8() /* NotebookStatus */,
    /** `NoteKind`: 0 a clue entry as before; 1-7 a night-power entry (GDD 3.2). */
    note: u8(),
    /** The seat a night-power entry is about; '' for a clue entry. */
    of: str(),
  },
  'NotebookEntry',
);

export const Private = schema(
  {
    role: Role,
    inventory: Inventory,
    notebook: t.array(NotebookEntry),
    tasks: t.array(TaskEntry),
    cabalMates: t.array('string'),
    cooldownEndTick: t.map('uint32'),
    ledger: t.array(LedgerLine),
    lensCharges: u8(),
    myVote: str(),
    nightReveal: t.array(NightReveal),
    onubLoc: str(),
    onubCard: str(),
    /**
     * Own scene index in SCENE_IDS order (LOFT_SCENE_INDEX in the quick-mode loft). Written beside the
     * public `Player.sceneId` by the pre-seed; the only scene index once 5F removes the public one.
     */
    sceneId: u8(),
    /** Own avatar handle in the own scene; '' while not placed. */
    avatar: str(),
    /** A cover role's current pick, preset to its first hint's look at the deal ('' for everyone else). */
    coverLook: str(),
    /** A Cabal cover role's view of each Cabal mate's current pick, by seat id (empty for everyone else). */
    mateLooks: t.map('string'),
  },
  'Private',
);

export const Player = schema(
  {
    // Public roster
    id: str(),
    name: str(),
    traits: Traits,
    alive: bool(),
    connected: bool(),
    ready: bool(),
    hasVoted: bool(),
    /** Kept by the pre-seed (X1); 5F removes it in its contract phase (section 10). */
    sceneId: u8(),
    /** Public look id (looks.json): '' for every seat until the role card closes, then fixed (GDD 3.17). */
    look: str(),
    // Pre-seed: the visibility tags of today (granted to same-scene viewers). After 5F: own client only,
    // the own position (others are avatars).
    presence: t.ref(Presence).view(VIEW_TAG.presence),
    priv: t.ref(Private).view(VIEW_TAG.priv),
  },
  'Player',
);
```

The pre-seed adds and removes nothing else: `Player.sceneId` stays, `presence` keeps its current
visibility, and `SceneState.avatars` stays empty until 5F fills it. Field counts: Player 11 (10 after 5F's
contract phase), Private 16, SceneState 6 plus 5J's, Avatar 10, NotebookEntry 8: all far under 63.
`Presence` is unchanged; after 5F it reaches only its owner. The privacy-class comment at the top of the
file becomes, with 5F's contract phase: "Public roster: plain fields on Player, the look included.
SceneScoped: `scenes` and each avatar, tagged `.view()`. Own client only: Presence and Private. Server
memory: everything else (handles' owners, covers, disguises, protections, poison)."

---

## 2. Shared constants, pure rules and random streams

```ts
// packages/shared/src/constants.ts
/** Avatar handles: 6 random bytes in base64url (GDD 3.17); never drawn from a seeded stream. */
export const AVATAR_HANDLE_BYTES = 6;
/** `NotebookEntry.note` values (GDD 3.2). */
export const NoteKind = {
  clue: 0,
  confession: 1,
  watching: 2,
  watchHeld: 3,
  remedyGiven: 4,
  remedyHeld: 5,
  poisonGiven: 6,
  shot: 7,
} as const;
/** Sent in `cooldownEndTick[abilityId]` while a night power is spent for the current night. */
export const SPENT_TONIGHT = 0xffffffff;
// ClueKind gains (append only):  hungerPrints: 9

// apps/server/src/sim/constants.ts and apps/client/src/view/animIds.ts (mirrors)
export const StatusBit = { transit: 1, bloody: 2, ghost: 4 } as const;
```

### 2.1 Pure rules (`packages/shared/src/rules/`)

```ts
// rules/prng.ts (new export, pre-seeded)
/**
 * Small Fast Counter, 128-bit state, seeded from four crypto words. Every match stream draws from it
 * (2.2): most of the main-mode deal is public by sight (non-cover seats wear their own card), so a
 * 32-bit seed could be recovered by brute force from the roster.
 */
export function sfc32(a: number, b: number, c: number, d: number): Rng;

// rules/deck.ts (new; pre-seeded with stub bodies; 5G owns dealDeck, 5F owns coverHints)
export interface DeckDeal {
  /** Seat id -> card role id. */
  dealt: Map<string, string>;
  /** The cards nobody holds, `cards.length - ids.length` of them, in the order the deal's shuffle left them. */
  undealt: string[];
}

/**
 * GDD 3.1: every card for which `alwaysDealt` holds is dealt; the other cards are shuffled and the
 * first `ids.length - always` of them join the hand, the rest are `undealt` in shuffled order; the hand
 * is shuffled onto the seats. Throws when more cards must be dealt than there are seats or there are
 * fewer cards than seats. Pre-seed stub: deals `deckFor(n).cards` with the Killer forced, untested;
 * 5G replaces it with the tested version.
 */
export function dealDeck(
  ids: readonly string[],
  cards: readonly string[],
  alwaysDealt: (card: string) => boolean,
  rng: Rng,
): DeckDeal;

/**
 * GDD 3.17, no draw: the undealt non-cover cards, in `undealt` order (already shuffled by the deal),
 * are matched to the cover seats ordered by their card's first index in `cards` (Killers first, then
 * the Accomplice, then the Drifter; two Killers in `dealt` order): cover seat i needs card i. A Cabal
 * cover seat is shown its own card first, then its Cabal mates' cards and every card no cover seat
 * needs; the Drifter is shown only its own. So a lone cover seat sees them all, Cabal mates share one
 * list with different first hints, and no Drifter hint is in a Cabal list. Returns seat -> card ids;
 * throws if a cover seat has no card (never, for a deck that passes validate.ts). Pre-seed stub:
 * returns an empty map.
 */
export function coverHints(
  dealt: ReadonlyMap<string, string>,
  undealt: readonly string[],
  cards: readonly string[],
  isCover: (card: string) => boolean,
  isCabal: (card: string) => boolean,
): Map<string, string[]>;
```

`assignRoles`, `Roster` and `RosterRow` stay in the pre-seed beside `dealDeck` (X1); 5G removes them in
its contract phase (section 10). The deal draws from `seeds.get('deal')`; the hints need no draw.

### 2.2 Random streams (`apps/server/src/sim/seeds.ts`, landed; the one spec, the other documents reference it)

```ts
export type StreamName =
  | 'deal' | 'traits' | 'npcNames' | 'script' | 'piles' | 'thaw' | 'perk' | 'prepTimeout'
  | 'nightTimeout' | 'npcTiming' | 'npcPlay' | 'mobs' | 'nodes';
/** Four 32-bit seed words of one sfc32 stream. */
export type SeedWords = readonly [number, number, number, number];
/** Fixed seed words per stream name; only the test helper `fixSeeds` ever supplies them. */
export type FixedSeeds = Partial<Record<StreamName, SeedWords>>;

export class MatchSeeds {
  /** `fixed` is undefined in production; only the test helper `fixSeeds` ever supplies it. */
  constructor(fixed?: FixedSeeds);
  /** The stream `name` (or `name:key`), created on first use and kept for the rest of the match. */
  get(name: StreamName, key?: string): Rng;
}

// apps/server/src/rooms/PartyRoom.ts: test-only room memory, read only by `startMatch`
fixedSeeds: FixedSeeds | undefined = undefined;

// apps/server/test/seedHelpers.ts (tests only)
export function fixSeeds(room: PartyRoom, words: FixedSeeds): void;
```

- **One generator.** Every stream is `sfc32` seeded with four `randomInt(2 ** 32)` words (`node:crypto`).
  `mulberry32` stays exported for the pure rules' own tests.
- **Keyed streams.** `get(name, key)` with a key (`npcPlay:<seatId>`, `npcTiming:<seatId>`) is a stream
  of its own, independent per key: four fresh crypto words per key, never derived from another stream.
- **`StreamName`** is the list above. `handles` and `covers` were removed from 265bda9's list: avatar
  handles come from `randomBytes` (4.1) and cover hints need no draw (2.1). `thaw` and `perk` are new
  (ONUB `resolvePrep`, below).
- **`fixSeeds(room, words)`** exists for tests only and is exported from a test helper, never
  registered in a production code path (no message, no debug handler). It stores `words` in room
  memory; every `new MatchSeeds(...)` of that room (each Start) seeds each listed stream from them, and
  each keyed stream of a listed name from the same words with the fourth word XORed with the 32-bit
  FNV-1a hash of its key, so one record reproduces a run. Streams not listed keep crypto words.
- **NPC seats.** Every NPC seat draws only from its own keyed streams, `npcPlay:<seatId>` and
  `npcTiming:<seatId>`. The ONUB prep sabotage roll is drawn by every NPC and ignored unless its card
  sabotages. The main-mode NPC strike roll is drawn by every NPC each check and ignored unless it holds
  `kill`. So no card changes how far a seat's stream moves.
- **ONUB `resolvePrep`**: the commits' card ids sorted by id, then shuffled (`piles`); the thaw pick
  from `thaw`; the perk slot from `perk`.
- **Main mode**: the deal from `deal`, the traits from `traits`, the NPC names from `npcNames`; nothing
  public is drawn from `deal`.
- **As landed.** `sfc32` (`packages/shared/src/rules/prng.ts`, exported through the rules index) discards its first 12
  outputs after seeding, so the small words tests fix start well mixed; `MatchSeeds.get` is its only caller.
  `new MatchSeeds(...)` runs only in the `PartyRoom` field initialiser (`PartyRoom.ts:60`) and in `startMatch`
  (`lobby.ts:279`, `new MatchSeeds(room.fixedSeeds)`). FNV-1a runs over the UTF-16 code units of the key (the bytes,
  for ASCII seat ids), and a keyed stream's fourth word is `(d ^ fnv1a(key)) >>> 0`. `fixSeeds` stores the words in
  `room.fixedSeeds` and also replaces the current `room.seeds`, so a test that draws before its next Start is fixed
  too. `seeds.test.ts` (9 cases, among them a two-room check that `fixSeeds` reproduces the NPC names, the deal and the
  traits across Start) scans `apps/server/src` and fails if anything there calls `fixSeeds(` or assigns
  `fixedSeeds`. `packages/shared/test/prng.test.ts` (6 cases) holds 1000 draws per seed against a separate BigInt
  version of the algorithm. Called today: `startMatch` (`npcNames`, `deal`, `traits`), `handleAddNpc` (`npcNames`)
  and `prepStreams` (`piles`, `thaw`, `perk`). `room.matchSeed` is still drawn at Start and read by nothing.

---

## 3. Protocol (`packages/shared/src/protocol/index.ts`)

```ts
export const C2S = {
  // ...as now, plus:
  coverPick: 'role.cover',
} as const;

export const S2C = {
  // ...as now, plus:
  vfx: 'vfx',
  aim: 'aim',
  shot: 'shot',
  inherit: 'inherit',
} as const;

/** Why a meeting opened; `final` is the forced meeting after the Final Night hunt (GDD 3.3). */
export type MeetingReason = 'body' | 'bell' | 'missing' | 'dawn' | 'final';
/** `poison` is Nightshade, `shot` the Gamekeeper's Last Shot (GDD 3.2). */
export type DeathCause = 'knife' | 'ejected' | 'vanished' | 'poison' | 'shot';

export interface RoleRevealPayload {
  // ...every field as now (`teamName?` included), plus, all optional (X1):
  /** Main mode only. The match's deck, card role ids in deck order; identical for every seat (GDD 3.1). */
  deck?: string[];
  /** Main mode only. The look this seat walks as: its card's, or a cover role's first hint. */
  look?: string;
  /** Main mode only. Manifest key of this seat's card portrait (`portrait_<card's look>`; a cover role's own card art). */
  portrait?: string;
  /**
   * Main mode only, cover roles only: the hints, undealt card role ids, first hint first (GDD 3.17,
   * `coverHints` in 2.1). Absent for every other seat.
   */
  coverHints?: string[];
}

export interface C2SPayloads {
  // ...as now; `act.ability` names its target per the ability's `target` (`deck-data.md` 2.1):
  /** `target: 'player'` (Kill, Bandage): an avatar handle. `target: 'seat'`: a seat id. (`targets` is 5A's.) */
  'act.ability': { abilityId: string; targetId?: string; targets?: string[] };
  /** Role card only, a cover role: picks the look it will walk as; changeable until the card closes. */
  'role.cover': { lookId: string };
}

export interface S2CPayloads {
  // ...as now, plus:
  /**
   * To every client whose view holds that scene: the puff of a disguise a Knife strike dropped, at (x, y).
   * Names no handle or seat. Sent only from `handleKill` (GDD 3.17).
   */
  vfx: { sceneId: string; x: number; y: number; kind: 'disguise' };
  /** Private, a dying Gamekeeper: pick a seat with `act.ability {abilityId: 'lastShot'}` before `endsTick`. */
  aim: { endsTick: number };
  /** Private, an Accomplice: the Knife passed to you (GDD 3.2 Inherit); nothing public changes. */
  inherit: Record<string, never>;
  /** Public, only during a reveal: the ejected Gamekeeper shot `targetId`, whose role was `role`. */
  shot: { fromId: string; targetId: string; role: string };
  /** `alsoWon`: an ejected Drifter; `undealt`: the two undealt cards (main mode). */
  gameOver: {
    winner: number;
    roles: Record<string, string>;
    summary: string;
    onub?: OnubGameOver;
    alsoWon?: string[];
    undealt?: string[];
  };
}

export const RATE_LIMITS = { /* ...as now, plus */ 'role.cover': 4 };
```

`killed` keeps its shape; for a Gamekeeper it is sent when the aim closes, not at the death. Error codes
are unchanged. `docs/PROTOCOL.md` is regenerated (`pnpm docs:protocol`).

---

## 4. Server rules (5F)

### 4.1 Handles and avatars (`apps/server/src/sim/Avatars.ts`, new)

Room memory, in a `WeakMap<PartyRoom, AvatarMemory>`, never in a schema:

```ts
interface AvatarMemory {
  handleOf: Map<string, string>;            // seat -> current handle
  seatOf: Map<string, string>;              // current handle -> seat
  leaving: Map<string, { seat: string; scene: SceneId; untilTick: number }>; // handle -> transit tail
  used: Set<string>;                        // every handle of the match
  disguise: Map<string, Disguise>;          // seat -> impersonation (4.5)
}
interface Disguise {
  as: string;             // the borrowed seat
  applied: boolean;       // false while the change waits to happen unseen
  dropRequested: boolean; // a second Impersonate, the run's end or daybreak asked it to drop
  applyByTick: number;    // a pending disguise not applied by then is cancelled
  untilTick: number;      // set when applied: the run's end
}
export function newHandle(room: PartyRoom): string;
export function rehandle(room: PartyRoom, seat: string, transit: boolean): void;
export function publishAvatars(room: PartyRoom): void;
export function resolveHandle(room: PartyRoom, actorSeat: string, handle: unknown): string | null;
export function resetAvatarsForLobby(room: PartyRoom): void; // called by Covers.ts resetCoversForLobby
```

- **A handle** is `randomBytes(AVATAR_HANDLE_BYTES).toString('base64url')` from `node:crypto`, redrawn
  while it is in `used` or equals a seat id. It never comes from a seeded stream.
- **`rehandle`** runs from `enterScene` on every call (a crossing, the first placement, the meeting move,
  the immunity placement), when a disguise applies or drops (4.5), and in `markDead`. Called from
  `enterScene`, it first settles the seat's disguise: a pending one applies, one with `dropRequested`
  drops (4.5). Called from `markDead`, it first deletes the seat's disguise. It then deletes the seat's
  current avatar from its SceneState, or, when `transit` is true, moves it to `leaving` (it stays in the
  old scene, frozen at the door with the transit bit and the `lookOf` it had, until `untilTick`, then is
  deleted); it creates a new `Avatar` in the SceneState of `PlayerSim.sceneIdx` under a new handle; it
  writes `Private.avatar`, and sets `viewsDirty`. A seat in the loft has no avatar.
- **`publishAvatars`** runs after the movement stage every tick. For every placed seat outside the loft it
  copies the own `Presence` fields (x, y, z, yaw, animId, statusBits, transitUntilTick) to the current
  avatar, sets `lookOf` to the borrowed seat when the seat's disguise is `applied` and to the seat
  otherwise, `height` to `player.traits.height`, adds `StatusBit.ghost` when the seat is dead, and writes
  `seat` (seen only by ghosts). A `leaving` avatar is never updated. Unchanged values cost no bytes.
- **`resolveHandle`** returns the seat of a current handle whose avatar is in the actor's SceneState, or of
  a `leaving` handle whose scene is the actor's (the kill validator then refuses it as in transit), and
  null for anything else: an unknown or stale handle, a handle in another scene, the actor's own, or
  any value that is not a string.
- **`Private.sceneId`** is written by `enterScene` for every seat, living or dead, beside the public
  field from the pre-seed on (the ghost-scene freeze of A30 disappears with the public field in 5F's
  contract phase); in the quick mode 5A's `beginOnubPlay` (`sim/Onub.ts`) writes `LOFT_SCENE_INDEX` to
  both fields (ONUB contract 4.4).

### 4.2 Visibility (`apps/server/src/sim/Visibility.ts`)

`createPlayerView` adds the own Player with `VIEW_TAG.presence` and `VIEW_TAG.priv` and the own
SceneState, as now. `reconcileViews` (5 Hz and when dirty) holds per viewer `{scene, avatars: Set<handle>,
ghost: boolean}` instead of `presences`:

- A viewer is a **ghost viewer** when `PlayerSim.dead` and it is not aiming (5G's `isAiming(room, seat)`).
  An aiming seat's wanted set is empty (GDD 3.2: a Knife strike blacks out the Gamekeeper's screen);
  it becomes a ghost viewer when its aim closes.
- Outside a world phase (meetings, the reveal, game over, the lobby, the role card) the wanted set is
  empty.
- In a world phase the wanted set is the avatars in the viewer's own SceneState (current and `leaving`)
  whose seat is placed; a living viewer skips every avatar whose seat is dead; a ghost viewer takes all.
- Each wanted avatar is added with `view.add(avatar)`, and for a ghost viewer also with
  `view.add(avatar, VIEW_TAG.ghost)`; each one no longer wanted is removed with both tags.
- No other seat's `presence` or `priv` is ever added to any view.

### 4.3 Targets

- `handleKill` and `handleBandage` read `payload.targetId` through `resolveHandle`; null is 422 "no
  target". The rest of each validator runs on the resolved seat as now.
- Every `target: 'seat'` ability (Impersonate, the night powers, Last Shot) takes a seat id: a key of
  `state.players` whose public `alive` is true, not the actor unless `allowSelf`; anything else is 422
  "no target". A handle sent to a seat act and a seat id sent to a handle act both fail that check.
- `act.reportBody` (body ids), holds (clue ids), doors and portals are unchanged.

### 4.4 The deal, the cover pick and the look (`sim/Covers.ts`, new; called from `rooms/handlers/lobby.ts`)

`lobby.ts` call sites are locked (section 8); 5F fills `Covers.ts` and 5G fills `Deck.ts`.

- **Deal (5G).** `startMatch` calls `dealMainDeck(room, ids)` (`sim/Deck.ts`), which takes
  `deckFor(n).cards`, calls `dealDeck(ids, cards, card has 'kill', seeds.get('deal'))`, keeps `flow.deck`
  (the cards) and `flow.undealt` in room memory and returns the deal; until 5G fills it, it returns null
  and `startMatch` deals from `rosters` as today. 5F's `assignCovers(room, dealt)` then calls
  `coverHints(dealt, flow.undealt, flow.deck, card is cover, card is cabal)` and keeps the hints in
  room memory.
- **Private fields at the deal.** A cover seat's `priv.coverLook` is its first hint's look; each Cabal
  cover seat's `priv.mateLooks` holds every Cabal mate's `coverLook`. Every other seat's `coverLook`
  stays '' and `mateLooks` empty; the Drifter's `mateLooks` is empty. `Player.look` stays '' for everyone.
- **`roleReveal`** gains, through `mainRevealFields(room, seat)`, `deck` (`flow.deck`), `look` (the
  card's look, or `coverLook`), `coverHints` (cover seats only) and `portrait`
  (`looks[roles[role].look].portrait`). All four are absent in the quick mode.
- **`role.cover {lookId}`** is a lobby command (`LOBBY_TYPES` gains `C2S.coverPick`), consumed in
  `runLobbyCommands` by `handleCoverPick`. Refusals, in this order: phase not `roleReveal` 425; the seat's
  card is not `cover` 422; `lookId` is not the look of a non-cover card in `flow.deck` 422; `lookId`
  equals the current `coverLook` of a seat in the picker's own `priv.cabalMates` 422 ("a teammate wears
  that"; never checked for the Drifter, which has no mates). Accepted: `priv.coverLook = lookId`, and when
  the picker is Cabal, every Cabal mate's `mateLooks.set(picker, lookId)`. A pick equal to a dealt seat's
  look is accepted (a visible counter-claim, GDD 3.17), and so is a Drifter's pick equal to a Cabal
  seat's, or a Cabal seat's equal to the Drifter's: neither side can learn the other's pick from a refusal.
- **Ready is private on the card, in both modes.** During `roleReveal`, `lobby.ready {ready: true}` and
  `role.ready` add the seat to `flow.cardReady` (room memory) and never touch `Player.ready`;
  `runLobbyPhase` ends the card when every living, connected seat is in `flow.cardReady` (through the
  pre-seeded `allCardReady(room)` hook, whose body 5F fills) or the card time runs out (main mode:
  `phases.roleRevealS`, 20 s). The quick mode's role card uses the same path
  (`onub-contract.md` §6): 5F owns it in `Covers.ts`. NPC seats join through `markCardReady(room, id)`,
  which 5H's `readyOnRoleCard` (`sim/npc/meeting.ts`, both modes) calls after its seeded delay. In the lobby phase Ready stays the public tick it is
  today. As landed, `markCardReady`'s stub writes `player.ready = true` (the public tick until 5F fills it), and
  `lobby.ready {ready: false}` during the card is ignored (at 265bda9 it un-readied the seat; no client sends it).
- **The look goes public in one tick.** `beginPlay` (main mode) calls `publishLooks(room)` before
  `setPhase(grace)`, which writes `player.look = card.cover ? priv.coverLook : card.look` for every seat in
  one loop. After that `role.cover` is 425.
- **Reset.** `resetToLobby` (main-mode lines) calls `resetCoversForLobby(room)`: `player.look = ''`;
  `priv.sceneId = 0`, `priv.avatar = ''`, `priv.coverLook = ''`, `priv.mateLooks.clear()`; every
  `SceneState.avatars` cleared; `resetAvatarsForLobby` (disguises included); the hints and
  `flow.cardReady` cleared. Until 5F fills it the landed hook is a no-op, so `priv.sceneId` keeps its last value in
  the lobby. 5G's `resetNightForLobby` clears `flow.deck` and `flow.undealt`.

### 4.5 Impersonate (`apps/server/src/sim/Impersonate.ts`, new)

GDD 3.17: the face changes only unseen; a strike drops it in place with a puff; every other drop waits
until the seat is alone in its scene or passes a door. "Alone" means no other seat whose `PlayerSim` is
placed, not dead and in the same scene (a ghost sees true seats anyway; an aiming seat sees no avatar).
Numbers: `balance.json` `impersonate.applyWindowS` (10), `durationS` (15), `cooldownS` (45).

- `handleAbility` dispatches `impersonate` to `handleImpersonate`. Refusals, in this order: the card lacks
  `impersonate` 422 "cannot do that"; dead, unplaced or in the loft 422; phase not in the ability's
  `phases` (dusk, night, finalNight) 425; busy 426. Then, when the seat already has a disguise (pending
  or applied), the act sets `dropRequested` and is accepted; nothing else is checked (no 422). Otherwise:
  tick before `cooldownEndTick.impersonate` 424; the target fails 4.3's seat check 422 "no target".
- **Request:** `disguise.set(seat, {as: target, applied: false, dropRequested: false, applyByTick: tick +
  applyWindowS * 20, untilTick: 0})`. Nothing is sent and nothing in any view changes. The owner's
  client shows the pending request from its own send, and the applied face from its own avatar's
  `lookOf`.
- **`runImpersonation`** (a stage right after `runCommands` in `Step.ts`), for each disguise in order:
  - a pending disguise is deleted, at no cooldown, when `dropRequested` is set, when the tick reaches
    `applyByTick`, or when the phase is not dusk, night or finalNight;
  - an applied disguise gets `dropRequested` when the tick reaches `untilTick` or the phase is not dusk,
    night or finalNight;
  - only on a tick when the seat is alone in its scene: a pending disguise applies (`applied = true`,
    `untilTick = tick + durationS * 20`, `rehandle(seat, false)`), and an applied one with
    `dropRequested` drops (`endImpersonation`).
- **Inside `enterScene`** (through `rehandle`, 4.1): a pending disguise applies and one with
  `dropRequested` drops, so the old scene sees the old face leave and the new scene sees the new face
  arrive.
- **`endImpersonation(room, seat): boolean`** (true when the disguise was applied): `disguise.delete(seat)`;
  for an applied one `cooldownEndTick.impersonate = tick + cooldownS * 20` and `rehandle(seat, false)`
  (not again when called from inside `enterScene`). Callers: `runImpersonation`; `rehandle` inside
  `enterScene`; `handleKill` once a strike is accepted by `validateKill`, before its outcome, voided or
  not; `onMeetingOpenDisguise(room)`, from `openMeeting`, for every disguise. `markDead` of the
  impersonator deletes its disguise through `rehandle` (4.1); `resetToLobby` clears them through
  `resetCoversForLobby`.
- **The puff.** `vfx {sceneId, x, y, kind: 'disguise'}` is sent only from `handleKill`, when
  `endImpersonation` returns true, at the striker's position, to every client whose view holds that
  scene, ghosts included. No other drop and no apply sends anything.
- Unchanged by a disguise: `Player.name`, `Player.look`, `Player.traits`, the kill clues (the Killer's own
  traits, as `Kill.ts` passes them today), Blood, Hunger's footprints, every night power.

### 4.6 Meetings and bodies

- `openMeeting` ends every disguise (`onMeetingOpenDisguise`) before `placeAtSquare`; the meeting
  placements re-roll every handle, and reconcile adds no avatar while the meeting, the reveal or game
  over run. The immunity placement re-rolls them again before anyone is shown.
- `markDead` re-rolls the victim's handle and sets the ghost bit, so a ghost never walks under a handle a
  living client saw, and living views drop it in the same tick (`viewsDirty`).
- A `Body` keeps `of` (the victim's seat); the client draws it in `players[of].look` with that seat's
  scarf and height. A body never shows an impersonation.

### 4.7 Client (5F)

- `net/world.ts`: `PlayerSnap.presence` is set for the own seat only; new `AvatarSnap {handle, lookOf,
  height, x, y, yaw, animId, statusBits, transitUntilTick, seat?}`; `WorldFeed.avatars(): AvatarSnap[]`
  (the own scene's) and `WorldFeed.selfHandle(): string`; `PlayerSnap.look: string`. The Colyseus feed
  and the mock feed both implement them.
- `view/EntityView.ts` keys sprites by handle: every avatar but `selfHandle()` is drawn as
  `players[lookOf]`'s look and scarf at `avatar.height`, with its nameplate (name and hat glyph) from
  `players[lookOf]`, never from the walker's own row; the own sprite comes from the own presence and the
  own avatar's `lookOf` and `height` (so the Killer sees the borrowed face); a ghost viewer's nameplate
  shows `players[seat].name` with a mask glyph when `seat !== lookOf`. A new handle means a new sprite
  with no slide; the `vfx` message plays `vfx_disguise` at its point.
- `view/targets.ts` (new): `nearestAvatar(avatars, self, rangePx)` returns a handle; the World's Kill and
  Bandage prompts send that handle (5I's `World.ts` calls it). Not pre-seeded: the function and its call need 5F's
  `WorldFeed.avatars()`, which the pre-seed does not add; until both land the prompts send the seat id, which the
  landed `resolveHandle` stub accepts.
- `ui/RoleCard.ts`: the deck strip, the look line, and for a cover role the picker (the hints first,
  marked safe, the first one preselected; then the deck's other non-cover looks; mates' picks from
  `priv.mateLooks` marked and disabled), each click sending `role.cover`. `ui/portrait.ts`: portraits by
  look id (5G's `ui/main/lookPortraits.ts` uses it). `ui/SeatPicker.ts` (new): the list of publicly
  living seats with name and portrait, used by Impersonate and by 5G's night powers and aim.
- The main-mode meeting, end-screen, HUD and lobby screens are 5G's (section 5, X6).

---

## 5. Rules wire (5G)

- **Night powers** (`sim/NightPowers.ts`, new; `handleAbility` dispatches `confession`, `keepWatch`,
  `remedy`, `poison`, `lastShot` to it through the pre-seeded dispatch line). Refusals, in this order: the
  card lacks it 422; dead, unplaced or in the loft 422 (Last Shot: only while aiming, else 422); phase not
  in `phases` 425 (never checked for Last Shot, which is accepted in any phase while `aimUntilTick` is
  ahead, the meetings and the reveal included); already used tonight 424 ("used tonight"); the kit item is gone 422 ("none left"); the
  target fails 4.3's seat check 422; the Watchman's seat of last night 422 ("watched last night"). A spent
  power sets `cooldownEndTick[id] = SPENT_TONIGHT`; `PlayerSim.nightUsed` and those entries clear when a
  dusk or the Final Night begins (`runNightPowers`).
- **Notebook entries** (private, `status` Verified, `sceneId` the actor's, `tick` now): `confession {of,
  value: Team index}`; `watching {of}` at the pick and `watchHeld {of}` when it voids a strike;
  `remedyGiven {of}` and `remedyHeld {of}`; `poisonGiven {of}`; `shot {of}`.
- **A secretly dead target** (dead in `PlayerSim`, `alive` still true) works, as far as its user can
  tell, as a living one: `confession` still writes the seat's faction; `keepWatch` and `remedy` write
  their pick entry (`watching`, `remedyGiven`) and never hold; `poison` is spent, writes `poisonGiven`, and
  is skipped when it resolves. Same entries, same ticks, same refusals as on a living seat (P18).
- **Protections** (`PlayerSim.watchUntilTick` + `watchBy`, `remedyBy`; `bandagedUntilTick` as now): a strike
  that `validateKill` accepts on a protected seat spends one in the order Bandage, Watch, Remedy
  (`spendProtection(room, target, actor)`, pre-seeded call in `Kill.ts`), and the Killer is refused
  "nothing happens" exactly as for a Bandage today, so the three are indistinguishable to the Killer.
- **Nightshade** (`flow.poisoned: Set<seat>`): resolved by `resolvePoison(room)` when a night turns to day
  (`runNightPowers`), at `openMeeting` before `alive` flips (`onMeetingOpenNight`) and when the Final Night
  hunt ends: `markDead(seat, 'poison')`, a body at its tile if placed, no clue. A secretly dead target is
  skipped.
- **Last Shot**: `markDead` of a Gamekeeper (cause knife, poison or ejected) calls `beginAim`, which sets
  `PlayerSim.aimUntilTick = tick + lastShot.params.aimS * 20`, sends `aim {endsTick}` and defers `killed`.
  While it aims, the seat's view holds no avatar (4.2; a Knife strike blacks the screen out at once on
  the client). Meeting requests and phase changes never wait for an aim. If a meeting opens while a
  Gamekeeper aims, the aim runs on until `aimUntilTick`. A shot then kills its target at once (`alive`
  false, cause shot, no role shown). Only that batch's win check and `endReveal` wait: `drainDeaths`
  holds back the win check of a batch that holds an aiming seat, never the phase clock, and
  `holdReveal(room)` keeps `endReveal` waiting. An accepted shot: `markDead(target, 'shot')`; in the
  world, a body at the target's tile and `noise` kind `shot` (radius `noise.shot`) in its scene; at a
  reveal, `alive = false` at once and `shot {fromId, targetId, role}` broadcast. When the aim closes (shot
  or timeout) the deferred `killed` goes out and the seat becomes a ghost viewer. `isAiming(room, seat)`
  is exported for Visibility.
- **NPC night powers** (5G, `sim/NightPowers.ts`, from `runNightPowers`): an NPC seat holding a night power
  uses it on the tick `brain.nightPowerAtTick` (5H's `Brain`, drawn by every NPC from `npcTiming:<seatId>`
  at each dusk and Final Night hunt start). It picks among its legal targets (GDD 3.2) with
  `brain.nightPowerPick`. An NPC Gamekeeper shoots at `brain.lastShotAtTick` at `npcVoteTarget(room, id)`
  (5H, `sim/npc/meeting.ts`), or holds its fire when that returns null. 5G draws nothing for NPC seats.
  The pre-seed added the three `Brain` fields (`nightPowerAtTick = -1; nightPowerPick = 0; lastShotAtTick =
  -1`, `sim/npc/memory.ts:42-44`) and an `npcVoteTarget` stub returning null (`sim/npc/meeting.ts`).
- **Inherit** (5G): when a death or an ejection leaves no living Killer and a living Accomplice, the
  Accomplice gains `kill` and the bound Knife, `cooldownEndTick.kill = tick + (killCdS +
  inherit.params.killCooldownBonusS) × 20`, and `lastStrikeRound = state.round` (it counts as having
  struck in that round, so it cannot glow before a meeting). A private `inherit` message goes to the
  Accomplice and nothing public changes. 5H's Killer brain runs for any NPC that holds `kill`.
- **Bell** (5G): `abilities.bell.phases` is `["grace", "day"]`; a Bell pull in any other phase is 425 and
  spends no pull. After dark only a body report or the missing-person roll-call opens a meeting.
- **Knife and Final Night**: `isKillPhase` adds `Phase.finalNight` and drops `Phase.day`; the Final Night
  is `Phase.finalNight` (11), a world phase, begun instead of the day whose round is above
  `finalNight.afterCycle` (4); a body report ends the hunt (`finalNight.reportEndsHunt`); the forced
  meeting opens with reason `final`, Skip refused 422, a tie ejects nobody, then `endMatch` with the 3.8
  rule.
- **Hunger** (`sim/Hunger.ts`, `runHunger`): `PlayerSim.lastStrikeRound`, set by every accepted strike and
  by Inherit; checked when a day starts; `hungerPrints` clues (`ClueKind` 9, `value` the height index,
  `dir` the facing) every `trailEveryS` of movement, decaying as `clues.json` says.
- **End screen**: `gameOver.undealt` (main mode) and `gameOver.alsoWon` (an ejected Drifter).
- **Main-mode client screens** (5G, X6), each in a new file under `apps/client/src/ui/main/`, mounted from
  the pre-seeded hooks of section 8: `deckList.ts` (the deck for the current party size, in the lobby),
  `deckChip.ts` (the HUD deck chip from `roleReveal.deck`), `lookPortraits.ts` (meeting portraits by
  `Player.look`, and the reveal line "Bo was the Killer, walking as the Baker" from the ejected seat's
  look), `overMain.ts` (the end screen: every seat's role and look, `undealt`, `alsoWon`) and
  `shotToast.ts` (the `shot` broadcast during a reveal). The quick paths of `ui/Meeting.ts` and
  `ui/GameOver.ts` stay 5D's; 5G plugs the night powers and the aim into 5F's `ui/SeatPicker.ts`.
- **`debug.deal`** (WDI_DEBUG) accepts only cards of the match's deck, each as often as the deck holds it,
  else 422; the deal then places the fixed cards and runs `dealDeck` on the rest with the remaining
  Killer cards always dealt.
- **Soak gate** (with 5E's bot swarm): the soak reports the median match length and the share of
  matches that reach the Final Night. Targets: 12-18 min and at most one third (GDD 3.9).

---

## 6. Privacy invariants (each one a test in section 7)

Throughout, "a client receives X" means X is in the decoded state of that client's room or in a message
it was sent.

1. **P1 Presence.** No client ever receives another seat's `Player.presence`; its own arrives from its
   first view onward.
2. **P2 Private.** No client ever receives another seat's `Player.priv`.
3. **P3 No scene on the roster.** No `Player` field a client receives about another seat carries a scene
   index; a client's own scene is only in its own `priv.sceneId`.
4. **P4 Avatars by scene.** In a world phase, a living client's view holds exactly the avatars of the
   living, placed seats in its own scene (its own included, plus `leaving` avatars there) and no others;
   outside world phases it holds none.
5. **P5 Ghost view.** A living client never receives a dead seat's avatar or any `Avatar.seat`; a ghost
   client receives every avatar of its scene with `seat` set to the true seat; an aiming seat receives
   no avatar at all until its aim closes, and no `killed` before then.
6. **P6 Handles.** Every handle a client receives is 8 base64url characters, equals no seat id, is never
   reused within a match and never appears in two scenes at once. A handle changes only on a scene
   entry, a placement, a death, a strike while disguised, or a tick with no other living seat in the
   scene. `Private.avatar` always equals the own current handle.
7. **P7 Look timing.** During `roleReveal` every `Player.look` a client receives is '' and every
   `Player.ready` is false; every seat's look becomes non-empty in the same patch, at the end of the card,
   and never changes again before the lobby.
8. **P8 Cover indistinguishable.** For a non-Cabal observer, the received `Player` of a cover seat and of
   a non-cover seat have the same set of fields with values of the same types; a cover seat's `look` is
   the look of a non-cover card of the deck; with a deck of two cover cards, no two seats' looks are
   equal unless a cover role picked a dealt look.
9. **P9 Impersonation shape.** While K's disguise as T is applied, K's avatar has `lookOf = T` and
   `height` = K's own height index, and its `statusBits` follow the same rule as every avatar; K's
   `Player` row is byte-identical to before the request; a pending disguise changes nothing any client
   receives.
10. **P10 No swap in sight.** An observer in K's scene never sees one handle removed and another added
    within 1 tile on the same tick, except at a strike or a death. A client draws a borrowed avatar's
    name, look, scarf and hat glyph from `players[lookOf]`, never from the walker's own row.
11. **P11 vfx.** A `vfx` message carries no handle and no seat id, reaches exactly the clients whose view
    holds that scene, and is sent only from `handleKill`, for a strike by a seat whose disguise was
    applied.
12. **P12 Targets.** Kill and Bandage succeed with a current handle in the actor's scene and are refused
    422 with a seat id, a stale handle, the actor's own handle or a handle from another scene; every
    `target: 'seat'` act is refused 422 with a handle.
13. **P13 Card payload.** `roleReveal.deck` is identical for every seat and equals `deckFor(n).cards`;
    `coverHints` is present exactly for cover seats; every hint is an undealt, non-cover card; no two
    cover seats share a first hint; no Drifter hint is in a Cabal list; the lone cover seat at 4 players
    gets 2.
14. **P14 Mates.** A Cabal cover seat's `mateLooks` holds exactly its Cabal mates' current picks; a
    Drifter's `mateLooks` is empty; every non-cover seat's `mateLooks` is empty and its `coverLook` is ''.
    The taken-look 422 checks only the picker's own `priv.cabalMates`: a Drifter's pick equal to the
    Killer's is accepted.
15. **P15 Night powers leave the world alone.** Using any night power changes no `SceneState` field and
    sends no message to anyone but the actor (a Last Shot at a reveal excepted).
16. **P16 Deal stream.** The main-mode deal draws only from an `sfc32` stream with four crypto seed
    words; no public value (traits, NPC names, handles, pile orders) is drawn from it; the cover hints
    draw nothing.
17. **P17 Aims never delay.** With a Gamekeeper aiming, the Bell opens its meeting on the same tick, and
    every phase change lands on the same tick, as in a run without one.
18. **P18 Powers on the secretly dead.** For each night power, the private entries are the same in shape
    and tick whether the target is living or secretly dead.

---

## 7. Tests

### 7.1 Tests 5F writes

Server (`apps/server/test/`, `@colyseus/testing`, real clients unless noted):

| File | Case | Invariant |
|---|---|---|
| `avatars.test.ts` | 6 clients in two scenes: each view holds exactly the avatars of its scene's living placed seats, own included; no other seat's presence or priv | P1, P2, P4 |
| | no `Player` field of another seat carries a scene; `priv.sceneId` follows every crossing, meeting move and immunity placement | P3 |
| | handles: shape, never a seat id, unique over a 3-cycle match, one scene at a time, re-rolled on crossing, meeting move, immunity placement and death; `priv.avatar` tracks it | P6 |
| | a crossing leaves the old avatar in the old scene with the transit bit until `transitUntilTick`, and the new handle appears in the new scene | P4, P6 |
| | a kill: living viewers lose the victim's avatar in that tick; the ghost sees every avatar of its scene with `seat`; no living view ever holds `seat` | P5 |
| | no avatar in any view during meetingDiscussion, meetingVote, reveal and gameOver | P4 |
| | Kill and Bandage: handle accepted; seat id, stale handle, own handle and other-scene handle 422 | P12 |
| `coverPick.test.ts` | property, 200 seeded deals at every count 4-10 (pure, no room): `dealDeck` deals every Killer, deals `n` cards and leaves exactly 2; `coverHints` (no rng): every hint undealt and non-cover, first hints distinct, Cabal mates share one list, no Drifter hint in a Cabal list, both cards to the lone cover seat at 4 | P13 |
| | `roleReveal.deck` identical for all seats; `coverHints` only for cover seats; `portrait` and `look` match `looks.json`; none of the four fields in the quick mode | P13 |
| | during the card, a non-Cabal client sees every `look` '' and every `ready` false while others press Ready and pick; at the card's end all looks arrive in one patch; in the quick mode every `ready` stays false through the card too (`flow.cardReady`) | P7 |
| | `role.cover` refusals: 425 outside the card, 422 from a non-cover seat, 422 for a cover look or a look outside the deck, 422 for a look a mate wears; a Drifter's pick equal to the Killer's accepted, and a Killer's equal to the Drifter's; acceptance updates `coverLook` and the mates' `mateLooks`, not the Drifter's | P14 |
| | no pick: the cover seat's look is its first hint's; an NPC cover seat wears its first hint | P7 |
| | fuzz, 50 matches (extends `lobby.test.ts` "no public field change at Start correlates with the Killer"): a fixed non-Cabal observer's received rows of cover and non-cover seats have the same fields and types; looks distinct at 5-10 when no pick duplicates | P8 |
| | the deal's rng is `sfc32` with four crypto words, and a traits, names or handle draw never advances it (spy on the streams) | P16 |
| `impersonate.test.ts` | refusals: day 425, cooldown 424, self or a publicly dead seat 422, non-Killer 422; a second `impersonate` while pending or applied is accepted, sets `dropRequested` and checks no target | 4.5 |
| | a request in company changes nothing any client receives; the face applies on the first tick the Killer is alone in its scene, or inside `enterScene`; the new avatar shows `lookOf` = target and the Killer's own `height`; the Killer's `Player` row is unchanged; no `vfx` | P9, P11 |
| | a request not applied within `applyWindowS` is cancelled and leaves `cooldownEndTick.impersonate` untouched | 4.5 |
| | a strike (voided by a Bandage too) drops it in place with exactly one `vfx` to the scene, carrying no handle or seat; a meeting and the Killer's death end it with no `vfx`; the run's end, daybreak and a second use drop it only when the Killer is alone or passes a door; the cooldown counts from the drop | P11, 4.5 |
| | the kill clues of a strike made in disguise carry the Killer's own height and scarf | 4.5 |
| | a crossing applies a pending disguise: the old scene's `leaving` avatar keeps the old `lookOf`, the new handle in the new scene shows the target | P6 |
| | a ghost in the scene sees `seat` = the Killer on the borrowed avatar | P5 |
| | an observer in K's scene over a scripted match (requests in company, alone and at doors; drops by the run's end, daybreak and a second use; strikes; deaths): no tick removes one handle and adds another within 1 tile, except at a strike or a death | P6, P10 |
| | diff: two scripted runs, with and without the impersonation, normalised by replacing each handle with its seat from room memory: an observer elsewhere sees no difference at all | P9 |
| `visibility.test.ts` (update) | "never shows a ghost's sceneId changing" becomes "no Player field carries a scene"; the meeting case asserts no avatar instead of no presence | P3, P4 |
| `lobby.test.ts` (update) | the Start fuzz asserts on `look` and avatars instead of presence | P8 |

Client (`apps/client`, vitest):

- `view/EntityView.test.ts`: sprites keyed by handle; the own handle is skipped and the own sprite drawn
  from the own presence; an avatar with `lookOf` != its seat draws `players[lookOf]`'s name, look,
  scarf and hat glyph at the avatar's height, never the walker's own (P10); a new handle at the same point replaces the sprite with no slide; a
  ghost viewer's nameplate shows the true name and the mask glyph.
- `view/targets.test.ts`: `nearestAvatar` picks the closest handle within range and never the own.
- `ui/RoleCard.test.ts`: the deck strip; a non-cover card shows its look; a cover card shows the picker
  with the hints first and the first one preselected, mates' picks disabled, and a click sends
  `role.cover {lookId}`; the quick-mode card still typechecks against `onubMockRoleCard` (no main-mode
  field).
- `net/mock` and `worldMock.test.ts`: the mock feed serves `avatars()`, `selfHandle()` and `look`, and an
  impersonation in `?mock=1` (debug key) re-rolls the handle; a mock strike in disguise emits `vfx`.

Gates: `pnpm lint && pnpm typecheck && pnpm test`, `pnpm docs:protocol`, an opt-in
`WDI_E2E_LOOKS=1` spec (`apps/client/e2e/looks.spec.ts`: two pages, a cover pick, an impersonation seen
by the second page, `toBeHidden()` on the picker for a non-cover card), and a 2-minute soak.

### 7.2 Tests 5G writes

| File | Case | Invariant |
|---|---|---|
| `nightPowers.test.ts` | each power's refusals in order; the Notebook entries; a spent power shows `SPENT_TONIGHT` and clears at the next dusk | GDD 3.2 |
| | no night power changes a `SceneState` field or messages anyone but the actor | P15 |
| | each power on a living and on a secretly dead target: the actor's entries match in shape and tick; Keep Watch and Remedy never hold on the dead seat; Nightshade is spent and skipped | P18 |
| | protections: a strike on a Bandaged, Watched or Remedied seat is refused "nothing happens" identically, spending in the order Bandage, Watch, Remedy | GDD 3.2 |
| `nightPowers.test.ts` | NPC use tick in dusk start + [219, 1761] (Final Night: hunt start + [179, 1441]) and equal to `brain.nightPowerAtTick`; NPC Last Shot [39, 161] ticks into the aim, at `brain.lastShotAtTick`, aimed at `npcVoteTarget` | GDD 3.2, 3.12 |
| `lastShot.test.ts` | a knifed Gamekeeper's view holds no avatar until the aim closes, then the ghost view; no `killed` before then | P5 |
| | with a Gamekeeper aiming (poisoned at daybreak, aiming in the day), the Bell opens its meeting on the same tick, and every phase change lands on the same tick, as in a run without the aim; a body report at night likewise | P17 |
| | a shot after a meeting opened kills its target at once (`alive` false, cause shot, no role); the batch's win check waits for the aim; an ejected Gamekeeper's reveal holds until the shot, which is announced with its target's role | GDD 3.2, 3.8 |
| `inherit.test.ts` | the Killer ejected, poisoned or shot with a living Accomplice: `kill` and the Knife pass, the cooldown carries `killCooldownBonusS`, `lastStrikeRound` is the current round so no `hungerPrints` appear before the next meeting; only the private `inherit` message goes out and no public field changes | GDD 3.2, 3.3 |
| `flow.test.ts` (update) | the Bell is 425 at dusk, at night and in the Final Night hunt; day 60 s and night 100 s; the Final Night replaces the day of round 5; a body report ends the hunt | GDD 3.3 |

Gates: as 5F's, plus the soak gate of section 5 (median match length 12-18 min, at most one third of
matches reaching the Final Night).

---

## 8. Hooks, locked call sites and seams (X5, X6)

The pre-seed created every hook below in its owner's new file, with the stub body shown, and calls it from
its site; `seams.md` lists each one with its locked call site (file:line). The
call sites in `lobby.ts`, `Meeting.ts` (main-mode lines), `Win.ts` `resetToLobby` (main-mode lines),
`Step.ts`, `Death.ts` and `Kill.ts` are locked for 5F, 5G, 5H and 5J: each session fills the bodies in
its own files and never edits a call. 5B keeps the quick-mode branches of `Meeting.ts` and `Win.ts`.

The pre-seed added to `FlowState` (`sim/Flow.ts:48-54`) `deck: string[] = []`, `undealt: string[] = []` (5G
writes them), `readonly cardReady = new Set<string>()` (5F) and `readonly poisoned = new Set<string>()`
(5G). No session edits `Flow.ts`.

### 8.1 Server hooks

| Hook (file, owner) | Called from (locked site) | Pre-seed body |
|---|---|---|
| `publishAvatars(room)` (`sim/Avatars.ts`, 5F) | `Step.ts`, after `moveAndCollide` | no-op |
| `rehandle(room, seat, transit)` (`sim/Avatars.ts`, 5F) | `Portals.ts` `enterScene`; `Death.ts` `markDead` | no-op |
| `resolveHandle(room, actor, handle)` (`sim/Avatars.ts`, 5F) | `Kill.ts` `handleKill`; `Actions.ts` `handleBandage` | returns `handle` when it is a seat id, else null |
| `runImpersonation(room)` (`sim/Impersonate.ts`, 5F) | `Step.ts`, right after `runCommands` | no-op |
| `endImpersonation(room, seat): boolean` (`sim/Impersonate.ts`, 5F) | `Kill.ts` `handleKill`, once `validateKill` accepts, with the `vfx` send beside it when it returns true (`sendDisguisePuff`, `Kill.ts`) | returns false |
| `onMeetingOpenDisguise(room)` (`sim/Impersonate.ts`, 5F) | `Meeting.ts` `openMeeting`, main mode only (behind `!isOnub`), before `placeAtSquare` | no-op |
| `handleImpersonate(room, seat, payload)` (`sim/Impersonate.ts`, 5F) | `Actions.ts` `handleAbility`, case `impersonate` | 422 "cannot do that" |
| `handleCoverPick(room, seat, payload)` (`sim/Covers.ts`, 5F) | `lobby.ts` `runLobbyCommands`, type `role.cover` (`LOBBY_TYPES` gains `C2S.coverPick`) | 425 "not now" |
| `markCardReady(room, seat)` (`sim/Covers.ts`, 5F) | `lobby.ts` (`lobby.ready` and `role.ready` during `roleReveal`, both modes); `readyOnRoleCard` (`sim/npc/meeting.ts`, both modes: the NPC role-card ready) | writes `player.ready = true`, as today |
| `allCardReady(room): boolean` (`sim/Covers.ts`, 5F) | `lobby.ts` `runLobbyPhase`, in place of the `p.ready` loop | returns true when every living, connected seat's `player.ready` is true, as today |
| `assignCovers(room, dealt)` (`sim/Covers.ts`, 5F) | `lobby.ts` `startMatch`, after the deal (main mode) | no-op |
| `mainRevealFields(room, seat)` (`sim/Covers.ts`, 5F) | `lobby.ts` `startMatch`, spread beside `buildRoleReveal` in the `roleReveal` send (main mode; `buildRoleReveal` keeps its signature) | returns `{}` |
| `publishLooks(room)` (`sim/Covers.ts`, 5F) | `lobby.ts` `beginPlay` (main mode), before `setPhase(grace)` | no-op |
| `resetCoversForLobby(room)` (`sim/Covers.ts`, 5F) | `Win.ts` `resetToLobby` | no-op |
| `dealMainDeck(room, ids): Map<string, string> \| null` (`sim/Deck.ts`, 5G) | `lobby.ts` `startMatch`, before the roster deal | returns null (the roster deal runs) |
| `runNightPowers(room)` (`sim/NightPowers.ts`, 5G; also checks Inherit each tick) | `Step.ts`, after `runImpersonation` | no-op |
| `handleNightPower(room, seat, payload)` (`sim/NightPowers.ts`, 5G) | `Actions.ts` `handleAbility`, cases `confession`, `keepWatch`, `remedy`, `poison`, `lastShot` | 422 "cannot do that" |
| `onMeetingOpenNight(room)` (`sim/NightPowers.ts`, 5G) | `Meeting.ts` `openMeeting`, main mode only (behind `!isOnub`), before `alive` flips | no-op |
| `holdReveal(room): boolean` (`sim/NightPowers.ts`, 5G) | `Meeting.ts` `endReveal`, first line | returns false |
| `beginAim(room, seat, cause): boolean` (`sim/NightPowers.ts`, 5G) | `Death.ts` `markDead` (defers `killed` when true) | returns false |
| `spendProtection(room, target, actor): boolean` (`sim/NightPowers.ts`, 5G) | `Kill.ts` `handleKill`, after `validateKill`: called for every strike `validateKill` accepts, after the Knife's cooldown is set and before the Bandage check; besides spending a protection, 5G's body sets the actor's `lastStrikeRound = state.round` and, in `Phase.finalNight`, caps `cooldownEndTick.kill` at `tick + finalNight.killCooldownS * 20` | returns false (today's Bandage check runs as now) |
| `isAiming(room, seat): boolean` (`sim/NightPowers.ts`, 5G) | `Visibility.ts` (5F's file); `Phases.ts` `drainDeaths`, for the win check only | returns false |
| `resetNightForLobby(room)` (`sim/NightPowers.ts`, 5G) | `Win.ts` `resetToLobby` | no-op |
| `runHunger(room)` (`sim/Hunger.ts`, 5G) | `Step.ts`, after `runAiAndHazards` | no-op |
| `fillNpcSeats(room, rng)` and `addNpcSeat(room, rng, id?)` (bodies moved to `sim/npc/seats.ts`, 5H) | `lobby.ts` `startMatch` (`fillNpcSeats(room, room.seeds.get('npcNames'))`) and `handleAddNpc` (`addNpcSeat(room, room.seeds.get('npcNames'))`, replacing the fresh `mulberry32(randomInt(2 ** 32))`) | today's bodies, moved |

`assignCovers`, `allCardReady`, `mainRevealFields`, `publishLooks`, `handleImpersonate` and `handleNightPower` are not in
the ruling's list of hook names; they are the calls the locked `lobby.ts` and the shared dispatch in
`Actions.ts` need; they landed as listed (`seams.md`).

### 8.2 Client mount hooks (X6; main-mode screens are 5G's)

| Hook (file, owner) | Mounted from | Pre-seed body |
|---|---|---|
| `mountDeckList(root, net): { update(s: LobbySnapshot): void; destroy(): void }` (`ui/main/deckList.ts`, 5G) | `ui/Lobby.ts:140`, in its own slot `lobby-deck-list` under the settings block (`update` at `:299`); the slot is hidden in the quick mode and while empty | renders nothing |
| `mountDeckChip(root, deck: readonly string[]): { destroy(): void }` (`ui/main/deckChip.ts`, 5G) | `view/Hud.ts:148` (`setChip`, once `HudChip.deck` is set; `net/worldRouter.ts:159` copies `roleReveal.deck` into the chip) | renders nothing |
| `renderLookPortrait(root, seat: MeetingPlayer): void`; `revealLookLine(look: string): string` (`ui/main/lookPortraits.ts`, 5G) | `ui/Meeting.ts:199` (main-mode roster, on the portrait slot after today's portrait is drawn) and `:360` (main-mode reveal, appended to the ejection line when not empty) | today's portrait; returns '' |
| `renderMainOver(root, over: GameOver, players: (id: string) => MeetingPlayer \| undefined): void` (`ui/main/overMain.ts`, 5G) | `ui/GameOver.ts:84`, main mode (the panel joins the stack only when it has children) | renders nothing |
| `showShotToast(root, shot: S2CPayloads['shot'], names: (id: string) => string): void` (`ui/main/shotToast.ts`, 5G) | `ui/Meeting.ts:385`, on `shot` during the reveal, main mode (`feed.bus.on('shot')` at `:387`, unsubscribed in `destroy`) | renders nothing |

The pre-seed added `look: string` to `MeetingPlayer` (`net/meeting.ts`), filled from `Player.look` by
`meetingColyseus.ts:100` and defaulted to '' by `meetingMock.ts:133`, and a `shot: S2CPayloads['shot']` event to
`MeetingFeedEvents`, routed by `meetingColyseus.ts:72` (the mock's bus carries the type). 5G and 5D never edit these three files.

The quick-mode paths of `ui/Meeting.ts` and `ui/GameOver.ts` stay 5D's.

### 8.3 Seams

| Producer -> consumer | Contract | Until it lands |
|---|---|---|
| 5F -> 5G | the hooks of 8.1 in `Kill.ts`, `Death.ts`, `Meeting.ts`, `Step.ts` | pre-seeded stubs |
| 5G -> 5F | `dealMainDeck` writes `flow.deck` and `flow.undealt` before `assignCovers` reads them | the roster deal; `assignCovers` sees no deck and does nothing |
| 5G -> 5F | `flow.deck`, `flow.undealt` | pre-seeded empty fields |
| 5H -> 5G | `Brain.nightPowerAtTick`, `nightPowerPick`, `lastShotAtTick`, `npcVoteTarget` | pre-seeded fields and stub |
| 5F -> 5H | `markCardReady(room, id)` replaces `player.ready = true` on the role card in `readyOnRoleCard` (`sim/npc/meeting.ts`, both modes) | pre-seeded; writes `player.ready` until 5F lands |
| 5F -> 5B, 5D | the quick-mode role card holds Ready through `markCardReady` (`flow.cardReady`); no public `ready` tick | pre-seeded; public tick until 5F lands |
| 5F -> 5E | `tools/bots/walk.ts` main mode: prey from `state.scenes.get(scene).avatars` by handle, Kill by handle; the leak monitor counts any other seat's `presence` and any avatar outside the own scene | 5E keeps the old reads (`Player.sceneId`, presence) until 5F merges, then switches (integration list) |
| 5F -> 5A | `beginOnubPlay` writes `priv.sceneId = LOFT_SCENE_INDEX` (and the public field until 5F's contract phase) | pre-seeded field |
| 5F -> 5I | `World.ts` Kill and Bandage prompts call `nearestAvatar`; `EntityView` stays 5F's | not pre-seeded (it needs `WorldFeed.avatars()`); the prompts send the seat id, which the landed `resolveHandle` stub accepts |
| 5F -> 5G (client) | `ui/SeatPicker.ts` for the night powers and the aim prompt; `ui/portrait.ts` for `lookPortraits.ts` | 5G uses a plain list until it lands |
| 5L -> 5F | `char_<look>`, `ovl_<look>`, `anims_<look>` (with `swing` and `interact`), `portrait_<look>`, `vfx_disguise` keys, with greybox placeholders under the same keys | `?art=placeholder` |

---

## 9. Text for the docs (ARCHITECTURE, SPRITES)

After the round-5 docs pass, ARCHITECTURE 5.5 and SPRITES 2 carry the texts below; the ARCHITECTURE 5.4 paragraph is
true only once 5F's contract phase lands and waits for it.

CLAUDE.md is already current (its role-secrecy, random-stream and atlas bullets), so this document
carries no CLAUDE.md text.

**ARCHITECTURE 5.4, replacing the paragraph after the code block's `Settings` sentence** (true once 5F's
contract phase lands). "`onJoin` sets `client.view = new StateView()` and adds the player's own
`Player` with its `presence` and `priv` tags and the `SceneState` of its scene. Others are never sent as
players: each placed seat walks as an `Avatar` in `SceneState.avatars` (a `.view()` map whose entries
`Visibility.ts` adds one by one), keyed by a random 6-byte handle that is re-rolled on every scene entry
and every death, and when an impersonation applies or drops, which happens only with no other living
seat in the scene, inside a scene entry, or at a Knife strike. An avatar carries the seat whose name,
look, scarf and hat glyph it shows (`lookOf`), the height it is drawn at, and the presence fields; its
true `seat` is tagged for ghosts only, and a seat aiming its Last Shot receives no avatar. `Player.look`
is the public look (GDD 3.17), written for every seat in one tick when the role card closes;
`Private.sceneId` replaces the public scene index. No field marks a cover or an impersonation. Kill and
Bandage name a handle that the server resolves to a seat; list acts name a seat. Role, inventory,
notebook, cooldowns, cover picks and the handle-to-seat map are therefore never on the wire for other
living clients. Every match stream is `sfc32` with four crypto seed words (`sim/seeds.ts`)."

**ARCHITECTURE 5.5 table rows.** `C->S role.cover {lookId}` 4/s; `S->C vfx {sceneId, x, y, kind}` (a
strike's puff only); `S->C private aim {endsTick}`; `S->C private inherit {}`; `S->C shot {fromId,
targetId, role}`; `roleReveal` adds `deck?, look?, portrait?, coverHints?` (main mode only); `gameOver`
adds `alsoWon?, undealt?`.

**SPRITES 2, body ids.** "Body ids are the look ids of `looks.json` (`^[a-z][a-z0-9]*$`) plus `villager`
for figures that are not seats. A look names a character, and in the main mode a look is public by
design; the three cover cards (Killer, Accomplice, Drifter) never get a body, so no world key, frame or
file ever names a role that hides."

---

## 10. Contract phase: what each session removes (X1)

The pre-seed is additive. Each removal below lands in the owning session's last PR of the round, in one
commit with every file it lists, after the session's own code reads only the new fields. The locked ONUB
mock (`apps/client/src/net/mock/onubMock.ts`, `onubMockRoleCard`) must keep typechecking after every
removal; the `RoleRevealPayload` fields stay optional for that reason. Line numbers are the working tree's after
the pre-seed; where the pre-seed moved a line, 265bda9's number follows in brackets.

### 10.1 Contract phase: what this session removes (5F)

| Removal | Files that change with it |
|---|---|
| `Player.sceneId` (public scene index); `Private.sceneId` becomes the only one | `apps/server/src/sim/Portals.ts:88` [86] (the public write and the A30 freeze); `apps/server/src/sim/Visibility.ts:28-31` [26-29] (`createPlayerView` reads `priv.sceneId`); `apps/server/src/sim/Win.ts:112` [110] (reset); `apps/server/src/sim/Onub.ts` `beginOnubPlay` (the quick mode's public `player.sceneId` write); `PlayerSim.sceneHidden` in `RoomSim.ts`, which only guards the public write |
| `presence` granted to other viewers; it becomes self-only, others are avatars | `apps/server/src/sim/Visibility.ts` (`reconcileViews` holds avatars, not `presences`) |
| Tests that read the public scene or other seats' presence | `apps/server/test/visibility.test.ts`, `ghost.test.ts`, `sim-portal.test.ts`, `sim-movement.test.ts`, `win.test.ts`, `lobby.test.ts`; also, at 265bda9 and unmoved by the pre-seed, the helpers `apps/server/test/killHelpers.ts:24` and `npcHelpers.ts:119`, which write `player.sceneId` |
| Bot reads | `tools/bots/walk.ts` reads `p.sceneId` and others' presence (5E switches at integration, 8.3) |

### 10.2 Contract phase: what this session removes (5G)

| Removal | Files that change with it |
|---|---|
| `roles.json` `rosters` and `standIn`; `RosterRow`; the roster block of `validate.ts`; `cover` and `look` become required in `schemas/roles.ts` | `packages/content/data/roles.json`, `packages/content/src/schemas/roles.ts`, `packages/content/src/validate.ts`, the `byCount` comment in `schemas/balance.ts` |
| `rosterFor` | `packages/content/src/index.ts` |
| `assignRoles`, `Roster` | `packages/shared/src/rules/roles.ts` and its export; `apps/server/src/rooms/handlers/lobby.ts` `dealRoles` (the roster deal behind `dealMainDeck` goes) |
| Tests that deal `townsfolk` or read `rosters` | `apps/server/test/flow.test.ts:116`, `hold.test.ts`, `kill.test.ts`, `meeting.test.ts`, `packages/shared/test/rules.test.ts`, `packages/content/test/content.test.ts`; also, at 265bda9 and unmoved by the pre-seed, `apps/server/test/report.test.ts`, `flowHelpers.ts:36`, `npc.test.ts:29`, `npcHelpers.ts:98`, `lobby.test.ts:90,124,285` and `packages/content/test/validate.test.ts:73` |

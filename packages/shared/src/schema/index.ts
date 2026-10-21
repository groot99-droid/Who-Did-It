import { schema, t } from '@colyseus/schema';

// Builder style, no decorators (ARCHITECTURE 5.4). Four privacy classes:
//   Public roster   plain fields on Player, the look included (GDD 3.17)
//   SceneScoped     Presence, the `scenes` map and each avatar, tagged .view()
//   Own client only Private, tagged .view()
//   Server memory   never in a schema (fingerprint logs, Blood timers, finalRoles, handles' owners, covers,
//                   disguises, protections, poison, ...)
// Every Schema stays under 63 fields. Round 5 (DECISIONS A50): `Player.sceneId` is gone and `presence` reaches its
// owner only; every other seat walks as an avatar under a handle (GDD 3.17).

export const SCHEMA_VERSION = 2;

/**
 * View tags (Visibility.ts): `presence` and `priv` are the numeric tags 1 and 2, granted one by one; `ghost`
 * reveals an avatar's true seat to a ghost's view only (GDD 3.17).
 */
export const VIEW_TAG = { presence: 1, priv: 2, ghost: 3 } as const;

// Every primitive carries a default so a fresh instance never encodes `undefined`.
const u8 = (v = 0) => t.uint8().default(v);
const u16 = () => t.uint16().default(0);
const u32 = () => t.uint32().default(0);
const i8 = () => t.int8().default(0);
const i16 = () => t.int16().default(0);
const f32 = () => t.float32().default(0);
const str = (v = '') => t.string().default(v);
const bool = () => t.boolean().default(false);

export const Phase = {
  lobby: 0,
  roleReveal: 1,
  grace: 2,
  day: 3,
  dusk: 4,
  night: 5,
  dawn: 6,
  meetingDiscussion: 7,
  meetingVote: 8,
  reveal: 9,
  immunity: 10,
  finalNight: 11,
  gameOver: 12,
  /** Quick mode (GDD 3.11): the prep piles face up on `GameState.onub`, between Evening Prep and the night. */
  prepReveal: 13,
} as const;
export type PhaseId = (typeof Phase)[keyof typeof Phase];

export const GameMode = { main: 0, onub: 1 } as const;
export const DoorState = { open: 0, closed: 1, locked: 2, broken: 3 } as const;
/**
 * 0 = nobody has won yet. `croissant` (the Stale Croissant, alone or with the Bakers) and `nobody` are quick-mode
 * values (GDD 3.11; 4 was the round-4 `debtor`). In quick mode the headline comes from the winners row, not this.
 */
export const Winner = { none: 0, village: 1, cabal: 2, drifter: 3, croissant: 4, nobody: 5 } as const;
export const Team = { village: 0, cabal: 1, neutral: 2 } as const;

// --- Public roster ---------------------------------------------------------------------------

/** Trait indices: height S/M/T, scarf red/green/blue, hat cap/bowler/bare (GDD 3.1). */
export const Traits = schema({ height: u8(), scarf: u8(), hat: u8() }, 'Traits');

// --- SceneScoped -----------------------------------------------------------------------------

export const Presence = schema(
  {
    x: i16(),
    y: i16(),
    z: i8(),
    yaw: f32(),
    animId: u8(),
    statusBits: u16(),
    transitUntilTick: u32(),
  },
  'Presence',
);

export const Door = schema({ id: str(), state: u8(), swingUntilTick: u32() }, 'Door');
export const Spot = schema({ id: str(), occupied: bool() }, 'Spot');
/** `of` is the dead player's id: a body is recognised by the victim's public traits (A30). */
export const Body = schema({ id: str(), of: str(), x: i16(), y: i16(), hidden: bool() }, 'Body');
/**
 * `kind` is a `ClueKind` index and `value` the trait index it shows (a Thread's colour, a Footprint's
 * stride): both are readable in the world by anyone in the scene (GDD 3.4). `dir` is the trail's
 * direction (0-7, `DIRECTIONS` order) for kinds that draw a trail.
 */
export const Clue = schema(
  { id: str(), kind: u8(), value: u8(), dir: u8(), x: i16(), y: i16(), claimed: bool() },
  'Clue',
);
/** `of` names a seat a prop belongs to, empty otherwise (round 4's quick-mode plates; ONUB v2 uses no props). */
export const Prop = schema({ id: str(), kind: str(), turned: bool(), of: str() }, 'Prop');

/**
 * A walking figure in a scene, keyed in `SceneState.avatars` by an opaque handle that is re-rolled on every scene
 * entry and every death, and when an impersonation applies or drops (GDD 3.17). There is no cover flag and no
 * disguise flag: an impersonation is an avatar like any other. Empty until Session 5F fills it.
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

export const Role = schema({ roleId: str(), team: u8() }, 'Role');
export const ItemStack = schema({ defId: str(), qty: u8() }, 'ItemStack');
export const Inventory = schema({ slots: t.array(ItemStack) }, 'Inventory');
export const NotebookEntry = schema(
  {
    id: str(),
    clueKind: u8(),
    value: u8(),
    sceneId: u8(),
    tick: u32(),
    status: u8() /* NotebookStatus: 0 claimed 1 verified 2 corroborated 3 forged 4 teaching */,
    /** `NoteKind`: 0 a clue entry as before; 1-7 a night-power entry (GDD 3.2). */
    note: u8(),
    /** The seat a night-power entry is about; '' for a clue entry. */
    of: str(),
  },
  'NotebookEntry',
);
export const TaskEntry = schema({ id: str(), done: bool(), fake: bool() }, 'TaskEntry');
/**
 * Quick mode (GDD 3.11): one thing this seat learned, kept so a reconnecting client can re-read it.
 * `slot` is a card slot (`seat.<i>.role`, `seat.<i>.loc`, `pantry.role.<k>`, `pantry.loc.<k>`, see
 * `rules/onub.ts`); `kind` is `role` or `loc` for a card seen, `mate` for a seat seen at night (the other
 * Spore or Commis, a Spore the Levain sees; `slot` is then `seat.<i>`); `value` is the role or station id;
 * `of` is the seat id behind a seat slot, empty for the Pantry.
 */
export const NightReveal = schema({ slot: str(), kind: str(), value: str(), of: str() }, 'NightReveal');
export const LedgerLine = schema({ sceneId: u8(), tick: u32() }, 'LedgerLine');

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
    /** Quick mode only; empty in the main mode. Every peek, sighting and the proofing perk, in order. */
    nightReveal: t.array(NightReveal),
    /** Quick mode: the station this seat committed at prep (its dealt Location card), empty before. */
    onubLoc: str(),
    /** Quick mode: the Ingredient card this seat committed at prep, empty before. */
    onubCard: str(),
    /**
     * Own scene index in SCENE_IDS order (LOFT_SCENE_INDEX in the quick-mode loft): the only scene index on the
     * wire, and only to its owner.
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
    /** Public look id (looks.json): '' for every seat until the role card closes, then fixed (GDD 3.17). */
    look: str(),
    // Own client only: the own position (others are avatars). `alive` flips only at a meeting or an ejection (A30).
    presence: t.ref(Presence).view(VIEW_TAG.presence),
    // Own client only
    priv: t.ref(Private).view(VIEW_TAG.priv),
  },
  'Player',
);

// --- Game ------------------------------------------------------------------------------------

/**
 * `mode` is 0 main, 1 onub (ARCHITECTURE 5.14). `revealMode` 0 is full, locked in V1 (GDD 2).
 * `npcDifficulty` is an `NpcLevel` index and `npcSeats` the number of NPC seats in the party, a count
 * only: no seat is ever marked (GDD 3.12, A39). `onubDeck` is the leader's custom quick-mode deck, public;
 * empty means `onubFor(n).deck` (GDD 3.11).
 */
export const Settings = schema(
  {
    map: str('hollowmere'),
    revealMode: u8(),
    mode: u8(),
    npcDifficulty: u8(),
    npcSeats: u8(),
    onubDeck: t.array('string'),
  },
  'Settings',
);

/** One thing a quick-mode claim says it saw: `targetId` a seat id or `"pantry"`, with a role or a station id. */
export const ClaimSaw = schema({ targetId: str(), roleId: str(), stationId: str() }, 'ClaimSaw');
/**
 * A quick-mode claim (GDD 3.11), latest per seat: "I was {roleId}, I worked {stationId} and played {cardId}",
 * plus up to `claims.maxSaw` sightings. Empty strings are parts left out.
 */
export const Claim = schema(
  { from: str(), roleId: str(), stationId: str(), cardId: str(), saw: t.array(ClaimSaw) },
  'Claim',
);

export const BoardRow = schema(
  { playerId: str(), fits: u8(), known: u8(), claimed: u8(), lastSceneId: u8() },
  'BoardRow',
);

export const MeetingState = schema(
  {
    phase: u8(),
    reason: str(),
    callerId: str(),
    bodyOf: str(),
    endsTick: u32(),
    missing: t.array('string'),
    board: t.array(BoardRow),
    suspects: t.array('string'),
    /** Quick mode: the structured claims, latest per seat (GDD 3.11). */
    claims: t.array(Claim),
  },
  'MeetingState',
);

/**
 * One prep pile face up (GDD 3.11), keyed by station id in `OnubBoard.piles`: `cards` the card ids still in it,
 * in seeded order; `lost` how many the Thermostat Flip discarded; `net` its net sabotage weight; `underMixed`
 * the Mixer's caution flag.
 */
export const OnubPile = schema(
  { cards: t.array('string'), lost: u8(), net: u8(), underMixed: bool() },
  'OnubPile',
);

/**
 * The public quick-mode board (GDD 3.11). `seats` is the deal order (slot index `i` of `seat.<i>.*` is
 * `seats[i]`) and `deck` the cards in play, both from the role card on; `piles`, `ruinWeight`, `ruined` and
 * `perk` from `prepReveal`; `cloche` (a slot id) from dawn. `window` is the open night window's role id, the
 * narrator's call, '' during fades and outside the night: public, since every window of the deck runs whatever
 * was dealt. Cleared at the lobby reset; empty in the main mode.
 */
export const OnubBoard = schema(
  {
    seats: t.array('string'),
    deck: t.array('string'),
    piles: t.map(OnubPile),
    ruinWeight: u8(),
    ruined: bool(),
    perk: bool(),
    cloche: str(),
    window: str(),
  },
  'OnubBoard',
);

export const GameState = schema(
  {
    schemaVersion: u8(SCHEMA_VERSION),
    phase: u8(),
    phaseEndsTick: u32(),
    tick: u32(),
    /** Tick the grace phase began; clients show match time as `tick - startTick` (A30). */
    startTick: u32(),
    round: u8(),
    leaderId: str(),
    settings: Settings,
    taskBar: u8(),
    players: t.map(Player),
    scenes: t.map(SceneState).view(),
    meeting: MeetingState,
    winner: u8(),
    /** Quick mode only (GDD 3.11). */
    onub: OnubBoard,
  },
  'GameState',
);

export type PlayerState = InstanceType<typeof Player>;
export type PrivateState = InstanceType<typeof Private>;
export type SceneStateType = InstanceType<typeof SceneState>;
export type AvatarState = InstanceType<typeof Avatar>;
export type GameStateType = InstanceType<typeof GameState>;

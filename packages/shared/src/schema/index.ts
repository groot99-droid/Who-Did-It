import { schema, t } from '@colyseus/schema';

// Builder style, no decorators (ARCHITECTURE 5.4). Four privacy classes:
//   Public roster   plain fields on Player, the look included (GDD 3.17)
//   SceneScoped     Presence, the `scenes` map and each avatar, tagged .view()
//   Own client only Private, tagged .view()
//   Server memory   never in a schema (fingerprint logs, Blood timers, finalRoles, handles' owners, covers,
//                   disguises, protections, poison, ...)
// Every Schema stays under 63 fields. Round 5 (DECISIONS A50): `Player.sceneId` is gone and `presence` reaches its
// owner only; every other seat walks as an avatar under a handle (GDD 3.17). Round 6 (DECISIONS A81): the M5b
// maps `nodes` and `mobs`, `Private.quests`, `GameState.lawStage` and `Role.evolvedFrom`, all empty until their
// sessions fill them (docs/round6/seams.md 1.1). Version 4 (round 7, A104): `Player.profile`,
// `Private.vendetta` (A112). Version 5 (round 7, A115): the quick mode's fields are gone. Version 6 (round 8,
// A135, docs/round8/seams.md 1): `Private.body` (8A); the later round-8 rows (`purse`, `bank`, `faith`, `hq`, 8L's
// `Avatar.nearBits`) join version 6 without another bump. Version 7 (round 10, docs/round10/seams.md 3): A10's
// `SceneState.propStates` and A12's `ItemStack.slot` and `Inventory.selected` (A245); the other round-10 rows
// join version 7.
// A7 adds `Private.home`, `asleep`, `inBed` and `inBedOf` (seams.md 3, row 5), C1 `Private.onLine` (row 6), B8
// `Private.pair` (row 10), C2 `Private.fare` (row 11), B3 `GameState.petition` and `Private.petitionSigned`
// (row 13), B4 `GameState.manhunt` and `Private.huntScene` (row 14), C5 `Private.paintTown` (row 18), and B5
// `Private.jailUntilTick` (row 19) to version 7. B6a adds `GameState.tribunal` (row 22) to version 7.

export const SCHEMA_VERSION = 7;

/**
 * View tags (Visibility.ts): `presence` and `priv` are the numeric tags 1 and 2, granted one by one; `ghost`
 * reveals an avatar's true seat to a ghost's view only (GDD 3.17); `near` (round 8, 8L) reveals an avatar's
 * range-limited bits to a view within range of it, and to a ghost's (GDD 3.4). Tags are bit masks: `near` takes a
 * bit of its own.
 */
export const VIEW_TAG = { presence: 1, priv: 2, ghost: 3, near: 4 } as const;

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
  /** Round 10, B6a (GDD 3.8, seams.md 3 row 22): the Tribunal; the world is paused under it. */
  tribunal: 13,
} as const;
export type PhaseId = (typeof Phase)[keyof typeof Phase];

export const DoorState = { open: 0, closed: 1, locked: 2, broken: 3 } as const;
/** 0 = nobody has won yet. Round 10 (C5, seams.md row 18): `paintTown`, the two Killers' shared win. Append-only. */
export const Winner = { none: 0, village: 1, cabal: 2, drifter: 3, paintTown: 4 } as const;
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
export const Prop = schema({ id: str(), kind: str(), turned: bool() }, 'Prop');
/**
 * Round 6 (M5b, GDD 3.14): a resource node of the scene, public like a prop. `resource` is a `resources.json` id,
 * `active` whether it can be gathered now, `respawnTick` when it comes back. Empty until Session 6F fills it.
 */
export const Node = schema(
  { id: str(), resource: str(), x: i16(), y: i16(), active: bool(), respawnTick: u32() },
  'Node',
);
/**
 * Round 6 (M5b, GDD 3.15): a creature of the scene, public like a prop, with no seat and no handle. `kind` is a
 * `mobs.json` id, `state` its FSM state index (`sim/mobs/ai.ts`). Empty until Session 6G fills it.
 */
/**
 * Round 10 (A10; logic-table.md 3.4): a prop whose state the logic table changed (`cut`, `rubble`, `searched`, `open`,
 * `broken`), public to the scene; a prop with no entry is `whole`. `untilTick` is when it comes back (0 = never). It
 * never says who changed it.
 */
export const PropState = schema({ id: str(), state: str(), untilTick: u32() }, 'PropState');
export const Mob = schema(
  { id: str(), kind: str(), x: i16(), y: i16(), yaw: f32(), animId: u8(), state: u8() },
  'Mob',
);

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
    /**
     * Round 8 (8L): the status bits seen only from close by (`StatusBit.bloody`, never in `statusBits`); only a view
     * within range of the avatar, or a ghost's, receives them.
     */
    nearBits: u16().view(VIEW_TAG.near),
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
    /** Round 6 (M5b): resource nodes, public to the scene; empty until Session 6F. */
    nodes: t.map(Node),
    /** Round 6 (M5b): creatures, public to the scene; empty until Session 6G. */
    mobs: t.map(Mob),
    /** Round 10 (A10): the logic table's prop states, public to the scene. */
    propStates: t.map(PropState),
  },
  'SceneState',
);

// --- Own client only -------------------------------------------------------------------------

/**
 * `evolvedFrom` is round 8 (the Bible's evolutions, docs/round6/bible-seams.md 2.2): the role id this card was
 * before it evolved, '' for every card today. Own view only, like the rest of `Private`.
 */
export const Role = schema({ roleId: str(), team: u8(), evolvedFrom: str() }, 'Role');
/** `slot` (round 10, A12, GDD 3.30): where the stack sits, a slot number of `rules/inventory.ts` `slotLayout`. */
export const ItemStack = schema({ defId: str(), qty: u8(), slot: u8() }, 'ItemStack');
/**
 * `slots` lists the occupied slots only, each stack naming its own `slot`; `selected` is the hotbar slot whose item
 * is held (round 10, A12, schema version 7). Own view only, like the rest of `Private`.
 */
export const Inventory = schema({ slots: t.array(ItemStack), selected: u8() }, 'Inventory');
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
/** Round 6 (M5b, GDD 3.16): one accepted quest of this seat; `id` a `quests.json` id. Empty until Session 6H. */
export const QuestState = schema({ id: str(), progress: u8(), done: bool() }, 'QuestState');
export const LedgerLine = schema({ sceneId: u8(), tick: u32() }, 'LedgerLine');
/**
 * Round 8 (GDD 3.22, docs/round8/seams.md 1 and 2): one effect on this seat's body. `id` is an `EffectId`,
 * `untilTick` the tick it wears off (0 for an effect that lasts until cured) and `stacks` its stack count.
 */
export const EffectState = schema({ id: u8(), untilTick: u32(), stacks: u8() }, 'EffectState');
/**
 * Round 8 (GDD 3.22): this seat's health and stamina, in the units of `balance.json` `body`. Own view only: no
 * other client and no public field ever carries a number of it; the drawn figure shows only its `StatusBit`s.
 * Empty (every number 0) until Session 8A's body lands.
 */
export const BodyState = schema(
  { hp: u16(), maxHp: u16(), stamina: u16(), maxStamina: u16(), effects: t.array(EffectState) },
  'BodyState',
);

/**
 * Round 10, B8 (GDD 3.31, seams.md 3 row 10): this seat's Walk with me. `state` is a `PairPhase`; `handle` the other
 * figure's avatar handle in this seat's scene, '' while it is elsewhere (handles re-roll on every entry), never a
 * seat id. Own view only: nothing public shows a pair.
 */
export const PairState = schema({ state: u8(), handle: str() }, 'PairState');

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
    /** Own scene index in SCENE_IDS order: the only scene index on the wire, and only to its owner. */
    sceneId: u8(),
    /** Own avatar handle in the own scene; '' while not placed. */
    avatar: str(),
    /** A cover role's current pick, preset to its first hint's look at the deal ('' for everyone else). */
    coverLook: str(),
    /** A Cabal cover role's view of each Cabal mate's current pick, by seat id (empty for everyone else). */
    mateLooks: t.map('string'),
    /** Round 6 (M5b): the quests this seat holds; empty until Session 6H. */
    quests: t.array(QuestState),
    /** Round 7 (GDD 3.20): a Killer's vendetta id, or an Accomplice's Killers' ids joined by commas; '' otherwise. */
    vendetta: str(),
    /** Round 8 (GDD 3.22, schema version 6): this seat's body; empty until Session 8A fills it. */
    body: BodyState,
    /** Round 8 (GDD 3.23, 8C): the Scrip this seat carries; others learn only its band, by inspect. */
    purse: u32(),
    /** Round 8 (GDD 3.23, 8C): the Scrip this seat keeps at the bank, safe from muggings and knockouts. */
    bank: u32(),
    /** Round 8 (GDD 3.23, 8D): the Faith this seat has earned by donating at an altar. */
    faith: u16(),
    /** Round 10 (GDD 3.32, A7): this seat's home, a scene id whose `bed` is its own; '' before the match. */
    home: str(),
    /** Round 10 (GDD 3.32, A7): whether this seat lies asleep in a bed; only its owner learns it. */
    asleep: bool(),
    /**
     * Round 10 (GDD 3.32, A7): while this seat sleeps, how many active players are in bed (`inBed`) of how many
     * there are (`inBedOf`), never a name; both 0 while it is awake, so an awake seat learns nothing (PH 13.4).
     */
    inBed: u8(),
    inBedOf: u8(),
    /** Round 10 (GDD 3.22, C1): this seat died by day and waits for the morning train; it gets no ghost view. */
    onLine: bool(),
    /** Round 10, B8 (schema version 7): Walk with me. */
    pair: PairState,
    /** Round 10 (GDD 3.23, C2): the Scrip this seat owes the line for its returns; only its owner sees it. */
    fare: u16(),
    /** Round 10, B3 (seams.md 3 row 13): whether this seat has signed the open petition. Own view only. */
    petitionSigned: bool(),
    /**
     * Round 10, B4 (seams.md 3 row 14): for the hunt's opener and signers only, the scene where a figure drawn as the
     * accused was last seen by the rumour ledger's rule; '' until the first sighting and when no manhunt runs.
     */
    huntScene: str(),
    /** Round 10, C5 (seams.md 3 row 18): this seat is a Killer of Paint The Town Red. Set at the deal; own view only. */
    paintTown: bool(),
    /** Round 10, B5 (seams.md 3 row 19): the tick of the train that releases this seat from jail, 0 when not jailed. */
    jailUntilTick: u32(),
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
    /** Round 7 (GDD 3.21): the device's profile code, '' for a seat without one; public like the name, says nothing of a role. */
    profile: str(),
    // Own client only: the own position (others are avatars). `alive` flips only at a meeting or an ejection (A30).
    presence: t.ref(Presence).view(VIEW_TAG.presence),
    // Own client only
    priv: t.ref(Private).view(VIEW_TAG.priv),
  },
  'Player',
);

// --- Game ------------------------------------------------------------------------------------

/**
 * `revealMode` 0 is full, locked in V1 (GDD 2). `npcDifficulty` is an `NpcLevel` index and `npcSeats` the number
 * of NPC seats in the party, a count only: no seat is ever marked (GDD 3.12, A39).
 */
export const Settings = schema(
  {
    map: str('hollowmere'),
    revealMode: u8(),
    npcDifficulty: u8(),
    npcSeats: u8(),
  },
  'Settings',
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
  },
  'MeetingState',
);

/**
 * Round 10, B3 (GDD 3.31, seams.md 3 row 13): one supporting entry of the open petition, as the public sees it. `value`
 * is filled only for a kind anyone may read (footprints, thread), else 0; `backed` is a Verified or Corroborated entry.
 * No entry id, tick, note or `of`.
 */
export const PetitionEntry = schema(
  { clueKind: u8(), value: u8(), sceneId: u8(), backed: bool() },
  'PetitionEntry',
);
/**
 * Round 10, B3: the open petition, one at a time; `id` '' when none is open. `accused` a roster seat id; `needed` the
 * other signatures it needs and `signed` how many it has, a count only: no opener and no signer is on the wire.
 */
export const Petition = schema(
  {
    id: str(),
    accused: str(),
    charge: str(),
    needed: u8(),
    signed: u8(),
    untilTick: u32(),
    entries: t.array(PetitionEntry),
  },
  'Petition',
);

/**
 * Round 10, B4 (GDD 3.31, seams.md 3 row 14): the manhunt, one at a time. `accused` the passed petition's seat, ''
 * when `state` is none; `state` a `ManhuntState`. Nothing names the seat a cuff held.
 */
export const Manhunt = schema({ accused: str(), untilTick: u32(), state: u8() }, 'Manhunt');

/**
 * Round 10, B6a (GDD 3.8, seams.md 3 row 22): one entry on the Tribunal's scales. `value` is filled as row 13 fills
 * it; `backed` as the presenter's Notebook shows it; `presenter` '' for the warrant's entries (the Constables'
 * badge), else the presenting seat; `weight` a `EntryWeight`, from the accused's public traits only.
 */
export const TribunalEntry = schema(
  { clueKind: u8(), value: u8(), sceneId: u8(), backed: bool(), presenter: str(), weight: u8() },
  'TribunalEntry',
);
/**
 * Round 10, B6a (row 22): the Tribunal, public. `accused` and `charge` the warrant's, never the seat held; `step` a
 * `TribunalStep`, `finding` a `TribunalFinding`, `sentence` a `TribunalSentence`; `matches` and `exclusions` count
 * the weights on the scales.
 */
export const Tribunal = schema(
  {
    accused: str(),
    charge: str(),
    step: u8(),
    untilTick: u32(),
    entries: t.array(TribunalEntry),
    matches: u8(),
    exclusions: u8(),
    finding: u8(),
    sentence: u8(),
  },
  'Tribunal',
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
    /** Round 8 (the Bible's law pipeline, docs/round6/bible-seams.md 2.2): 0 until then. Public. */
    lawStage: u8(),
    /**
     * Round 8 (GDD 3.23, docs/round8/seams.md 1 row 4), Session 8D: each HQ station's bought tier (0 to 3) by
     * `economy.json` station id. Public: a building visibly upgrades. No row names who bought it.
     */
    hq: t.map('uint8'),
    /** Round 10, B3 (GDD 3.31, seams.md 3 row 13): the open petition, public. */
    petition: Petition,
    /** Round 10, B4 (GDD 3.31, seams.md 3 row 14): the manhunt, public. */
    manhunt: Manhunt,
    /** Round 10, B6a (GDD 3.8, seams.md 3 row 22): the Tribunal, public. */
    tribunal: Tribunal,
  },
  'GameState',
);

export type PlayerState = InstanceType<typeof Player>;
export type PrivateState = InstanceType<typeof Private>;
export type BodyStateType = InstanceType<typeof BodyState>;
export type EffectStateType = InstanceType<typeof EffectState>;
export type SceneStateType = InstanceType<typeof SceneState>;
export type AvatarState = InstanceType<typeof Avatar>;
export type GameStateType = InstanceType<typeof GameState>;

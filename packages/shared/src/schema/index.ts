import { schema, t } from '@colyseus/schema';

// Builder style, no decorators (ARCHITECTURE 5.4). Four privacy classes:
//   Public roster   plain fields on Player
//   SceneScoped     Presence and the `scenes` map, tagged .view()
//   Own client only Private, tagged .view()
//   Server memory   never in a schema (fingerprint logs, Blood timers, finalRoles, ...)
// Every Schema stays under 63 fields.

export const SCHEMA_VERSION = 1;

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
} as const;
export type PhaseId = (typeof Phase)[keyof typeof Phase];

export const GameMode = { main: 0, onub: 1 } as const;
export const DoorState = { open: 0, closed: 1, locked: 2, broken: 3 } as const;
/** 0 = nobody has won yet. `debtor` and `nobody` are quick-mode additions (ARCHITECTURE 5.14). */
export const Winner = { none: 0, village: 1, cabal: 2, drifter: 3, debtor: 4, nobody: 5 } as const;
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
export const Body = schema({ id: str(), x: i16(), y: i16(), hidden: bool() }, 'Body');
export const Clue = schema({ id: str(), kind: u8(), x: i16(), y: i16(), claimed: bool() }, 'Clue');
export const Prop = schema({ id: str(), kind: str(), turned: bool() }, 'Prop');

export const SceneState = schema(
  {
    doors: t.map(Door),
    spots: t.map(Spot),
    bodies: t.map(Body),
    clues: t.map(Clue),
    props: t.map(Prop),
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
    status: u8() /* 0 claimed 1 verified 2 corroborated 3 forged */,
  },
  'NotebookEntry',
);
export const TaskEntry = schema({ id: str(), done: bool(), fake: bool() }, 'TaskEntry');
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
    sceneId: u8(),
    // SceneScoped (V1) / Proximity (V1.5)
    presence: t.ref(Presence).view(1),
    // Own client only
    priv: t.ref(Private).view(2),
  },
  'Player',
);

// --- Game ------------------------------------------------------------------------------------

/** `mode` is 0 main, 1 onub (ARCHITECTURE 5.14). `revealMode` 0 is full, locked in V1 (GDD 2). */
export const Settings = schema({ map: str('hollowmere'), revealMode: u8(), mode: u8() }, 'Settings');

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

export const GameState = schema(
  {
    schemaVersion: u8(SCHEMA_VERSION),
    phase: u8(),
    phaseEndsTick: u32(),
    tick: u32(),
    round: u8(),
    leaderId: str(),
    settings: Settings,
    taskBar: u8(),
    players: t.map(Player),
    scenes: t.map(SceneState).view(),
    meeting: MeetingState,
    winner: u8(),
  },
  'GameState',
);

export type PlayerState = InstanceType<typeof Player>;
export type PrivateState = InstanceType<typeof Private>;
export type SceneStateType = InstanceType<typeof SceneState>;
export type GameStateType = InstanceType<typeof GameState>;

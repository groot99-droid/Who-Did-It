// Refusal reasons (round 10, A1; docs/round9/failures.md 3 to 6). Every refusal the server sends names exactly one
// reason; the client turns it into a line (apps/client/src/ui/copy/refusals.ts) and the legacy `code` is derived from
// it by `REASON_CODE`, so the two never disagree. The list is append-only (docs/round10/seams.md 1): add at the end,
// never rename, reorder the meaning of or reuse a reason.

export const ErrorCode = {
  cannot: 422,
  locked: 423,
  cooldown: 424,
  wrongPhase: 425,
  busy: 426,
  outOfRange: 427,
  closed: 428,
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Every reason, in the order of failures.md 4.1 to 4.6, then 4.9. Append only. */
// prettier-ignore
export const REFUSAL_REASONS = [
  // 4.1 Unfinished and malformed
  'NFY', 'BAD_REQUEST', 'DEBUG_ONLY',
  // 4.2 The seat and the moment
  'PHASE_CLOSED', 'NOT_IN_PLAY', 'DOWN_OR_STUNNED', 'BUSY', 'COOLDOWN', 'SPENT', 'LOBBY_ONLY', 'NOT_LEADER',
  'LOBBY_RULE',
  // 4.3 Reach and targets
  'TOO_FAR', 'NO_TARGET', 'NOTHING_THERE', 'TARGET_DOWN', 'NOTHING_TO_CURE', 'VOIDED', 'NO_WAY', 'NOT_AIMED',
  'ALREADY_DONE', 'ALREADY_HAVE',
  // 4.4 Missing unlocks
  'NEED_TOOL', 'NEED_KEY', 'LOCKED', 'CURFEW', 'BOARDED', 'NEED_ITEM', 'NEED_MATERIALS', 'NEED_STATION',
  'NEED_SCRIP', 'NEED_FAITH', 'NOT_YOUR_POWER',
  // 4.5 Packs, money and counters
  'PACK_FULL', 'FAITH_FULL', 'NO_COUNTER', 'COUNTER_CLOSED', 'NOT_FOR_SALE', 'NOT_BOUGHT_HERE', 'NOTHING_OWED',
  'SEAL_BLOCKS', 'OWN_NAME',
  // 4.6 People and tasks
  'NOT_YOURS', 'TASK_TAKEN', 'TOO_MANY_QUESTS', 'LOOK_TAKEN', 'SAY_SOMETHING', 'CHAT_RATE',
  // 4.9 Reasons the owner answers add
  'IN_JAIL', 'ASLEEP', 'NO_BED', 'BOARDED_HOME', 'PETITION_GRACE', 'PETITION_OPEN', 'NOT_HUNTED', 'PICK_SNAPPED',
  'GRID_NO_RECIPE', 'GRID_BOUND', 'NEEDS_PART',
  // Round 10, M1 (seams.md 3 row 36)
  'UNKNOWN_PHRASE',
] as const;
export type RefusalReason = (typeof REFUSAL_REASONS)[number];

/** The reasons whose legacy code is not 422 (`cannot`), from failures.md 4. */
const NOT_CANNOT: Partial<Record<RefusalReason, ErrorCode>> = {
  PHASE_CLOSED: ErrorCode.wrongPhase,
  LOBBY_ONLY: ErrorCode.wrongPhase,
  BUSY: ErrorCode.busy,
  ASLEEP: ErrorCode.busy,
  COOLDOWN: ErrorCode.cooldown,
  CHAT_RATE: ErrorCode.cooldown,
  TOO_FAR: ErrorCode.outOfRange,
  NO_COUNTER: ErrorCode.outOfRange,
  NEED_KEY: ErrorCode.locked,
  LOCKED: ErrorCode.locked,
  CURFEW: ErrorCode.locked,
  BOARDED: ErrorCode.closed,
  BOARDED_HOME: ErrorCode.closed,
};

/** The legacy code of each reason, kept on the wire for the door sound, the shake and old clients. */
export const REASON_CODE: Readonly<Record<RefusalReason, ErrorCode>> = Object.fromEntries(
  REFUSAL_REASONS.map((r) => [r, NOT_CANNOT[r] ?? ErrorCode.cannot]),
) as Record<RefusalReason, ErrorCode>;

/**
 * `NFY` feature tags for the systems the design has and the build does not yet (failures.md 9 and 10). A handler
 * that falls through answers `NFY` with one of these; an `interactions.json` entry with `status: "nfy"` sends its
 * own `feature` string. A tag is shown as written ("NFY: fighting back."), so it is plain words, never a role.
 */
export const NFY_FEATURES = [
  'this action', // a verb or ability id with no handler (the dispatch defaults)
  'fighting back', // the Mugging's flee and fight
  'the headquarters', // the HQ gate
  'lock-pick mini-game',
  'crafting grid',
  'petition',
  'manhunt',
  'county jail',
  'sleeping',
  'the mill',
  'bakery sections',
] as const;
export type NfyFeature = (typeof NFY_FEATURES)[number];

/** When a phase-closed verb opens again (`PHASE_CLOSED.until`). `play` is the match proper, after the role card. */
export type RefusalUntil = 'day' | 'dusk' | 'night' | 'dawn' | 'meeting' | 'play';
/** What a seat is too far from (`TOO_FAR.of`). */
export type RefusalTarget = 'person' | 'body' | 'clue' | 'door' | 'task' | 'pile' | 'counter' | 'bell';
/** A counter, in the plain words the line uses (`NO_COUNTER.kind`, `COUNTER_CLOSED.kind`). */
export type RefusalCounter = 'shop' | 'bank' | 'altar' | 'buyer' | 'station';
/** Which lobby rule refused (`LOBBY_RULE.rule`). */
export type RefusalLobbyRule = 'tooFewHumans' | 'full' | 'noNpcSeats';

/**
 * The arguments of the reasons that take any. Every field is optional: the line reads well without it, so a refusal site
 * that cannot cheaply know a value sends none. Ids, never sentences: `need`, `item` and `missing` are `items.json`
 * ids (`need` of `NEED_STATION` a station id), numbers are whole seconds or a shortfall.
 */
interface ArgsOf {
  NFY: { feature?: string };
  PHASE_CLOSED: { until?: RefusalUntil };
  NOT_IN_PLAY: { why?: 'ghost' | 'transit' };
  COOLDOWN: { readyInS?: number };
  SPENT: { what?: 'power' | 'stock' | 'match' };
  LOBBY_RULE: { rule?: RefusalLobbyRule };
  TOO_FAR: { of?: RefusalTarget };
  ALREADY_DONE: { what?: 'report' | 'notebook' | 'built' };
  ALREADY_HAVE: { item?: string };
  NEED_TOOL: { need?: string; tier?: number };
  NEED_KEY: { need?: string };
  /** `pick`: the seat holds no pick (`none`) or too thin a one (`thin`) for the `lock` tier. */
  LOCKED: { lock?: string; pick?: 'none' | 'thin' };
  NEED_ITEM: { need?: string };
  NEED_MATERIALS: { missing?: string[] };
  NEED_STATION: { need?: string };
  NEED_SCRIP: { short?: number };
  NEED_FAITH: { short?: number };
  NO_COUNTER: { kind?: RefusalCounter };
  COUNTER_CLOSED: { kind?: RefusalCounter };
  NOT_FOR_SALE: { item?: string };
  NOT_BOUGHT_HERE: { item?: string };
  NOT_YOURS: { what?: 'task' | 'build' };
  CHAT_RATE: { readyInS?: number };
  PETITION_GRACE: { readyInS?: number };
  /** Round 10, B5: the seconds until the train that releases the seat (seams.md 3 row 19). */
  IN_JAIL: { untilDawn?: number };
  GRID_BOUND: { item?: string };
  NEEDS_PART: { missing?: string[] };
}

/** Each reason's arguments; a reason not listed above takes none. */
export type RefusalArgMap = {
  [R in RefusalReason]: R extends keyof ArgsOf ? ArgsOf[R] : Record<string, never>;
};

/** The union of every reason's arguments, as the wire carries them. */
export type RefusalArgs = RefusalArgMap[RefusalReason];

/** Reasons the client never shows in a release build (failures.md rule 5, 4.6 and 4.9): logged, or dropped. */
export const SILENT_REASONS: ReadonlySet<RefusalReason> = new Set<RefusalReason>([
  'BAD_REQUEST',
  'DEBUG_ONLY',
  'SAY_SOMETHING',
  'ASLEEP',
]);

export const isRefusalReason = (value: unknown): value is RefusalReason =>
  typeof value === 'string' && (REFUSAL_REASONS as readonly string[]).includes(value);

/** The `error` frame of a refusal (failures.md 6.1). `msg` stays for logs, tests, `WDI_DEBUG` and old clients. */
export interface RefusalFrame {
  code: ErrorCode;
  msg: string;
  reason?: RefusalReason;
  args?: RefusalArgs;
  interaction?: string;
}

/**
 * Builds the frame for one refusal: the code from `REASON_CODE`, the reason, its args when any were given, the
 * interaction id when the refusal came from the logic table, and `msg` (the reason id when no message is given).
 */
export function refusalFrame<R extends RefusalReason>(
  reason: R,
  args?: RefusalArgMap[R],
  extra: { msg?: string; interaction?: string } = {},
): RefusalFrame {
  const frame: RefusalFrame = { code: REASON_CODE[reason], msg: extra.msg ?? reason, reason };
  if (args && Object.keys(args).length > 0) frame.args = args;
  if (extra.interaction) frame.interaction = extra.interaction;
  return frame;
}

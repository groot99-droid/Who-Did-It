// UI.md 14.43 Refusals (Session 10A, round 10, A1; docs/round9/failures.md 3 to 5). One line per `RefusalReason`;
// the server sends ids and numbers, never sentences, and the line names an item by its `items.json` name. A reason
// added to the shared list without a line here fails the typecheck (the mapped type below).
import interactionsData from '@wdi/content/data/interactions.json';
import items from '@wdi/content/data/items.json';
import {
  isRefusalReason,
  SILENT_REASONS,
  type RefusalArgMap,
  type RefusalCounter,
  type RefusalLobbyRule,
  type RefusalReason,
  type RefusalTarget,
  type RefusalUntil,
} from '@wdi/shared/protocol';

/** The release switch of FM1: `NFY` lines show in every playtest build; false makes them read "Nothing happens". */
export const NFY_SHOWN = true;

/** What any refusal without a line reads in a release build (failures.md rule 3). */
export const NOTHING_HAPPENS = 'Nothing happens.';

const NAMES = items.items as Record<string, { name: string }>;

/** An item's name as the lines use it: lower case, with its article ("a spade", "an axe", "some salts"). */
export function aName(id: string): string {
  const name = (NAMES[id]?.name ?? id).toLowerCase();
  if (/[^s]s$/.test(name)) return `some ${name}`;
  return `${/^[aeiou]/.test(name) ? 'an' : 'a'} ${name}`;
}

/** An item's plain name in lower case, for a list ("timber and resin"). */
const plain = (id: string): string => (NAMES[id]?.name ?? id).toLowerCase();

const list = (ids: readonly string[] | undefined): string => {
  const names = (ids ?? []).map(plain);
  return names.length < 2
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
};

const capital = (line: string): string => line.charAt(0).toUpperCase() + line.slice(1);
const whole = (n: number | undefined): number | null =>
  typeof n === 'number' && Number.isFinite(n) ? Math.max(1, Math.ceil(n)) : null;

const UNTIL: Record<RefusalUntil, string> = {
  day: 'the day',
  dusk: 'dusk',
  night: 'nightfall',
  dawn: 'dawn',
  meeting: 'a meeting',
  play: 'the match to begin',
};
const TARGET: Record<RefusalTarget, string> = {
  person: 'them',
  body: 'the body',
  clue: 'the clue',
  door: 'the door',
  task: 'the task',
  pile: 'the pile',
  counter: 'the counter',
  bell: 'the bell',
};
const COUNTER: Record<RefusalCounter, string> = {
  shop: 'shop',
  bank: 'bank',
  altar: 'altar',
  buyer: 'buyer',
  station: 'station',
};
const LOBBY: Record<RefusalLobbyRule, string> = {
  tooFewHumans: 'The party needs more players to start.',
  full: 'The party is full.',
  noNpcSeats: 'There is no NPC seat to remove.',
};
/** Station ids of `recipes.json` and the logic table, in the words a line uses. */
const STATION: Record<string, string> = { basin: 'basin', oven: 'oven', workbench: 'workbench', saw: 'saw' };
const aStation = (id: string | undefined): string => {
  const word = (id && STATION[id]) ?? 'station';
  return `${/^[aeiou]/.test(word) ? 'an' : 'a'} ${word}`;
};

type Line<R extends RefusalReason> = string | ((args: RefusalArgMap[R]) => string);

/** Every reason's line. A function reads its args; each one reads well when the args are missing. */
export const REFUSAL_COPY: { readonly [R in RefusalReason]: Line<R> } = {
  // 4.1 Unfinished and malformed
  NFY: (a) => `NFY: ${a.feature || 'this action'}.`,
  BAD_REQUEST: 'Bug: bad request',
  DEBUG_ONLY: 'Bug: debug only',
  // 4.2 The seat and the moment
  PHASE_CLOSED: (a) =>
    a.until && UNTIL[a.until] ? `Not now. This waits for ${UNTIL[a.until]}.` : 'Not now.',
  NOT_IN_PLAY: (a) => (a.why === 'transit' ? 'Wait until you arrive.' : 'You have no hands for it now.'),
  DOWN_OR_STUNNED: 'You are too dazed to do that.',
  BUSY: 'Your hands are full right now.',
  COOLDOWN: (a) => (whole(a.readyInS) ? `Not ready yet: ${whole(a.readyInS)} s.` : 'Not ready yet.'),
  SPENT: (a) =>
    a.what === 'power'
      ? 'You have used it up for tonight.'
      : a.what === 'match'
        ? 'You have used it up for this match.'
        : 'Nothing is left.',
  LOBBY_ONLY: 'The party has started. That is settled now.',
  NOT_LEADER: 'Only the party leader can change that.',
  LOBBY_RULE: (a) => (a.rule && LOBBY[a.rule]) || 'The party cannot do that.',
  // 4.3 Reach and targets
  TOO_FAR: (a) =>
    a.of && TARGET[a.of] ? `Too far from ${TARGET[a.of]}. Step closer.` : 'Too far. Step closer.',
  NO_TARGET: 'There is nobody within reach.',
  NOTHING_THERE: 'There is nothing there.',
  TARGET_DOWN: 'They are already down.',
  NOTHING_TO_CURE: 'There is nothing wrong that this would mend.',
  VOIDED: NOTHING_HAPPENS, // opaque on purpose (rule 4, FM4)
  NO_WAY: 'There is no way through there.',
  NOT_AIMED: 'You have no shot lined up.',
  ALREADY_DONE: (a) =>
    a.what === 'report'
      ? 'Someone already reported this body.'
      : a.what === 'notebook'
        ? 'That is in your Notebook already.'
        : a.what === 'built'
          ? 'That is built as far as it goes.'
          : 'That is done already.',
  ALREADY_HAVE: (a) => (a.item ? `You have ${aName(a.item)} already.` : 'You have one already.'),
  // 4.4 Missing unlocks (rule 2: what you tried, then what you lack)
  NEED_TOOL: (a) =>
    !a.need
      ? 'You cannot work this with your bare hands.'
      : (a.tier ?? 1) > 1
        ? `Your ${plain(a.need)} is too crude for this. It wants a finer one.`
        : `You cannot work this without ${aName(a.need)}.`,
  NEED_KEY: (a) => `The lock holds. It wants ${a.need ? aName(a.need) : 'a key'}.`,
  LOCKED: (a) =>
    a.pick === 'none'
      ? 'Failed to pick the lock. Looks like you might need a lock pick.'
      : a.pick === 'thin'
        ? 'Your pick is too thin for this lock.'
        : 'It is locked.',
  CURFEW: 'Locked for the night. Curfew keeps you out.',
  BOARDED: 'Boarded up. Not open yet.',
  NEED_ITEM: (a) => (a.need ? `You are missing ${aName(a.need)}.` : 'You are missing what it takes.'),
  NEED_MATERIALS: (a) =>
    a.missing?.length ? `You are short: ${list(a.missing)}.` : 'You are short of materials.',
  NEED_STATION: (a) => `You need ${aStation(a.need)} to do that.`,
  NEED_SCRIP: (a) => (whole(a.short) ? `You are ${whole(a.short)} Scrip short.` : 'You are short of Scrip.'),
  NEED_FAITH: (a) => (whole(a.short) ? `Your Faith is ${whole(a.short)} short.` : 'Your Faith falls short.'),
  NOT_YOUR_POWER: 'You do not know how.', // never offered by the client; names no role (rule 4)
  // 4.5 Packs, money and counters
  PACK_FULL: 'Your pockets are full.',
  FAITH_FULL: 'You cannot hold any more Faith.',
  NO_COUNTER: (a) => `There is no ${(a.kind && COUNTER[a.kind]) || 'counter'} here.`,
  COUNTER_CLOSED: (a) => `The ${(a.kind && COUNTER[a.kind]) || 'counter'} is closed.`,
  NOT_FOR_SALE: 'That is not for sale.',
  NOT_BOUGHT_HERE: (a) => `Nobody here buys ${a.item ? plain(a.item) : 'that'}.`,
  NOTHING_OWED: 'You owe nothing.',
  SEAL_BLOCKS: 'The Seal still shields them.',
  OWN_NAME: 'You cannot post a notice on yourself.',
  // 4.6 People and tasks
  NOT_YOURS: (a) =>
    a.what === 'task'
      ? 'That task is not yours.'
      : a.what === 'build'
        ? 'That is not yours to build.'
        : 'That is not yours.',
  TASK_TAKEN: 'Someone else has taken that.',
  TOO_MANY_QUESTS: 'You are carrying all the work you can.',
  LOOK_TAKEN: 'A teammate already wears that.',
  SAY_SOMETHING: '', // the empty line is dropped; nothing is shown
  CHAT_RATE: (a) => (whole(a.readyInS) ? `Slow down. Wait ${whole(a.readyInS)} s.` : 'Slow down.'),
  // 4.9 Reasons the owner answers add
  IN_JAIL: 'You are in the county jail until dawn.',
  ASLEEP: '', // never shown: any input wakes the sleeper instead
  NO_BED: 'This is not your bed. Your own is at home.',
  BOARDED_HOME: 'Your house is boarded up. Pay what you owe, or find a cot.',
  PETITION_GRACE: (a) =>
    whole(a.readyInS)
      ? `The case was just dismissed. Wait ${whole(a.readyInS)} s.`
      : 'The case was just dismissed.',
  PETITION_OPEN: 'A petition is already open. Sign that one.',
  NOT_HUNTED: 'There is no warrant for them. Petition first.',
  PICK_SNAPPED: 'The pick snaps. Ease the tension next time.',
  GRID_NO_RECIPE: 'Nothing comes of that.',
  GRID_BOUND: (a) => `${a.item ? capital(plain(a.item)) : 'That'} stays with you. It cannot be worked.`,
  NEEDS_PART: (a) =>
    a.missing?.length
      ? `The oven wants the parts first: ${list(a.missing)}.`
      : 'The oven wants the parts first.',
  // Round 10, M1 (seams.md 3 row 36)
  UNKNOWN_PHRASE: '', // the wheel sends only pool ids; an id it lacks is dropped, nothing is shown
};

/** The per-interaction `fail` lines of `interactions.json`, by interaction id and then reason (failures.md 5). */
export type InteractionFails = (interaction: string) => Readonly<Record<string, string>> | undefined;

const TABLE = interactionsData.interactions as unknown as Record<string, { fail?: Record<string, string> }>;

/** The `fail` lines of `interactions.json` (the logic table), by interaction id. */
export const interactionFails: InteractionFails = (interaction) => TABLE[interaction]?.fail;

/** The refusal fields of an `error` frame. */
export interface RefusalIn {
  reason?: unknown;
  args?: unknown;
  interaction?: string;
}

export interface RefusalLineOptions {
  /** A development build: a silent or unknown reason shows a `Bug:` line instead of nothing. */
  dev: boolean;
  /** `NFY_SHOWN` unless a test says otherwise. */
  nfy?: boolean;
}

/**
 * The line for a refusal off the wire, or null when nothing is shown (a silent reason in a release build, the empty
 * chat line, the sleeper's input). An unknown reason reads "Nothing happens" in release and names itself in dev.
 */
export function refusalLine(reason: unknown, args: unknown, opts: RefusalLineOptions): string | null {
  if (!isRefusalReason(reason))
    return opts.dev ? `Bug: unhandled refusal ${String(reason)}` : NOTHING_HAPPENS;
  if (reason === 'NFY' && !(opts.nfy ?? NFY_SHOWN)) return NOTHING_HAPPENS;
  const entry = REFUSAL_COPY[reason] as Line<RefusalReason>;
  const values = (args && typeof args === 'object' ? args : {}) as RefusalArgMap[RefusalReason];
  const line = typeof entry === 'function' ? (entry as (a: typeof values) => string)(values) : entry;
  if (SILENT_REASONS.has(reason) && !opts.dev) return null;
  return line === '' ? null : line;
}

/** True for the `NFY` reason ("the game is unfinished"), which the log draws apart from a missing-thing line. */
export const isNfy = (reason: unknown): boolean => reason === 'NFY';

/**
 * What a refusal shows (failures.md 6.2): the interaction's own `fail` line for the reason when the frame names one,
 * else the general line of the reason. Null when nothing is shown.
 */
export function refusalText(
  e: RefusalIn,
  opts: RefusalLineOptions & { fails?: InteractionFails },
): string | null {
  const own =
    e.interaction && typeof e.reason === 'string' ? opts.fails?.(e.interaction)?.[e.reason] : undefined;
  return own ?? refusalLine(e.reason, e.args, opts);
}

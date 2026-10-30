import abilitiesJson from '@wdi/content/data/abilities.json';
import { ABILITY_KEYS } from '@wdi/shared/protocol';

// Round 10, R1 (docs/round10/rolecards.md 3): every action a player can take in a match, in one table. The input code
// binds by action id (`InputController.bindAction`, the M5b layer and the role card read `actionOfCode`), the touch HUD
// builds its controls from the same rows, and the trifold card (R4) draws its "What you can do" panel from them, so a
// key can change in one place only. A new action adds a row here, its label in UI.md 14.53, and binds by its id.

/** Where a row is live: `world` in the match's world, `minigame` while a board is open (each board owns its keys). */
export type ActionContext = 'world' | 'minigame';

export type ActionGroup = 'move' | 'verb' | 'slot' | 'screen';

/** How the phone reaches it: a disc of the cluster, the stick, a HUD control, or nothing (desktop only). */
export type TouchControl =
  | { kind: 'stick' }
  | { kind: 'stickRim' }
  | { kind: 'disc'; disc: 'use' | 'slot' | 'strike' | 'sneak' }
  | { kind: 'hud'; control: string }
  | { kind: 'board' }
  | { kind: 'none' };

export interface ActionRow {
  readonly id: string;
  readonly group: ActionGroup;
  readonly context: ActionContext;
  /** `KeyboardEvent.code`s, in the order the card shows them. */
  readonly codes: readonly string[];
  /** Held: the action lasts while the key or the disc is down. */
  readonly hold?: boolean;
  readonly touch: TouchControl;
}

export const ACTIONS = [
  {
    id: 'move',
    group: 'move',
    context: 'world',
    codes: ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'],
    hold: true,
    touch: { kind: 'stick' },
  },
  { id: 'run', group: 'move', context: 'world', codes: ['Space'], hold: true, touch: { kind: 'stickRim' } },
  {
    id: 'sneak',
    group: 'move',
    context: 'world',
    codes: ['ShiftLeft', 'ShiftRight'],
    hold: true,
    touch: { kind: 'disc', disc: 'sneak' },
  },
  {
    id: 'use',
    group: 'verb',
    context: 'world',
    codes: ['KeyE'],
    hold: true,
    touch: { kind: 'disc', disc: 'use' },
  },
  { id: 'slot1', group: 'slot', context: 'world', codes: ['KeyQ'], touch: { kind: 'disc', disc: 'slot' } },
  { id: 'slot2', group: 'slot', context: 'world', codes: ['KeyR'], touch: { kind: 'disc', disc: 'slot' } },
  { id: 'slot3', group: 'slot', context: 'world', codes: ['KeyF'], touch: { kind: 'disc', disc: 'slot' } },
  { id: 'strike', group: 'verb', context: 'world', codes: ['KeyX'], touch: { kind: 'disc', disc: 'strike' } },
  { id: 'talk.town', group: 'verb', context: 'world', codes: ['KeyG'], touch: { kind: 'none' } },
  { id: 'talk.time', group: 'verb', context: 'world', codes: ['KeyH'], touch: { kind: 'none' } },
  { id: 'giver', group: 'verb', context: 'world', codes: ['KeyT'], touch: { kind: 'disc', disc: 'use' } },
  ...[1, 2, 3, 4, 5, 6].map(
    (n) =>
      ({
        id: `hotbar.${n}`,
        group: 'verb',
        context: 'world',
        codes: [`Digit${n}`],
        touch: { kind: 'hud', control: 'hotbar' },
      }) as const,
  ),
  {
    id: 'card',
    group: 'screen',
    context: 'world',
    codes: ['Tab'],
    touch: { kind: 'hud', control: 'card chip' },
  },
  {
    id: 'pockets',
    group: 'screen',
    context: 'world',
    codes: ['KeyI'],
    touch: { kind: 'hud', control: 'pockets' },
  },
  {
    id: 'craft',
    group: 'screen',
    context: 'world',
    codes: ['KeyC'],
    touch: { kind: 'hud', control: 'craft' },
  },
  {
    id: 'quests',
    group: 'screen',
    context: 'world',
    codes: ['KeyJ'],
    touch: { kind: 'hud', control: 'quests' },
  },
  {
    id: 'chores',
    group: 'screen',
    context: 'world',
    codes: ['KeyK'],
    touch: { kind: 'hud', control: 'chores' },
  },
  {
    id: 'notebook',
    group: 'screen',
    context: 'world',
    codes: ['KeyN'],
    touch: { kind: 'hud', control: 'notebook' },
  },
  {
    id: 'close',
    group: 'screen',
    context: 'world',
    codes: ['Escape'],
    touch: { kind: 'hud', control: 'close' },
  },
  {
    id: 'minigame.move',
    group: 'verb',
    context: 'minigame',
    codes: ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'],
    touch: { kind: 'board' },
  },
  {
    id: 'minigame.act',
    group: 'verb',
    context: 'minigame',
    codes: ['Space', 'Enter'],
    touch: { kind: 'board' },
  },
] as const satisfies readonly ActionRow[];

export type ActionId = (typeof ACTIONS)[number]['id'];

const BY_ID = new Map<string, ActionRow>(ACTIONS.map((a) => [a.id, a]));

/** The key codes of an action. */
export function codesOf(id: ActionId): readonly string[] {
  return BY_ID.get(id)?.codes ?? [];
}

/** The world action a key code runs, or null; a minigame's keys belong to its board. */
export function actionOfCode(code: string): ActionId | null {
  const row = ACTIONS.find((a) => a.context === 'world' && (a.codes as readonly string[]).includes(code));
  return row ? row.id : null;
}

/** The slot rows in slot order (Q, R, F). */
export const SLOT_ACTIONS = ['slot1', 'slot2', 'slot3'] as const satisfies readonly ActionId[];

const KIND = abilitiesJson.abilities as unknown as Record<string, { kind: string }>;

/** One of a card's slots: the action that fires it, its key letter and the ability it holds. */
export interface CardSlot {
  action: (typeof SLOT_ACTIONS)[number];
  key: string;
  id: string;
}

/**
 * The card's slots (rolecards.md 3.2, A1): the abilities that are not passive, in card order, take Q, R and F; a
 * passive takes none. The wire's positional `key` is not read (it leaves the wire in R6).
 */
export function cardSlots(abilities: readonly { id: string }[] | null | undefined): CardSlot[] {
  const out: CardSlot[] = [];
  for (const a of abilities ?? []) {
    const kind = KIND[a.id]?.kind;
    if (kind === undefined || kind === 'passive') continue;
    const i = out.length;
    if (i >= SLOT_ACTIONS.length) break;
    out.push({ action: SLOT_ACTIONS[i]!, key: ABILITY_KEYS[i]!, id: a.id });
  }
  return out;
}

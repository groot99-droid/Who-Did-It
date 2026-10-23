import { NoteKind } from '@wdi/shared/constants';

// UI.md 14.29: the Killer's vendetta goal line on the role card (Session 7H, round 7; GDD 3.20). 7F renders it
// in `ui/RoleCard.ts` from `Private.vendetta`: a Killer's own id, or for the Accomplice its Killers' ids joined by
// commas. Values in braces are filled with `fill()`. The contract note and its Accept button sit in the Notebook.
export const VENDETTA_COPY = {
  'vendetta.label': 'Vendetta',
  'vendetta.goal.zealot': 'Zealot: stay near the Vicar until doubt takes the flock.',
  'vendetta.goal.activist': 'Activist: tamper with two of the company’s work stations.',
  'vendetta.goal.bandit': 'Bandit: crack the manor’s strongbox after dark, alone.',
  'vendetta.goal.hitman': 'Hitman: the Train brings you a contract. Take only its mark.',
  'vendetta.mate': 'Your Killer’s vendetta: {goal}',
  'vendetta.note.doubt': 'Doubt took the flock: your vote did not carry.',
  'vendetta.note.contract': 'The mail brought a contract: {name}.',
  'vendetta.contract.accept': 'Accept',
} as const satisfies Record<string, string>;

type Goal = Extract<keyof typeof VENDETTA_COPY, `vendetta.goal.${string}`>;

/** The goal line of a vendetta id, or null for an empty or unknown one (including an inherited name). */
export function vendettaGoal(id: string): string | null {
  const key = `vendetta.goal.${id}` as Goal;
  return Object.hasOwn(VENDETTA_COPY, key) ? VENDETTA_COPY[key] : null;
}

/**
 * The Notebook entry whose Accept button shows (GDD 3.20 "Contract"): this seat's latest contract note while the
 * offer is open, so no `contract` quest is on its own list and the mark still stands on the roster; else null.
 * It reads the seat's own Notebook and quests only, so no other seat's view ever carries it.
 */
export function openContractEntry(
  entries: readonly { id: string; note?: number; of?: string }[],
  quests: readonly { id: string }[],
  alive: (seat: string) => boolean,
): string | null {
  if (quests.some((q) => q.id === 'contract')) return null;
  const last = entries.filter((e) => e.note === NoteKind.contract).at(-1);
  return last?.of && alive(last.of) ? last.id : null;
}

/** The Accept button's message: `quest.accept { questId: 'contract' }` (the server's contract line in `sim/Quests.ts`). */
export function acceptContract(feed: { questAccept(questId: string): void }): void {
  feed.questAccept('contract');
}

import { roles } from '@wdi/content';
import { ItemStack, NotebookEntry, Phase } from '@wdi/shared';
import { act, errorCodes, playerOf, setPhase, simOfBot, sleep } from './killHelpers';
import { type Bot, type Match } from './simHelpers';

// White-box helpers of the round-5 night-power tests (Session 5G): kits, the night, powers and Notebook reads.

/** The seat's kit as its card lists it (the debug start deals none). */
export function giveKit(m: Match, bot: Bot): void {
  const priv = playerOf(m, bot).priv;
  priv.inventory.slots.clear();
  for (const k of roles.roles[priv.role.roleId]?.startKit ?? []) {
    const stack = new ItemStack();
    stack.defId = k.item;
    stack.qty = k.qty;
    priv.inventory.slots.push(stack);
  }
}

/** Gives a seat a role white-box, with its kit. */
export function becomes(m: Match, bot: Bot, roleId: string): void {
  const priv = playerOf(m, bot).priv;
  priv.role.roleId = roleId;
  giveKit(m, bot);
}

/** Moves the clock to a phase with a far end and lets `runNightPowers` notice the change. */
export async function toPhase(m: Match, phase: number): Promise<void> {
  setPhase(m, phase);
  await sleep(120);
}
export const nightfall = (m: Match): Promise<void> => toPhase(m, Phase.night);

/** `act.ability` with a seat target. */
export const power = (bot: Bot, abilityId: string, targetId?: string) =>
  act(bot, 'act.ability', targetId === undefined ? { abilityId } : { abilityId, targetId });

/** The night-power entries of a seat's Notebook, in order. */
export const notes = (m: Match, bot: Bot): InstanceType<typeof NotebookEntry>[] =>
  [...playerOf(m, bot).priv.notebook].filter((e) => e.note > 0);

/** The (code, msg) pairs a bot was refused with, in order. */
export const refusals = (bot: Bot): Array<{ code: number; msg: string }> =>
  bot.events.filter((e) => e.type === 'error').map((e) => e.payload as { code: number; msg: string });

export { errorCodes, simOfBot };

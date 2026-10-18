import type { OnubActLogEntry } from '@wdi/shared/protocol';
import { fill } from '../copy';
import { ONUB_NIGHT_COPY as C } from '../copy/onubNight';
import { h } from '../dom';
import { roleName } from './rushModel';

type CopyId = keyof typeof C;

/**
 * One accepted night act as a line (GDD 3.11, "Reveal and game over"). The actor's own slot comes first for the
 * swaps with their own card, so such an act names its last slot; a pair names both. The role is the window's,
 * never a seat.
 */
export function actLogLine(entry: OnubActLogEntry, slotName: (slot: string) => string): string {
  const name = entry.act.replace(/^onub\./, '');
  const id = `onub.log.${name}` as CopyId;
  const template = id in C ? C[id] : name;
  const first = entry.slots[0] ?? '';
  const last = entry.slots.at(-1) ?? '';
  const swapsOwn = name === 'vent' || name === 'rob' || name === 'drunk' || name === 'laminateSwap';
  const pair = name === 'peekPantry' || name === 'peekLocs' || name === 'dishRoles' || name === 'dishLocs';
  const line = fill(template, {
    role: roleName(entry.roleId),
    a: slotName(swapsOwn ? last : first),
    b: slotName(pair ? last : ''),
  });
  return entry.auto ? `${line} ${C['onub.log.auto']}` : line;
}

/** The night's timeline in window order: `actlog` with one `actlog-entry` per act. */
export function renderActLog(
  root: HTMLElement,
  log: readonly OnubActLogEntry[],
  slotName: (slot: string) => string,
): void {
  const items =
    log.length === 0
      ? [h('li', { class: 'wdi-hint' }, C['onub.log.empty'])]
      : [...log]
          .sort((a, b) => a.order - b.order)
          .map((e) => h('li', { 'data-testid': 'actlog-entry' }, actLogLine(e, slotName)));
  root.replaceChildren(
    h('h2', { class: 'wdi-eyebrow' }, C['onub.log.title']),
    h('ol', { class: 'wdi-timeline', 'data-testid': 'actlog' }, ...items),
  );
}

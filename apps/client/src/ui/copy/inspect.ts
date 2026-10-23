import type { InspectHealth, InspectPurse } from '@wdi/shared/protocol';

// UI.md 14.33: inspect (Session 8B, round 8; GDD 3.22 "Inspect"). The server sends the sign and hunch ids; the words
// live only here. Values in braces are filled with `fill()`.
export const INSPECT_COPY = {
  'prompt.inspect': 'Inspect',
  'inspect.title': '{look}',
  'inspect.signs.none': 'No sign of trouble',
  'inspect.light': 'Carries a lit light',
  'inspect.close': 'Close',
  'inspect.noticed': '{look} looked you over',
  'inspect.noticed.someone': 'Someone looked you over',

  // Health bands
  'inspect.health.unhurt': 'Unhurt',
  'inspect.health.bruised': 'Bruised',
  'inspect.health.badlyHurt': 'Badly hurt',

  // Purse bands
  'inspect.purse.unknown': 'You cannot tell their purse',
  'inspect.purse.light': 'A light purse',
  'inspect.purse.fair': 'A fair purse',
  'inspect.purse.heavy': 'A heavy purse',

  // Signs (`sim/inspect/read.ts`)
  'inspect.sign.down': 'Out cold',
  'inspect.sign.stunned': 'Stunned',
  'inspect.sign.dazed': 'Dazed, eyes swimming',
  'inspect.sign.bloody': 'Blood on their clothes',
  'inspect.sign.bleeding': 'Bleeding',
  'inspect.sign.limping': 'Limping',
  'inspect.sign.pale': 'Pale and sweating',
  'inspect.sign.weary': 'Weary, stumbling',
  'inspect.sign.weak': 'Drawn and weak',
  'inspect.sign.hungry': 'Hollow-cheeked',
  'inspect.sign.hunted': 'A hunted look',

  // Hunches (`relations.json` notes): card-blind, about the look only
  'inspect.hunch.watchChain': 'Their eyes lingered on your watch chain.',
  'inspect.hunch.collar': 'They studied your collar as if it offended them.',
  'inspect.hunch.keys': 'Their eyes counted the keys at your belt.',
  'inspect.hunch.rings': 'Their stare went straight to your rings.',
  'inspect.hunch.measured': 'They took your measure, slowly.',
  'inspect.hunch.confession': 'They watched you as if waiting for a confession.',
  'inspect.hunch.blessing': 'They looked at you the way one looks for a blessing.',
  'inspect.hunch.pockets': 'Their glance went to your pockets.',
} as const satisfies Record<string, string>;

type Key = keyof typeof INSPECT_COPY;

/** The line of a server-sent copy id (a sign or a hunch), or null when this build has no words for it. */
export function inspectLine(id: string): string | null {
  return Object.hasOwn(INSPECT_COPY, id) ? INSPECT_COPY[id as Key] : null;
}

export const healthLine = (band: InspectHealth): string => INSPECT_COPY[`inspect.health.${band}`];
export const purseLine = (band: InspectPurse): string => INSPECT_COPY[`inspect.purse.${band}`];

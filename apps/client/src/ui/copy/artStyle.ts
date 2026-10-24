// UI.md 14.18 art-style switch lines (Session 5N, round 5). `{style}` is a style's name, filled with `fill()`.
export const ART_STYLE_COPY = {
  'artStyle.label': 'Art style',
  'artStyle.name.8bit': '8-bit',
  'artStyle.name.lowpoly': 'Low poly',
  'artStyle.name.hd': 'HD',
  'artStyle.reserved.hint': 'Coming later',
  'artStyle.gated.screen': 'Needs a larger screen',
  'artStyle.gated.memory': 'Needs more memory',
  'artStyle.gated.texture': 'Needs a stronger graphics card',
  'artStyle.pick': 'Play in {style}',
  'artStyle.loading': 'Changing the look...',
  'artStyle.changed': 'Look: {style}',
  'artStyle.failed': 'Could not load {style}. Staying on {current}.',
  'artStyle.hint': 'Only your own screen changes.',
} as const satisfies Record<string, string>;

type Name = Extract<keyof typeof ART_STYLE_COPY, `artStyle.name.${string}`>;

/** The shown name of a style id; an id with no copy line shows as itself. */
export function styleName(id: string): string {
  const key = `artStyle.name.${id}` as Name;
  return key in ART_STYLE_COPY ? ART_STYLE_COPY[key] : id;
}

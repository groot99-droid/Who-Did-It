import { h } from '../dom';

/** One letter of the title: its character and its place in the drop-in order (`--i`, docs/UI.md 6). */
export interface TitleLetter {
  ch: string;
  i: number;
}

/**
 * The letters of each title line, numbered on from line to line so the second line drops in after the
 * first. Spaces keep their place in the word but take no turn of the animation.
 */
export function titleLetterOrder(lines: readonly string[]): TitleLetter[][] {
  let i = 0;
  return lines.map((line) => [...line].map((ch) => ({ ch, i: ch === ' ' ? i : i++ })));
}

/**
 * The `.wdi-title` heading: one `.wdi-title__line` per line (the last takes the lantern accent when there
 * are two or more), each letter an `aria-hidden` `.wdi-title__ch` with its `--i`, and the whole text as
 * the heading's accessible name. The drop-in itself is CSS, off under `prefers-reduced-motion`.
 */
export function titleLetters(
  lines: readonly string[],
  attrs: Record<string, string> = {},
): HTMLHeadingElement {
  const order = titleLetterOrder(lines);
  return h(
    'h1',
    { ...attrs, class: 'wdi-title', 'aria-label': lines.join(' ') },
    ...order.map((letters, n) =>
      h(
        'span',
        {
          class:
            n > 0 && n === lines.length - 1 ? 'wdi-title__line wdi-title__line--accent' : 'wdi-title__line',
          'aria-hidden': 'true',
        },
        ...letters.map(({ ch, i }) => h('span', { class: 'wdi-title__ch', style: `--i: ${i}` }, ch)),
      ),
    ),
  );
}

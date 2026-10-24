import { EFFECT_KEYS, EffectId, type EffectIdValue, type EffectKey } from '@wdi/shared';
import { currentStyleId, onArtStyleChanged, styleOf } from '../view/artStyle';

// The round-8 icons (8N, docs/round8/teardown.md 3; SPRITES 9.1): DOM images, one file per icon and art style,
// `assets/ui/icons/<style>/<key>.<png|svg>`. HD is the SVG master itself; 8-bit and low poly are the PNGs generated
// from it. An icon replaces a word on screen, and the word stays its accessible label (`alt`). A key with no file
// yet resolves to null, and the caller keeps showing the word.

/** Every drawn key: the masters under `public/assets/ui/icons/hd/` (the test checks the two agree). */
export const ICON_KEYS: ReadonlySet<string> = new Set([
  ...EFFECT_KEYS.map((k) => `icon_effect_${k}`),
  'icon_sign_bloody',
  'icon_sign_hunted',
]);

/** The URL of an icon in an art style (the current one by default), or null when the icon is not drawn. */
export function iconUrl(key: string, style: string = currentStyleId()): string | null {
  if (!ICON_KEYS.has(key)) return null;
  const id = styleOf(style).id;
  return `${import.meta.env.BASE_URL}assets/ui/icons/${id}/${key}.${id === 'hd' ? 'svg' : 'png'}`;
}

/** An effect's icon, by its `EffectId` key or wire value. */
export function effectIconUrl(effect: EffectKey | EffectIdValue, style?: string): string | null {
  const key = typeof effect === 'number' ? EFFECT_KEYS.find((k) => EffectId[k] === effect) : effect;
  return key === undefined ? null : iconUrl(`icon_effect_${key}`, style);
}

/** An item's icon, by its `items.json` id. */
export const itemIconUrl = (defId: string, style?: string): string | null =>
  iconUrl(`icon_item_${defId}`, style);

/** An ability's icon, by its `abilities.json` id. */
export const abilityIconUrl = (abilityId: string, style?: string): string | null =>
  iconUrl(`icon_ability_${abilityId}`, style);

/**
 * The icon of an inspect sign (`inspect.sign.<id>`, `sim/inspect/read.ts`): the effect it shows, or a sign of its
 * own. "A hunted look" has its own drawing, never Indebted's: the sign is public and the status private.
 */
const SIGN_ICON: Readonly<Record<string, string>> = {
  down: 'icon_effect_knockedOut',
  stunned: 'icon_effect_stunned',
  dazed: 'icon_effect_dazed',
  bloody: 'icon_sign_bloody',
  bleeding: 'icon_effect_bleeding',
  limping: 'icon_effect_slowed',
  pale: 'icon_effect_poisoned',
  weary: 'icon_effect_fatigued',
  weak: 'icon_effect_weakened',
  hungry: 'icon_effect_famished',
  hunted: 'icon_sign_hunted',
};

export function signIconUrl(signId: string, style?: string): string | null {
  const key = SIGN_ICON[signId.replace(/^inspect\.sign\./, '')];
  return key === undefined ? null : iconUrl(key, style);
}

/**
 * An icon as an `<img>` labelled with its word, or null when the icon is not drawn. Its file follows the art style:
 * every icon image in the document is swapped when the style changes.
 */
export function iconImg(key: string, alt: string, cls = ''): HTMLImageElement | null {
  const src = iconUrl(key);
  if (src === null) return null;
  watchStyle();
  const img = document.createElement('img');
  img.setAttribute('class', `wdi-r8icon${cls === '' ? '' : ` ${cls}`}`);
  img.setAttribute('src', src);
  img.setAttribute('alt', alt);
  img.setAttribute('title', alt);
  img.setAttribute('draggable', 'false');
  img.setAttribute('data-icon', key);
  return img;
}

/** Points every icon image under `root` at the files of `style`. */
export function swapIcons(root: Pick<ParentNode, 'querySelectorAll'>, style: string): void {
  for (const img of root.querySelectorAll<HTMLImageElement>('img[data-icon]')) {
    const src = iconUrl(img.getAttribute('data-icon') ?? '', style);
    if (src !== null) img.setAttribute('src', src);
  }
}

let unwatch: (() => void) | null = null;

function watchStyle(): void {
  unwatch ??= onArtStyleChanged((id) => swapIcons(document, id));
}

/** Test seam: drop the style listener. */
export function resetIconsForTests(): void {
  unwatch?.();
  unwatch = null;
}

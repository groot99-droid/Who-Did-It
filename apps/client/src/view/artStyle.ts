import styleJson from '@wdi/content/data/style.json';
import { type GateVerdict, type StyleRequires, gateVerdict, probeDevice } from '../ui/artStyle/deviceGate';

// The player's art style (DECISIONS A79, SPRITES 5). The list is `style.json` `artStyles`, never a literal here.
// The pick is per player and client-side only: it lives in this module and in localStorage, and never goes on the
// wire. A style with `requires` (HD, A164) is offered only where the device meets it (`ui/artStyle/deviceGate.ts`);
// elsewhere it shows disabled, and a stored or queried pick of it falls back to the default. No Phaser import, so
// the lobby and the unit tests can use it.

export interface ArtStyleDef {
  id: string;
  pixelFinish: boolean;
  filter: 'nearest' | 'linear';
  drawScale: number;
  root: string;
  requires?: StyleRequires;
}

const defs = styleJson.artStyles;

export const ART_STYLES: readonly ArtStyleDef[] = defs.styles as ArtStyleDef[];
export const DEFAULT_STYLE_ID: string = defs.default;
/** Ids promised for later (HD): shown disabled, never loaded. */
export const RESERVED_STYLE_IDS: readonly string[] = defs.reserved;
export const STORAGE_KEY = 'wdi.artStyle';
/** Emitted on `game.events` (and to `onArtStyleChanged` listeners) once the new style's textures are in place. */
export const ART_STYLE_CHANGED = 'art-style-changed';

export const isShippedStyle = (id: unknown): id is string =>
  typeof id === 'string' && ART_STYLES.some((s) => s.id === id);

/** Why this device cannot show a shipped style, or null when it can (a style without `requires` always can). */
export const styleGate = (id: string): GateVerdict =>
  gateVerdict(ART_STYLES.find((s) => s.id === id)?.requires, probeDevice());

/** A shipped style this device may show: the only kind a pick resolves to or a switch accepts. */
export const isAvailableStyle = (id: unknown): id is string => isShippedStyle(id) && styleGate(id) === null;

export const styleOf = (id: string): ArtStyleDef =>
  ART_STYLES.find((s) => s.id === id) ?? (ART_STYLES.find((s) => s.id === DEFAULT_STYLE_ID) as ArtStyleDef);

/** The storage, or null when the browser blocks it (private window, blocked site data). */
function storage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

export function readStoredStyle(store: Pick<Storage, 'getItem'> | null = storage()): string | null {
  try {
    const v = store?.getItem(STORAGE_KEY) ?? null;
    return isAvailableStyle(v) ? v : null;
  } catch {
    return null;
  }
}

export function storeStyle(id: string, store: Pick<Storage, 'setItem'> | null = storage()): void {
  try {
    store?.setItem(STORAGE_KEY, id);
  } catch {
    // The pick then lasts for this page load only.
  }
}

/** `?art=<id>` for testing; `?art=placeholder` is the loader's own override and is not a style. */
export function queryStyle(search: string): string | null {
  const v = new URLSearchParams(search).get('art');
  return isAvailableStyle(v) ? v : null;
}

/** Query override, then the stored pick, then the default: an unknown or gated id at any step is skipped. */
export function resolveStyleId(search: string, store: Pick<Storage, 'getItem'> | null = storage()): string {
  return queryStyle(search) ?? readStoredStyle(store) ?? DEFAULT_STYLE_ID;
}

let current: string | null = null;

/** Mirrors the pick on `<html data-art-style>` for CSS and tests. */
function mirror(id: string): void {
  if (typeof document !== 'undefined') document.documentElement.dataset.artStyle = id;
}

export function currentStyleId(): string {
  if (current === null) {
    current = resolveStyleId(typeof location === 'undefined' ? '' : location.search);
    mirror(current);
  }
  return current;
}

type Listener = (id: string) => void;
const listeners = new Set<Listener>();

/** Subscribes to style changes; returns the unsubscribe. */
export function onArtStyleChanged(cb: Listener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

type Switcher = (id: string) => Promise<void>;
let switcher: Switcher | null = null;
let pending = false;

/** The Phaser side registers how textures are swapped (`view/artSwap.ts`); without it a pick applies at next load. */
export function registerSwitcher(fn: Switcher | null): void {
  switcher = fn;
}

export const isSwitching = (): boolean => pending;

/**
 * Switches to a shipped style this device may show. Resolves true when the style is now in place (or already was),
 * false when the id is not shipped or is gated here, a switch is running, or the swap failed: the old style then stays.
 */
export async function requestArtStyle(id: string): Promise<boolean> {
  if (!isAvailableStyle(id)) return false;
  if (pending) return false;
  if (id === currentStyleId()) return true;
  pending = true;
  try {
    if (switcher) await switcher(id);
    current = id;
    mirror(id);
    storeStyle(id);
    for (const cb of [...listeners]) cb(id);
    return true;
  } catch (err) {
    console.warn('[wdi] art style switch failed', err);
    return false;
  } finally {
    pending = false;
  }
}

/** Test seam: forget the resolved pick and any registered switcher. */
export function resetArtStyleForTests(): void {
  current = null;
  switcher = null;
  pending = false;
  listeners.clear();
}

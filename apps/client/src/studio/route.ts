// Round 9 (9T): which scene a page load starts. The GitHub callback always lands on `#/admin?token=...`, so the
// Studio's sign-in button leaves a one-shot marker in the tab's session storage and `Preload` follows it.
import type { TokenStore } from '../admin/AdminNet';

export const STUDIO_MARKER = 'wdi:studioReturn';

export function setStudioMarker(store: TokenStore): void {
  try {
    store.setItem(STUDIO_MARKER, '1');
  } catch {
    // Without storage the callback lands on the admin page; the owner opens the Studio from there.
  }
}

export function hasStudioMarker(store: Pick<TokenStore, 'getItem'>): boolean {
  try {
    return store.getItem(STUDIO_MARKER) === '1';
  } catch {
    return false;
  }
}

/** The marker is used once: the Studio clears it as it starts. */
export function clearStudioMarker(store: Pick<TokenStore, 'removeItem'>): void {
  try {
    store.removeItem(STUDIO_MARKER);
  } catch {
    // Nothing to clear.
  }
}

/** The first scene after loading: `#/studio`, or the admin landing with the marker, or `#/admin`, or the game. */
export function firstScene(
  flags: { admin: boolean; studio: boolean },
  marker: boolean,
): 'Studio' | 'Admin' | 'Intro' {
  if (flags.studio || (flags.admin && marker)) return 'Studio';
  return flags.admin ? 'Admin' : 'Intro';
}

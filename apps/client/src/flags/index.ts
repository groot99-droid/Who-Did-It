export type ArtMode = 'default' | 'placeholder';

export interface Flags {
  /** `?art=placeholder` keeps playtests running before the real atlas lands. */
  art: ArtMode;
  /** `?mock=1` runs the whole lobby flow against in-memory fixtures, no server. */
  mock: boolean;
  /** `?mode=onub` makes the mocks play quick mode (GDD 3.11); the real server takes the lobby setting. */
  mode: 'main' | 'onub';
  /**
   * `?onub=1` offers the quick-mode toggle in a live lobby. Until ONUB v2 lands (round 5) the live lobby does
   * not offer the mode without it; the mock lobby (`?mock=1`) always does.
   */
  onub: boolean;
  /** `#/join/CODE` deep link, already upper-cased. */
  joinCode: string | null;
  /** `#/lobby/CODE` lets a reload resume through the stored reconnection token. */
  resumeCode: string | null;
  /** `#/admin`: the owner's admin page (round 6, docs/round6/auto-admin.md 8); `Preload` starts `Admin` instead of `Landing`. */
  admin: boolean;
}

const CODE_RE = /^[A-Za-z0-9]{5}$/;

export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function isValidCode(raw: string): boolean {
  return CODE_RE.test(raw.trim());
}

export function readFlags(search: string, hash: string): Flags {
  const params = new URLSearchParams(search);
  const route = hash.replace(/^#\/?/, '').split('/');
  const code = route[1] !== undefined && isValidCode(route[1]) ? normalizeCode(route[1]) : null;
  return {
    art: params.get('art') === 'placeholder' ? 'placeholder' : 'default',
    mock: params.get('mock') === '1',
    mode: params.get('mode') === 'onub' ? 'onub' : 'main',
    onub: params.get('onub') === '1',
    joinCode: route[0] === 'join' ? code : null,
    resumeCode: route[0] === 'lobby' ? code : null,
    admin: route[0] === 'admin',
  };
}

export function setRoute(route: '' | 'admin' | `join/${string}` | `lobby/${string}`): void {
  const hash = route === '' ? '' : `#/${route}`;
  history.replaceState(null, '', `${location.pathname}${location.search}${hash}`);
}

/** Shareable deep link for a room code, honouring the Pages base path. */
export function joinLink(code: string): string {
  return `${location.origin}${import.meta.env.BASE_URL}#/join/${code}`;
}

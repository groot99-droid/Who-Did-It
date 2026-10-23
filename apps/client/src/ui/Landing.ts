import type { PartyVisibility } from '../net/protocol';
import { readAudioSettings, onAudioSettings, writeAudioSettings } from '../view/audioSettings';
import { MENU_COPY as C, fill } from './copy';
import { h, type Screen } from './dom';
import { mountTrailer } from './landingTrailer';
import { openCodeBox } from './menu/codeBox';
import { openDialog, type MenuDialog } from './menu/dialog';
import { openFriendsPanel } from './menu/friends';
import { openProfilePanel } from './menu/profile';
import { readProfile } from './menu/profileModel';
import { openQuitDialog } from './menu/quit';
import { openStartDialog } from './menu/startDialog';
import { titleLetters } from './theme/title';
import { mountSettingsPanel } from './SettingsPanel';
import './menu.css';

export interface LandingOptions {
  /** Prefilled from the `#/join/CODE` deep link. */
  joinCode: string | null;
  /** The build from `/health`, for the footer; null until it is known. */
  build?: string | null;
  onCreate(name: string, visibility: PartyVisibility): Promise<void>;
  onJoin(code: string, name: string): Promise<void>;
  /** After a failed join: a better message than the generic one, if there is one (stale build). */
  explainFailure?(): Promise<string | null>;
  /** The consented leave of the current party, for Quit; the scene passes `net.leave`. */
  onQuit?(): Promise<void>;
  /** The music bus, so the trailer's soundtrack can start on the first tap (round 6, 6K). */
  music?: { crossfadeTo(playlistId: string | null): void } | undefined;
}

/** The repository's CREDITS.md, opened in a new tab (CLAUDE.md: CC-BY needs a credits row). */
export const CREDITS_URL = 'https://github.com/groot99-droid/Who-Did-It/blob/HEAD/CREDITS.md';

type Glyph = '▶' | '⇥' | '+' | '☰' | '⚙' | '?' | '★' | '⏻';

function menuButton(label: string, glyph: Glyph, modifier = ''): HTMLButtonElement {
  return h(
    'button',
    { type: 'button', class: `wdi-glass-btn ${modifier}`.trim() },
    h('span', { class: 'wdi-glass-btn__icon', 'aria-hidden': 'true' }, glyph),
    h('span', { class: 'wdi-menu__label' }, label),
    h('span', { class: 'wdi-glass-btn__chev', 'aria-hidden': 'true' }),
  );
}

function menuLink(label: string, glyph: Glyph, href: string): HTMLAnchorElement {
  return h(
    'a',
    { class: 'wdi-glass-btn wdi-glass-btn--sm', href, target: '_blank', rel: 'noopener noreferrer' },
    h('span', { class: 'wdi-glass-btn__icon', 'aria-hidden': 'true' }, glyph),
    label,
  );
}

export function mountLanding(root: HTMLElement, opts: LandingOptions): Screen {
  let dialog: MenuDialog | null = null;
  let settings: { destroy(): void } | null = null;
  const closed = () => {
    dialog = null;
    settings?.destroy();
    settings = null;
  };
  const show = (open: (onClose: () => void) => MenuDialog) => {
    dialog?.close();
    dialog = open(closed);
  };
  /** The profile's name prefills both dialogs; a guest types it each time and nothing is remembered. */
  const remembered = () => readProfile()?.name ?? '';

  const start = menuButton(C['menu.start'], '▶', 'wdi-glass-btn--primary');
  const join = menuButton(C['menu.join'], '⇥');
  const profile = menuButton(readProfile() ? C['menu.profile.edit'] : C['menu.profile'], '+');
  const friends = menuButton(C['menu.friends'], '☰');
  const settingsBtn = menuButton(C['menu.settings'], '⚙');
  const help = menuLink(C['menu.help'], '?', `${import.meta.env.BASE_URL}help/`);
  const credits = menuLink(C['menu.credits'], '★', CREDITS_URL);
  const quit = menuButton(C['menu.quit'], '⏻', 'wdi-glass-btn--sm');

  const openCode = (code: string | null) =>
    show((onClose) =>
      openCodeBox({
        root,
        code,
        name: remembered(),
        onClose,
        onJoin: opts.onJoin,
        ...(opts.explainFailure ? { explainFailure: opts.explainFailure } : {}),
      }),
    );

  start.addEventListener('click', () =>
    show((onClose) =>
      openStartDialog({
        root,
        name: remembered(),
        onClose,
        onCreate: opts.onCreate,
        ...(opts.explainFailure ? { explainFailure: opts.explainFailure } : {}),
      }),
    ),
  );
  // Until the party list lands (PR 4) Join Game opens the code box.
  join.addEventListener('click', () => openCode(null));
  quit.addEventListener('click', () =>
    show((onClose) =>
      openQuitDialog({ root, onClose, leave: opts.onQuit ?? (async () => undefined), music: opts.music }),
    ),
  );
  settingsBtn.addEventListener('click', () =>
    show((onClose) => {
      const d = openDialog(root, { id: 'settings-title', title: C['settings.title'], onClose });
      settings = mountSettingsPanel(d.body);
      d.body.querySelector<HTMLElement>('[data-testid="settings-gear"]')?.click();
      return d;
    }),
  );

  const chipName = h('span', {});
  const chip = h(
    'button',
    { type: 'button', class: 'wdi-glass wdi-menu__chip', 'data-testid': 'menu-chip' },
    h('span', { class: 'wdi-menu__icon', 'aria-hidden': 'true' }, '☺'),
    chipName,
  );
  const showProfile = () => {
    const saved = readProfile();
    chipName.textContent = saved?.name ?? C['menu.chip.guest'];
    profile.querySelector('.wdi-menu__label')!.textContent = saved
      ? C['menu.profile.edit']
      : C['menu.profile'];
  };
  const openProfile = () => show((onClose) => openProfilePanel({ root, onClose, onSaved: showProfile }));
  chip.addEventListener('click', openProfile);
  profile.addEventListener('click', openProfile);
  friends.addEventListener('click', () => show((onClose) => openFriendsPanel({ root, onClose })));
  showProfile();
  const sound = h('button', {
    type: 'button',
    class: 'wdi-glass wdi-menu__sound',
    'data-testid': 'menu-sound',
  });
  const showSound = () => {
    const muted = readAudioSettings().muted;
    sound.setAttribute('aria-pressed', String(!muted));
    sound.setAttribute('aria-label', muted ? C['menu.sound.off'] : C['menu.sound.on']);
    sound.textContent = muted ? '×' : '♪';
  };
  sound.addEventListener('click', () => {
    const now = readAudioSettings();
    writeAudioSettings({ ...now, muted: !now.muted });
  });
  const unsubscribe = onAudioSettings(showSound);
  showSound();

  const el = h(
    'div',
    { class: 'wdi-menu', 'data-testid': 'menu' },
    h('div', { class: 'wdi-menu__top' }, chip, sound),
    h(
      'main',
      { class: 'wdi-menu__main' },
      titleLetters([C['menu.title.top'], C['menu.title.bottom']], { 'data-testid': 'menu-title' }),
      h(
        'nav',
        { class: 'wdi-menu__nav', 'aria-label': C['menu.title.label'] },
        start,
        join,
        profile,
        friends,
        settingsBtn,
      ),
      h('div', { class: 'wdi-menu__small' }, help, credits, quit),
    ),
    h(
      'footer',
      { class: 'wdi-menu__footer', 'data-testid': 'menu-build' },
      opts.build ? fill(C['menu.footer'], { build: opts.build }) : '',
    ),
  );
  // Round 6 (locked slot): the trailer loop (6K).
  const trailer = h('div', { class: 'wdi-landing__trailer', 'data-testid': 'landing-trailer', hidden: true });
  const trailerPlayer = mountTrailer(trailer, { base: import.meta.env.BASE_URL, music: opts.music });
  root.append(trailer, el);
  if (opts.joinCode !== null) openCode(opts.joinCode);
  else start.focus();
  return {
    destroy: () => {
      dialog?.close();
      settings?.destroy();
      unsubscribe();
      trailerPlayer.destroy();
      trailer.remove();
      el.remove();
    },
  };
}

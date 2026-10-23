import balance from '@wdi/content/data/balance.json';
import type { CoverState } from '../net/world';
import type { RoleRevealPayload, TraitIds } from '../net/protocol';
import { LOOKS_COPY, fill } from './copy';
import './match.css';
import { h, icon, isTyping, type Screen } from './dom';
import { type PortraitTextures, drawPortrait, isCoverRole, lookName, roleLook } from './portrait';

/** Fallback hold time (`balance.json` phases.roleRevealS); the server's `phaseChange.endsTick` overrides it. */
export const ROLE_CARD_SECONDS = balance.phases.roleRevealS;

const FLIP_DELAY_MS = 650;

const TEAM_LABEL: Record<RoleRevealPayload['team'], string> = {
  village: 'Village',
  cabal: 'Cabal',
  neutral: 'Neutral',
};

/** Words for the trait value ids of `traits.json`; a test keeps these in step with its `label` fields. */
export const TRAIT_LABELS: { [A in keyof TraitIds]: Record<TraitIds[A], string> } = {
  height: { short: 'Short', mid: 'Medium height', tall: 'Tall' },
  scarf: { red: 'Red scarf', green: 'Green scarf', blue: 'Blue scarf' },
  hat: { cap: 'Cap', bowler: 'Bowler hat', bare: 'Bare head' },
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function lookLine(t: TraitIds): string {
  return `You look like: ${TRAIT_LABELS.height[t.height]} / ${TRAIT_LABELS.scarf[t.scarf]} / ${TRAIT_LABELS.hat[t.hat]}`;
}

/** The role's display name. */
export function roleTitle(roleId: string): string {
  return roleId.split(/[_-]/).map(cap).join(' ');
}

export interface RoleCardOptions {
  onReady(): void;
  /** Main mode, a cover role: the picker sends `role.cover {lookId}` through this (GDD 3.17). */
  onPickCover?(lookId: string): void;
  /** Live picks, own and Cabal mates' (`Private.coverLook`, `mateLooks`); polled while the picker is on screen. */
  cover?(): CoverState;
  /** Loaded textures, for the picker's portraits; none draws the initial of the look's name. */
  textures?: PortraitTextures | null;
}

/** The deck strip's one card: the role's name, and the look it walks as when it has one. */
function deckChip(roleId: string): HTMLElement {
  const look = roleLook(roleId);
  const cover = isCoverRole(roleId);
  return h(
    'li',
    {
      class: `wdi-chip wdi-card__deckcard${cover ? ' is-cover' : ''}`,
      'data-card': roleId,
      title: look === '' ? '' : lookName(look),
    },
    roleTitle(roleId),
  );
}

/**
 * The cover picker's choices in order (GDD 3.17): the hints first, marked safe, then the deck's other non-cover
 * looks. A look appears once.
 */
export function coverChoices(
  deck: readonly string[],
  hints: readonly string[],
): Array<{ lookId: string; safe: boolean }> {
  const out: Array<{ lookId: string; safe: boolean }> = [];
  const seen = new Set<string>();
  const add = (card: string, safe: boolean) => {
    const lookId = roleLook(card);
    if (lookId === '' || seen.has(lookId) || isCoverRole(card)) return;
    seen.add(lookId);
    out.push({ lookId, safe });
  };
  for (const hint of hints) add(hint, true);
  for (const card of deck) add(card, false);
  return out;
}

export interface RoleCardScreen extends Screen {
  toggle(): void;
}

/**
 * The private role card. The payload lives only in this closure and the DOM below: it is
 * never written to storage, the console or the network, and `destroy` removes it.
 */
export function mountRoleCard(
  root: HTMLElement,
  role: RoleRevealPayload,
  opts: RoleCardOptions,
): RoleCardScreen {
  const holdS = ROLE_CARD_SECONDS;
  const timerBar = h('div', { class: 'wdi-timer__bar' });
  const ready = h(
    'button',
    { type: 'button', class: 'wdi-btn wdi-btn--primary wdi-grow', 'data-testid': 'ready' },
    'Ready',
  );

  const abilities = role.abilities
    .slice(0, 3)
    .map((a) =>
      h(
        'li',
        { class: 'wdi-card__ability' },
        h('kbd', { class: 'wdi-kbd' }, a.key),
        h('span', {}, a.name),
        h('span', { class: 'wdi-card__cooldown' }, a.cooldown > 0 && `${a.cooldown}s`),
      ),
    );
  const items = role.inventory.map((i) =>
    h('li', { class: 'wdi-chip', title: i.tooltip }, i.qty > 1 ? `${i.name} x${i.qty}` : i.name),
  );
  const trait = (axis: keyof TraitIds) => {
    const id = role.traits[axis];
    return h(
      'span',
      { class: 'wdi-card__trait' },
      icon(`icons/icon_${axis}_${id}`),
      (TRAIT_LABELS[axis] as Record<string, string>)[id],
    );
  };

  // GDD 3.17: the look this seat walks as, the deck, and for a cover role the picker.
  const hints = role.coverHints ?? [];
  const walkLead =
    role.look !== undefined && role.look !== '' && hints.length === 0
      ? fill(LOOKS_COPY['card.walk'], { look: lookName(role.look) })
      : '';
  const deckStrip = h(
    'div',
    { class: 'wdi-card__deck', 'data-testid': 'card-deck' },
    h('p', { class: 'wdi-eyebrow', title: LOOKS_COPY['card.deck.hint'] }, LOOKS_COPY['card.deck']),
    h('ul', { class: 'wdi-card__deckcards' }, ...(role.deck ?? []).map(deckChip)),
  );
  const picker = hints.length > 0 ? mountCoverPicker(role, opts) : null;

  const front = h(
    'article',
    { class: `wdi-card wdi-card--${role.team} wdi-flip__face wdi-flip__face--front` },
    h('div', { class: 'wdi-card__stripe' }, icon(`icons/icon_faction_${role.team}`), TEAM_LABEL[role.team]),
    h('h1', { class: 'wdi-display wdi-card__title', 'data-testid': 'role-name' }, roleTitle(role.roleId)),
    h(
      'p',
      { class: 'wdi-card__look', 'aria-label': lookLine(role.traits), 'data-testid': 'card-look' },
      walkLead !== '' ? `${walkLead}: ` : 'You look like ',
      trait('height'),
      ' ',
      trait('scarf'),
      ' ',
      trait('hat'),
    ),
    picker?.el,
    role.deck !== undefined && role.deck.length > 0 && deckStrip,
    h('p', { class: 'wdi-card__goal' }, role.goal),
    abilities.length > 0 && h('ul', { class: 'wdi-card__abilities' }, ...abilities),
    items.length > 0 && h('ul', { class: 'wdi-card__inventory' }, ...items),
    h('p', { class: 'wdi-card__text' }, role.cardText),
    h(
      'p',
      { class: 'wdi-card__beware' },
      icon('glyphs/glyph_warning', 'Beware'),
      h('span', {}, h('strong', {}, 'Beware: '), role.beware),
    ),
    role.teammates.length > 0 &&
      h(
        'p',
        { class: 'wdi-card__mates' },
        h('strong', {}, 'Your Cabal: '),
        role.teammates.map((t) => t.name).join(', '),
      ),
    h('div', { class: 'wdi-timer', 'aria-hidden': 'true' }, timerBar),
    h('div', { class: 'wdi-card__footer' }, ready, h('span', { class: 'wdi-hint' }, 'Tab reopens this card')),
  );
  const back = h(
    'article',
    { class: 'wdi-card wdi-card--back wdi-flip__face wdi-flip__face--back' },
    h('p', { class: 'wdi-eyebrow' }, 'Your role'),
    h('p', { class: 'wdi-muted' }, 'Keep your screen to yourself.'),
  );
  const inner = h('div', { class: 'wdi-flip__inner' }, front, back);
  const card = h(
    'div',
    {
      class: 'wdi-flip',
      role: 'dialog',
      'aria-modal': 'false',
      'aria-label': 'Your role card',
      'data-testid': 'rolecard',
    },
    inner,
  );
  const chip = h(
    'button',
    { type: 'button', class: 'wdi-btn wdi-btn--sm wdi-rolechip', hidden: true, 'data-testid': 'role-chip' },
    'Role card (Tab)',
  );
  root.append(card, chip);

  // The picker keeps itself in step with the server's picks (own and mates') for as long as the card is mounted.
  const pickerPoll = picker && opts.cover ? pollCover(picker, opts.cover) : null;

  let open = false;
  let timers: number[] = [];
  let isReady = false;

  const clearTimers = () => {
    for (const t of timers) window.clearTimeout(t);
    timers = [];
  };

  const hide = () => {
    clearTimers();
    open = false;
    card.hidden = true;
    chip.hidden = false;
    chip.textContent = isReady ? 'Ready - role card (Tab)' : 'Role card (Tab)';
  };

  const show = (withTimer: boolean) => {
    clearTimers();
    open = true;
    card.hidden = false;
    chip.hidden = true;
    inner.classList.remove('is-flipped');
    timerBar.classList.remove('is-running');
    timerBar.style.transform = withTimer ? '' : 'scaleX(0)';
    const flip = () => {
      inner.classList.add('is-flipped');
      if (!withTimer) return;
      timerBar.style.setProperty('--wdi-timer-duration', `${holdS}s`);
      // Force a reflow so the drain animation restarts from full.
      void timerBar.offsetWidth;
      timerBar.classList.add('is-running');
      timers.push(window.setTimeout(hide, holdS * 1000));
    };
    // Under prefers-reduced-motion the theme zeroes the flip's transition, so flipping at once is safe.
    timers.push(window.setTimeout(flip, FLIP_DELAY_MS));
  };

  const toggle = () => (open ? hide() : show(false));

  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Tab' || isTyping(e.target)) return;
    e.preventDefault();
    toggle();
  };
  document.addEventListener('keydown', onKey);
  chip.addEventListener('click', toggle);
  ready.addEventListener('click', () => {
    if (!isReady) {
      isReady = true;
      opts.onReady();
    }
    hide();
  });

  show(true);
  ready.focus({ preventScroll: true });

  return {
    toggle,
    destroy: () => {
      clearTimers();
      pickerPoll?.();
      document.removeEventListener('keydown', onKey);
      card.remove();
      chip.remove();
    },
  };
}

/** What the picker draws for one look. */
export interface CoverChoiceView {
  lookId: string;
  safe: boolean;
  picked: boolean;
  /** The Cabal mate's name when the mate wears this look: the choice is disabled. */
  wornBy: string | null;
}

/**
 * The state of a cover role's picker, apart from the DOM (GDD 3.17): the choices in order, the pick (preselected: the
 * first hint's look, as the server presets it), the mates' picks, and the clicks that become `role.cover`.
 */
export function createCoverModel(
  role: Pick<RoleRevealPayload, 'deck' | 'coverHints' | 'look' | 'teammates'>,
  onPick?: (lookId: string) => void,
) {
  const choices = coverChoices(role.deck ?? [], role.coverHints ?? []);
  const names = new Map(role.teammates.map((t) => [t.id, t.name]));
  let picked = role.look !== undefined && role.look !== '' ? role.look : (choices[0]?.lookId ?? '');
  let mates: Record<string, string> = {};
  const wornBy = (lookId: string): string | null => {
    const seat = Object.keys(mates).find((id) => mates[id] === lookId);
    return seat === undefined ? null : (names.get(seat) ?? seat);
  };
  return {
    choices: (): CoverChoiceView[] =>
      choices.map((c) => ({ ...c, picked: c.lookId === picked, wornBy: wornBy(c.lookId) })),
    /** A click: false (and nothing sent) for a look a mate wears, one already picked or one off the list. */
    pick(lookId: string): boolean {
      if (picked === lookId || wornBy(lookId) !== null || !choices.some((c) => c.lookId === lookId))
        return false;
      picked = lookId;
      onPick?.(lookId);
      return true;
    },
    /** The server's view of the picks, polled while the card is up. */
    sync(state: CoverState): void {
      if (state.look !== '') picked = state.look;
      mates = state.mates;
    },
  };
}

interface CoverPicker {
  el: HTMLElement;
  sync(c: CoverState): void;
}

/** The picker of a cover role: a button per look, the hints first; a click sends the pick. */
function mountCoverPicker(role: RoleRevealPayload, opts: RoleCardOptions): CoverPicker {
  const model = createCoverModel(role, opts.onPickCover);
  const buttons = new Map<string, HTMLButtonElement>();
  const list = h('ul', { class: 'wdi-coverpicker__list' });
  const paint = () => {
    for (const c of model.choices()) {
      const button = buttons.get(c.lookId);
      if (!button) continue;
      button.disabled = c.wornBy !== null;
      button.setAttribute('aria-pressed', String(c.picked));
      button.classList.toggle('is-picked', c.picked);
      const note = button.querySelector('.wdi-coverpicker__note');
      if (note) {
        note.textContent =
          c.wornBy !== null
            ? fill(LOOKS_COPY['card.cover.mate'], { name: c.wornBy })
            : c.safe
              ? LOOKS_COPY['card.cover.safe']
              : LOOKS_COPY['card.cover.dealt'];
      }
    }
  };
  for (const c of model.choices()) {
    const canvas = h('canvas', { class: 'wdi-coverpicker__portrait', 'aria-hidden': 'true' });
    drawPortrait(
      canvas,
      opts.textures ?? null,
      { height: 1, scarf: 0, hat: 2 },
      lookName(c.lookId),
      c.lookId,
    );
    const button = h(
      'button',
      {
        type: 'button',
        class: 'wdi-coverpicker__look',
        'data-testid': 'cover-look',
        'data-look': c.lookId,
        'data-safe': c.safe ? 'true' : 'false',
        title: fill(LOOKS_COPY['card.cover.pick'], { look: lookName(c.lookId) }),
        onClick: () => {
          if (model.pick(c.lookId)) paint();
        },
      },
      canvas,
      h('span', { class: 'wdi-coverpicker__name' }, lookName(c.lookId)),
      h('span', { class: 'wdi-coverpicker__note' }),
    );
    buttons.set(c.lookId, button);
    list.append(h('li', {}, button));
  }
  const el = h(
    'div',
    { class: 'wdi-coverpicker', 'data-testid': 'cover-picker' },
    h('p', { class: 'wdi-eyebrow' }, LOOKS_COPY['card.cover.title']),
    h('p', { class: 'wdi-hint' }, LOOKS_COPY['card.cover.hint']),
    list,
  );
  paint();
  return {
    el,
    sync: (state) => {
      model.sync(state);
      paint();
    },
  };
}

/** Re-reads the live picks twice a second while the card is mounted; returns the stop. */
function pollCover(picker: CoverPicker, read: () => CoverState): () => void {
  const sync = () => picker.sync(read());
  sync();
  const id = window.setInterval(sync, 500);
  return () => window.clearInterval(id);
}

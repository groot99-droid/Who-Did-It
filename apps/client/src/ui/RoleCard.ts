import balance from '@wdi/content/data/balance.json';
import onubBalance from '@wdi/content/data/balance.onub.json';
import onubRoles from '@wdi/content/data/roles.onub.json';
import type { RoleRevealPayload, TraitIds } from '../net/protocol';
import { h, icon, isTyping, type Screen } from './dom';

/** Fallback hold time (`balance.json` phases.roleRevealS); the server's `phaseChange.endsTick` overrides it. */
export const ROLE_CARD_SECONDS = balance.phases.roleRevealS;

type OnubRoleRow = { name: string; faction: string };
const onubRow = (roleId: string): OnubRoleRow | undefined =>
  (onubRoles.roles as Record<string, OnubRoleRow | undefined>)[roleId];

/** A quick-mode card carries the quick-mode card line as its `beware` (R -> U seam). */
export const isOnubCard = (role: Pick<RoleRevealPayload, 'beware'>): boolean =>
  role.beware === onubRoles.cardLine;

/** How long the card holds: `timers.roleCardS` for a quick-mode card, else `phases.roleRevealS`. */
export const roleCardSeconds = (role: Pick<RoleRevealPayload, 'beware'>): number =>
  isOnubCard(role) ? onubBalance.timers.roleCardS : ROLE_CARD_SECONDS;

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

/** The role's display name; quick mode reads `roles.onub.json` (`sinEater` is "Sin-Eater"). */
export function roleTitle(roleId: string, mode: 'main' | 'onub' = 'main'): string {
  if (mode === 'onub') {
    const row = onubRow(roleId);
    if (row !== undefined) return row.name;
  }
  return roleId.split(/[_-]/).map(cap).join(' ');
}

export interface RoleCardOptions {
  onReady(): void;
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
  const quick = isOnubCard(role);
  const holdS = roleCardSeconds(role);
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

  const front = h(
    'article',
    { class: `wdi-card wdi-card--${role.team} wdi-flip__face wdi-flip__face--front` },
    h('div', { class: 'wdi-card__stripe' }, icon(`icons/icon_faction_${role.team}`), TEAM_LABEL[role.team]),
    h(
      'h1',
      { class: 'wdi-display wdi-card__title', 'data-testid': 'role-name' },
      roleTitle(role.roleId, quick ? 'onub' : 'main'),
    ),
    h(
      'p',
      { class: 'wdi-card__look', 'aria-label': lookLine(role.traits) },
      'You look like ',
      trait('height'),
      ' ',
      trait('scarf'),
      ' ',
      trait('hat'),
    ),
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
      document.removeEventListener('keydown', onKey);
      card.remove();
      chip.remove();
    },
  };
}

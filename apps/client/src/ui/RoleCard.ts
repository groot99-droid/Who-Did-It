import type { RoleRevealPayload, Traits } from '../net/protocol';
import { h, isTyping, type Screen } from './dom';

// TODO: import from `@wdi/shared/constants` when it merges (GDD 3.x: the card holds 12 s).
export const ROLE_CARD_SECONDS = 12;

const FLIP_DELAY_MS = 650;

const TEAM_LABEL: Record<RoleRevealPayload['team'], string> = {
  village: 'Village',
  cabal: 'Cabal',
  neutral: 'Neutral',
};

const HEIGHT_LABEL: Record<Traits['height'], string> = { S: 'Short', M: 'Average height', T: 'Tall' };
const HAT_LABEL: Record<Traits['hat'], string> = { cap: 'Cap', bowler: 'Bowler hat', bare: 'No hat' };

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function lookLine(t: Traits): string {
  return `You look like: ${HEIGHT_LABEL[t.height]} / ${cap(t.scarf)} scarf / ${HAT_LABEL[t.hat]}`;
}

export function roleTitle(roleId: string): string {
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
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const timerBar = h('div', { class: 'timer-bar' });
  const ready = h('button', { type: 'button', class: 'primary', 'data-testid': 'ready' }, 'Ready');

  const abilities = role.abilities
    .slice(0, 3)
    .map((a) =>
      h(
        'li',
        {},
        h('kbd', {}, a.key),
        h('span', { class: 'grow' }, a.name),
        a.cooldown > 0 && h('span', { class: 'dim' }, `${a.cooldown}s`),
      ),
    );
  const items = role.inventory.map((i) =>
    h('li', { title: i.tooltip }, i.qty > 1 ? `${i.defId} x${i.qty}` : i.defId),
  );

  const front = h(
    'div',
    { class: `face front team-${role.team}` },
    h('div', { class: 'stripe' }, TEAM_LABEL[role.team]),
    h('h2', { class: 'role-name', 'data-testid': 'role-name' }, roleTitle(role.roleId)),
    h('p', { class: 'look' }, lookLine(role.traits)),
    h('p', { class: 'goal' }, role.goal),
    abilities.length > 0 && h('ul', { class: 'abilities' }, ...abilities),
    items.length > 0 && h('ul', { class: 'inventory' }, ...items),
    h('p', { class: 'text' }, role.cardText),
    h('p', { class: 'beware' }, h('strong', {}, 'Beware: '), role.beware),
    role.teammates.length > 0 &&
      h(
        'p',
        { class: 'mates' },
        h('strong', {}, 'Your Cabal: '),
        role.teammates.map((t) => t.name).join(', '),
      ),
    h('div', { class: 'timer' }, timerBar),
    h('div', { class: 'row' }, ready, h('span', { class: 'dim hint-key' }, 'Tab reopens this card')),
  );
  const back = h(
    'div',
    { class: 'face back' },
    h('p', { class: 'dim' }, 'Your role'),
    h('p', {}, 'Keep your screen to yourself.'),
  );
  const inner = h('div', { class: 'inner' }, front, back);
  const card = h(
    'div',
    {
      class: 'rolecard',
      role: 'dialog',
      'aria-modal': 'false',
      'aria-label': 'Your role card',
      'data-testid': 'rolecard',
    },
    inner,
  );
  const chip = h(
    'button',
    { type: 'button', class: 'chip', hidden: true, 'data-testid': 'role-chip' },
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
    inner.classList.toggle('flipped', false);
    timerBar.style.transition = 'none';
    timerBar.style.width = withTimer ? '100%' : '0%';
    const flip = () => {
      inner.classList.add('flipped');
      if (!withTimer) return;
      // Force a reflow so the width transition starts from 100%.
      void timerBar.offsetWidth;
      timerBar.style.transition = `width ${ROLE_CARD_SECONDS}s linear`;
      timerBar.style.width = '0%';
      timers.push(window.setTimeout(hide, ROLE_CARD_SECONDS * 1000));
    };
    if (reduceMotion) {
      inner.classList.add('no-motion');
      flip();
    } else {
      timers.push(window.setTimeout(flip, FLIP_DELAY_MS));
    }
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

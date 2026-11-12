import abilitiesJson from '@wdi/content/data/abilities.json';
import type { RoleRevealPayload } from '@wdi/shared/protocol';
import { WORLD_COPY as C } from '../ui/copy';
import { BODY_COPY } from '../ui/copy/body'; // round 8, 8A
import { h } from '../ui/dom';
import '../view/hud.css';
import { cardSlots } from './actions';
import type { InputSource } from './InputController';
import { stickVector } from './vectors';

const RADIUS = 56;
const ABILITY_KINDS = abilitiesJson.abilities as unknown as Record<string, { kind: string }>;

export interface TouchHandlers {
  /** The Use disc: `true` on pointerdown, `false` on pointerup or pointercancel (a hold ends). */
  onUse(on: boolean): void;
  /** Round 10 (10Y, A334): an ability disc, fired on pointerdown with the card row's ability id. */
  onAbility(id: string): void;
  /** Round 8 (8A): the Strike disc (X), the fists at the nearest target in reach, fired on pointerdown. */
  onStrike(): void;
}

/** One disc of the card: its key slot (Q, R or F), its ability id and the name the disc is labelled with. */
export interface AbilityDisc {
  slot: string;
  id: string;
  name: string;
}

/**
 * Round 10 (10Y, A334; UI.md 14.51.1): the discs a card gets on a phone, one per active ability in the card's slot
 * order, labelled with the row's name. A passive or a hold ability gets none: a key does nothing for them either
 * (`World.useAbility`; rolecards.md 1.2 A2), so the disc would be a dead button.
 */
export function abilityDiscs(card: Pick<RoleRevealPayload, 'abilities'> | null | undefined): AbilityDisc[] {
  if (!card) return [];
  // Round 10, R1: the slot letter from the action table's slots (passives take none), never the wire's positional key.
  const slots = cardSlots(card.abilities);
  return card.abilities
    .filter((a) => ABILITY_KINDS[a.id]?.kind === 'active')
    .map((a) => ({ slot: slots.find((s) => s.id === a.id)?.key ?? '', id: a.id, name: a.name }));
}

/**
 * One stick and the discs: the card's abilities (Q, R, F; `setAbilities`) in a row over a cluster of Use (E), Sneak
 * and Strike (X). Pushing the stick to its rim runs; Sneak toggles (round 10, R1, Q-C3). Shown on touch screens or with
 * ?touch=1.
 */
export class TouchControls implements InputSource {
  readonly root: HTMLElement;
  private readonly knob: HTMLElement;
  private readonly useBtn: HTMLButtonElement;
  private readonly abilityRow: HTMLElement;
  private abilityBtns: HTMLButtonElement[] = [];
  private abilitiesOn = true;
  private vec = { dx: 0, dy: 0 };
  private run = false;
  private sneakOn = false;
  private stickPointer: number | null = null;

  constructor(
    parent: HTMLElement,
    private readonly handlers: TouchHandlers,
  ) {
    this.knob = h('div', { class: 'wdi-stick__knob' });
    const stick = h(
      'div',
      { class: 'wdi-stick', 'aria-label': C['touch.run'], title: C['touch.run'] },
      this.knob,
    );
    this.useBtn = this.disc('E', C['touch.use'], {
      class: 'wdi-touch-btn--primary',
      'data-testid': 'touch-use',
    });
    // Round 10, R1 (rolecards.md Q-C3): Run is the stick pushed to its rim; Sneak is a toggle, not a held disc.
    const sneak = this.disc('Shift', C['touch.sneak'], {
      'aria-pressed': 'false',
      'data-testid': 'touch-sneak',
    });
    const strike = this.disc('X', BODY_COPY['body.strike'], { 'data-testid': 'touch-strike' }); // round 8, 8A
    this.press(this.useBtn, handlers.onUse);
    this.press(strike, (on) => on && handlers.onStrike()); // round 8, 8A
    sneak.addEventListener('click', () => {
      this.sneakOn = !this.sneakOn;
      sneak.setAttribute('aria-pressed', String(this.sneakOn));
      sneak.classList.toggle('is-on', this.sneakOn);
    });
    this.abilityRow = h('div', { class: 'wdi-touch-abilities', 'data-testid': 'touch-abilities' });
    this.root = h(
      'div',
      { class: 'wdi-root wdi-hud-touch' },
      h('div', { class: 'wdi-hud__bl' }, stick),
      h(
        'div',
        { class: 'wdi-hud__br' },
        this.abilityRow,
        h('div', { class: 'wdi-touch-cluster' }, this.useBtn, sneak, strike), // round 8, 8A
      ),
    );
    parent.append(this.root);

    const move = (e: PointerEvent) => {
      const r = stick.getBoundingClientRect();
      const ox = e.clientX - (r.left + r.width / 2);
      const oy = e.clientY - (r.top + r.height / 2);
      this.vec = stickVector(ox, oy, RADIUS);
      this.run = Math.hypot(ox, oy) >= RADIUS; // the rim: run
      const len = Math.min(RADIUS, Math.hypot(ox, oy)) || 0;
      const a = Math.atan2(oy, ox);
      this.knob.style.transform = `translate(calc(-50% + ${Math.cos(a) * len}px), calc(-50% + ${Math.sin(a) * len}px))`;
    };
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.stickPointer) return;
      this.stickPointer = null;
      this.vec = { dx: 0, dy: 0 };
      this.run = false;
      this.knob.style.transform = '';
    };
    stick.addEventListener('pointerdown', (e) => {
      if (this.stickPointer !== null) return;
      e.preventDefault();
      this.stickPointer = e.pointerId;
      stick.setPointerCapture(e.pointerId);
      move(e);
    });
    stick.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.stickPointer) move(e);
    });
    stick.addEventListener('pointerup', end);
    stick.addEventListener('pointercancel', end);
  }

  private disc(key: string, label: string, extra: Record<string, string> = {}): HTMLButtonElement {
    return h(
      'button',
      { type: 'button', class: `wdi-touch-btn ${extra.class ?? ''}`.trim(), ...extra },
      h('span', { class: 'wdi-touch-btn__key' }, key),
      label,
    );
  }

  /** A disc that follows the finger: `change(true)` on press, `change(false)` on release or cancel. */
  private press(b: HTMLButtonElement, change: (on: boolean) => void): void {
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      b.setPointerCapture(e.pointerId);
      b.classList.add('is-on');
      change(true);
    });
    const up = () => {
      if (!b.classList.contains('is-on')) return;
      b.classList.remove('is-on');
      change(false);
    };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
  }

  vector(): { dx: number; dy: number } {
    return this.vec;
  }
  sprint(): boolean {
    return this.run;
  }
  sneak(): boolean {
    return this.sneakOn;
  }
  /**
   * Round 10 (10Y, A334): rebuilds the ability discs, one per entry in slot order (`touch-ability-<slot>`), each
   * labelled with its name and firing `onAbility(id)`; an empty list leaves the row empty.
   */
  setAbilities(discs: AbilityDisc[]): void {
    this.abilityBtns = discs.map((d) => {
      const b = this.disc(d.slot, d.name, { 'data-testid': `touch-ability-${d.slot}` });
      this.press(b, (on) => on && this.handlers.onAbility(d.id));
      b.disabled = !this.abilitiesOn;
      return b;
    });
    this.abilityRow.replaceChildren(...this.abilityBtns);
  }
  /** Greys the ability discs (the player is a ghost). */
  setAbilitiesEnabled(on: boolean): void {
    this.abilitiesOn = on;
    for (const b of this.abilityBtns) b.disabled = !on;
  }
  setHidden(hidden: boolean): void {
    this.root.hidden = hidden;
  }
  destroy(): void {
    this.root.remove();
  }
}

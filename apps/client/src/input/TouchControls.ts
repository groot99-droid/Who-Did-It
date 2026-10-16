import { h } from '../ui/dom';
import '../view/hud.css';
import type { InputSource } from './InputController';
import { stickVector } from './vectors';

const RADIUS = 56;

export interface TouchHandlers {
  /** The Use disc: `true` on pointerdown, `false` on pointerup or pointercancel (a hold ends). */
  onUse(on: boolean): void;
  /** The Act disc (Q): the first ability of the card, fired on pointerdown. */
  onAct(): void;
}

/** One stick and four discs (Use E, Act Q held-free; Run and Sneak held). Shown on touch screens or with ?touch=1. */
export class TouchControls implements InputSource {
  readonly root: HTMLElement;
  private readonly knob: HTMLElement;
  private readonly useBtn: HTMLButtonElement;
  private readonly actBtn: HTMLButtonElement;
  private vec = { dx: 0, dy: 0 };
  private run = false;
  private sneakOn = false;
  private stickPointer: number | null = null;

  constructor(parent: HTMLElement, handlers: TouchHandlers) {
    this.knob = h('div', { class: 'wdi-stick__knob' });
    const stick = h('div', { class: 'wdi-stick', 'aria-label': 'Move' }, this.knob);
    const disc = (key: string, label: string, extra: Record<string, string> = {}) =>
      h(
        'button',
        { type: 'button', class: `wdi-touch-btn ${extra.class ?? ''}`.trim(), ...extra },
        h('span', { class: 'wdi-touch-btn__key' }, key),
        label,
      );
    /** A disc that follows the finger: `change(true)` on press, `change(false)` on release or cancel. */
    const press = (b: HTMLButtonElement, change: (on: boolean) => void) => {
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
    };
    this.useBtn = disc('E', 'use', { class: 'wdi-touch-btn--primary', 'data-testid': 'touch-use' });
    this.actBtn = disc('Q', 'act', { 'data-testid': 'touch-act' });
    const run = disc('Run', 'hold');
    const sneak = disc('Shift', 'sneak');
    press(this.useBtn, handlers.onUse);
    press(this.actBtn, (on) => on && handlers.onAct());
    press(run, (on) => (this.run = on));
    press(sneak, (on) => (this.sneakOn = on));
    this.root = h(
      'div',
      { class: 'wdi-root wdi-hud-touch' },
      h('div', { class: 'wdi-hud__bl' }, stick),
      h(
        'div',
        { class: 'wdi-hud__br' },
        h('div', { class: 'wdi-touch-cluster' }, this.actBtn, this.useBtn, run, sneak),
      ),
    );
    parent.append(this.root);

    const move = (e: PointerEvent) => {
      const r = stick.getBoundingClientRect();
      const ox = e.clientX - (r.left + r.width / 2);
      const oy = e.clientY - (r.top + r.height / 2);
      this.vec = stickVector(ox, oy, RADIUS);
      const len = Math.min(RADIUS, Math.hypot(ox, oy)) || 0;
      const a = Math.atan2(oy, ox);
      this.knob.style.transform = `translate(calc(-50% + ${Math.cos(a) * len}px), calc(-50% + ${Math.sin(a) * len}px))`;
    };
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.stickPointer) return;
      this.stickPointer = null;
      this.vec = { dx: 0, dy: 0 };
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

  vector(): { dx: number; dy: number } {
    return this.vec;
  }
  sprint(): boolean {
    return this.run;
  }
  sneak(): boolean {
    return this.sneakOn;
  }
  /** Greys the Act disc when the card has no active ability on Q (or the player is a ghost). */
  setActEnabled(on: boolean): void {
    this.actBtn.disabled = !on;
  }
  setHidden(hidden: boolean): void {
    this.root.hidden = hidden;
  }
  destroy(): void {
    this.root.remove();
  }
}

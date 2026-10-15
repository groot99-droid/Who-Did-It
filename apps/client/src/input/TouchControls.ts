import { h } from '../ui/dom';
import '../view/hud.css';
import type { InputSource } from './InputController';
import { stickVector } from './vectors';

const RADIUS = 56;

/** One stick and three buttons (Run, Sneak held; Use tapped). Shown on touch screens or with ?touch=1. */
export class TouchControls implements InputSource {
  readonly root: HTMLElement;
  private readonly knob: HTMLElement;
  private vec = { dx: 0, dy: 0 };
  private run = false;
  private sneakOn = false;
  private stickPointer: number | null = null;

  constructor(parent: HTMLElement, onUse: () => void) {
    this.knob = h('i');
    const stick = h('div', { class: 'wdi-stick' }, this.knob);
    const hold = (label: string, set: (on: boolean) => void) => {
      const b = h('button', { type: 'button' }, label);
      const down = (e: PointerEvent) => {
        e.preventDefault();
        b.setPointerCapture(e.pointerId);
        b.classList.add('on');
        set(true);
      };
      const up = () => {
        b.classList.remove('on');
        set(false);
      };
      b.addEventListener('pointerdown', down);
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      return b;
    };
    const use = h('button', { type: 'button', class: 'use' }, 'Use');
    use.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      onUse();
    });
    this.root = h(
      'div',
      { class: 'wdi-touch' },
      stick,
      h(
        'div',
        { class: 'wdi-btns' },
        hold('Run', (on) => (this.run = on)),
        hold('Sneak', (on) => (this.sneakOn = on)),
        use,
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
      this.knob.style.transform = `translate(${Math.cos(a) * len}px, ${Math.sin(a) * len}px)`;
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
  destroy(): void {
    this.root.remove();
  }
}

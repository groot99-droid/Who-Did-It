import balance from '@wdi/content/data/balance.json';
import type { LockAttempt, LockpickPublic } from '@wdi/shared/rules';
import { fill } from '../../ui/copy';
import { MINIGAME_COPY as C } from '../../ui/copy/minigames';
import { h } from '../../ui/dom';
import type { MiniGameFactory } from './registry';
import { ART_H, ART_W, box, COLORS, createStage, loop } from './draw';

const SPEC = balance.minigames.lockpick;

/** Tension rises while the pick is pressed and falls back when it is let go, per second (GDD 3.29). */
const TENSION_UP = 0.6;
const TENSION_DOWN = 1.2;
/** Under this much tension the pins do not feel the pick; at `snapAt` the pick snaps. */
const FEEL_FROM = 0.15;
/** How far a key moves the selected pin. */
const LIFT_STEP = 0.02;

export type LockResult = 'wait' | 'miss' | 'set' | 'snap';

/**
 * The lock-pick (round 10, D5b; GDD 3.29): the server's `LockpickPublic` is the lock, so the set points are known here
 * and are felt, never drawn: a click when a lifted pin crosses its band under light tension. An attempt is a release of
 * the pick: it records the pin, its lift and the tension reached. The record is the answer the server replays
 * (`lockpickOutcome`); this model repeats that replay so the board knows when it is done.
 */
export class LockpickModel {
  readonly lifts: number[];
  readonly trace: LockAttempt[] = [];
  readonly set = new Set<number>();
  selected = 0;
  tension = 0;
  pressed = false;
  snapped = false;
  /** Seconds since the first tick. */
  elapsed = 0;
  private lastT = -Infinity;
  private inBand = new Set<number>();

  constructor(readonly pub: LockpickPublic) {
    this.lifts = Array.from({ length: pub.pins }, () => 0);
  }

  get done(): boolean {
    return this.snapped || this.set.size === this.pub.pins || this.trace.length >= this.pub.maxAttempts;
  }

  select(pin: number): void {
    this.selected = Math.min(this.pub.pins - 1, Math.max(0, pin));
  }

  lift(by: number): void {
    this.setLift(this.selected, this.lifts[this.selected]! + by);
  }

  setLift(pin: number, to: number): void {
    if (this.done || this.set.has(pin)) return;
    this.lifts[pin] = Math.min(1, Math.max(0, to));
  }

  press(): void {
    if (!this.done) this.pressed = true;
  }

  /** Lets the pick go: records the attempt with the tension reached. */
  release(): LockResult {
    this.pressed = false;
    const tension = this.tension;
    this.tension = 0;
    if (this.done || this.elapsed - this.lastT < this.pub.minAttemptS) return 'wait';
    const pin = this.selected;
    const lift = this.lifts[pin]!;
    this.lastT = this.elapsed;
    this.trace.push({
      t: Math.round(this.elapsed * 1000) / 1000,
      pin,
      lift: Math.round(lift * 1000) / 1000,
      tension: Math.round(tension * 1000) / 1000,
    });
    if (tension >= this.pub.snapAt) {
      this.snapped = true;
      return 'snap';
    }
    if (Math.abs(lift - this.pub.setPoints[pin]!) <= this.pub.band) {
      this.set.add(pin);
      return 'set';
    }
    return 'miss';
  }

  /** Whether the selected pin is inside its band now: what the hand feels. */
  get feels(): boolean {
    return this.pressed && this.tension >= FEEL_FROM && this.tension < this.pub.snapAt && this.inBandNow();
  }

  private inBandNow(): boolean {
    return Math.abs(this.lifts[this.selected]! - this.pub.setPoints[this.selected]!) <= this.pub.band;
  }

  /** Advances the clock and the tension; true on the tick a pin first crosses into its band under feel. */
  tick(dt: number): boolean {
    if (this.done) return false;
    this.elapsed += dt;
    this.tension = this.pressed
      ? Math.min(1, this.tension + TENSION_UP * dt)
      : Math.max(0, this.tension - TENSION_DOWN * dt);
    if (this.pressed && this.tension >= this.pub.snapAt) this.release();
    const key = this.selected;
    if (this.feels && !this.inBand.has(key)) {
      this.inBand.add(key);
      return true;
    }
    if (!this.inBandNow()) this.inBand.delete(key);
    return false;
  }
}

/** A short click through the Web Audio API when the browser has one; a phone also buzzes. Failures are ignored. */
function click(): void {
  try {
    const Ctx = window.AudioContext;
    if (Ctx !== undefined) {
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 1400;
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.05);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.06);
      osc.onended = () => void ctx.close();
    }
    navigator.vibrate?.(20);
  } catch {
    // No sound is fine: the jolt on the screen carries the same news.
  }
}

export const lockpickGame: MiniGameFactory = (host) => {
  const pins = SPEC.pinsByTier[0] ?? 3;
  const pub = (host.pub ?? {
    pins,
    setPoints: Array.from({ length: pins }, () => 0.5),
    band: SPEC.bandFrac,
    snapAt: SPEC.snapAt,
    minAttemptS: SPEC.minAttemptS,
    maxAttempts: SPEC.maxAttempts,
  }) as LockpickPublic;
  const model = new LockpickModel(pub);
  const stage = createStage(host.root);
  const hint = h(
    'p',
    { class: 'wdi-hint', 'data-testid': 'minigame-lockpick-hint' },
    C['minigame.lockpick.hint'],
  );
  const status = h('p', { class: 'wdi-hint', 'data-testid': 'minigame-lockpick-status', role: 'status' });
  const press = h(
    'button',
    { type: 'button', class: 'wdi-btn wdi-btn--primary', 'data-testid': 'minigame-lockpick-press' },
    C['minigame.lockpick.press'],
  );
  host.root.append(hint, press, status);

  let joltS = 0;
  const colW = (ART_W - 32) / pub.pins;
  const trackTop = 14;
  const trackH = 60;
  const say = (line: string) => {
    status.textContent = line;
  };
  say(fill(C['minigame.lockpick.progress'], { set: 0, pins: pub.pins }));

  const draw = () => {
    const g = stage.ctx;
    g.fillStyle = COLORS.slate;
    g.fillRect(0, 0, ART_W, ART_H);
    const shake = joltS > 0 ? Math.round(Math.sin(model.elapsed * 90) * 1.5) : 0;
    for (let i = 0; i < pub.pins; i++) {
      const x = 16 + i * colW + colW / 2 - 5 + (i === model.selected ? shake : 0);
      box(g, { x, y: trackTop, w: 10, h: trackH }, i === model.selected ? COLORS.bone : COLORS.fog);
      const y = trackTop + trackH - 6 - model.lifts[i]! * (trackH - 6);
      g.fillStyle = model.set.has(i) ? COLORS.teal : COLORS.ink;
      g.fillRect(x - 1, y, 12, 6);
    }
    // The tension gauge: a bar filling to the snap line.
    box(g, { x: 16, y: 82, w: ART_W - 32, h: 8 }, COLORS.fog);
    g.fillStyle = model.tension >= pub.snapAt * 0.8 ? COLORS.mustard : COLORS.teal;
    g.fillRect(16, 82, (ART_W - 32) * model.tension, 8);
    g.fillStyle = COLORS.ink;
    g.fillRect(16 + (ART_W - 32) * pub.snapAt - 1, 80, 2, 12);
  };

  const let_go = () => {
    const r = model.release();
    if (r === 'set') say(fill(C['minigame.lockpick.progress'], { set: model.set.size, pins: pub.pins }));
    else if (r === 'miss') say(C['minigame.lockpick.miss']);
    else if (r === 'snap') say(C['minigame.lockpick.snap']);
  };
  const pinAt = (e: PointerEvent) => Math.floor((stage.toArt(e).x - 16) / colW);
  const drag = (e: PointerEvent) => {
    const y = stage.toArt(e).y;
    model.setLift(model.selected, 1 - (y - trackTop - 3) / (trackH - 6));
  };
  let dragging = false;
  stage.canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const pin = pinAt(e);
    if (pin >= 0 && pin < pub.pins) {
      model.select(pin);
      dragging = true;
      drag(e);
    }
  });
  stage.canvas.addEventListener('pointermove', (e) => {
    if (dragging) drag(e);
  });
  const stopDrag = () => {
    dragging = false;
  };
  stage.canvas.addEventListener('pointerup', stopDrag);
  stage.canvas.addEventListener('pointerleave', stopDrag);
  press.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    model.press();
  });
  press.addEventListener('pointerup', let_go);
  press.addEventListener('pointerleave', () => {
    if (model.pressed) let_go();
  });
  const onKey = (e: KeyboardEvent, down: boolean) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (down && !e.repeat) model.press();
      else if (!down && model.pressed) let_go();
    } else if (down && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      model.select(model.selected + (e.key === 'ArrowRight' ? 1 : -1));
    } else if (down && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      model.lift(e.key === 'ArrowUp' ? LIFT_STEP : -LIFT_STEP);
    }
  };
  const keydown = (e: KeyboardEvent) => onKey(e, true);
  const keyup = (e: KeyboardEvent) => onKey(e, false);
  window.addEventListener('keydown', keydown);
  window.addEventListener('keyup', keyup);

  let reported = false;
  const halt = loop((dt) => {
    if (model.tick(dt)) {
      joltS = 0.2;
      click();
    }
    joltS = Math.max(0, joltS - dt);
    draw();
    if (model.done && !reported) {
      reported = true;
      host.onDone();
    }
  });
  draw();
  return {
    answer: () => ({ trace: model.trace.map((a) => ({ ...a })) }),
    destroy() {
      halt();
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      stage.destroy();
      hint.remove();
      press.remove();
      status.remove();
    },
  };
};

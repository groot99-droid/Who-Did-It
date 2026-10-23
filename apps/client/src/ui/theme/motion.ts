/**
 * Activation motion (round 8, 8H; docs/UI.md 9): one-shot classes a screen puts on a control when something
 * happens to it, drawn by the "Round 8 (8H)" block of components.css. Each call restarts its animation, so a
 * second press flashes again, and takes the class off when the animation ends. Nothing here reads or changes
 * game state: the caller decides when a press landed, was refused or started a cooldown.
 */

/** The part of an element these helpers touch, so a test can pass a stand-in. */
export interface MotionTarget {
  classList: { add(c: string): void; remove(c: string): void };
  style: { setProperty(name: string, value: string): void };
  addEventListener(type: 'animationend', fn: () => void, opts: { once: true }): void;
  /** Read to commit the class removal before it is added again; any value will do. */
  readonly offsetWidth?: number;
}

export const FX = {
  flash: 'wdi-fx-flash',
  refused: 'wdi-fx-refused',
  cooling: 'wdi-fx-cooling',
  pop: 'wdi-fx-pop',
} as const;

/** Removes `cls`, commits the style, adds it back, and removes it again once its animation ends. */
export function replay(el: MotionTarget, cls: string): void {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  el.addEventListener('animationend', () => el.classList.remove(cls), { once: true });
}

/** A press that landed: a short bright flash with one overshoot. */
export const flash = (el: MotionTarget): void => replay(el, FX.flash);

/** A press the server refused: a short side-to-side shake. */
export const refused = (el: MotionTarget): void => replay(el, FX.refused);

/** Something arriving to be noticed: an icon, a prompt, a counter. */
export const pop = (el: MotionTarget): void => replay(el, FX.pop);

/**
 * A cooldown starting: a dark sweep over the control that unwinds clockwise over `ms`. The sweep is status,
 * like the busy spinner, so it runs under reduced motion too. `ms` comes from the caller (the card's
 * cooldown); with `ms` 0 or less nothing is drawn.
 */
export function cooldown(el: MotionTarget, ms: number): void {
  if (ms <= 0) {
    el.classList.remove(FX.cooling);
    return;
  }
  el.style.setProperty('--wdi-cooldown-ms', `${Math.round(ms)}ms`);
  replay(el, FX.cooling);
}

/** The prompts a refused press came from: the E prompt of the world layer, or the HUD's interact toast. */
const PRESSED = '.wdi-m5b__prompt:not([hidden]), .wdi-hud-prompt:not([hidden])';

/** A refusal from the server: shakes the first visible prompt under `root`, if one is showing. */
export function refusedIn(root: { querySelector(sel: string): MotionTarget | null }): void {
  const el = root.querySelector(PRESSED);
  if (el) refused(el);
}

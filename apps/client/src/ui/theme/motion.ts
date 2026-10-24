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

/** What bodyMotion reads from 8A's body panel each time it redraws: the health meter and the chips' effects. */
export interface BodyFrame {
  hp: number;
  effects: readonly string[];
}

/** What changed between two frames of the body panel: a hit landed, effects arrived, effects were cured. */
export interface BodyChange {
  hit: boolean;
  fresh: string[];
  cured: string[];
}

/** Compares two frames. The first frame (prev null) changes nothing, so a panel that mounts mid-game is quiet. */
export function bodyChange(prev: BodyFrame | null, next: BodyFrame): BodyChange {
  if (prev === null) return { hit: false, fresh: [], cured: [] };
  return {
    hit: next.hp < prev.hp,
    fresh: next.effects.filter((e) => !prev.effects.includes(e)),
    cured: prev.effects.filter((e) => !next.effects.includes(e)),
  };
}

export const BODY_FX = { hit: 'wdi-fx-hit', fresh: 'is-fresh', cured: 'is-cured' } as const;

/** How long a new chip is tracked across the panel's redraws: longer than any pulse token, so the pulse ends first. */
const FRESH_MS = 3000;

/**
 * The body panel's one-shot motion (round 8, 8H; UI.md 9; granted by 6Z, World.ts bodyMotion): 8A's BodyHud
 * redraws its chips every second, so CSS alone cannot tell a new hit or a new effect from a redraw. This watches
 * the panel and adds no node to it and changes none of its content: it puts classes on the health bar (a hit)
 * and on a new chip (a pulse, resumed across redraws through its animation delay), and draws a cured chip's
 * fading copy in a layer of its own beside the panel. It stops itself once the panel leaves the page.
 * Returns a function that stops it sooner.
 */
export function bodyMotion(root: HTMLElement): () => void {
  const meter = (): HTMLElement | null => root.querySelector('.wdi-body__bar--health');
  const chips = (): HTMLElement[] => [...root.querySelectorAll<HTMLElement>('.wdi-body__chip')];
  const frame = (): BodyFrame => ({
    hp: Number(meter()?.getAttribute('aria-valuenow') ?? 0),
    effects: chips().map((el) => el.dataset.effect ?? ''),
  });
  let prev: BodyFrame | null = root.hidden ? null : frame();
  const fresh = new Map<string, number>();
  // Each chip as it last looked, so a cured chip's copy reads the same and sits where the chip sat.
  const seen = new Map<string, { text: string; rect: DOMRect }>();
  const ghosts = document.createElement('div');
  ghosts.className = 'wdi-body-ghosts';
  ghosts.setAttribute('aria-hidden', 'true');
  root.after(ghosts);

  const stop = (): void => {
    observer.disconnect();
    ghosts.remove();
  };
  const observer = new MutationObserver(() => {
    if (!root.isConnected) return stop();
    if (root.hidden) {
      prev = null;
      return;
    }
    const next = frame();
    const change = bodyChange(prev, next);
    prev = next;
    const now = performance.now();
    if (change.hit) {
      const bar = meter();
      if (bar) replay(bar, BODY_FX.hit);
    }
    for (const key of change.fresh) fresh.set(key, now);
    for (const [key, since] of fresh) {
      const el = root.querySelector<HTMLElement>(`.wdi-body__chip[data-effect="${key}"]`);
      if (now - since > FRESH_MS || !el) {
        fresh.delete(key);
        continue;
      }
      // A redraw makes a new chip: start its pulse where the last one was, so it plays once.
      el.style.animationDelay = `${-Math.round(now - since)}ms`;
      el.classList.add(BODY_FX.fresh);
    }
    for (const key of change.cured) {
      const was = seen.get(key);
      if (!was) continue;
      const ghost = document.createElement('span');
      ghost.className = `wdi-body__chip wdi-body__chip--${key} ${BODY_FX.cured}`;
      ghost.textContent = was.text;
      ghost.style.left = `${was.rect.left}px`;
      ghost.style.top = `${was.rect.top}px`;
      ghosts.append(ghost);
      ghost.addEventListener('animationend', () => ghost.remove(), { once: true });
    }
    seen.clear();
    for (const el of chips())
      seen.set(el.dataset.effect ?? '', { text: el.textContent ?? '', rect: el.getBoundingClientRect() });
  });
  observer.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['aria-valuenow', 'hidden'],
  });
  // The panel leaving the page is a change to its parent, not to the panel: watch the parent for that too.
  if (root.parentNode) observer.observe(root.parentNode, { childList: true });
  return stop;
}

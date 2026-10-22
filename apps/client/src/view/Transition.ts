/**
 * Scene transitions (round 6, docs/round6/cutscene-music.md 2): a full-screen DOM layer that covers the screen,
 * runs `then` (the router's `scene.start`) behind it, then lifts. `ms` is the whole transition, half to cover and
 * half to lift (`balance.ui.transitionS`, GDD 3.13). With `ms` 0, or under `prefers-reduced-motion`, or with no
 * DOM at all (the unit tests), `then` runs synchronously and no layer exists, so the router keeps its timing.
 * A transition that starts while another is running replaces it: the older `then` is dropped, because the newer
 * scene start (a meeting's end after its start, a game over after anything) is the one that must win.
 * The three call sites in `net/worldRouter.ts` are locked.
 */
export type TransitionKind = 'fade' | 'iris' | 'wipe';

/** One mounted layer; `cover` and `reveal` call `done` on `transitionend`, the core adds the timeout fallback. */
export interface TransitionLayer {
  cover(done: () => void): void;
  reveal(done: () => void): void;
  remove(): void;
}

export interface TransitionHost {
  reduced(): boolean;
  mount(kind: TransitionKind, halfMs: number): TransitionLayer;
  after(fn: () => void, ms: number): () => void;
}

/** Slack past the CSS duration before the timeout fallback fires. */
const FALLBACK_SLACK_MS = 120;

let active: { cancel(): void } | null = null;

export function transition(
  kind: TransitionKind,
  ms: number,
  then: () => void,
  host: TransitionHost = domHost(),
): void {
  active?.cancel();
  active = null;
  if (ms <= 0 || host.reduced()) {
    then();
    return;
  }
  const half = ms / 2;
  const layer = host.mount(kind, half);
  let clear: () => void = () => undefined;
  const cancel = () => {
    clear();
    layer.remove();
    if (active === self) active = null;
  };
  const self = { cancel };
  active = self;
  /** Runs `step` once, from whichever of the layer's event or the timer arrives first. */
  const wait = (start: (done: () => void) => void, step: () => void) => {
    let fired = false;
    const done = () => {
      if (fired) return;
      fired = true;
      clear();
      step();
    };
    clear = host.after(done, half + FALLBACK_SLACK_MS);
    start(done);
  };
  wait(
    (done) => layer.cover(done),
    () => {
      then();
      wait(
        (done) => layer.reveal(done),
        () => cancel(),
      );
    },
  );
}

/** The browser host; without a `document` it reports reduced motion so every call is synchronous. */
export function domHost(): TransitionHost {
  return {
    reduced: () =>
      typeof document === 'undefined' ||
      (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches),
    mount: (kind, halfMs) => {
      const el = document.createElement('div');
      el.className = `wdi-transition wdi-transition--${kind}`;
      el.setAttribute('aria-hidden', 'true');
      el.setAttribute('data-testid', 'transition');
      el.style.setProperty('--wdi-transition-ms', `${halfMs}ms`);
      (document.getElementById('overlay') ?? document.body).append(el);
      const settle = (state: 'covered' | 'lifted', done: () => void) => {
        el.addEventListener('transitionend', () => done(), { once: true });
        void el.offsetWidth; // commit the start state so the class change animates
        el.classList.toggle('wdi-transition--covered', state === 'covered');
        el.classList.toggle('wdi-transition--lifted', state === 'lifted');
      };
      return {
        cover: (done) => settle('covered', done),
        reveal: (done) => settle('lifted', done),
        remove: () => el.remove(),
      };
    },
    after: (fn, ms) => {
      const id = setTimeout(fn, ms);
      return () => clearTimeout(id);
    },
  };
}

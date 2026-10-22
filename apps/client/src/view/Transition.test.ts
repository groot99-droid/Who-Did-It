import { afterEach, describe, expect, it } from 'vitest';
import balance from '@wdi/content/data/balance.json';
import {
  domHost,
  transition,
  type TransitionHost,
  type TransitionKind,
  type TransitionLayer,
} from './Transition';

/** A host with a hand-driven clock and layers whose `transitionend` the test fires. */
function fakeHost(reduced = false) {
  const timers: Array<{ at: number; fn: () => void; live: boolean }> = [];
  const layers: Array<{
    kind: TransitionKind;
    halfMs: number;
    removed: boolean;
    pending: Array<() => void>;
  }> = [];
  let now = 0;
  const host: TransitionHost = {
    reduced: () => reduced,
    mount: (kind, halfMs): TransitionLayer => {
      const state = { kind, halfMs, removed: false, pending: [] as Array<() => void> };
      layers.push(state);
      return {
        cover: (done) => state.pending.push(done),
        reveal: (done) => state.pending.push(done),
        remove: () => {
          state.removed = true;
        },
      };
    },
    after: (fn, ms) => {
      const t = { at: now + ms, fn, live: true };
      timers.push(t);
      return () => {
        t.live = false;
      };
    },
  };
  const tick = (ms: number) => {
    now += ms;
    for (const t of timers) {
      if (t.live && t.at <= now) {
        t.live = false;
        t.fn();
      }
    }
  };
  return { host, layers, tick };
}

afterEach(() => {
  // Flush any transition a test left running, so the module's single slot starts clean.
  transition('fade', 0, () => undefined, fakeHost().host);
});

describe('transition', () => {
  it('runs then at once at 0 ms and mounts nothing', () => {
    const { host, layers } = fakeHost();
    let ran = 0;
    transition('fade', 0, () => ran++, host);
    expect(ran).toBe(1);
    expect(layers).toHaveLength(0);
  });

  it('runs then at once under reduced motion', () => {
    const { host, layers } = fakeHost(true);
    let ran = 0;
    transition('iris', 600, () => ran++, host);
    expect(ran).toBe(1);
    expect(layers).toHaveLength(0);
  });

  it('runs then on transitionend, once, and removes the layer after the lift', () => {
    const { host, layers } = fakeHost();
    let ran = 0;
    transition('wipe', 700, () => ran++, host);
    expect(ran).toBe(0);
    expect(layers[0]?.halfMs).toBe(350);
    layers[0]?.pending.shift()?.();
    expect(ran).toBe(1);
    expect(layers[0]?.removed).toBe(false);
    layers[0]?.pending.shift()?.();
    expect(layers[0]?.removed).toBe(true);
    expect(ran).toBe(1);
  });

  it('runs then on the timeout when transitionend never comes', () => {
    const { host, layers, tick } = fakeHost();
    let ran = 0;
    transition('fade', 400, () => ran++, host);
    tick(200);
    expect(ran).toBe(0);
    tick(130);
    expect(ran).toBe(1);
    tick(400);
    expect(layers[0]?.removed).toBe(true);
  });

  it('does not run then twice when the event and the timer both arrive', () => {
    const { host, layers, tick } = fakeHost();
    let ran = 0;
    transition('fade', 400, () => ran++, host);
    layers[0]?.pending.shift()?.();
    tick(1000);
    expect(ran).toBe(1);
  });

  it('drops the older then when a newer transition starts', () => {
    const { host, layers } = fakeHost();
    const order: string[] = [];
    transition('iris', 600, () => order.push('meeting'), host);
    transition('fade', 400, () => order.push('world'), host);
    expect(layers[0]?.removed).toBe(true);
    layers[1]?.pending.shift()?.();
    expect(order).toEqual(['world']);
  });
});

describe('domHost', () => {
  it('reports reduced motion without a document, so the router stays synchronous in tests', () => {
    expect(domHost().reduced()).toBe(true);
  });
});

describe('balance.ui.transitionS', () => {
  it('sets a short, non-zero duration for each kind', () => {
    for (const kind of ['fade', 'iris', 'wipe'] as const) {
      expect(balance.ui.transitionS[kind]).toBeGreaterThan(0);
      expect(balance.ui.transitionS[kind]).toBeLessThanOrEqual(1);
    }
  });
});

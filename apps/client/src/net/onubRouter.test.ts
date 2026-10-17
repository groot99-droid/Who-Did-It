import mitt from 'mitt';
import { describe, expect, it } from 'vitest';
import { Phase } from '@wdi/shared/schema';
import { REG_ONUB, type OnubFeed, type OnubFeedEvents } from './onub';
import { installOnubRouter, ONUB_PHASE } from './onubRouter';

function setup(opts: { quick?: boolean; phase?: number; active?: string[] } = {}) {
  const active = new Set<string>(opts.active ?? []);
  const sleeping = new Set<string>();
  const calls: string[] = [];
  const registry = new Map<string, unknown>();
  const game = {
    registry: { set: (k: string, v: unknown) => registry.set(k, v) },
    scene: {
      isActive: (k: string) => active.has(k),
      isSleeping: (k: string) => sleeping.has(k),
      isPaused: () => false,
      start: (k: string) => (active.add(k), calls.push(`start ${k}`)),
      stop: (k: string) => (active.delete(k), sleeping.delete(k), calls.push(`stop ${k}`)),
      sleep: (k: string) => (active.delete(k), sleeping.add(k), calls.push(`sleep ${k}`)),
    },
  };
  const bus = mitt<OnubFeedEvents>();
  const feed = {
    bus,
    clock: () => ({ phase: opts.phase ?? 1, phaseEndsTick: 0, tick: 0 }),
  } as unknown as OnubFeed;
  let quick = opts.quick ?? true;
  const uninstall = installOnubRouter(game as never, feed, { quick: () => quick });
  const phase = (p: number) => bus.emit('phaseChange', { phase: p, endsTick: 99 });
  return { active, sleeping, calls, registry, feed, phase, uninstall, setQuick: (q: boolean) => (quick = q) };
}

describe('ONUB router', () => {
  it('mirrors the schema phase ids', () => {
    expect(ONUB_PHASE).toEqual({
      dusk: Phase.dusk,
      night: Phase.night,
      dawn: Phase.dawn,
      prepReveal: Phase.prepReveal,
    });
  });

  it('publishes the feed under REG_ONUB', () => {
    const { registry, feed } = setup();
    expect(registry.get(REG_ONUB)).toBe(feed);
  });

  it('dusk stops the match scenes, sleeps the role card and starts Kitchen; prepReveal keeps it', () => {
    const { active, sleeping, calls, phase } = setup({ active: ['RoleReveal', 'World', 'Meeting'] });
    phase(ONUB_PHASE.dusk);
    expect(active.has('World') || active.has('Meeting')).toBe(false);
    expect(sleeping.has('RoleReveal')).toBe(true);
    expect(active.has('Kitchen')).toBe(true);
    phase(ONUB_PHASE.prepReveal);
    expect(calls.filter((c) => c === 'start Kitchen')).toHaveLength(1);
  });

  it('the night stops Kitchen and starts Night; dawn keeps it', () => {
    const { active, calls, phase } = setup();
    phase(ONUB_PHASE.dusk);
    phase(ONUB_PHASE.night);
    expect(active.has('Kitchen')).toBe(false);
    expect(active.has('Night')).toBe(true);
    phase(ONUB_PHASE.dawn);
    expect(calls.filter((c) => c === 'start Night')).toHaveLength(1);
    expect(active.has('Night')).toBe(true);
  });

  it('routes nothing outside quick mode (a main-mode dusk or night)', () => {
    const { calls, phase, setQuick } = setup({ quick: false });
    phase(ONUB_PHASE.dusk);
    phase(ONUB_PHASE.night);
    expect(calls).toEqual([]);
    setQuick(true);
    phase(ONUB_PHASE.night);
    expect(calls).toEqual(['start Night']);
  });

  it('routes the phase it joins mid-match, and nothing once uninstalled', () => {
    const { active, calls, phase, uninstall } = setup({ phase: ONUB_PHASE.prepReveal });
    expect(active.has('Kitchen')).toBe(true);
    uninstall();
    phase(ONUB_PHASE.night);
    expect(calls).toEqual(['start Kitchen']);
  });

  it('leaves the meeting phases alone', () => {
    const { calls, phase } = setup();
    phase(Phase.meetingDiscussion);
    phase(Phase.gameOver);
    expect(calls).toEqual([]);
  });
});

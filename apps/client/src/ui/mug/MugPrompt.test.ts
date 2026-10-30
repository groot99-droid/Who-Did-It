import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import mitt from 'mitt';
import { TICK_RATE } from '@wdi/shared/constants';
import type { AvatarSnap, PlayerSnap, WorldFeedEvents } from '../../net/world';
import { MUG_COPY } from '../copy';
import { type FakeNode, installFakeDom } from '../main/fakeDom';
import { type MugChoice, mountMugPrompt, muggerName, remainingS } from './MugPrompt';

/** The mugging prompt (UI.md 14.36.1, GDD 3.24): opens on the private prompt, counts down, answers and closes. */

const avatar = (handle: string, lookOf: string): AvatarSnap =>
  ({
    handle,
    lookOf,
    height: 1,
    x: 0,
    y: 0,
    yaw: 0,
    animId: 0,
    statusBits: 0,
    transitUntilTick: 0,
  }) as AvatarSnap;
const seat = (id: string, name: string): PlayerSnap =>
  ({
    id,
    name,
    traits: { height: 1, scarf: 1, hat: 1 },
    alive: true,
    look: 'baker',
    presence: null,
  }) as PlayerSnap;
const asEl = (n: FakeNode) => n as unknown as HTMLElement;

describe('muggerName', () => {
  it('names a figure by its villager look, a seat by the character drawn, and a gone handle as a villager', () => {
    const avatars = [avatar('h1', 'villagerclerk'), avatar('h2', 'p2'), avatar('h3', 'villager')];
    const roster = [seat('p2', 'Moll')];
    expect(muggerName('h1', avatars, roster)).toBe('Clerk');
    expect(muggerName('h2', avatars, roster)).toBe('Moll');
    expect(muggerName('h3', avatars, roster)).toBe('Villager');
    expect(muggerName('gone', avatars, roster)).toBe('Villager');
  });
  it('counts whole seconds left and never goes below zero', () => {
    expect(remainingS(100 + 6 * TICK_RATE, 100)).toBe(6);
    expect(remainingS(100 + 1, 100)).toBe(1);
    expect(remainingS(100, 160)).toBe(0);
  });
});

describe('mountMugPrompt', () => {
  let root: FakeNode;
  let bus: ReturnType<typeof mitt<WorldFeedEvents>>;
  let tick: number;
  let sent: MugChoice[];
  beforeEach(() => {
    vi.useFakeTimers();
    root = installFakeDom()();
    bus = mitt<WorldFeedEvents>();
    tick = 1000;
    sent = [];
  });
  afterEach(() => vi.useRealTimers());

  const mount = () =>
    mountMugPrompt(
      asEl(root),
      {
        bus,
        avatars: () => [avatar('h1', 'villagerlass')],
        snapshot: () => [],
        clock: () => ({ tick, phase: 3, phaseEndsTick: 0, startTick: 0 }),
      },
      (choice) => sent.push(choice),
    );
  const prompt = (endsS: number) =>
    bus.emit('mugPrompt', { muggerId: 'h1', endsTick: tick + endsS * TICK_RATE });

  it('opens on the prompt with the mugger named, counts down, and Pay sends and closes', () => {
    const panel = mount();
    expect(panel.open()).toBe(false);
    expect(root.byTestId('mug-prompt')).toBeUndefined();
    prompt(6);
    expect(panel.open()).toBe(true);
    expect(root.byTestId('mug-title')?.content).toBe('Lass wants your purse.');
    expect(root.byTestId('mug-timer')?.content).toBe('6 s to choose');
    // Part one: Pay alone; Run and Fight join with the fists (A180).
    expect(root.byTestId('mug-flee')).toBeUndefined();
    expect(root.byTestId('mug-fight')).toBeUndefined();
    tick += 2 * TICK_RATE;
    vi.advanceTimersByTime(300);
    expect(root.byTestId('mug-timer')?.content).toBe('4 s to choose');
    root.byTestId('mug-pay')?.click();
    expect(sent).toEqual(['pay']);
    expect(panel.open()).toBe(false);
    expect(root.byTestId('mug-prompt')).toBeUndefined();
    panel.destroy();
  });

  it('closes by itself when the answer runs out, a second prompt replaces the first, and destroy unhooks', () => {
    const panel = mount();
    prompt(2);
    prompt(3);
    expect(root.all().filter((n) => n.attrs.get('data-testid') === 'mug-prompt')).toHaveLength(1);
    expect(root.byTestId('mug-timer')?.content).toBe('3 s to choose');
    tick += 3 * TICK_RATE;
    vi.advanceTimersByTime(300);
    expect(panel.open()).toBe(false);
    expect(sent).toEqual([]);
    panel.destroy();
    prompt(5);
    expect(root.byTestId('mug-prompt')).toBeUndefined();
  });

  it('carries only the three motion classes of 8H', () => {
    const panel = mount();
    prompt(6);
    const classes = root
      .all()
      .flatMap((n) => n.className.split(' '))
      .filter((c) => c.startsWith('wdi-anim-'));
    expect(new Set(classes)).toEqual(new Set(['wdi-anim-veil', 'wdi-anim-panel', 'wdi-anim-list']));
    expect(MUG_COPY['mug.fight']).toBe('Fight');
    panel.destroy();
  });
});

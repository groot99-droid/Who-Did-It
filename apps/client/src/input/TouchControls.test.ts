import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockNetwork } from '../net/mock';
import type { RoleRevealPayload } from '../net/protocol';
import { type FakeNode, installFakeDom } from '../ui/main/fakeDom';
import { abilityDiscs, TouchControls } from './TouchControls';

// Round 10, 10Y (A334; UI.md 14.51.1; rolecards.md 1.2 A3): a phone gets one disc per active ability of the card, on
// Q, R and F, labelled with the ability's name, each pressing the same path a key presses.

/** A Reverend-shaped card: Q, R and F all active (`salts` R, `fakeBlood` F), as the Vane's or the Reverend's. */
const threeActive: Pick<RoleRevealPayload, 'abilities'> = {
  abilities: [
    { id: 'kill', name: 'Kill', key: 'Q', cooldown: 0, uses: null },
    { id: 'salts', name: 'Salts', key: 'R', cooldown: 0, uses: 2 },
    { id: 'fakeBlood', name: 'Fake Blood', key: 'F', cooldown: 0, uses: 1 },
  ],
};

/** The mock net's card after Start: Kill (Q, active), Lock door (R, active), Drag body (F, a hold). */
async function mockCard(): Promise<RoleRevealPayload> {
  const net = new MockNetwork();
  await net.create('Hana');
  net.send('lobby.start', {});
  vi.advanceTimersByTime(1000);
  const card = net.roleCard;
  if (!card) throw new Error('the mock dealt no card');
  return card;
}

describe('abilityDiscs', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('window', { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('gives the mock net card Q and R and skips the hold on F', async () => {
    expect(abilityDiscs(await mockCard())).toEqual([
      { slot: 'Q', id: 'kill', name: 'Kill' },
      { slot: 'R', id: 'killerLock', name: 'Lock door' },
    ]);
  });

  it('keeps the card order, and gives no card and a passive no disc', () => {
    expect(abilityDiscs(threeActive).map((d) => `${d.slot} ${d.name}`)).toEqual([
      'Q Kill',
      'R Salts',
      'F Fake Blood',
    ]);
    expect(abilityDiscs(null)).toEqual([]);
    expect(
      abilityDiscs({ abilities: [{ id: 'tasks', name: 'Tasks', key: 'Q', cooldown: 0, uses: null }] }),
    ).toEqual([]);
  });
});

describe('TouchControls discs', () => {
  let root: FakeNode;
  let pressed: string[];
  let touch: TouchControls;
  const asEl = (n: FakeNode) => n as unknown as HTMLElement;
  const pointer = { preventDefault: () => {}, pointerId: 7 };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('window', { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout });
    root = installFakeDom()();
    pressed = [];
    touch = new TouchControls(asEl(root), {
      onUse: () => {},
      onAbility: (id) => pressed.push(id),
      onStrike: () => {},
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('draws one labelled disc per active ability of the mock card and presses by ability id', async () => {
    touch.setAbilities(abilityDiscs(await mockCard()));
    const q = root.byTestId('touch-ability-Q');
    const r = root.byTestId('touch-ability-R');
    // The fake DOM puts a node's own text before its children; the browser draws the cap then the label.
    const capAndLabel = (n: FakeNode | undefined) => [n?.children[0]?.content, n?.text];
    expect(capAndLabel(q)).toEqual(['Q', 'Kill']);
    expect(capAndLabel(r)).toEqual(['R', 'Lock door']);
    expect(root.byTestId('touch-ability-F')).toBeUndefined();
    expect(root.byTestId('touch-act')).toBeUndefined();
    expect(root.byTestId('touch-use')).toBeDefined();
    r?.fire('pointerdown', pointer);
    r?.fire('pointerup');
    q?.fire('pointerdown', pointer);
    expect(pressed).toEqual(['killerLock', 'kill']);
  });

  it('draws R and F discs for a card with three active abilities, greyed for a ghost', () => {
    touch.setAbilities(abilityDiscs(threeActive));
    const row = root.byTestId('touch-abilities');
    expect(row?.children.map((c) => [c.children[0]?.content, c.text])).toEqual([
      ['Q', 'Kill'],
      ['R', 'Salts'],
      ['F', 'Fake Blood'],
    ]);
    touch.setAbilitiesEnabled(false);
    expect(row?.children.map((c) => c.disabled)).toEqual([true, true, true]);
    root.byTestId('touch-ability-F')?.fire('pointerdown', pointer);
    expect(pressed).toEqual(['fakeBlood']); // the browser blocks a disabled button's events; the model does not
    touch.setAbilitiesEnabled(true);
    touch.setAbilities([]);
    expect(row?.children).toEqual([]);
  });
});

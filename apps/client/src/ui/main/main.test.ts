import { beforeEach, describe, expect, it, vi } from 'vitest';
import deckJson from '@wdi/content/data/roles.json';
import type { GameOver, MeetingPlayer } from '../../net/meeting';
import type { LobbySnapshot, NetworkService } from '../../net/NetworkService';
import { cardCounts, cardName, deckOfParty, lookName } from './cards';
import { mountDeckChip } from './deckChip';
import { mountDeckList } from './deckList';
import { FakeNode, installFakeDom } from './fakeDom';
import { renderLookPortrait, revealLookLine } from './lookPortraits';
import { renderMainOver } from './overMain';
import { showShotToast } from './shotToast';

let root: () => FakeNode;
beforeEach(() => {
  root = installFakeDom();
});

const asEl = (n: FakeNode) => n as unknown as HTMLElement;
const net = {} as NetworkService;
const snapshot = (n: number, mode: 'main' | 'onub' = 'main'): LobbySnapshot =>
  ({
    code: 'ABCDE',
    selfId: 'a',
    leaderId: 'a',
    players: Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}` })),
    settings: { mode, npcDifficulty: 'normal', npcSeats: 0, onubDeck: [], map: 'hollowmere' },
  }) as unknown as LobbySnapshot;

describe('cards (public content)', () => {
  it('names cards and looks, and returns "" for an unknown look', () => {
    expect(cardName('killer')).toBe('Killer');
    expect(cardName('nobody')).toBe('nobody');
    expect(lookName('baker')).toBe('the Baker');
    expect(lookName('')).toBe('');
    expect(lookName('nobody')).toBe('');
  });

  it('reads the deck of a party, filled to four and capped at ten', () => {
    expect(deckOfParty(1)?.seats).toBe(4);
    expect(deckOfParty(1)?.practice).toBe(true);
    expect(deckOfParty(7)?.cards).toEqual(deckJson.decks['7'].cards);
    expect(deckOfParty(12)?.seats).toBe(10);
    for (let n = 4; n <= 10; n++) expect(deckOfParty(n)?.cards).toHaveLength(n + 2);
  });

  it('counts the repeated Killer card of the ten-seat deck once, with its count', () => {
    const counts = cardCounts(deckOfParty(10)?.cards ?? []);
    expect(counts.find((c) => c.id === 'killer')?.count).toBe(2);
    expect(counts).toHaveLength(11);
  });
});

describe('the lobby deck list', () => {
  it('lists the deck of the party size, follows it, and empties in the quick mode', () => {
    const slot = root();
    const list = mountDeckList(asEl(slot), net);
    list.update(snapshot(6));
    expect(slot.byTestId('lobby-deck-size')?.content).toBe('8 cards for 6 players');
    expect(slot.byTestId('deck-card-watchman')?.content).toBe('Watchman');
    expect(slot.byTestId('deck-card-herbalist')).toBeUndefined();
    list.update(snapshot(8));
    expect(slot.byTestId('lobby-deck-size')?.content).toBe('10 cards for 8 players');
    expect(slot.byTestId('deck-card-herbalist')?.content).toBe('Herbalist');
    list.update(snapshot(8, 'onub'));
    expect(slot.childElementCount).toBe(0);
    list.update(snapshot(2));
    expect(slot.byTestId('lobby-deck-practice')).toBeDefined();
    list.destroy();
    expect(slot.childElementCount).toBe(0);
  });

  it('shows the repeated Killer card as a pair', () => {
    const slot = root();
    mountDeckList(asEl(slot), net).update(snapshot(10));
    expect(slot.byTestId('deck-card-killer')?.content).toBe('Killer x2');
  });
});

describe('the HUD deck chip', () => {
  it('opens and closes the list of the cards from roleReveal.deck', () => {
    const slot = root();
    const cards = deckOfParty(5)?.cards ?? [];
    const chip = mountDeckChip(asEl(slot), cards);
    const toggle = slot.byTestId('hud-deck-toggle') as FakeNode;
    const list = slot.byTestId('hud-deck-list') as FakeNode;
    expect(toggle.content).toBe('Deck: 7 cards');
    expect(list.hidden).toBe(true);
    toggle.click();
    expect(list.hidden).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(list.children.map((c) => c.content)).toEqual(cards.map(cardName));
    toggle.click();
    expect(list.hidden).toBe(true);
    chip.destroy();
    expect(slot.childElementCount).toBe(0);
  });
});

describe('looks on the meeting', () => {
  const seat = (look: string): MeetingPlayer => ({
    id: 's1',
    name: 'Bo',
    traits: { height: 0, scarf: 0, hat: 0 },
    look,
    alive: true,
    hasVoted: false,
  });

  it('tags a portrait with the look, once, and leaves a seat without a look alone', () => {
    const pic = root();
    renderLookPortrait(asEl(pic), seat('baker'));
    renderLookPortrait(asEl(pic), seat('baker'));
    expect(pic.children).toHaveLength(1);
    expect(pic.byTestId('look-s1')?.content).toBe('the Baker');
    expect(pic.dataset.look).toBe('baker');
    const bare = root();
    renderLookPortrait(asEl(bare), seat(''));
    renderLookPortrait(asEl(bare), seat('nobody'));
    expect(bare.childElementCount).toBe(0);
  });

  it('words the reveal line, and is empty without a look', () => {
    expect(revealLookLine('baker')).toBe('Walking as the Baker.');
    expect(revealLookLine('')).toBe('');
    expect(revealLookLine('nobody')).toBe('');
  });
});

describe('the Last Shot toast', () => {
  it('names the shooter, the target and the target role, then goes away', () => {
    vi.useFakeTimers();
    const board = root();
    vi.stubGlobal('window', { setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms) });
    showShotToast(asEl(board), { fromId: 'a', targetId: 'b', role: 'killer' }, (id) =>
      id === 'a' ? 'Ana' : 'Bo',
    );
    expect(board.byTestId('shot-toast')?.content).toBe('Ana fired the Last Shot: Bo was the Killer.');
    vi.advanceTimersByTime(8000);
    expect(board.byTestId('shot-toast')).toBeUndefined();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
});

describe('the main end panel', () => {
  const players = (look: string) => (id: string) =>
    ({
      id,
      name: id.toUpperCase(),
      look,
      traits: { height: 0, scarf: 0, hat: 0 },
      alive: true,
      hasVoted: false,
    }) as MeetingPlayer;
  const over = (extra: Partial<GameOver>): GameOver => ({
    winner: 1,
    roles: { a: 'killer', b: 'drifter' },
    summary: '',
    ...extra,
  });

  it('lists looks, the undealt cards and an ejected Drifter', () => {
    const panel = root();
    renderMainOver(asEl(panel), over({ undealt: ['vicar', 'baker'], alsoWon: ['b'] }), players('baker'));
    expect(panel.byTestId('gameover-look-a')?.content).toBe('A walked as the Baker');
    expect(panel.byTestId('gameover-undealt')?.content).toBe('Vicar, Baker');
    expect(panel.byTestId('gameover-alsowon')?.content).toBe('B was ejected as the Drifter');
  });

  it('draws nothing when the server sent no looks, cards or winners', () => {
    const panel = root();
    renderMainOver(asEl(panel), over({}), players(''));
    expect(panel.childElementCount).toBe(0);
  });
});

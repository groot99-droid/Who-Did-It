import mitt from 'mitt';
import { describe, expect, it } from 'vitest';
import onubBalance from '@wdi/content/data/balance.onub.json';
import type { OnubFeedEvents } from '../onub';
import { ONUB_PHASE } from '../onubRouter';
import { type MockOnubContext, mockOnubDeal } from './onubMock';
import { createPrepMock } from './onubPrepMock';

function setup(role = 'chef', phase: number = ONUB_PHASE.dusk) {
  const refused: [number, string][] = [];
  const emitted: unknown[] = [];
  const bus = mitt<OnubFeedEvents>();
  bus.on('nightReveal', (e) => emitted.push(e));
  const deal = mockOnubDeal('You', `?role=${role}`);
  const ctx: MockOnubContext = {
    selfId: 'mock-me',
    deal,
    bus,
    clock: () => ({ phase, phaseEndsTick: 0, tick: 0 }),
    ticks: (s) => s,
    later: () => undefined,
    endPhase: () => undefined,
    boardChanged: () => undefined,
    refuse: (code, msg) => void refused.push([code, msg]),
  };
  return { half: createPrepMock(ctx), refused, emitted, deal };
}

describe('prep mock', () => {
  it('accepts one commit from the self seat and refuses a repeat with 422', () => {
    const { half, refused } = setup();
    half.prep('fridge', 'pureDairy');
    expect(half.myPrep()).toEqual({ station: 'fridge', card: 'pureDairy' });
    half.prep('oven', 'oakFirewood');
    expect(refused).toEqual([[422, 'cannot commit that']]);
    expect(half.myPrep()).toEqual({ station: 'fridge', card: 'pureDairy' });
  });

  it('refuses a sabotage card for a seat dealt a Baker', () => {
    const { half, refused } = setup('chef');
    half.prep('fridge', 'spoiledMilk');
    expect(half.myPrep()).toBeNull();
    expect(refused[0]?.[0]).toBe(422);
  });

  it('refuses outside Evening Prep with 425', () => {
    const { half, refused } = setup('chef', ONUB_PHASE.night);
    half.prep('fridge', 'pureDairy');
    expect(refused).toEqual([[425, 'not in Evening Prep']]);
  });

  it('commits for the self seat at the end of prep and lands every visitor on a pile', () => {
    const { half, deal } = setup();
    half.endPrep();
    expect(half.myPrep()).not.toBeNull();
    const board = half.board();
    const cards = Object.values(board.piles).reduce((n, p) => n + p.cards.length + p.lost, 0);
    expect(cards).toBe(deal.seats.length);
    expect(Object.keys(board.piles).sort()).toEqual(onubBalance.stations.map((s) => s.id).sort());
  });

  it('adds the nets and the caution flags into the ruin weight', () => {
    const { half } = setup('champignon');
    half.endPrep();
    const board = half.board();
    const flags = Object.values(board.piles).filter((p) => p.underMixed).length;
    const nets = Object.values(board.piles).reduce((n, p) => n + p.net, 0);
    expect(board.ruinWeight).toBe(nets + flags * onubBalance.stations[1]!.underMixWeight!);
    expect(board.ruined).toBe(board.ruinWeight >= onubBalance.ruin.weightByCount['5']);
  });

  it('is empty before the end of prep and shows the deal order and the deck', () => {
    const { half, deal } = setup();
    expect(half.board().piles).toEqual({});
    expect(half.board().seats).toEqual(deal.seats.map((s) => s.id));
    expect(half.board().deck).toEqual(deal.deck);
  });
});

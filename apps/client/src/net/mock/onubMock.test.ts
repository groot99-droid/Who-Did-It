import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import onubBalance from '@wdi/content/data/balance.onub.json';
import onubRoles from '@wdi/content/data/roles.onub.json';
import { ONUB_PHASE } from '../onubRouter';
import { MockOnubFeed, mockOnubDeal, onubMockRoleCard } from './onubMock';

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('window', globalThis);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const T = onubBalance.timers;

describe('mock ONUB deal', () => {
  it('deals the 5-seat deck: five seats, three Pantry cards, the self seat first', () => {
    const deal = mockOnubDeal('Hana', '');
    expect(deal.deck).toEqual(onubBalance.byCount['5'].deck);
    expect(deal.seats).toHaveLength(5);
    expect(deal.seats[0]).toEqual({ id: 'mock-me', name: 'Hana' });
    expect(deal.pantryRoles).toHaveLength(onubBalance.pantry.roles);
    expect([...Object.values(deal.dealt), ...deal.pantryRoles].sort()).toEqual([...deal.deck].sort());
    expect(deal.dealt['mock-me']).toBe('chef');
  });

  it('honours ?role= for a card of the deck only', () => {
    expect(mockOnubDeal('Hana', '?role=aboyeur').dealt['mock-me']).toBe('aboyeur');
    expect(mockOnubDeal('Hana', '?role=tourrier').dealt['mock-me']).toBe('chef');
  });

  it('makes a quick-mode role card with the team name and no main-mode parts', () => {
    const card = onubMockRoleCard('Hana', '?role=champignon');
    expect(card).toMatchObject({
      roleId: 'champignon',
      team: 'cabal',
      teamName: onubRoles.teams.mold.name,
      goal: onubRoles.teams.mold.goal,
      beware: onubRoles.cardLine,
      abilities: [],
      inventory: [],
      teammates: [],
    });
  });
});

describe('MockOnubFeed', () => {
  it('plays dusk, prepReveal, the night and dawn on the shared clock, then asks for the Rush', () => {
    const onDawnEnd = vi.fn();
    const feed = new MockOnubFeed({ selfName: 'Hana', onDawnEnd, search: '' });
    const phases: number[] = [];
    const boards: number[] = [];
    feed.bus.on('phaseChange', (e) => phases.push(e.phase));
    feed.bus.on('board', () => boards.push(feed.clock().phase));
    expect(feed.seats()).toHaveLength(5);
    expect(feed.dealtRole()).toBe('chef');
    expect(feed.board().seats).toEqual(feed.seats().map((s) => s.id));

    feed.start();
    expect(phases).toEqual([ONUB_PHASE.dusk]);
    const { phaseEndsTick, tick } = feed.clock();
    expect(phaseEndsTick - tick).toBe(T.prepS * 20);
    vi.advanceTimersByTime(T.prepS * 1000);
    expect(phases.at(-1)).toBe(ONUB_PHASE.prepReveal);
    expect(boards).toContain(ONUB_PHASE.prepReveal);
    vi.advanceTimersByTime(T.prepRevealS * 1000);
    expect(phases.at(-1)).toBe(ONUB_PHASE.night);
    vi.advanceTimersByTime(600_000);
    expect(phases).toEqual([ONUB_PHASE.dusk, ONUB_PHASE.prepReveal, ONUB_PHASE.night, ONUB_PHASE.dawn]);
    expect(onDawnEnd).toHaveBeenCalledOnce();
    feed.dispose();
  });

  it('hands prep to the prep half: one commit in dusk, the rest refused', () => {
    const onRefuse = vi.fn();
    const feed = new MockOnubFeed({ onRefuse, search: '' });
    feed.prep('fridge', 'pureDairy');
    expect(onRefuse).toHaveBeenLastCalledWith(425, expect.any(String));
    feed.start();
    feed.prep('fridge', 'pureDairy');
    expect(feed.myPrep()).toEqual({ station: 'fridge', card: 'pureDairy' });
    feed.prep('oven', 'oakFirewood');
    expect(onRefuse).toHaveBeenLastCalledWith(422, expect.any(String));
    vi.advanceTimersByTime(T.prepS * 1000);
    expect(feed.board().piles.fridge?.cards).toEqual(['pureDairy']);
    feed.dispose();
  });

  it('hands the night and the claims to the night half', () => {
    const onRefuse = vi.fn();
    const feed = new MockOnubFeed({ onRefuse, search: '' });
    const claims = vi.fn();
    feed.bus.on('claims', claims);
    expect(feed.wake()).toBeNull();
    expect(feed.reveals()).toEqual([]);
    feed.act('onub.peekRole', ['seat.1.role']);
    expect(onRefuse).toHaveBeenCalledWith(425, expect.any(String));
    feed.claim({ roleId: 'chef', saw: [{ targetId: 'mock-ada', roleId: 'aboyeur' }] });
    expect(feed.claims()).toEqual([
      {
        from: 'mock-me',
        roleId: 'chef',
        stationId: '',
        cardId: '',
        saw: [{ targetId: 'mock-ada', roleId: 'aboyeur', stationId: '' }],
      },
    ]);
    expect(claims).toHaveBeenCalledOnce();
    feed.dispose();
  });

  it('stops its script on dispose', () => {
    const onDawnEnd = vi.fn();
    const feed = new MockOnubFeed({ onDawnEnd, search: '' });
    feed.start();
    feed.dispose();
    vi.advanceTimersByTime(600_000);
    expect(onDawnEnd).not.toHaveBeenCalled();
  });
});

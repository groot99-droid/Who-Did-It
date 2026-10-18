import onubBalance from '@wdi/content/data/balance.onub.json';
import type { OnubPileView } from '../onub';
import { ONUB_PHASE } from '../onubRouter';
import type { MockOnubContext, MockOnubPrepHalf } from './onubMock';

// Session 5C's half of `MockOnubFeed` (round-5 contract 5.3): Evening Prep and the public board. Pre-seeded as a
// stub on the composer's fixed 5-seat deal: the self seat commits once in dusk, the bots never do, and the piles
// hold the self seat's card only. 5C replaces this file, and adds its test, behind the same `createPrepMock`.

export function createPrepMock(ctx: MockOnubContext): MockOnubPrepHalf {
  let mine: { station: string; card: string } | null = null;
  let piles: Record<string, OnubPileView> = {};
  return {
    prep(stationId, cardId) {
      if (ctx.clock().phase !== ONUB_PHASE.dusk) return ctx.refuse(425, 'not in Evening Prep');
      const station = onubBalance.stations.find((s) => s.id === stationId);
      const cards: string[] = station === undefined ? [] : [...station.good, ...station.sabotage];
      if (mine !== null || !cards.includes(cardId)) return ctx.refuse(422, 'cannot commit that');
      mine = { station: stationId, card: cardId };
    },
    myPrep: () => mine,
    board: () => ({
      seats: ctx.deal.seats.map((s) => s.id),
      deck: [...ctx.deal.deck],
      piles,
      ruinWeight: 0,
      ruined: false,
      perk: false,
      cloche: '',
      window: '',
    }),
    endPrep() {
      // The server's timeout commit, simplified: the first station's first good card.
      const first = onubBalance.stations[0];
      if (mine === null && first !== undefined) mine = { station: first.id, card: first.good[0] ?? '' };
      piles = Object.fromEntries(
        onubBalance.stations.map((s) => [
          s.id,
          { cards: mine?.station === s.id ? [mine.card] : [], lost: 0, net: 0, underMixed: false },
        ]),
      );
    },
    dispose: () => undefined,
  };
}

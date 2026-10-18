import onubBalance from '@wdi/content/data/balance.onub.json';
import { mulberry32 } from '@wdi/shared/rules';
import { handOf } from '../../view/onub/PrepView';
import type { OnubPileView } from '../onub';
import { ONUB_PHASE } from '../onubRouter';
import type { MockOnubContext, MockOnubPrepHalf } from './onubMock';

// Session 5C's half of `MockOnubFeed` (round-5 contract 5.3): Evening Prep and the public board. The self seat
// commits once in dusk; at the end of dusk every bot and, if the self seat has not, the self seat too commit a
// seeded card (the server's `prepTimeout`), and the piles resolve the way GDD 3.11 "The crime scenes" says. The
// resolution here is a local stand-in of `resolvePrep` (5A, not landed): it is mock-only and the real board
// comes from the server.

const MOCK_SEED = 0x5c0ffee;

function shuffled<T>(items: readonly T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

export function createPrepMock(ctx: MockOnubContext): MockOnubPrepHalf {
  const rng = mulberry32(MOCK_SEED);
  let mine: { station: string; card: string } | null = null;
  let piles: Record<string, OnubPileView> = {};
  let ruinWeight = 0;
  let ruined = false;
  let perk = false;

  const commitOf = (seat: string): { station: string; card: string } => {
    const station = onubBalance.stations[Math.floor(rng() * onubBalance.stations.length)];
    const stationId = station?.id ?? '';
    const hand = handOf(stationId, ctx.deal.dealt[seat] ?? '');
    return { station: stationId, card: hand[Math.floor(rng() * hand.length)] ?? '' };
  };

  return {
    prep(stationId, cardId) {
      if (ctx.clock().phase !== ONUB_PHASE.dusk) return ctx.refuse(425, 'not in Evening Prep');
      const hand = handOf(stationId, ctx.deal.dealt[ctx.selfId] ?? '');
      if (mine !== null || !hand.includes(cardId)) return ctx.refuse(422, 'cannot commit that');
      mine = { station: stationId, card: cardId };
    },
    myPrep: () => mine,
    board: () => ({
      seats: ctx.deal.seats.map((s) => s.id),
      deck: [...ctx.deal.deck],
      piles,
      ruinWeight,
      ruined,
      perk,
      cloche: '',
      window: '',
    }),
    endPrep() {
      mine ??= commitOf(ctx.selfId);
      const commits = ctx.deal.seats.map((s) => (s.id === ctx.selfId ? mine : commitOf(s.id)));
      let flags = 0;
      let net = 0;
      piles = {};
      for (const station of onubBalance.stations) {
        let cards = shuffled(
          commits
            .filter((c) => c?.station === station.id)
            .map((c) => c?.card ?? '')
            .sort(),
          rng,
        );
        const visitors = cards.length;
        let lost = 0;
        for (const card of [...cards]) {
          if (onubBalance.cards[card as keyof typeof onubBalance.cards]?.effect !== 'discardRandomOther')
            continue;
          if (!cards.includes(card) || cards.length < 2) continue;
          const others = cards.filter((c) => c !== card);
          const gone = others[Math.floor(rng() * others.length)];
          cards = cards.filter((c) => c !== gone);
          lost += 1;
        }
        const kind = (c: string) => onubBalance.cards[c as keyof typeof onubBalance.cards]?.kind;
        const bad = cards.filter((c) => kind(c) === 'sabotage').length;
        const good = cards.length - bad;
        const stationNet = Math.max(0, bad * station.weight - good * onubBalance.ruin.goodCancels);
        const underMixed =
          station.underMixBelow !== undefined && cards.length > 0 && cards.length < station.underMixBelow;
        net += stationNet;
        if (underMixed) flags += station.underMixWeight ?? 0;
        if (station.perk !== undefined && visitors > 0 && bad === 0) perk = true;
        piles[station.id] = { cards, lost, net: stationNet, underMixed };
      }
      ruinWeight = net + flags;
      const need =
        onubBalance.ruin.weightByCount[
          String(ctx.deal.seats.length) as keyof typeof onubBalance.ruin.weightByCount
        ] ?? onubBalance.ruin.weight;
      ruined = ruinWeight >= need;
      // The proofing visitor sees one Pantry Location card (the real one arrives as a private `nightReveal`).
      if (perk && mine.station === 'proofing') {
        const station = onubBalance.stations[Math.floor(rng() * onubBalance.stations.length)];
        ctx.bus.emit('nightReveal', {
          entries: [{ slot: 'pantry.loc.0', kind: 'loc', value: station?.id ?? 'fridge', of: '' }],
        });
      }
    },
    dispose: () => undefined,
  };
}

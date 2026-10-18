import onubBalance from '@wdi/content/data/balance.onub.json';
import type { OnubClaimView } from '../onub';
import type { MockOnubContext, MockOnubNightHalf } from './onubMock';

// Session 5D's half of `MockOnubFeed` (round-5 contract 5.3): the night windows, what a seat learns and the
// Morning Rush claims. Pre-seeded as a stub on the composer's fixed 5-seat deal: the self seat never wakes (it
// sees lights-out all night), learns nothing, and only its own claim is kept. 5D replaces this file, and adds
// its test, behind the same `createNightMock`.

export function createNightMock(ctx: MockOnubContext): MockOnubNightHalf {
  const claims = new Map<string, OnubClaimView>();
  return {
    act: () => ctx.refuse(425, 'not your window'),
    wake: () => null,
    reveals: () => [],
    claims: () => [...claims.values()],
    claim(c) {
      claims.set(ctx.selfId, {
        from: ctx.selfId,
        roleId: c.roleId,
        stationId: c.stationId ?? '',
        cardId: c.cardId ?? '',
        saw: (c.saw ?? []).map((s) => ({
          targetId: s.targetId,
          roleId: s.roleId ?? '',
          stationId: s.stationId ?? '',
        })),
      });
      ctx.bus.emit('claims', [...claims.values()]);
    },
    // The nominal night: every window of a role in the deck, each with its fade.
    beginNight: () =>
      onubBalance.windows
        .filter((w) => ctx.deal.deck.includes(w.role))
        .reduce((s, w) => s + w.seconds + onubBalance.timers.fadeS, 0),
    cloche: () => '',
    window: () => '',
    dispose: () => undefined,
  };
}

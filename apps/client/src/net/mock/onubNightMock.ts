import onubBalance from '@wdi/content/data/balance.onub.json';
import type { NightRevealEntry, OnubLegalAct, OnubWakeView, S2CPayloads } from '@wdi/shared/protocol';
import { pantrySlot, seatSlot } from '../../ui/onub/slots';
import type { OnubClaimView } from '../onub';
import { ONUB_PHASE } from '../onubRouter';
import type { MockOnubContext, MockOnubNightHalf } from './onubMock';

// Session 5D's half of `MockOnubFeed` (round-5 contract 5.3): the night windows, what a seat learns and the
// Morning Rush claims, on the composer's fixed 5-seat deal. The windows of the deck run in order with their
// fades and no jitter; the self seat wakes in the window of its dealt role. The bots never act.

type Window = (typeof onubBalance.windows)[number];
type Act = (typeof onubBalance.acts)[keyof typeof onubBalance.acts];

/** The Pantry Location cards of the mock deal (stations, repeats allowed). */
const PANTRY_LOCS = ['fridge', 'mixer', 'oven'] as const;

export function createNightMock(ctx: MockOnubContext): MockOnubNightHalf {
  const claims = new Map<string, OnubClaimView>();
  const selfIndex = Math.max(
    0,
    ctx.deal.seats.findIndex((s) => s.id === ctx.selfId),
  );
  let open = '';
  let wake: S2CPayloads['nightWake'] | null = null;
  let reveals: NightRevealEntry[] = [];
  const cloche = '';

  const pantryRoles = ctx.deal.pantryRoles;

  /** The slots an act's target kinds allow for the self seat (cloche slot removed). */
  const poolOf = (act: Act): string[] => {
    const out: string[] = [];
    const seats = ctx.deal.seats.map((_, i) => i);
    for (const kind of act.targets) {
      if (kind === 'anySeatCard') for (const i of seats) out.push(seatSlot(i, 'role'), seatSlot(i, 'loc'));
      if (kind === 'anySeatRole') for (const i of seats) out.push(seatSlot(i, 'role'));
      if (kind === 'otherSeatRole') for (const i of seats) if (i !== selfIndex) out.push(seatSlot(i, 'role'));
      if (kind === 'otherSeatLoc') for (const i of seats) if (i !== selfIndex) out.push(seatSlot(i, 'loc'));
      if (kind === 'pantryRole') pantryRoles.forEach((_, k) => out.push(pantrySlot(k, 'role')));
      if (kind === 'pantryLoc') PANTRY_LOCS.forEach((_, k) => out.push(pantrySlot(k, 'loc')));
    }
    return out.filter((s) => s !== cloche);
  };

  const legalOf = (w: Window, alone: boolean): OnubLegalAct[] =>
    w.acts
      .filter(() => !w.onlyIfAlone || alone)
      .map((id) => {
        const act = onubBalance.acts[id as keyof typeof onubBalance.acts] as Act;
        return { act: id, picks: act.picks, slots: poolOf(act) };
      });

  const viewOf = (w: Window): OnubWakeView => {
    const others = ctx.deal.seats.filter((s) => s.id !== ctx.selfId);
    const mates = w.seeEachOther
      ? others.filter((s) => ctx.deal.dealt[s.id] === w.role).map((s) => s.id)
      : [];
    const seen = others
      .filter((s) => (w.sees as string[]).includes(ctx.deal.dealt[s.id] ?? ''))
      .map((s) => ({ seat: s.id, roleId: ctx.deal.dealt[s.id] ?? '' }));
    const alone = w.seeEachOther && mates.length === 0;
    return { mates, seen, alone, cloche, legal: legalOf(w, alone), must: w.onTimeout === 'seededPick' };
  };

  const openWindow = (w: Window) => {
    open = w.role;
    ctx.boardChanged();
    if (ctx.deal.dealt[ctx.selfId] !== w.role) return;
    const view = viewOf(w);
    wake = { windowRole: w.role, endsTick: ctx.clock().tick + ctx.ticks(w.seconds), view };
    const rows: NightRevealEntry[] = [...view.mates, ...view.seen.map((s) => s.seat)].map((id) => ({
      slot: `seat.${ctx.deal.seats.findIndex((s) => s.id === id)}`,
      kind: 'mate',
      value: ctx.deal.dealt[id] ?? '',
      of: id,
    }));
    ctx.bus.emit('nightWake', wake);
    if (rows.length > 0) {
      reveals = [...reveals, ...rows];
      ctx.bus.emit('nightReveal', { entries: rows });
    }
  };

  const closeWindow = () => {
    open = '';
    ctx.boardChanged();
    if (wake !== null) {
      wake = null;
      ctx.bus.emit('nightSleep', {});
    }
  };

  return {
    act: () => ctx.refuse(425, 'not your window'),
    wake: () => wake,
    reveals: () => reveals,
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
    // The nominal night: every window of a role in the deck, each with its fade; the half schedules them.
    beginNight() {
      reveals = [];
      let t = 0;
      for (const w of onubBalance.windows.filter((x) => ctx.deal.deck.includes(x.role))) {
        ctx.later(() => openWindow(w), t);
        ctx.later(closeWindow, t + w.seconds);
        t += w.seconds + onubBalance.timers.fadeS;
      }
      return t;
    },
    cloche: () => (ctx.clock().phase === ONUB_PHASE.dawn ? cloche : ''),
    window: () => open,
    dispose: () => undefined,
  };
}

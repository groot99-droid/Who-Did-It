import onubBalance from '@wdi/content/data/balance.onub.json';
import onubRoles from '@wdi/content/data/roles.onub.json';
import { TICK_RATE } from '@wdi/shared/constants';
import type { VoteResult } from '../../net/meeting';
import type { OnubClaimView } from '../../net/onub';
import { fill } from '../copy';
import { ONUB_NIGHT_COPY as C } from '../copy/onubNight';

// The pure parts of the Morning Rush, CRUST and the Final Bake (GDD 3.11): claim lines, the countdown step and
// the reveal lines. The DOM in `rush.ts` only places what these return.

export const PANTRY = 'pantry';

const ROLE_NAME = Object.fromEntries(Object.entries(onubRoles.roles).map(([id, r]) => [id, r.name]));
const STATION_NAME = Object.fromEntries(onubBalance.stations.map((s) => [s.id, s.name]));
const CARD_NAME = Object.fromEntries(Object.entries(onubBalance.cards).map(([id, c]) => [id, c.name]));

export const roleName = (id: string) => ROLE_NAME[id] ?? id;
export const stationName = (id: string) => STATION_NAME[id] ?? id;
export const cardName = (id: string) => CARD_NAME[id] ?? id;

/** The deck's distinct roles in `roles.onub.json` order: the claim form offers these and no others. */
export function claimableRoles(deck: readonly string[]): string[] {
  return Object.keys(onubRoles.roles).filter((id) => deck.includes(id));
}

type NameOf = (seatId: string) => string;

/** "Hana says: dealt Le Chef, worked at La Chambre Froide, played Pure Dairy, saw Bo's Location card was Le Pétrin." */
export function claimLine(claim: OnubClaimView, nameOf: NameOf): string {
  const parts = [fill(C['onub.claim.part.role'], { role: roleName(claim.roleId) })];
  if (claim.stationId !== '')
    parts.push(fill(C['onub.claim.part.station'], { station: stationName(claim.stationId) }));
  if (claim.cardId !== '') parts.push(fill(C['onub.claim.part.card'], { card: cardName(claim.cardId) }));
  const saw = claim.saw.map((s) => {
    if (s.targetId === PANTRY)
      return s.roleId !== ''
        ? fill(C['onub.claim.saw.pantryRole'], { role: roleName(s.roleId) })
        : fill(C['onub.claim.saw.pantryStation'], { station: stationName(s.stationId) });
    return s.roleId !== ''
      ? fill(C['onub.claim.saw.seatRole'], { name: nameOf(s.targetId), role: roleName(s.roleId) })
      : fill(C['onub.claim.saw.seatStation'], {
          name: nameOf(s.targetId),
          station: stationName(s.stationId),
        });
  });
  if (saw.length > 0) parts.push(fill(C['onub.claim.part.saw'], { sightings: saw.join(' and ') }));
  return fill(C['onub.claim.line'], { name: nameOf(claim.from), parts: parts.join(', ') });
}

/** The CRUST countdown step (0 to 3) for the seconds into CRUST, or null once it is over. */
export function crustStep(elapsedS: number): 0 | 1 | 2 | 3 | null {
  const total = onubBalance.timers.crustCountdownS;
  if (elapsedS < 0 || elapsedS >= total) return null;
  return Math.min(3, Math.floor((elapsedS / total) * 4)) as 0 | 1 | 2 | 3;
}

const CRUST_COPY = [
  C['onub.vote.count1'],
  C['onub.vote.count2'],
  C['onub.vote.count3'],
  C['onub.vote.crust'],
] as const;

/** The countdown line, or '' outside the countdown. `ticksLeft` is CRUST's remaining ticks. */
export function crustLine(ticksLeft: number): string {
  const elapsed = onubBalance.timers.voteS - ticksLeft / TICK_RATE;
  const step = crustStep(elapsed);
  return step === null ? '' : CRUST_COPY[step];
}

export interface OutLines {
  outs: string[];
  hop: string;
  pantry: string;
  abstained: string;
}

/** The Final Bake's lines (each '' when it does not apply): who goes in with what they held, the drag, the Pantry. */
export function outLines(result: VoteResult, nameOf: NameOf): OutLines {
  const outs = result.outs ?? [];
  return {
    outs:
      outs.length === 0
        ? [C['onub.out.none']]
        : outs.map((id) =>
            fill(C['onub.out.line'], { name: nameOf(id), role: roleName(result.roles?.[id] ?? '') }),
          ),
    hop:
      result.hop === undefined || result.hop === ''
        ? ''
        : fill(C['onub.out.hop'], { name: nameOf(result.hop) }),
    pantry: result.pantryOut === true ? C['onub.out.pantry'] : '',
    abstained:
      result.abstained === undefined || result.abstained.length === 0
        ? ''
        : fill(C['onub.out.abstained'], { names: result.abstained.map(nameOf).join(', ') }),
  };
}

import onubBalance from '@wdi/content/data/balance.onub.json';
import onubRoles from '@wdi/content/data/roles.onub.json';
import bakery from '@wdi/content/data/scenes/bakery.json';
import { TILE_PX } from '@wdi/shared/constants';
import type { NightRevealEntry } from '@wdi/shared/protocol';
import { WORLD_COPY as C, fill } from '../ui/copy';
import type { PropSnap } from '../net/world';

// The pure half of the quick-mode bakery (GDD 3.11, A39): which act a window offers where, and how a reveal
// reads. Every number comes from balance.onub.json; the scene only draws and sends.

export type ActTarget = 'deadLoaf' | 'ledger' | 'otherPlate' | 'ownPlate';

export interface WindowAct {
  act: string;
  picks: number;
  target: ActTarget;
  holdS: number;
}

/** A bakery prop with its pixel centre; `of` is a plate's owner (empty for everything else). */
export interface Spot {
  id: string;
  kind: string;
  x: number;
  y: number;
  of: string;
}

export interface ActChoice {
  act: WindowAct;
  prop: Spot;
  /** True when this is the second pick of a `picks: 2` act. */
  second: boolean;
}

const ACTS = onubBalance.acts as unknown as Record<string, { target: ActTarget; holdS: number }>;
const ROLES = onubRoles.roles as unknown as Record<string, { name: string }>;

export const ACT_RANGE_PX = onubBalance.actRangeTiles * TILE_PX;
export const PLATE_HOLD_MS = onubBalance.timers.plateHoldS * 1000;

export const roleName = (id: string): string => ROLES[id]?.name ?? id;

export function windowFor(role: string) {
  return onubBalance.windows.find((w) => w.role === role);
}

/** The acts a window offers, with their target kind and hold from `acts[id]`. */
export function windowActs(role: string): WindowAct[] {
  return (windowFor(role)?.acts ?? []).flatMap((a) => {
    const def = ACTS[a.act];
    return def ? [{ act: a.act, picks: a.picks, target: def.target, holdS: def.holdS }] : [];
  });
}

/** The bakery's props at their pixel centres; a plate is listed only for the seats the server seated. */
export function bakerySpots(listed: PropSnap[]): Spot[] {
  const by = new Map(listed.map((p) => [p.id, p]));
  return bakery.props.flatMap((p) => {
    const l = by.get(p.id);
    if (p.kind === 'plate' && !l) return [];
    return [
      {
        id: p.id,
        kind: p.kind,
        x: (p.x + 0.5) * TILE_PX,
        y: (p.y + 0.5) * TILE_PX,
        of: l?.of ?? '',
      },
    ];
  });
}

export const legalTarget = (target: ActTarget, spot: Spot, selfId: string): boolean => {
  switch (target) {
    case 'deadLoaf':
      return spot.kind === 'deadLoaf';
    case 'ledger':
      return spot.kind === 'ledger';
    case 'otherPlate':
      return spot.kind === 'plate' && spot.of !== '' && spot.of !== selfId;
    case 'ownPlate':
      return spot.kind === 'plate' && spot.of === selfId;
  }
};

export interface PickOptions {
  /** The window's role id (`nightWake.windowRole`). */
  role: string;
  spots: Spot[];
  selfId: string;
  self: { x: number; y: number };
  /** The first pick of a `picks: 2` act, held in scene state. */
  first: { act: string; targetId: string } | null;
  /** False while a partner is in view: a "lone Poisoner" act (`onlyIfAlone`) is not offered. */
  alone: boolean;
}

/** The nearest act-and-prop in reach for this window, or null. Ties keep the earlier act, then the earlier prop. */
export function pickAct(o: PickOptions): ActChoice | null {
  const win = windowFor(o.role);
  if (!win || (win.onlyIfAlone && !o.alone)) return null;
  const acts = windowActs(o.role).filter((a) => o.first === null || a.act === o.first.act);
  let best: ActChoice | null = null;
  let bestD = ACT_RANGE_PX;
  for (const act of acts) {
    for (const spot of o.spots) {
      if (spot.id === o.first?.targetId || !legalTarget(act.target, spot, o.selfId)) continue;
      const d = Math.hypot(o.self.x - spot.x, o.self.y - spot.y);
      if (d <= bestD && (best === null || d < bestD - 1)) {
        bestD = d;
        best = { act, prop: spot, second: o.first !== null };
      }
    }
  }
  return best;
}

/** The prompt line of a choice: the act's line, or "pick the second" once the first pick is held. */
export function promptFor(choice: ActChoice): string {
  if (choice.second) return C['quick.pick.second'];
  return (C as Record<string, string>)[`prompt.act.${choice.act.act}`] ?? choice.act.act;
}

/** "<seat name>: <role name>" when `of` is set, the role name alone for a dead loaf (UI copy `quick.reveal.*`). */
export function revealLine(entry: NightRevealEntry, nameOf: (seatId: string) => string): string {
  const role = roleName(entry.roleId);
  return entry.of === ''
    ? fill(C['quick.reveal.dead'], { role })
    : fill(C['quick.reveal.plate'], { name: nameOf(entry.of), role });
}

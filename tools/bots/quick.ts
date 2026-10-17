// Quick-mode (GDD 3.11) choices of the bot brain, pure over the bakery's props so they can be tested without a
// server: which prop is my plate, which act a window allows and on what, and what to claim. The numbers come
// from `balance.onub.json` through @wdi/content; nothing here restates one.
import { onubBalance, scenes } from '@wdi/content';
import { TILE_PX } from '@wdi/shared';

/** A bakery prop as the bot receives it in `SceneState.props`. */
export interface PropLike {
  id: string;
  kind: string;
  /** The plate owner's seat id; empty for every other prop. */
  of: string;
}

export interface NightPlan {
  abilityId: string;
  targetId: string;
  targetId2?: string;
  holdS: number;
}

/** Centre of a bakery prop in world pixels, from the frozen scene content. */
export function propPx(propId: string): { x: number; y: number } | undefined {
  const p = scenes.bakery.props.find((q) => q.id === propId);
  return p ? { x: (p.x + 0.5) * TILE_PX, y: (p.y + 0.5) * TILE_PX } : undefined;
}

/** The plate whose owner is `selfId`, or undefined before dusk seeds the props. */
export function ownPlate(props: readonly PropLike[], selfId: string): PropLike | undefined {
  return props.find((p) => p.kind === 'plate' && p.of === selfId);
}

function candidates(target: string, props: readonly PropLike[], selfId: string): PropLike[] {
  switch (target) {
    case 'deadLoaf':
      return props.filter((p) => p.kind === 'deadLoaf');
    case 'ledger':
      return props.filter((p) => p.kind === 'ledger');
    case 'ownPlate':
      return props.filter((p) => p.kind === 'plate' && p.of === selfId);
    case 'otherPlate':
      return props.filter((p) => p.kind === 'plate' && p.of !== '' && p.of !== selfId);
    default:
      return [];
  }
}

const dist = (a: PropLike, b: PropLike): number => {
  const pa = propPx(a.id);
  const pb = propPx(b.id);
  return pa && pb ? Math.hypot(pa.x - pb.x, pa.y - pb.y) : Infinity;
};

/**
 * A legal act for a woken `role`: one of the window's alternative acts, a target of the kind the act takes
 * (never the bot's own plate for `otherPlate`) and, for `picks: 2`, a second distinct one chosen as near the
 * first as the prop layout allows so one standing spot reaches both. Null when the window has no act, or
 * `onlyIfAlone` and the bot has teammates. `mates` is the number of other seats holding the dealt role.
 */
export function planNightAct(
  role: string,
  selfId: string,
  props: readonly PropLike[],
  rng: () => number,
  mates = 0,
): NightPlan | null {
  const window = onubBalance.windows.find((w) => w.role === role);
  if (!window || window.acts.length === 0) return null;
  if (window.onlyIfAlone && mates > 0) return null;
  const options = window.acts.filter((a) => {
    const def = onubBalance.acts[a.act];
    return def !== undefined && candidates(def.target, props, selfId).length >= a.picks;
  });
  const pick = options[Math.floor(rng() * options.length)];
  if (!pick) return null;
  const def = onubBalance.acts[pick.act];
  if (!def) return null;
  const pool = candidates(def.target, props, selfId);
  const first = pool[Math.floor(rng() * pool.length)];
  if (!first) return null;
  const plan: NightPlan = { abilityId: pick.act, targetId: first.id, holdS: def.holdS };
  if (pick.picks === 2) {
    const second = pool.filter((p) => p.id !== first.id).sort((a, b) => dist(first, a) - dist(first, b))[0];
    if (!second) return null;
    plan.targetId2 = second.id;
  }
  return plan;
}

/** Where to stand for a plan: the centre of its targets. */
export function standingSpot(plan: NightPlan): { x: number; y: number } | undefined {
  const a = propPx(plan.targetId);
  const b = plan.targetId2 ? propPx(plan.targetId2) : a;
  return a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : undefined;
}

/** `meeting.claim` payload: the dealt role, with what the last reveal showed when it named a seat. */
export function claimPayload(
  roleId: string,
  lastReveal?: { of: string; roleId: string },
): { roleId: string; targetId?: string; sawRoleId?: string } {
  return lastReveal && lastReveal.of !== ''
    ? { roleId, targetId: lastReveal.of, sawRoleId: lastReveal.roleId }
    : { roleId };
}

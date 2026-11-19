// Pure input maths, kept apart from the DOM so it is unit-tested.
import { keysToWorld, stickToWorld } from '@wdi/shared/iso';

/** Keyboard state to a movement vector in screen space (x right, y down); diagonals are not shortened. */
export function keyVector(pressed: ReadonlySet<string>): { dx: number; dy: number } {
  const has = (...codes: string[]) => codes.some((c) => pressed.has(c));
  const dx = (has('KeyD', 'ArrowRight') ? 1 : 0) - (has('KeyA', 'ArrowLeft') ? 1 : 0);
  const dy = (has('KeyS', 'ArrowDown') ? 1 : 0) - (has('KeyW', 'ArrowUp') ? 1 : 0);
  return { dx, dy };
}

/** Touch stick: pointer offset from the stick centre to a vector with a dead zone, length clamped to 1. */
export function stickVector(
  ox: number,
  oy: number,
  radius: number,
  deadZone = 0.2,
): { dx: number; dy: number } {
  const len = Math.hypot(ox, oy);
  const amount = Math.min(1, len / radius);
  if (amount < deadZone || len === 0) return { dx: 0, dy: 0 };
  return { dx: (ox / len) * amount, dy: (oy / len) * amount };
}

/**
 * A world vector turned by `quarterTurns` quarter turns of the camera heading (round 11, R2): each turn maps (x, y) to
 * (y, -x), the turn the sprite world's camera makes per heading step. `+ 0` keeps a zero from becoming -0.
 */
export function turnByHeading(v: { x: number; y: number }, quarterTurns: number): { x: number; y: number } {
  let { x, y } = v;
  for (let i = 0; i < ((quarterTurns % 4) + 4) % 4; i++) [x, y] = [y + 0, -x + 0];
  return { x, y };
}

/**
 * The key and stick vectors, both in screen axes, as one world-frame move (SPRITES 10.8): keys through
 * `keysToWorld`, the stick through its exact inverse projection, then summed and turned by the camera `heading`
 * (0 to 3; always 0 off the sprite world). The server normalises the length and sees world frame, as before.
 */
export function worldMove(
  key: { dx: number; dy: number },
  stick: { dx: number; dy: number },
  heading = 0,
): { dx: number; dy: number } {
  const k = keysToWorld(key.dx, key.dy);
  const s = stickToWorld(stick.dx, stick.dy);
  const w = turnByHeading({ x: k.x + s.x, y: k.y + s.y }, heading);
  return { dx: w.x, dy: w.y };
}

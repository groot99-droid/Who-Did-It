// Pure input maths, kept apart from the DOM so it is unit-tested.

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

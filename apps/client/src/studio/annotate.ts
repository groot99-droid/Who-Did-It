// Round 9 (9T): the pen of the report tool, as plain geometry so it is tested. Points are canvas px.
export interface Pt {
  x: number;
  y: number;
}
export type Tool = 'arrow' | 'circle';
export interface Mark {
  tool: Tool;
  from: Pt;
  to: Pt;
}

/** The two barbs of an arrow that ends at `to`, `len` px long, spread 25 degrees either side of the shaft. */
export function arrowBarbs(from: Pt, to: Pt, len = 14): [Pt, Pt] {
  const a = Math.atan2(to.y - from.y, to.x - from.x);
  const barb = (d: number): Pt => ({
    x: to.x - len * Math.cos(a + d),
    y: to.y - len * Math.sin(a + d),
  });
  const spread = (25 * Math.PI) / 180;
  return [barb(spread), barb(-spread)];
}

/** A circle marks the area dragged out from its centre `from` to the edge `to`. */
export const circleOf = (from: Pt, to: Pt): { c: Pt; r: number } => ({
  c: from,
  r: Math.hypot(to.x - from.x, to.y - from.y),
});

/** Draws the marks over the screenshot. */
export function paint(ctx: CanvasRenderingContext2D, marks: readonly Mark[]): void {
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#ff3b30';
  for (const m of marks) {
    ctx.beginPath();
    if (m.tool === 'circle') {
      const { c, r } = circleOf(m.from, m.to);
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    } else {
      const [l, r] = arrowBarbs(m.from, m.to);
      ctx.moveTo(m.from.x, m.from.y);
      ctx.lineTo(m.to.x, m.to.y);
      ctx.moveTo(l.x, l.y);
      ctx.lineTo(m.to.x, m.to.y);
      ctx.lineTo(r.x, r.y);
    }
    ctx.stroke();
  }
}

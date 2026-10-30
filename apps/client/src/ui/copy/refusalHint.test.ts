import { describe, expect, it } from 'vitest';
import interactions from '@wdi/content/data/interactions.json';
import { HINT_WINDOW_MS, RefusalHints, hintFor } from './refusalHint';

// UI.md 14.51 (10Y, round 10; failures.md 6.2, FM5): the second identical NEED_* refusal within 30 s carries the
// table's hint; the first, a different one, a late one, and one the table has no hint for carry nothing.

const CHOP = interactions.interactions.chopLumber.hint;
const BOULDER = interactions.interactions.breakBoulder.hint;
const axe = { reason: 'NEED_TOOL', args: { need: 'axe' }, interaction: 'chopLumber' };

describe('hintFor', () => {
  it("reads the interaction's own hint, else one for the missing tool, else nothing", () => {
    expect(hintFor(axe)).toBe(CHOP);
    expect(hintFor({ reason: 'NEED_TOOL', args: { need: 'pickaxe' } })).toBe(BOULDER); // `break`: the boulder's
    expect(hintFor({ reason: 'NEED_TOOL', args: { need: 'spade' } })).toBeNull(); // no interaction digs yet
    expect(hintFor({ reason: 'NEED_TOOL', args: { need: 'axe' }, interaction: 'grubStump' })).toBe(CHOP);
    expect(hintFor({ reason: 'NEED_ITEM', args: { need: 'rope' } })).toBeNull();
  });
});

describe('RefusalHints', () => {
  it('hints on the second identical NEED_* within the window, not on the first', () => {
    const h = new RefusalHints();
    expect(h.take(axe, 1000)).toBeNull();
    expect(h.take(axe, 1000 + HINT_WINDOW_MS)).toBe(CHOP);
    expect(h.take(axe, 2000 + HINT_WINDOW_MS)).toBe(CHOP); // a third quick one keeps hinting
  });

  it('forgets after the window, and another refusal in between does not break the pair', () => {
    const h = new RefusalHints();
    expect(h.take(axe, 0)).toBeNull();
    expect(h.take({ reason: 'TOO_FAR', args: { of: 'pile' } }, 100)).toBeNull();
    expect(
      h.take({ reason: 'NEED_TOOL', args: { need: 'pickaxe' }, interaction: 'breakBoulder' }, 200),
    ).toBeNull();
    expect(h.take(axe, 300)).toBe(CHOP);
    expect(h.take(axe, 300 + HINT_WINDOW_MS + 1)).toBeNull(); // too late: it starts over
  });

  it('tells refusals apart by reason, interaction and the missing item', () => {
    const h = new RefusalHints();
    h.take(axe, 0);
    expect(h.take({ ...axe, args: { need: 'crowbar' } }, 10)).toBeNull();
    expect(h.take({ ...axe, interaction: 'cutTimberSet' }, 20)).toBeNull();
    expect(h.take({ ...axe, reason: 'NEED_ITEM' }, 30)).toBeNull();
    expect(h.take(axe, 40)).toBe(CHOP);
  });

  it('never hints a reason outside NEED_*, nor a repeat the table has no hint for', () => {
    const h = new RefusalHints();
    const far = { reason: 'TOO_FAR', args: { of: 'pile' as const }, interaction: 'chopLumber' };
    expect([h.take(far, 0), h.take(far, 1)]).toEqual([null, null]);
    const crate = { reason: 'NEED_TOOL', args: { need: 'crowbar' }, interaction: 'pryCrate' };
    expect([h.take(crate, 0), h.take(crate, 1)]).toEqual([null, null]);
  });
});

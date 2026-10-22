import { cutscenes } from '@wdi/content';
import { describe, expect, it } from 'vitest';
import { CUTSCENE_COPY, cutsceneLine } from './cutscenes';

describe('cutscene copy (UI.md 14.20)', () => {
  const ids = Object.values(cutscenes.cutscenes).flatMap((c) =>
    c.steps.flatMap((s) => (s.t === 'caption' ? [s.copyId] : [])),
  );

  it('carries a line for every caption a cutscene names', () => {
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(cutsceneLine(id), id).not.toBeNull();
  });

  it('keeps every caption to 90 characters', () => {
    for (const id of ids) expect(cutsceneLine(id)!.length, id).toBeLessThanOrEqual(90);
  });

  it('has no line that no cutscene uses', () => {
    const used = new Set(ids);
    for (const key of Object.keys(CUTSCENE_COPY))
      if (key.startsWith('cs.')) expect(used.has(key), key).toBe(true);
  });

  it('answers null for an unknown id, including an inherited one', () => {
    expect(cutsceneLine('cs.nowhere')).toBeNull();
    expect(cutsceneLine('toString')).toBeNull();
  });
});

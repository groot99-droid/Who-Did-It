import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cutscenes } from '../src/index.js';

const manifest = JSON.parse(
  readFileSync(new URL('../../../apps/client/public/assets/video/manifest.json', import.meta.url), 'utf8'),
) as { entries: Array<{ key: string; durationS: number }> };

describe("the Vicar's memorial cutscene (GDD 3.20)", () => {
  const cs = cutscenes.cutscenes.memorialVicar;

  it('is a skippable memorial that plays memorial_vicar, a key of the video manifest', () => {
    expect(cs).toMatchObject({ kind: 'memorial', skippable: true });
    const videos = cs!.steps.filter((s) => s.t === 'video');
    expect(videos).toEqual([{ t: 'video', key: 'memorial_vicar' }]);
    const entry = manifest.entries.find((e) => e.key === 'memorial_vicar');
    expect(entry).toBeDefined();
    expect(cs!.maxS).toBeGreaterThanOrEqual(entry!.durationS);
  });

  it('names its captions in the cs.memorial block', () => {
    const ids = cs!.steps.flatMap((s) => (s.t === 'caption' ? [s.copyId] : []));
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(id).toMatch(/^cs\.memorial\./);
  });
});

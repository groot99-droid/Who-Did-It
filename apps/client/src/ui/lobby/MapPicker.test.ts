import { describe, expect, it } from 'vitest';
import { MAP_IDS, maps } from '@wdi/content';
import { MAP_ROWS, chosenMap, mapsForMode } from './MapPicker';

describe('map row (GDD 3.13)', () => {
  it('lists the map files in MAP_IDS order', () => {
    expect(MAP_ROWS.map((m) => m.id)).toEqual([...MAP_IDS]);
    for (const m of MAP_ROWS) expect(m).toMatchObject({ name: maps[m.id as keyof typeof maps].name });
  });

  it('offers every map in the main mode and none in the quick mode', () => {
    expect(mapsForMode('main').map((m) => m.id)).toEqual(['hollowmere', 'blackpine']);
    expect(mapsForMode('onub')).toEqual([]);
  });

  it('shows the pick, or the first offered map when the pick is not offered', () => {
    const rows = mapsForMode('main');
    expect(chosenMap(rows, 'blackpine')?.id).toBe('blackpine');
    expect(chosenMap(rows, 'atlantis')?.id).toBe('hollowmere');
    expect(chosenMap([], 'hollowmere')).toBeUndefined();
  });

  it('has a name, a blurb and a thumbnail id for every card (the mockup shows all three)', () => {
    for (const m of MAP_ROWS) {
      expect(m.name.length).toBeGreaterThan(0);
      expect(m.blurb.length).toBeGreaterThan(0);
      expect(m.thumbnail.length).toBeGreaterThan(0);
    }
  });
});

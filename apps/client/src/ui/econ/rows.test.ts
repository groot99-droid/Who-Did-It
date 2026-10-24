import economy from '@wdi/content/data/economy.json';
import { NoteKind, Phase, TILE_PX } from '@wdi/shared';
import { describe, expect, it } from 'vitest';
import type { NotebookSnap } from '../../net/world';
import { CIVIC_COPY, stationName } from '../copy/civic';
import { canAfford, civicSpots, hqOffer, noticeRows } from './rows';

describe('civicSpots', () => {
  it('finds the altar, the mailbag, a rack, the back room, a station and a bank, and skips the rest', () => {
    const props = [
      { id: economy.faith.altars[0]!, kind: 'altar', x: 1, y: 2 },
      { id: economy.notices.mailbags[0]!, kind: 'mailbag', x: 2, y: 2 },
      { id: economy.quota.racks[0]!, kind: 'rack', x: 3, y: 2 },
      { id: economy.notices.blackMarkets[0]!, kind: 'blackMarket', x: 4, y: 2 },
      { id: economy.hq.stations.chapel.props.hollowmere, kind: 'hq', x: 5, y: 2 },
      { id: 'mh.bank_counter', kind: 'bank', x: 6, y: 2 },
      { id: 'xx.chair', kind: 'dressing', x: 7, y: 2 },
    ];
    const spots = civicSpots(props, economy);
    expect(spots.map((s) => s.kind)).toEqual(['altar', 'mailbag', 'rack', 'market', 'hq', 'bank']);
    expect(spots[4]).toMatchObject({ stationId: 'chapel', x: 5.5 * TILE_PX, y: 2.5 * TILE_PX });
  });
});

describe('noticeRows', () => {
  const entry = (id: string, note: number, of: string, value: number): NotebookSnap => ({
    id,
    clueKind: 0,
    value,
    sceneId: 3,
    tick: 1,
    status: 0,
    note,
    of,
  });
  it('lists only the notices, by look, place and part of day', () => {
    const rows = noticeRows(
      [
        entry('a', NoteKind.notice, 'baker', Phase.night),
        entry('b', 0, '', 0),
        entry('c', NoteKind.notice, '', Phase.day),
      ],
      () => 'the Cellar',
    );
    expect(rows.map((r) => r.id)).toEqual(['a', 'c']);
    expect(rows[0]!.line).toMatch(/look, in the Cellar, at night\.$/);
    expect(rows[1]!.line).toBe("A figure in a stranger's look, in the Cellar, by day.");
  });
});

describe('the altar and the HQ offers', () => {
  it('needs both the Faith and the Scrip', () => {
    expect(canAfford({ faith: 5, scrip: 3 }, 5, 3)).toBe(true);
    expect(canAfford({ faith: 5, scrip: 3 }, 4, 9)).toBe(false);
    expect(canAfford({ faith: 5, scrip: 3 }, 9, 2)).toBe(false);
  });

  it('lets only the station look build, with the Scrip and the materials in its pockets', () => {
    const station = { look: 'vicar', tiers: [{ scrip: 10, materials: [{ item: 'candle', qty: 2 }] }] };
    const pockets = [{ defId: 'candle', qty: 2 }];
    expect(hqOffer(station, 0, 'vicar', 10, pockets)).toMatchObject({ tier: 0, mine: true, can: true });
    expect(hqOffer(station, 0, 'baker', 10, pockets)).toMatchObject({ mine: false, can: false });
    expect(hqOffer(station, 0, 'vicar', 9, pockets).can).toBe(false);
    expect(hqOffer(station, 0, 'vicar', 10, [{ defId: 'candle', qty: 1 }]).can).toBe(false);
    expect(hqOffer(station, 1, 'vicar', 10, pockets)).toEqual({
      tier: 1,
      next: null,
      mine: true,
      can: false,
    });
  });
});

describe('civic copy', () => {
  it('names every HQ station and prompts every civic kind', () => {
    for (const id of Object.keys(economy.hq.stations)) expect(stationName(id)).not.toBe(id);
    for (const kind of ['altar', 'mailbag', 'rack', 'market', 'hq', 'bank'])
      expect(Object.keys(CIVIC_COPY)).toContain(`prompt.${kind}`);
  });
});

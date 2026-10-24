// Round 8, 8G (motion.md 2): the HQ stations wear their bought tier, with build dust only on a rise seen happening.
import { describe, expect, it } from 'vitest';
import economy from '@wdi/content/data/economy.json';
import { type DefContext, mapStatics } from '../mapDefs';
import { readSceneMap } from '../sceneMap';
import { HQ_TIERS, HqView, hqFrame, stationProps } from './HqView';

const STATIONS = {
  crumbOvens: { props: { hollowmere: 'bk.hq_ovens', blackpine: 'bl.hq_ovens' } },
  chapel: { props: { hollowmere: 'ov.hq_chapel' } },
};

/** The scene's statics: only the ids in `here` are drawn. */
function rig(here: string[]) {
  const frames = new Map<string, string>();
  const dust: string[] = [];
  const statics = {
    setFrame(id: string, frame: string) {
      if (!here.includes(id)) return null;
      frames.set(id, frame);
      return { x: 10, y: 20 };
    },
  };
  const fx = { play: (kind: string, x: number, y: number) => dust.push(`${kind} ${x},${y}`) };
  return { frames, dust, here, view: new HqView(statics, fx, STATIONS) };
}

describe('hqFrame', () => {
  it('names the tier frame, clamped to the four drawn', () => {
    expect(HQ_TIERS).toBe(4);
    expect([0, 1, 3, 7, -1].map(hqFrame)).toEqual([
      'prop_hq_0',
      'prop_hq_1',
      'prop_hq_3',
      'prop_hq_3',
      'prop_hq_0',
    ]);
  });

  it('has a frame for every tier economy.json sells', () => {
    for (const s of Object.values(economy.hq.stations)) expect(s.tiers.length).toBeLessThan(HQ_TIERS);
  });
});

describe('stationProps', () => {
  it('pairs each station with its prop on every map', () => {
    expect(stationProps(STATIONS)).toEqual([
      ['crumbOvens', 'bk.hq_ovens'],
      ['crumbOvens', 'bl.hq_ovens'],
      ['chapel', 'ov.hq_chapel'],
    ]);
    expect(stationProps(economy.hq.stations)).toHaveLength(12);
  });
});

describe('HqView', () => {
  it('draws the bought tier, an absent station as its site, and no dust on first sight', () => {
    const r = rig(['bk.hq_ovens', 'ov.hq_chapel']);
    r.view.update({ crumbOvens: 2 });
    expect(r.frames.get('bk.hq_ovens')).toBe('prop_hq_2');
    expect(r.frames.get('ov.hq_chapel')).toBe('prop_hq_0');
    expect(r.dust).toEqual([]);
  });

  it('throws dust over a station whose tier rises in view, once', () => {
    const r = rig(['bk.hq_ovens']);
    r.view.update({});
    r.view.update({ crumbOvens: 1 });
    r.view.update({ crumbOvens: 1 });
    expect(r.frames.get('bk.hq_ovens')).toBe('prop_hq_1');
    expect(r.dust).toEqual(['buildDust 10,20']);
  });

  it('plays nothing for a rise in another scene, and draws it on return', () => {
    const r = rig([]);
    r.view.update({ chapel: 1 });
    r.view.update({ chapel: 2 });
    r.here.push('ov.hq_chapel');
    r.view.update({ chapel: 2 });
    expect(r.frames.get('ov.hq_chapel')).toBe('prop_hq_2');
    expect(r.dust).toEqual([]);
  });

  it('plays nothing when a new match resets the tiers, nor after destroy', () => {
    const r = rig(['bk.hq_ovens']);
    r.view.update({ crumbOvens: 3 });
    r.view.update({});
    expect(r.frames.get('bk.hq_ovens')).toBe('prop_hq_0');
    r.view.destroy();
    r.view.update({ crumbOvens: 1 });
    expect(r.dust).toEqual([]);
  });
});

describe('mapStatics: an hq row', () => {
  it('stands as the site frame of the shared props atlas', () => {
    const ctx: DefContext = {
      mapId: 'hollowmere',
      theme: 'timber',
      hasFrame: (atlas, frame) => atlas === 'props' && frame.startsWith('prop_hq_'),
    };
    const map = readSceneMap({
      orientation: 'isometric',
      width: 20,
      height: 20,
      properties: [
        { name: 'theme', value: 'timber' },
        { name: 'map', value: 'hollowmere' },
      ],
      layers: [
        {
          name: 'props',
          type: 'objectgroup',
          objects: [{ name: 'bk.hq_ovens', type: 'hq', x: 64, y: 64, width: 64, height: 64, properties: [] }],
        },
      ],
    });
    expect(mapStatics(map, ctx)).toEqual([
      expect.objectContaining({ id: 'bk.hq_ovens', atlas: 'props', frame: 'prop_hq_0', autoOccluder: true }),
    ]);
  });
});

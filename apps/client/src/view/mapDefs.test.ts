import { describe, expect, it } from 'vitest';
import { type DefContext, mapStatics, parseFootprint, portalFrame } from './mapDefs';
import { readSceneMap } from './sceneMap';
import { defDepth } from './statics';

const frames = new Set<string>();
const ctx: DefContext = {
  mapId: 'hollowmere',
  theme: 'harbour',
  hasFrame: (atlas, frame) => frames.has(`${atlas}:${frame}`),
};
const obj = (
  name: string,
  type: string,
  x: number,
  y: number,
  props: Array<[string, unknown]> = [],
  w = 64,
  h = 64,
) => ({
  name,
  type,
  x,
  y,
  width: w,
  height: h,
  properties: props.map(([name, value]) => ({ name, value })),
});
const map = (groups: Record<string, ReturnType<typeof obj>[]>) =>
  readSceneMap({
    orientation: 'isometric',
    width: 20,
    height: 20,
    properties: [
      { name: 'theme', value: 'harbour' },
      { name: 'map', value: 'hollowmere' },
    ],
    layers: Object.entries(groups).map(([name, objects]) => ({ name, type: 'objectgroup', objects })),
  });

describe('parseFootprint', () => {
  it('reads x,y,w,h in tiles', () => {
    expect(parseFootprint('3,4,2,1')).toEqual({ x: 3, y: 4, w: 2, h: 1 });
    for (const bad of ['3,4,2', '3,4,0,1', '-1,0,1,1', 'a,b,c,d', 7, undefined])
      expect(parseFootprint(bad)).toBeNull();
  });
});

describe('mapStatics: solids', () => {
  it('draws a kit piece from the kit atlas at its tile centre, sorted by it', () => {
    frames.clear();
    const defs = mapStatics(
      map({ solids: [obj('3,2', 'wall/half/1', 192, 128), obj('5,5', 'fence/full/0', 320, 320)] }),
      ctx,
    );
    expect(defs[0]).toMatchObject({
      atlas: 'iso_kit_harbour',
      frame: 'wall/half/1',
      x: 224,
      y: 160,
      occluder: true,
    });
    expect(defDepth(defs[0]!)).toBe((224 + 160) / 2);
    expect(defs[1]!.frame).toBe('fence/full/0');
  });
  it('takes the occluder flag from the file when it has one, and skips frames it does not know', () => {
    const defs = mapStatics(
      map({
        solids: [
          obj('1,1', 'wall/full/0', 64, 64, [['occluder', false]]),
          obj('2,2', 'door/full/0', 128, 128),
        ],
      }),
      ctx,
    );
    expect(defs).toHaveLength(1);
    expect(defs[0]!.occluder).toBe(false);
  });
});

describe('mapStatics: buildings', () => {
  it('cuts a slice per footprint tile from the map building atlas', () => {
    const defs = mapStatics(
      map({ buildings: [obj('bld.tavern', 'building', 128, 192, [['art', 'tavern']], 192, 128)] }),
      ctx,
    );
    expect(defs).toHaveLength(6);
    expect(defs.every((d) => d.atlas === 'bld_hollowmere' && d.occluder)).toBe(true);
    expect(defs.map((d) => d.frame)).toContain('tavern#2_1');
  });
});

describe('mapStatics: props (SPRITES 10.13 lookup)', () => {
  it('looks in the map atlas before the shared one, kind before id tail', () => {
    frames.clear();
    frames.add('props:prop_pump');
    frames.add('props_hollowmere:prop_pump');
    const [d] = mapStatics(map({ props: [obj('ov.pump', 'pump', 64, 64)] }), ctx);
    expect(d).toMatchObject({ atlas: 'props_hollowmere', frame: 'prop_pump', autoOccluder: true });
    frames.clear();
    frames.add('props:prop_board');
    const [e] = mapStatics(map({ props: [obj('ov.board', 'noticeBoard', 64, 64)] }), ctx);
    expect(e).toMatchObject({ atlas: 'props', frame: 'prop_board' });
  });
  it('draws a labelled greybox for an interactable without art and nothing for decor', () => {
    frames.clear();
    const defs = mapStatics(
      map({ props: [obj('ov.bell', 'bell', 64, 64), obj('ov.crate', 'decor', 128, 64)] }),
      ctx,
    );
    expect(defs).toHaveLength(1);
    expect(defs[0]).toMatchObject({ id: 'ov.bell', label: 'Bell', atlas: '' });
  });
  it('lights a lantern post with its lit frame and keeps the unlit one in reserve', () => {
    frames.clear();
    frames.add('props:prop_lanternPost_lit');
    const [d] = mapStatics(map({ props: [obj('ov.lantern_0', 'lanternPost', 64, 64)] }), ctx);
    expect(d).toMatchObject({ frame: 'prop_lanternPost_lit', frameAlt: 'prop_lanternPost_unlit' });
  });
  it('slices a multi-tile prop by its footprint', () => {
    frames.clear();
    frames.add('props:prop_wakeTable#0_0');
    const defs = mapStatics(
      map({ props: [obj('bk.table', 'wakeTable', 64, 64, [['footprint', '1,1,2,2']])] }),
      ctx,
    );
    expect(defs).toHaveLength(4);
    expect(defs[3]!.frame).toBe('prop_wakeTable#1_1');
  });
});

describe('mapStatics: spots and portals', () => {
  it('draws a greybox block for a spot without its frame', () => {
    frames.clear();
    const [d] = mapStatics(
      map({ interact: [obj('ov.hedge_w', 'hide', 64, 128, [['variant', 'hedge']])] }),
      ctx,
    );
    expect(d).toMatchObject({ id: 'ov.hedge_w', atlas: '', colour: 'teal' });
    frames.add('props:spot_hedge');
    expect(
      mapStatics(map({ interact: [obj('ov.hedge_w', 'hide', 64, 128, [['variant', 'hedge']])] }), ctx)[0],
    ).toMatchObject({
      atlas: 'props',
      frame: 'spot_hedge',
    });
  });
  it('names the portal frame by kind and face, hatches and drops apart', () => {
    expect(portalFrame('door', 's')).toBe('portal_door_s');
    expect(portalFrame('door', 'sill')).toBe('portal_door_sill');
    expect(portalFrame('hatch', null)).toBe('portal_hatch');
    expect(portalFrame('door', null)).toBeNull();
  });
  it('draws a portal frame, a marker without art, and no frame inside a building', () => {
    frames.clear();
    const door = obj('ov.door', 'door', 64, 64, [['face', 's']]);
    const marker = mapStatics(map({ portals: [door] }), ctx);
    expect(marker[0]).toMatchObject({ id: 'ov.door', atlas: '', colour: 'mustard' });
    frames.add('props:portal_door_s');
    expect(mapStatics(map({ portals: [door] }), ctx)[0]).toMatchObject({
      atlas: 'props',
      frame: 'portal_door_s',
    });
    const inside = obj('ov.in', 'door', 64, 64, [
      ['face', 's'],
      ['inBuilding', true],
    ]);
    expect(mapStatics(map({ portals: [inside] }), ctx)).toEqual([]);
  });
  it('adds a hidden boarded overlay when the art has one', () => {
    frames.clear();
    frames.add('props:portal_boarded_e');
    const defs = mapStatics(map({ portals: [obj('ov.door', 'door', 64, 64, [['face', 'e']])] }), ctx);
    const overlay = defs.find((d) => d.id === 'ov.door~boarded')!;
    expect(overlay).toMatchObject({ hidden: true, frame: 'portal_boarded_e' });
    expect(defDepth(overlay)).toBeGreaterThan(defDepth(defs[0]!));
  });
});

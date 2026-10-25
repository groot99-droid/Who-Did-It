import { describe, expect, it } from 'vitest';
import { maps } from '@wdi/content';
import type { SaveApi } from '../saveApi';
import { OverviewModel } from './model';

const ids = maps.hollowmere.scenes;
const portalOf = (m: OverviewModel, scene: string, portal: string) =>
  m.sceneOf(scene)!.portals.find((p) => p.id === portal)!;

describe('OverviewModel', () => {
  it('re-targets a portal to another spawn and lists the scene as changed', () => {
    const m = new OverviewModel();
    expect(m.changed).toEqual([]);
    expect(m.retarget('bakery', 'bk.door', 'overworld', 'barn')).toBe(true);
    expect(portalOf(m, 'bakery', 'bk.door')).toMatchObject({ to: 'overworld', toSpawn: 'barn' });
    expect(m.links(ids)).toContainEqual({
      scene: 'bakery',
      portal: 'bk.door',
      to: 'overworld',
      toSpawn: 'barn',
    });
    expect(m.changed).toEqual(['bakery']);
    expect(m.error).toBe('');
  });

  it('refuses, and changes nothing, when a live check turns up a new error', () => {
    const m = new OverviewModel();
    expect(m.retarget('bakery', 'bk.door', 'tavern_bar', 'front')).toBe(false);
    expect(m.error).toContain('no portal leads back');
    expect(portalOf(m, 'bakery', 'bk.door')).toMatchObject({ to: 'overworld', toSpawn: 'bakery' });
    expect(m.changed).toEqual([]);
  });

  it('refuses a spawn the target scene does not have, and changes nothing', () => {
    const m = new OverviewModel();
    const before = structuredClone(portalOf(m, 'bakery', 'bk.door'));
    expect(m.retarget('bakery', 'bk.door', 'overworld', 'no_such_spawn')).toBe(false);
    expect(m.error).toContain('no_such_spawn');
    expect(portalOf(m, 'bakery', 'bk.door')).toEqual(before);
    expect(m.changed).toEqual([]);
  });

  it('refuses an unknown portal', () => {
    const m = new OverviewModel();
    expect(m.retarget('bakery', 'bk.nope', 'overworld', 'bakery')).toBe(false);
    expect(m.error).toContain('bk.nope');
  });

  it('keeps a session per scene, so the editor reopens on the same edits', () => {
    const m = new OverviewModel();
    expect(m.has('bakery')).toBe(false);
    expect(m.sessionFor('bakery')).toBe(m.sessionFor('bakery'));
    expect(m.has('bakery')).toBe(true);
  });
});

describe('OverviewModel.save', () => {
  it('sends each changed scene once, with the note, through the scene save', async () => {
    const m = new OverviewModel();
    const sent: Array<{ id: string; note: string }> = [];
    const api: SaveApi = {
      save: (req) => {
        sent.push({ id: (req as { scene: { id: string } }).scene.id, note: (req as { note: string }).note });
        return Promise.resolve({ branch: 'studio/x', number: 1, url: '#' });
      },
    };
    expect(m.retarget('bakery', 'bk.door', 'overworld', 'barn')).toBe(true);
    expect(m.changed).toEqual(['bakery']);
    await m.save(api, 'door');
    await m.save(api, 'door');
    expect(sent).toEqual([{ id: 'bakery', note: 'door' }]);
    expect(m.changed).toEqual([]);
  });
});

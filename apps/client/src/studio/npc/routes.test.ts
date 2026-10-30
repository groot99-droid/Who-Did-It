import { content, scenes } from '@wdi/content';
import { describe, expect, it } from 'vitest';
import { PHASES, phaseClassOf, qualifies, routeOf, stationKinds, walks } from './routes';
import { newErrors, setFixed, setHold, setMaps, setStations } from './routinesEdit';

const r = content.routines;
const ids = Object.keys(r.townsfolk);

describe('routes', () => {
  it('maps every scrubber phase to a phase class', () => {
    for (const p of PHASES) expect(['day', 'night']).toContain(phaseClassOf(p, r));
  });

  it('lists a route in station order and none for any prop kind outside it', () => {
    const scene = Object.values(scenes).find((s) => s.props.length > 3)!;
    const kinds = stationKinds(r, [scene]);
    expect(kinds.length).toBeGreaterThan(0);
    const row = { look: 'villager', named: false, fixed: false, stations: [kinds[0]!] } as never;
    const stops = routeOf(scene, row, r, 'day');
    expect(stops.every((s) => s.kind === kinds[0])).toBe(true);
    expect(stops.map((s) => s.n)).toEqual(stops.map((_, i) => i + 1));
  });

  it('treats a kind in no activity as used at any time', () => {
    expect(qualifies('__none__', 'day', r)).toBe(true);
    expect(qualifies('__none__', 'night', r)).toBe(true);
  });

  it('walks every map when a row has no maps', () => {
    const row = { look: 'villager', named: false, fixed: false, stations: [] } as never;
    expect(walks(row, 'hollowmere' as never)).toBe(true);
  });
});

describe('routinesEdit', () => {
  const id = ids[0]!;
  it('edits stations and fixed without touching other rows', () => {
    const e = setStations(r, id, ['bench']);
    expect('routines' in e && e.routines.townsfolk[id]!.stations).toEqual(['bench']);
    const f = setFixed(r, id, true);
    expect('routines' in f && f.routines.townsfolk[id]!.fixed).toBe(true);
    if ('routines' in e)
      for (const o of ids.slice(1)) expect(e.routines.townsfolk[o]).toEqual(r.townsfolk[o]);
  });

  it('keeps the row key order and drops maps when cleared', () => {
    const e = setMaps(r, id, []);
    expect('routines' in e && 'maps' in e.routines.townsfolk[id]!).toBe(false);
    const keys = 'routines' in e ? Object.keys(e.routines.townsfolk[id]!) : [];
    expect(keys).toEqual(Object.keys(r.townsfolk[id]!).filter((k) => k !== 'maps'));
  });

  it('keeps guard and count where the file has them, in its order (the clerk, the Constables)', () => {
    const clerk = setStations(r, 'clerk', [
      'pump',
      ...r.townsfolk.clerk!.stations.filter((k) => k !== 'pump'),
    ]);
    expect('routines' in clerk && clerk.routines.townsfolk.clerk).toMatchObject({ guard: true });
    expect('routines' in clerk ? Object.keys(clerk.routines.townsfolk.clerk!) : []).toEqual(
      Object.keys(r.townsfolk.clerk!),
    );
    const guards = setFixed(r, 'constable', true);
    expect('routines' in guards ? Object.keys(guards.routines.townsfolk.constable!) : []).toEqual([
      'look',
      'named',
      'fixed',
      'guard',
      'count',
      'stations',
    ]);
  });

  it('refuses an unknown kind and sets and clears a hold', () => {
    expect('error' in setStations(r, 'nobody', [])).toBe(true);
    const h = setHold(r, 'bench', 'inspect');
    expect('routines' in h && h.routines.holds.bench).toBe('inspect');
    const c = 'routines' in h ? setHold(h.routines, 'bench', null) : h;
    expect('routines' in c && 'bench' in c.routines.holds).toBe(false);
  });

  it('reports no new errors for the committed file', () => {
    expect(newErrors(r)).toEqual([]);
  });
});

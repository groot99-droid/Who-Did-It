import { content } from '@wdi/content';
import { describe, expect, it } from 'vitest';
import { SaveError } from '../saveApi';
import { NpcModel } from './NpcModel';
import { setFixed, setStations } from './routinesEdit';

describe('NpcModel', () => {
  it('applies an edit, undoes it and reports a bad one without applying it', () => {
    const m = new NpcModel();
    const id = m.figure;
    expect(m.apply(setFixed(m.routines, id, !m.routines.townsfolk[id]!.fixed))).toBe(true);
    expect(m.changed).toBe(true);
    m.undo();
    expect(m.routines).toBe(content.routines);
    expect(m.apply(setStations(m.routines, 'nobody', []))).toBe(false);
    expect(m.problems).toHaveLength(1);
    expect(m.changed).toBe(false);
  });

  it('saves the whole file as routines.json and previews it', async () => {
    const m = new NpcModel();
    const sent: unknown[] = [];
    const out = await m.save(
      { save: (r) => (sent.push(r), Promise.resolve({ branch: 'b', number: 1, url: 'u' })) },
      'n',
    );
    expect(out?.number).toBe(1);
    expect(sent[0]).toMatchObject({ file: 'routines.json', note: 'n' });
    const up: unknown[] = [];
    expect(await m.preview({ upload: (_r, f) => (up.push(f), Promise.resolve()) }, 'room')).toBe(true);
    expect(up[0]).toEqual({ routines: m.routines });
  });

  it('keeps a refused save the problems list', async () => {
    const m = new NpcModel();
    const out = await m.save({ save: () => Promise.reject(new SaveError(422, 'no', ['a', 'b'])) }, '');
    expect(out).toBeNull();
    expect(m.problems).toEqual(['a', 'b']);
  });
});

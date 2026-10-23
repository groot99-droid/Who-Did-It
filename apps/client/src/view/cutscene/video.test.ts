import { describe, expect, it } from 'vitest';
import manifest from '../../../public/assets/video/manifest.json';
import { parseVideoRow } from './video';

describe('parseVideoRow', () => {
  it('finds a row by key, with its poster when it has one', () => {
    const raw = {
      entries: [
        { key: 'a', url: 'a.webm', poster: 'a.jpg' },
        { key: 'b', url: 'b.webm' },
      ],
    };
    expect(parseVideoRow(raw, 'a')).toEqual({ url: 'a.webm', poster: 'a.jpg' });
    expect(parseVideoRow(raw, 'b')).toEqual({ url: 'b.webm' });
  });

  it('is null for a missing row, a row without a url, or a damaged manifest', () => {
    expect(parseVideoRow({ entries: [{ key: 'a', url: 'a.webm' }] }, 'c')).toBeNull();
    expect(parseVideoRow({ entries: [{ key: 'a', url: '' }, null] }, 'a')).toBeNull();
    expect(parseVideoRow({ entries: 'nope' }, 'a')).toBeNull();
    expect(parseVideoRow(null, 'a')).toBeNull();
  });

  it('reads the memorial the Vicar plays from the shipped manifest', () => {
    expect(parseVideoRow(manifest, 'memorial_vicar')).toEqual({ url: 'memorial_vicar.webm' });
  });
});

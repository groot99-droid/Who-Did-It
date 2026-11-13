import { describe, expect, it } from 'vitest';
import type { StorySaveWire } from '@wdi/shared/protocol';
import { deviceSaveStore } from './save';

const save = (over: Partial<StorySaveWire> = {}): StorySaveWire => ({
  v: 1,
  storyId: 's',
  nextChapterId: 'c2',
  finished: ['c1'],
  handOn: [{ any: 'thing' }],
  replayUsed: [],
  summaries: [],
  rev: 1,
  savedAt: 5,
  ...over,
});

function memory(initial?: string): Storage {
  const m = new Map<string, string>(initial === undefined ? [] : [['wdi:story:save', initial]]);
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  } as unknown as Storage;
}

describe('the device save store', () => {
  it('keeps what it was given, whole, one slot per story', () => {
    const st = deviceSaveStore(memory());
    st.write(save());
    st.write(save({ storyId: 't' }));
    expect(st.read('s')).toEqual(save());
    expect(st.read('t')?.storyId).toBe('t');
    st.clear('s');
    expect(st.read('s')).toBeNull();
    expect(st.read('t')).not.toBeNull();
  });

  it('never rolls a slot back to an older revision', () => {
    const st = deviceSaveStore(memory());
    st.write(save({ rev: 3, nextChapterId: 'c4' }));
    st.write(save({ rev: 2, nextChapterId: 'c3' }));
    expect(st.read('s')?.nextChapterId).toBe('c4');
  });

  it('treats damaged, mismatched or missing storage as no save, not a crash', () => {
    expect(deviceSaveStore(memory('{not json')).read('s')).toBeNull();
    expect(deviceSaveStore(memory('[1,2]')).read('s')).toBeNull();
    expect(deviceSaveStore(memory(JSON.stringify({ s: { storyId: 'other' } }))).read('s')).toBeNull();
    expect(deviceSaveStore(memory(JSON.stringify({ s: save({ rev: 'x' as never }) }))).read('s')).toBeNull();
    const none = deviceSaveStore(undefined);
    none.write(save());
    expect(none.read('s')).toBeNull();
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    } as unknown as Storage;
    const st = deviceSaveStore(throwing);
    st.write(save());
    expect(st.read('s')).toBeNull();
  });

  it('refuses to write a value that is not shaped like a save', () => {
    const st = deviceSaveStore(memory());
    st.write({ storyId: 's' } as never);
    expect(st.read('s')).toBeNull();
  });
});

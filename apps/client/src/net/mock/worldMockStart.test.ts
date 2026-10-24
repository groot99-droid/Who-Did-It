import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { MockWorldFeed } from './worldMock';

// Round 8 (8J): `?scene=&spawn=` under ?mock=1 starts the own seat in any scene, for the room screenshots of art.md 4.
const content = {
  navs: {},
  sceneIds: ['overworld', 'chapel'],
  scenes: {
    overworld: {
      id: 'overworld',
      portals: [],
      spawns: Array.from({ length: 10 }, (_, i) => ({ id: `square_${i}`, x: 3 + i * 2, y: 5, facing: 's' })),
      props: [],
    },
    chapel: {
      id: 'chapel',
      portals: [],
      spawns: [
        { id: 'door', x: 16, y: 6, facing: 'w' },
        { id: 'crypt', x: 2, y: 10, facing: 'n' },
      ],
      props: [],
    },
  },
};

function enters(search: string): unknown[] {
  (globalThis as { location?: unknown }).location = { search };
  const feed = new MockWorldFeed(content as never);
  const out: unknown[] = [];
  feed.bus.on('sceneEnter', (e) => out.push(e));
  feed.start();
  feed.dispose();
  return out;
}

describe('MockWorldFeed start scene (?scene=&spawn=)', () => {
  beforeAll(() => void vi.stubGlobal('window', globalThis));
  afterAll(() => void vi.unstubAllGlobals());

  it('starts on the overworld square by default', () => {
    expect(enters('')).toEqual([{ sceneId: 'overworld', spawn: 'square_0', facing: 's' }]);
  });

  it('starts at the named spawn of the named scene', () => {
    expect(enters('?scene=chapel&spawn=crypt')).toEqual([{ sceneId: 'chapel', spawn: 'crypt', facing: 'n' }]);
  });

  it("takes the scene's first spawn when the spawn is unknown, and ignores an unknown scene", () => {
    expect(enters('?scene=chapel&spawn=nowhere')).toEqual([
      { sceneId: 'chapel', spawn: 'door', facing: 'w' },
    ]);
    expect(enters('?scene=nowhere')).toEqual([{ sceneId: 'overworld', spawn: 'square_0', facing: 's' }]);
  });
});

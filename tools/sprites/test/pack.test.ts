import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { applyPivots, buildAnims, fileStemOf, type FeetManifest } from '../gen-anims.ts';
import { animKey, frameFileName, frameKey, parseFrameFileName, type Dir } from '../keys.ts';
import { packCharacter, packFrames, type MultiAtlas, type PackInput } from '../pack.ts';

/** A 128 px cell, transparent except a w x h block whose bottom centre is the feet point. */
function cell(feet: [number, number], w: number, h: number, shade: string): Buffer {
  const c = createCanvas(128, 128);
  const g = c.getContext('2d');
  g.fillStyle = shade;
  g.fillRect(feet[0] - w / 2, feet[1] - h, w, h);
  return c.toBuffer('image/png');
}

const DIRS: Dir[] = ['n', 'e'];
function synthetic(): { manifest: FeetManifest; frames: Map<'body' | 'scarf', PackInput[]> } {
  const manifest: FeetManifest = {
    version: 1,
    body: 'tester',
    cell: 128,
    fps: 12,
    passes: ['body', 'scarf'],
    frames: {},
  };
  const body: PackInput[] = [];
  const scarf: PackInput[] = [];
  for (const dir of DIRS) {
    for (let index = 0; index < 3; index++) {
      const id = { body: 'tester', anim: 'walk', dir, index };
      const feet: [number, number] = [64 + index, 112];
      manifest.frames[frameFileName(id)] = { feet };
      // Frames 0 and 2 of a direction are drawn identically; detectIdentical shares their pixels.
      const h = index === 1 ? 40 : 30;
      body.push({ name: frameKey('body', id), png: cell(index === 2 ? [64, 112] : feet, 20, h, '#6F7A8C') });
      scarf.push({ name: frameKey('scarf', id), png: cell([64, 80], 16, 4, '#D9D2C2') });
      if (index === 2) manifest.frames[frameFileName(id)] = { feet: [64, 112] };
    }
  }
  return {
    manifest,
    frames: new Map([
      ['body', body],
      ['scarf', scarf],
    ]),
  };
}

describe('keys', () => {
  it('round-trips frame names and builds atlas keys', () => {
    const id = parseFrameFileName('char_villager_walk_se_003');
    expect(id).toEqual({ body: 'villager', anim: 'walk', dir: 'se', index: 3 });
    expect(frameFileName(id)).toBe('char_villager_walk_se_003');
    expect(frameKey('body', id)).toBe('char/villager/walk/se/003');
    expect(frameKey('hat_cap', id)).toBe('hat_cap/villager/walk/se/003');
    expect(animKey('blood', 'villager', 'die', 'nw')).toBe('blood/villager/die/nw');
    expect(fileStemOf('scarf/villager/walk/se/003')).toBe('char_villager_walk_se_003');
  });

  it('rejects role-like or malformed names', () => {
    expect(() => parseFrameFileName('char_villager_dance_n_000')).toThrow();
    expect(() => frameFileName({ body: 'old_man', anim: 'walk', dir: 'n', index: 0 })).toThrow();
  });
});

describe('packFrames', () => {
  it('trims, keeps source sizes, never rotates and pads to a power of two', async () => {
    const { frames } = synthetic();
    const { atlas, pages } = await packFrames('char_tester', frames.get('body')!);
    expect(atlas.textures).toHaveLength(1);
    const t = atlas.textures[0]!;
    expect(t.image).toBe('char_tester-0.png');
    expect(pages.has('char_tester-0.png')).toBe(true);
    for (const n of [t.size.w, t.size.h]) expect(Math.log2(n) % 1).toBe(0);
    expect(t.frames.map((f) => f.filename)).toEqual([...t.frames.map((f) => f.filename)].sort());
    for (const f of t.frames) {
      expect(f.rotated).toBe(false);
      expect(f.trimmed).toBe(true);
      expect(f.sourceSize).toEqual({ w: 128, h: 128 });
      expect(f.frame.w).toBe(f.spriteSourceSize.w);
    }
    const tall = t.frames.find((f) => f.filename === 'char/tester/walk/n/001')!;
    expect(tall.spriteSourceSize).toEqual({ x: 55, y: 72, w: 20, h: 40 });
    const a = t.frames.find((f) => f.filename === 'char/tester/walk/e/000')!;
    const b = t.frames.find((f) => f.filename === 'char/tester/walk/e/002')!;
    expect(b.frame).toEqual(a.frame); // detectIdentical
  });

  it('is deterministic whatever the input order', async () => {
    const body = synthetic().frames.get('body')!;
    const one = await packFrames('char_tester', body);
    const two = await packFrames('char_tester', [...body].reverse());
    expect(JSON.stringify(two.atlas)).toBe(JSON.stringify(one.atlas));
    expect(two.pages.get('char_tester-0.png')!.equals(one.pages.get('char_tester-0.png')!)).toBe(true);
  });

  it('refuses duplicate frame names', async () => {
    const body = synthetic().frames.get('body')!;
    await expect(packFrames('x', [body[0]!, body[0]!])).rejects.toThrow(/duplicate/);
  });
});

describe('gen-anims', () => {
  it('writes the feet as a normalised pivot on body and overlay frames', async () => {
    const { manifest, frames } = synthetic();
    const atlases: MultiAtlas[] = [];
    for (const pass of ['body', 'scarf'] as const) {
      const { atlas } = await packFrames(pass, frames.get(pass)!);
      applyPivots(atlas, manifest);
      atlases.push(atlas);
    }
    const pivotOf = (a: MultiAtlas, name: string) =>
      a.textures[0]!.frames.find((f) => f.filename === name)!.pivot;
    expect(pivotOf(atlases[0]!, 'char/tester/walk/n/001')).toEqual({ x: 0.5078, y: 0.875 });
    expect(pivotOf(atlases[1]!, 'scarf/tester/walk/n/001')).toEqual({ x: 0.5078, y: 0.875 });
  });

  it('builds one Phaser anim per layer, body, clip and direction', async () => {
    const { manifest, frames } = synthetic();
    const files = await packCharacter('tester', frames, manifest);
    expect([...files.keys()].sort()).toEqual([
      'char_tester-0.png',
      'char_tester.json',
      'ovl_tester-0.png',
      'ovl_tester.json',
      'tester.anims.json',
    ]);
    const { anims } = JSON.parse(files.get('tester.anims.json')!.toString()) as ReturnType<typeof buildAnims>;
    expect(anims.map((a) => a.key)).toEqual([
      'char/tester/walk/e',
      'char/tester/walk/n',
      'scarf/tester/walk/e',
      'scarf/tester/walk/n',
    ]);
    const walk = anims[1]!;
    expect(walk).toMatchObject({ frameRate: 12, repeat: -1 });
    expect(walk.frames).toEqual(
      [0, 1, 2].map((i) => ({ key: 'char_tester', frame: `char/tester/walk/n/00${i}` })),
    );
    expect(anims[2]!.frames[0]!.key).toBe('ovl_tester');
  });

  it('plays one-shot clips once', () => {
    const atlas: MultiAtlas = {
      meta: { app: '', version: '' },
      textures: [
        {
          image: 'x-0.png',
          format: 'RGBA8888',
          size: { w: 1, h: 1 },
          scale: 1,
          frames: [
            {
              filename: 'char/v/die/s/000',
              rotated: false,
              trimmed: false,
              sourceSize: { w: 1, h: 1 },
              spriteSourceSize: { x: 0, y: 0, w: 1, h: 1 },
              frame: { x: 0, y: 0, w: 1, h: 1 },
            },
          ],
        },
      ],
    };
    expect(buildAnims([{ key: 'char_v', atlas }]).anims[0]!.repeat).toBe(0);
  });
});

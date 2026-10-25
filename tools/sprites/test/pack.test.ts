import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { applyPivots, buildAnims, fileStemOf, type FeetManifest } from '../gen-anims.ts';
import {
  CLIP_CELL,
  CLIP_NAMES,
  DIRECTIONS,
  FAMILY_DROPS,
  PASSES,
  R8_CLIPS,
  V1_CLIPS,
  animKey,
  frameCounts,
  frameFileName,
  frameKey,
  isLazy,
  lookClips,
  lookTails,
  parseFrameFileName,
  textureKey,
  type Dir,
} from '../keys.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodePng, encodeIndexedPng } from '../bleed.ts';
import { atlasJson, packCharacter, packFrames, type MultiAtlas, type PackInput } from '../pack.ts';
import { finishEnabled } from '../palette.ts';

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
    expect(frameKey('scarf', id)).toBe('scarf/villager/walk/se/003');
    expect(PASSES).toEqual(['body', 'scarf', 'blood']);
    expect(Object.keys(V1_CLIPS)).toEqual(['idle', 'walk', 'swing', 'interact', 'die']);
    const perPass = Object.values(V1_CLIPS).reduce((n, c) => n + c.frames, 0) * DIRECTIONS.length;
    expect(perPass).toBe(272); // 304 until the owner's option B trimmed idle and interact to 6 (A161)
    expect(animKey('blood', 'villager', 'die', 'nw')).toBe('blood/villager/die/nw');
    expect(fileStemOf('scarf/villager/walk/se/003')).toBe('char_villager_walk_se_003');
  });

  it('rejects role-like or malformed names', () => {
    expect(() => parseFrameFileName('char_villager_dance_n_000')).toThrow();
    expect(() => frameFileName({ body: 'old_man', anim: 'walk', dir: 'n', index: 0 })).toThrow();
  });

  it("carries the clip table of SPRITES 3 at the frame counts of the owner's option B (A161)", () => {
    expect(parseFrameFileName('char_villager_knockdown_ne_003').anim).toBe('knockdown');
    expect(CLIP_NAMES).toHaveLength(21);
    const table = Object.fromEntries(
      CLIP_NAMES.map((c) => [c, [R8_CLIPS[c].frames, R8_CLIPS[c].dirs.length]]),
    );
    expect(table).toEqual({
      idle: [6, 8],
      walk: [8, 8],
      swing: [6, 8],
      interact: [6, 8],
      die: [8, 8],
      run: [6, 8],
      strike: [4, 8],
      hurt: [3, 8],
      limp: [6, 4],
      stagger: [6, 4],
      inspect: [4, 4],
      cower: [4, 4],
      fidget: [4, 4],
      stomp: [4, 4],
      stunned: [4, 4],
      knockdown: [4, 4],
      down: [2, 4],
      getup: [4, 4],
      rob: [4, 4],
      eat: [4, 4],
      threaten: [4, 4],
    });
    expect(CLIP_NAMES.filter((c) => R8_CLIPS[c].lazy)).toEqual([
      'knockdown',
      'down',
      'getup',
      'rob',
      'eat',
      'threaten',
    ]);
    expect(isLazy('down') && !isLazy('limp') && !isLazy('dance')).toBe(true);
    expect(CLIP_CELL).toEqual({
      die: [256, 128],
      knockdown: [256, 128],
      down: [256, 128],
      getup: [256, 128],
    });
    // A deck look renders 504 resident frames a pass and 88 lazy; the villager family drops five clips: 408 and 56.
    expect(frameCounts('baker')).toEqual({ resident: 504, lazy: 88 });
    expect([...lookClips('baker').keys()]).toEqual(CLIP_NAMES);
    expect(frameCounts('villagerelder')).toEqual({ resident: 408, lazy: 56 });
    expect([...lookClips('villager').keys()]).toEqual(CLIP_NAMES.filter((c) => !FAMILY_DROPS.includes(c)));
    expect(lookTails('villager', true)).toHaveLength(56);
    expect(lookTails('baker', false)[0]).toBe('baker/idle/n/000');
    expect(lookTails('baker', false).filter((t) => t.includes('/limp/'))).toHaveLength(24);
    expect(textureKey('body', 'baker', true)).toBe('char_baker_2');
    expect(textureKey('blood', 'baker', true)).toBe('ovl_baker_2');
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

  it('writes the atlas json on one line that parses back to the same frames (A161, #184 request 4)', async () => {
    const { atlas } = await packFrames('char_tester', synthetic().frames.get('body')!);
    const text = atlasJson(atlas);
    expect(text.endsWith('\n')).toBe(true);
    expect(text.slice(0, -1)).not.toContain('\n');
    expect(JSON.parse(text)).toEqual(atlas);
    expect(JSON.parse(atlasJson(atlas, true))).toEqual(atlas);
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
    const animsText = files.get('tester.anims.json')!.toString();
    expect(animsText.slice(0, -1), 'one line like the atlas json').not.toContain('\n');
    const { anims } = JSON.parse(animsText) as ReturnType<typeof buildAnims>;
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

  it('leaves the unrotated flag out of a character atlas', async () => {
    const { manifest, frames } = synthetic();
    const files = await packCharacter('tester', frames, manifest);
    for (const key of ['char_tester.json', 'ovl_tester.json']) {
      const atlas = JSON.parse(files.get(key)!.toString()) as MultiAtlas;
      const all = atlas.textures.flatMap((t) => t.frames);
      expect(all.length, key).toBeGreaterThan(0);
      for (const f of all) expect('rotated' in f, f.filename).toBe(false);
    }
  });

  it.skipIf(!finishEnabled('main'))(
    'writes a finished page indexed, the same pixels at fewer bytes',
    async () => {
      const { manifest, frames } = synthetic();
      const files = await packCharacter('tester', frames, manifest);
      const page = files.get('char_tester-0.png')!;
      expect(page[25], 'colour type').toBe(3);
      const rgba = (await packFrames('char_tester', frames.get('body')!, undefined, true)).pages.get(
        'char_tester-0.png',
      )!;
      expect(decodePng(page).data).toEqual(decodePng(rgba).data);
      expect(page.length).toBeLessThan(rgba.length);
    },
  );

  it('keeps a page with partial alpha RGBA', async () => {
    const { manifest, frames } = synthetic();
    // A block drawn at a half-pixel offset has antialiased edges: partial alpha, so the set is not finished.
    const soft = frames
      .get('body')!
      .map((f, i) => (i ? f : { ...f, png: cell([64.5, 112], 20, 30, '#6F7A8C') }));
    const files = await packCharacter('tester', new Map([...frames, ['body', soft]]), manifest);
    expect(files.get('char_tester-0.png')![25], 'colour type').toBe(6);
    expect(files.get('ovl_tester-0.png')![25], 'colour type').toBe(3);
  });

  it.skipIf(!finishEnabled('main'))('round-trips a committed 8-bit page byte for byte', () => {
    const file = join(import.meta.dirname, '../../../apps/client/public/assets/chars/char_villager-0.png');
    const png = readFileSync(file);
    expect(png[25], 'colour type').toBe(3);
    const img = decodePng(png);
    const again = encodeIndexedPng(img)!;
    expect(again.equals(png), "the committed page is the encoder's own output").toBe(true);
    // A native byte compare: toEqual walks the 4 MB of pixels element by element (about 19 s of the old 20 s).
    const back = decodePng(again);
    expect([back.width, back.height]).toEqual([img.width, img.height]);
    expect(Buffer.compare(back.data, img.data), 'the same RGBA bytes').toBe(0);
    expect(encodeIndexedPng(img)!.equals(again), 'deterministic').toBe(true);
  });

  it('keeps a look on one page per texture, or spills to a second when it does not fit', async () => {
    const { frames } = synthetic();
    const small = await packFrames('char_tester', frames.get('body')!, { w: 1024, h: 512 });
    expect(small.atlas.textures).toHaveLength(1);
    expect(small.atlas.textures[0]!.size.w).toBeLessThanOrEqual(1024);
    expect(small.atlas.textures[0]!.size.h).toBeLessThanOrEqual(512);
  });

  it('loops interact and plays swing once', () => {
    expect(V1_CLIPS.interact.loop).toBe(true);
    expect(V1_CLIPS.swing.loop).toBe(false);
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

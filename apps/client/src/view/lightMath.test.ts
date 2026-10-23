import { describe, expect, it } from 'vitest';
import palette from '@wdi/content/data/palette.json';
import {
  ambientFor,
  burnsIn,
  defaultLightColour,
  flickerRadius,
  glowAlpha,
  idPhase,
  lightAlphaAt,
  poolOnScreen,
  sceneLights,
  visionTiles,
} from './lightMath';

const hex = (t: keyof typeof palette.colors) => Number.parseInt(palette.colors[t].slice(1), 16);

describe('ambient darkness (SPRITES 10.11, GDD 3.13)', () => {
  it('is slate at 20% by day and ink at 90% at night', () => {
    expect(ambientFor(0, false)).toEqual({ colour: hex('slate'), alpha: 0.2 });
    expect(ambientFor(1, false)).toEqual({ colour: hex('ink'), alpha: 0.9 });
  });
  it('eases between the two through dusk', () => {
    const mid = ambientFor(0.5, false);
    expect(mid.alpha).toBeCloseTo(0.55);
    expect(mid.colour).not.toBe(hex('slate'));
    expect(mid.colour).not.toBe(hex('ink'));
  });
  it('is ink at 94% in a dark scene, in every phase', () => {
    for (const d of [0, 0.5, 1]) expect(ambientFor(d, true)).toEqual({ colour: hex('ink'), alpha: 0.94 });
  });
});

describe('vision (SPRITES 10.10)', () => {
  it('is 7 tiles by day, 3.5 at night, eased through dusk', () => {
    expect(visionTiles(0, false)).toBe(7);
    expect(visionTiles(1, false)).toBe(3.5);
    expect(visionTiles(0.5, false)).toBeCloseTo(5.25);
  });
  it('is the night radius in a dark scene whatever the phase', () => {
    expect(visionTiles(0, true)).toBe(3.5);
  });
});

describe('light texture (SPRITES 10.11)', () => {
  it('is opaque to 55% of the radius, then linear to nothing at the edge', () => {
    expect(lightAlphaAt(0)).toBe(1);
    expect(lightAlphaAt(0.55)).toBe(1);
    expect(lightAlphaAt(0.775)).toBeCloseTo(0.5);
    expect(lightAlphaAt(1)).toBe(0);
  });
});

describe('lights by phase (GDD 3.13)', () => {
  it('burns always without phases and only in the listed parts otherwise', () => {
    expect(burnsIn(undefined, 'day')).toBe(true);
    expect(burnsIn('', 'night')).toBe(true);
    expect(burnsIn('dusk,night', 'day')).toBe(false);
    expect(burnsIn('dusk, night', 'night')).toBe(true);
    expect(burnsIn('night', 'dusk')).toBe(false);
    expect(burnsIn('day,dusk', 'dusk')).toBe(true);
  });
  it('reads a scene light from its object: tile centre, default colour by kind', () => {
    const [moss, torch, window] = sceneLights([
      { name: 'cg.lt_rot_0', type: 'moss', x: 128, y: 64, width: 0, height: 0, props: { radiusTiles: 2 } },
      {
        name: 'bm.lt_torch',
        type: 'torch',
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        props: { radiusTiles: 2.5, phases: 'night' },
      },
      {
        name: 'bc.lt_win',
        type: 'window',
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        props: { radiusTiles: 2, color: 'moon' },
      },
    ]);
    expect(moss).toMatchObject({ id: 'cg.lt_rot_0', x: 160, y: 96, colour: 'teal', radiusTiles: 2 });
    expect(torch).toMatchObject({ colour: 'lantern', phases: 'night' });
    expect(window!.colour).toBe('moon');
    expect(['moon', 'shaft'].map(defaultLightColour)).toEqual(['moon', 'moon']);
  });
});

describe('flicker (SPRITES 10.11)', () => {
  it('wobbles torches and fires by 6% and leaves other lights alone', () => {
    let lo = Infinity;
    let hi = -Infinity;
    for (let t = 0; t < 2000; t += 10) {
      const r = flickerRadius('torch', 2, t, 'a');
      lo = Math.min(lo, r);
      hi = Math.max(hi, r);
    }
    expect(hi).toBeCloseTo(2 * 1.06, 1);
    expect(lo).toBeCloseTo(2 * 0.94, 1);
    expect(flickerRadius('lamp', 2, 123, 'a')).toBe(2);
    expect(flickerRadius('moss', 2, 456, 'a')).toBe(2);
  });
  it('offsets the phase by the light id', () => {
    expect(idPhase('a')).not.toBe(idPhase('b'));
    expect(idPhase('a')).toBe(idPhase('a'));
    expect(idPhase('bw.lt_kiln_0')).toBeGreaterThanOrEqual(0);
    expect(idPhase('bw.lt_kiln_0')).toBeLessThan(1);
  });
});

describe('pools on the darkness texture', () => {
  it('turns a radius into an ellipse twice as wide as it is tall, scaled by the zoom', () => {
    const p = poolOnScreen(640, 320, 7, 1.5, { x: 100, y: 50 });
    expect(p.width / p.height).toBeCloseTo(2, 9);
    expect(p.width).toBeCloseTo(2 * 633.6 * 1.5, 0);
    // world (640, 320) projects to screen (320, 480)
    expect(p.x).toBeCloseTo((320 - 100) * 1.5);
    expect(p.y).toBeCloseTo((480 - 50) * 1.5);
  });
  it('glows at a quarter alpha at night and not at all by day', () => {
    expect(glowAlpha(1)).toBe(0.25);
    expect(glowAlpha(0)).toBe(0);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import { DIRECTIONS, dirFromVector } from '@wdi/shared/direction';
import type { AvatarSnap, PlayerSnap } from '../net/world';
import { dirFromYaw, headingYaw } from '../view/poses';
import { type Heading, cameraDirection } from './frame';

/** Round 11, R3: the direction a figure is drawn in at each camera heading. */

// EntityView builds PlayerViews with Phaser; here a recorder keeps what it was asked to draw.
interface Made {
  look: { lookId?: string; height: number };
  dirs: string[];
}
const made = vi.hoisted(() => [] as Made[]);
vi.mock('../view/PlayerView', async () => ({
  dirFromYaw: (await import('../view/poses')).dirFromYaw,
  PlayerView: class {
    readonly root = {};
    private readonly rec: Made;
    constructor(_s: unknown, _n: string, look: Made['look']) {
      this.rec = { look, dirs: [] };
      made.push(this.rec);
    }
    setPosition() {}
    pose(dir: string) {
      this.rec.dirs.push(dir);
    }
    setBlood() {}
    setGhost() {}
    destroy() {}
  },
}));
const { EntityView } = await import('../view/EntityView');

const HEADINGS: Heading[] = [0, 1, 2, 3];
type V = { x: number; y: number; z: number };
const cross = (a: V, b: V): V => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const dot = (a: V, b: V) => a.x * b.x + a.y * b.y + a.z * b.z;
/** The screen direction (x right, y down) of a world ground vector seen by the camera at `heading`. */
function onScreen(w: { x: number; y: number }, heading: Heading): { x: number; y: number } {
  const d = cameraDirection(heading);
  const forward = { x: -d.x, y: -d.y, z: -d.z };
  const right = cross(forward, { x: 0, y: 1, z: 0 });
  const up = cross(right, forward);
  const p = { x: w.x, y: 0, z: w.y };
  return { x: dot(p, right), y: -dot(p, up) };
}

describe('the direction a figure is drawn in (R3)', () => {
  it('for each heading and facing, the atlas direction is the facing as the turned camera sees it', () => {
    for (const h of HEADINGS)
      for (let k = 0; k < 32; k++) {
        const yaw = (k * Math.PI) / 16 + 0.03; // off the 22.5 degree borders between two directions
        const facing = { x: Math.sin(yaw), y: -Math.cos(yaw) }; // yaw: clockwise from world north (-y)
        const seen = onScreen(facing, h);
        expect(dirFromYaw(headingYaw(yaw, h)), `yaw ${k} at ${h}`).toBe(dirFromVector(seen.x, seen.y));
      }
  });

  it('heading 0 is today’s direction, and each heading step turns the eight directions by two', () => {
    for (let k = 0; k < 8; k++) {
      const yaw = (k * Math.PI) / 4;
      expect(dirFromYaw(headingYaw(yaw, 0))).toBe(dirFromYaw(yaw));
      for (const h of HEADINGS) {
        const i = DIRECTIONS.indexOf(dirFromYaw(yaw));
        expect(dirFromYaw(headingYaw(yaw, h))).toBe(DIRECTIONS[(i + 2 * h) % 8]);
      }
    }
  });

  const SELF = 'me';
  const row = (id: string, name: string, look: string, presence = false): PlayerSnap => ({
    id,
    name,
    traits: { height: 1, scarf: 0, hat: 0 },
    alive: true,
    look,
    presence: presence ? { x: 100, y: 100, yaw: 0, animId: 0, statusBits: 0, transitUntilTick: 0 } : null,
  });
  const avatar = (handle: string, lookOf: string, yaw: number): AvatarSnap => ({
    handle,
    lookOf,
    height: 1,
    x: 160,
    y: 100,
    yaw,
    animId: 0,
    statusBits: 0,
    transitUntilTick: 0,
  });
  const scene = { registry: { get: () => undefined } } as unknown as Phaser.Scene;
  beforeEach(() => void (made.length = 0));

  it('EntityView poses each figure at the heading, and covers and impersonation keep the look of today', () => {
    // `b` walks under `a`'s face (an impersonation, or a cover drawn as another card): the drawn look is `a`'s.
    const roster = [row(SELF, 'Me', 'sheriff', true), row('a', 'Ann', 'baker'), row('b', 'Bo', 'smith')];
    const looks: Array<string | undefined> = [];
    for (const h of HEADINGS) {
      made.length = 0;
      const v = new EntityView(scene, SELF, () => undefined);
      v.setHeading(h);
      const yaw = 0.4;
      v.update(roster, 1000, [avatar('h1', 'a', yaw)], 'own');
      const other = made.find((m) => m.look.lookId === 'baker')!;
      expect(other.dirs.at(-1), `heading ${h}`).toBe(dirFromYaw(headingYaw(yaw, h)));
      looks.push(...made.map((m) => m.look.lookId));
    }
    // The same looks at every heading: only the direction turns.
    expect(new Set(looks)).toEqual(new Set(['sheriff', 'baker']));
  });
});

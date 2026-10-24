import { describe, expect, it } from 'vitest';
import type Phaser from 'phaser';
import { balance } from '@wdi/content';
import { TICK_RATE } from '@wdi/shared/constants';
import type { AvatarSnap, DoorSnap } from '../../net/world';
import { TRAIN_DWELL_MS, TRAIN_ROLL_MS } from './transportSpecs';
import { TransportView } from './TransportView';

/** A Graphics that counts what is drawn into it. */
class FakeGraphics {
  shapes = 0;
  destroyed = false;
  clear() {
    this.shapes = 0;
    return this;
  }
  setDepth() {
    return this;
  }
  fillStyle() {
    return this;
  }
  lineStyle() {
    return this;
  }
  fillTriangle() {
    this.shapes++;
    return this;
  }
  fillEllipse() {
    this.shapes++;
    return this;
  }
  fillRect() {
    this.shapes++;
    return this;
  }
  fillCircle() {
    return this;
  }
  lineBetween() {
    return this;
  }
  destroy() {
    this.destroyed = true;
  }
}

function setup(reduced = false) {
  const made: FakeGraphics[] = [];
  const played: string[] = [];
  const scene = {
    add: { graphics: () => made[made.push(new FakeGraphics()) - 1] },
    cameras: { main: { worldView: { contains: () => true } } },
    registry: { get: () => ({ play: (k: string) => played.push(k) }) },
  };
  const view = new TransportView(scene as unknown as Phaser.Scene, () => reduced);
  return { view, made, played };
}

const avatar = (handle: string, x: number, y: number) => ({ handle, x, y }) as AvatarSnap;
const feed = (doors: DoorSnap[], avatars: AvatarSnap[] = []) => ({
  doors: () => doors,
  avatars: () => avatars,
});
const DOOR = { id: 'ov.tavern_front', x: 1824, y: 2208, kind: 'door', face: 's' };

describe('TransportView (round 8, 8G: motion.md 2)', () => {
  it('draws a door while it swings and clears it once the swing ends', () => {
    const { view, made } = setup();
    const until = 100 + balance.doors.swingS * TICK_RATE;
    const swinging = [{ id: DOOR.id, state: 0, swingUntilTick: until }];
    view.update('overworld', [DOOR], feed([], [avatar('a', DOOR.x, DOOR.y + 30)]), 99, 0);
    view.update('overworld', [DOOR], feed(swinging, [avatar('a', DOOR.x, DOOR.y + 30)]), 100 + TICK_RATE, 0);
    expect(made).toHaveLength(1);
    expect(made[0]!.shapes).toBeGreaterThan(0);
    view.update('overworld', [DOOR], feed(swinging), until, 0);
    expect(made[0]!.destroyed).toBe(true);
  });

  it('starts a new swing when the server extends it, and drops everything on a scene change', () => {
    const { view, made } = setup();
    view.update('overworld', [DOOR], feed([{ id: DOOR.id, state: 0, swingUntilTick: 200 }]), 150, 0);
    view.update('overworld', [DOOR], feed([{ id: DOOR.id, state: 0, swingUntilTick: 260 }]), 160, 0);
    expect(made).toHaveLength(2);
    expect(made[0]!.destroyed).toBe(true);
    view.update('tavern_bar', [], feed([]), 161, 0);
    expect(made[1]!.destroyed).toBe(true);
  });

  it('rolls the Train in on the platform after its arrival pulse and takes it away after the delivery', async () => {
    const { view, made } = setup();
    await view.ready;
    view.update('overworld', [], feed([]), 0, 0);
    view.pulse('train_arrive', 1000);
    view.update('overworld', [], feed([]), 0, 1000 + TRAIN_ROLL_MS);
    expect(made).toHaveLength(1);
    view.pulse('train_brake', 9000);
    view.update('overworld', [], feed([]), 0, 9000 + TRAIN_DWELL_MS + TRAIN_ROLL_MS);
    expect(made[0]!.destroyed).toBe(true);
  });

  it('draws no Train in a scene with no station', async () => {
    const { view, made } = setup();
    await view.ready;
    view.update('bp_camp', [], feed([]), 0, 0);
    view.pulse('train_arrive', 10);
    view.update('bp_camp', [], feed([]), 0, 20);
    expect(made).toHaveLength(0);
  });

  it('sounds a hatch, a ladder and a veil as each starts to swing, and leaves a door to the World', () => {
    const { view, played } = setup();
    const portals = [
      DOOR,
      { id: 'ov.cellar', x: 100, y: 100, kind: 'hatch', face: null },
      { id: 'ov.well', x: 300, y: 100, kind: 'hatch', face: null },
      { id: 'ov.path', x: 500, y: 100, kind: 'edge', face: null },
    ];
    const swings = portals.map((p) => ({ id: p.id, state: 0, swingUntilTick: 200 }));
    view.update('overworld', portals, feed(swings), 150, 0);
    view.update('overworld', portals, feed(swings), 151, 0);
    expect(played).toEqual(['hatch_open', 'ladder_climb', 'portal_veil']);
  });
});

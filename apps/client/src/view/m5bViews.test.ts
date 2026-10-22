import { describe, expect, it } from 'vitest';
import mobsJson from '@wdi/content/data/mobs.json';
import quests from '@wdi/content/data/quests.json';
import resources from '@wdi/content/data/resources.json';
import { screenDirOfYaw } from '@wdi/shared/iso';
import { AnimId, StatusBit } from './animIds';
import { giverAnimKey, giverDir, lanternCarriers, mobAnimKey, mobClip, nodeFrame } from './m5bFrames';
import { M5B_COPY, questLine } from '../ui/copy/m5b';

describe('NodeView frames', () => {
  it('names a ready and a spent frame from the resource row, with the snake-case stem of the content', () => {
    expect(nodeFrame('tinOre', true)).toBe('node_tin_ore/ready');
    expect(nodeFrame('tinOre', false)).toBe('node_tin_ore/spent');
    for (const r of Object.values(resources.resources))
      expect(nodeFrame(r.id, true)).toBe(`${r.sprite}/ready`);
  });
});

describe('MobView clips', () => {
  it('maps the wire animation ids to the atlas clips', () => {
    expect(mobClip(AnimId.idle)).toBe('idle');
    expect(mobClip(AnimId.walk)).toBe('walk');
    expect(mobClip(AnimId.swing)).toBe('attack');
  });
  it('turns the world-frame yaw into the screen-frame direction, as for an avatar', () => {
    expect(mobAnimKey('wolf', AnimId.walk, 0)).toBe(`mob_wolf/walk/${screenDirOfYaw(0)}`);
    expect(mobAnimKey('rat', AnimId.idle, Math.PI / 2)).toBe(`mob_rat/idle/${screenDirOfYaw(Math.PI / 2)}`);
    // World north (-y) is up-left on screen, so it is not the atlas `n`.
    expect(screenDirOfYaw(0)).not.toBe('n');
  });
  it('has a sprite stem for every mob row', () => {
    for (const m of Object.values(mobsJson.mobs))
      expect(mobAnimKey(m.id, 0, 0).startsWith(m.sprite)).toBe(true);
  });
});

describe('GiverView direction', () => {
  it('turns the facing name of the scene file (world frame) into the atlas direction', () => {
    expect(giverDir('w')).toBe('nw');
    expect(giverDir('s')).toBe('sw');
    expect(giverAnimKey('harbourmaster', 'w')).toBe('giver_harbourmaster/idle/nw');
  });
});

describe('lantern carriers (Lighting)', () => {
  const av = (handle: string, statusBits: number, x = 0) => ({
    handle,
    lookOf: 's',
    height: 1,
    x,
    y: 0,
    yaw: 0,
    animId: 0,
    statusBits,
    transitUntilTick: 0,
  });
  it('finds every lit avatar and the own seat once, never a second disc for the own avatar', () => {
    const avatars = [av('me', StatusBit.lantern), av('a', StatusBit.lantern, 64), av('b', 0, 128)];
    const c = lanternCarriers(avatars, 'me', { x: 5, y: 6 }, StatusBit.lantern);
    expect(c.map((x) => [x.key, x.own])).toEqual([
      ['self', true],
      ['a', false],
    ]);
    expect(c[0]).toMatchObject({ x: 5, y: 6 });
  });
  it('shows nothing for an unlit seat and nothing without a viewer', () => {
    expect(lanternCarriers([av('me', 0)], 'me', { x: 0, y: 0 }, 0)).toEqual([]);
    expect(lanternCarriers([], 'me', null, StatusBit.lantern)).toEqual([]);
  });
});

describe('quest copy', () => {
  it('has the giver offer and thanks for every quest copy id of the content', () => {
    for (const q of Object.values(quests.quests)) {
      expect(M5B_COPY[q.copyId as keyof typeof M5B_COPY], q.copyId).toBeTruthy();
      expect(M5B_COPY[`${q.copyId}.done` as keyof typeof M5B_COPY], `${q.copyId}.done`).toBeTruthy();
      expect(questLine(q.copyId).length).toBeLessThanOrEqual(120);
    }
  });
  it('falls back to the id for a line the deck lacks', () => {
    expect(questLine('quest.unknown')).toBe('quest.unknown');
  });
});

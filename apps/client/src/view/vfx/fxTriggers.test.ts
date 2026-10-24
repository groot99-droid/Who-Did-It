import { describe, expect, it } from 'vitest';
import type { AvatarSnap, MobSnap } from '../../net/world';
import { AnimId, StatusBit } from '../animIds';
import { FX, FX_KINDS, STILL_COUNT } from './fxSpecs';
import { R8, STEP_MS, avatarFx, mobFx, type Seen } from './fxTriggers';

const avatar = (animId: number, statusBits = 0): AvatarSnap => ({
  handle: 'h1',
  lookOf: 'baker',
  height: 1,
  x: 100,
  y: 200,
  yaw: 0,
  animId,
  statusBits,
  transitUntilTick: 0,
});
const mob = (animId: number, state = 0): MobSnap => ({
  id: 'm1',
  kind: 'wolf',
  x: 5,
  y: 6,
  yaw: 0,
  animId,
  state,
});
const was = (animId: number, bits = 0, stepAt = 0): Seen => ({ animId, bits, state: 0, stepAt });
const kinds = (r: { fx: Array<{ kind: string }> }) => r.fx.map((e) => e.kind);

describe('effects from the public feed (motion.md 2, round 8 8G)', () => {
  it('keeps the round-8 ids in step with seams.md 2', () => {
    const ids = AnimId as Record<string, number>;
    for (const [name, v] of Object.entries(R8.anim)) expect(ids[name] ?? v, name).toBe(v);
    const bits = StatusBit as Record<string, number>;
    for (const [name, v] of Object.entries(R8.bit)) expect(bits[name] ?? v, name).toBe(v);
  });

  it('shows nothing for a figure first seen, whatever it is doing', () => {
    expect(avatarFx(undefined, avatar(R8.anim.hurt, R8.bit.bleeding), 0).fx).toEqual([]);
    expect(mobFx(undefined, mob(R8.anim.hurt, R8.mobDead), 0).fx).toEqual([]);
  });

  it('sparks on a hit, bleeds and sickens on the bits, at the figure', () => {
    const r = avatarFx(was(AnimId.idle), avatar(R8.anim.hurt, R8.bit.bleeding | R8.bit.poisoned), 0);
    expect(kinds(r)).toEqual(['hitSpark', 'blood', 'poisonPuff']);
    expect(r.fx[0]).toMatchObject({ x: 100, y: 200 });
    // A bit that stays set, or a hurt that carries on, shows nothing more.
    expect(kinds(avatarFx(r.seen, avatar(R8.anim.hurt, R8.bit.bleeding | R8.bit.poisoned), 10))).toEqual([]);
  });

  it('throws dust and stars on a knockdown, crumbs on eating and coins on a robbery', () => {
    expect(kinds(avatarFx(was(AnimId.idle), avatar(R8.anim.knockdown), 0))).toEqual(['fallDust', 'koStars']);
    expect(kinds(avatarFx(was(AnimId.idle), avatar(R8.anim.eat), 0))).toEqual(['crumbs']);
    expect(kinds(avatarFx(was(AnimId.idle), avatar(R8.anim.rob), 0))).toEqual(['coinBurst']);
  });

  it('kicks up dust at the walk and run cadence, and none standing', () => {
    expect(kinds(avatarFx(was(AnimId.walk, 0, 0), avatar(AnimId.walk), STEP_MS.walk - 1))).toEqual([]);
    const r = avatarFx(was(AnimId.walk, 0, 0), avatar(AnimId.walk), STEP_MS.walk);
    expect(kinds(r)).toEqual(['stepDust']);
    expect(r.seen.stepAt).toBe(STEP_MS.walk);
    expect(kinds(avatarFx(was(R8.anim.run, 0, 0), avatar(R8.anim.run), STEP_MS.run))).toEqual(['stepDust']);
    expect(kinds(avatarFx(was(AnimId.idle, 0, 0), avatar(AnimId.idle), 10_000))).toEqual([]);
  });

  it("sparks a creature's hit and dusts its fall", () => {
    expect(kinds(mobFx(was(AnimId.walk), mob(R8.anim.hurt), 0))).toEqual(['hitSpark']);
    expect(kinds(mobFx(was(AnimId.walk), mob(AnimId.idle, R8.mobDead), 0))).toEqual(['fallDust']);
  });

  it('has a spec for every effect of the list, each with a still mark under reduced motion', () => {
    expect(FX_KINDS).toEqual(
      expect.arrayContaining(['coinBurst', 'buildDust', 'ledger', 'mailbag', 'koStars', 'crumbs']),
    );
    for (const k of FX_KINDS) {
      expect(FX[k].count, k).toBeGreaterThanOrEqual(Math.min(STILL_COUNT, 2));
      expect(FX[k].tints.length, k).toBeGreaterThan(0);
      expect(FX[k].lifespanMs, k).toBeLessThanOrEqual(1200);
    }
  });

  it('sounds the hits, the poison, the knockout, the robbery and the creatures, and nothing for a first sighting', () => {
    const cues = (r: { cues: Array<{ key: string }> }) => r.cues.map((c) => c.key);
    expect(cues(avatarFx(was(AnimId.idle), avatar(R8.anim.hurt), 0))).toEqual(['fx_hit']);
    expect(cues(avatarFx(was(AnimId.idle), avatar(AnimId.idle, R8.bit.poisoned), 0))).toEqual(['fx_poison']);
    expect(cues(avatarFx(was(AnimId.idle), avatar(R8.anim.knockdown), 0))).toEqual([
      'fx_fall',
      'fx_knockout',
    ]);
    expect(cues(avatarFx(was(AnimId.idle), avatar(R8.anim.rob), 0))).toEqual(['fx_coins']);
    expect(cues(avatarFx(was(AnimId.idle), avatar(AnimId.walk), 1000))).toEqual([]);
    expect(cues(mobFx(was(AnimId.idle), mob(R8.anim.hurt), 0))).toEqual(['mob_hurt_wolf']);
    expect(cues(mobFx(was(AnimId.idle), { ...mob(R8.anim.hurt), kind: 'rat' }, 0))).toEqual([
      'mob_hurt_small',
    ]);
    expect(cues(mobFx(was(AnimId.idle), mob(AnimId.idle, R8.mobDead), 0))).toEqual(['mob_death']);
    expect(cues(mobFx(was(AnimId.idle), mob(AnimId.swing), 0))).toEqual(['mob_wolf_attack']);
    expect(cues(mobFx(was(AnimId.idle), { ...mob(AnimId.swing), kind: 'boar' }, 0))).toEqual([]);
    expect(cues(mobFx(undefined, mob(AnimId.swing), 0))).toEqual([]);
  });
});

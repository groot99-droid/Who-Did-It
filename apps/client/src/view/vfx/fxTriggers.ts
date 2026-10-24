import type { AvatarSnap, MobSnap } from '../../net/world';
import { AnimId } from '../animIds';
import type { FxKind } from './fxSpecs';
import { mobHurt, type Cue } from './sfx';

/**
 * The round-8 ids of seams.md 2 the effects read. 8A appends them to `animIds.ts`; they are named here so the view
 * builds before that lands, and `fxTriggers.test.ts` keeps them in step.
 */
export const R8 = {
  anim: { hurt: 6, knockdown: 7, run: 10, eat: 19, rob: 20 },
  bit: { bleeding: 32, poisoned: 64, down: 1024 },
  mobDead: 4,
} as const;

/** One effect at a point of the world (px), and the figure it belongs to, if any. */
export interface FxEvent {
  kind: FxKind;
  x: number;
  y: number;
}

/** What a figure's change shows and sounds (`cues` at world px), and what it showed. */
export interface FxResult {
  fx: FxEvent[];
  cues: Cue[];
  seen: Seen;
}

/** What a figure showed last time, enough to see a change. */
export interface Seen {
  animId: number;
  bits: number;
  state: number;
  /** When it last kicked up dust, ms. */
  stepAt: number;
}

/** Footstep dust every this many ms at a walk, and at a run. */
export const STEP_MS = { walk: 420, run: 260 } as const;

const gained = (prev: number, next: number, bit: number) => (prev & bit) === 0 && (next & bit) !== 0;

/**
 * The effects a figure's change shows, the same for every client (motion.md 2): a spark on a hit, blood when the
 * hit leaves it Bleeding, a puff when it is Poisoned, dust and stars as it is knocked down, crumbs as it eats, coins
 * as it robs, and dust at its feet as it walks or runs. Only public fields: `animId` and `statusBits`.
 */
export function avatarFx(prev: Seen | undefined, a: AvatarSnap, now: number): FxResult {
  const fx: FxEvent[] = [];
  const cues: Cue[] = [];
  const at = (kind: FxKind, key?: Cue['key']) => {
    fx.push({ kind, x: a.x, y: a.y });
    if (key) cues.push({ key, x: a.x, y: a.y });
  };
  const seen: Seen = { animId: a.animId, bits: a.statusBits, state: 0, stepAt: prev?.stepAt ?? now };
  if (prev) {
    const began = prev.animId !== a.animId;
    if (began && a.animId === R8.anim.hurt) at('hitSpark', 'fx_hit');
    if (gained(prev.bits, a.statusBits, R8.bit.bleeding)) at('blood');
    if (gained(prev.bits, a.statusBits, R8.bit.poisoned)) at('poisonPuff', 'fx_poison');
    if (began && a.animId === R8.anim.knockdown) {
      at('fallDust', 'fx_fall');
      at('koStars', 'fx_knockout');
    }
    if (began && a.animId === R8.anim.eat) at('crumbs');
    if (began && a.animId === R8.anim.rob) at('coinBurst', 'fx_coins');
  }
  const gait = a.animId === R8.anim.run ? STEP_MS.run : a.animId === AnimId.walk ? STEP_MS.walk : 0;
  if (gait && now - seen.stepAt >= gait) {
    at('stepDust');
    seen.stepAt = now;
  }
  return { fx, cues, seen };
}

/**
 * A creature's effects: a spark and its kind's cry when a hit lands, dust and a thud as it falls dead, and a wolf's
 * snarl as it lunges (`swing`).
 */
export function mobFx(prev: Seen | undefined, m: MobSnap, now: number): FxResult {
  const fx: FxEvent[] = [];
  const cues: Cue[] = [];
  const began = prev !== undefined && prev.animId !== m.animId;
  if (began && m.animId === R8.anim.hurt) {
    fx.push({ kind: 'hitSpark', x: m.x, y: m.y });
    cues.push({ key: mobHurt(m.kind), x: m.x, y: m.y });
  }
  if (prev && prev.state !== R8.mobDead && m.state === R8.mobDead) {
    fx.push({ kind: 'fallDust', x: m.x, y: m.y });
    cues.push({ key: 'mob_death', x: m.x, y: m.y });
  }
  if (began && m.animId === AnimId.swing && m.kind === 'wolf' && m.state !== R8.mobDead)
    cues.push({ key: 'mob_wolf_attack', x: m.x, y: m.y });
  return { fx, cues, seen: { animId: m.animId, bits: 0, state: m.state, stepAt: now } };
}

import effectsJson from '@wdi/content/data/effects.json';
import { EFFECT_KEYS, type EffectKey, TICK_RATE } from '@wdi/shared/constants';
import type { OwnBodySnap, OwnEffectSnap } from '../../net/world';

export type { OwnBodySnap, OwnEffectSnap };

/**
 * The body HUD's model (round 8, 8A; GDD 3.22, docs/UI.md 14.32): pure functions from this seat's `Private.body`
 * and the clock to what the panel shows. `BodyHud.ts` draws it; 8H animates the classes. No number of
 * `balance.json` lives here: the states are read from the effects the server derived (Wounded, Fatigued, Knocked out).
 */

export type HealthState = 'whole' | 'wounded' | 'down';
export type StaminaState = 'fresh' | 'fatigued';

export interface EffectChip {
  key: EffectKey;
  /** The row's name in `effects.json`. */
  label: string;
  /** Whole seconds left, or null for an effect that lasts until cured or until its condition ends. */
  secondsLeft: number | null;
  stacks: number;
}

export interface BodyHudModel {
  /** False while the row is empty (the lobby, the card, a ghost): the panel hides. */
  shown: boolean;
  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
  /** 0 to 100, whole numbers; a sliver of health still reads 1. */
  hpPct: number;
  staminaPct: number;
  health: HealthState;
  staminaState: StaminaState;
  effects: EffectChip[];
}

const NAMES: Record<string, string> = Object.fromEntries(
  Object.values(effectsJson.effects).map((row) => [row.id, row.name]),
);

/** The `effects.json` key of a wire id, or null for an id this client does not know (a newer server). */
export function effectKeyOf(id: number): EffectKey | null {
  return EFFECT_KEYS[id - 1] ?? null;
}

/** The row's name, for a chip; the key itself when no row carries one. */
export function effectLabel(key: EffectKey): string {
  return NAMES[key] ?? key;
}

/** A share as a whole percentage that never rounds a remainder down to nothing. */
export function percent(value: number, max: number): number {
  if (!(max > 0) || !(value > 0)) return 0;
  return Math.max(1, Math.min(100, Math.round((value / max) * 100)));
}

/** Whole seconds from `tick` to `untilTick`, never negative; null for 0 (lasts until cured). */
export function secondsLeft(untilTick: number, tick: number): number | null {
  if (untilTick <= 0) return null;
  return Math.max(0, Math.ceil((untilTick - tick) / TICK_RATE));
}

/** The panel's model for this tick. */
export function bodyHudModel(body: OwnBodySnap | null, tick: number): BodyHudModel {
  if (body === null || body.maxHp <= 0) {
    return {
      shown: false,
      hp: 0,
      maxHp: 0,
      stamina: 0,
      maxStamina: 0,
      hpPct: 0,
      staminaPct: 0,
      health: 'whole',
      staminaState: 'fresh',
      effects: [],
    };
  }
  const effects: EffectChip[] = [];
  const keys = new Set<EffectKey>();
  for (const e of body.effects) {
    const key = effectKeyOf(e.id);
    if (key === null) continue;
    keys.add(key);
    effects.push({
      key,
      label: effectLabel(key),
      secondsLeft: secondsLeft(e.untilTick, tick),
      stacks: e.stacks,
    });
  }
  // Timed effects first, the soonest to pass at the front; the lasting ones after, in wire order.
  effects.sort((a, b) => (a.secondsLeft ?? Infinity) - (b.secondsLeft ?? Infinity));
  return {
    shown: true,
    hp: body.hp,
    maxHp: body.maxHp,
    stamina: body.stamina,
    maxStamina: body.maxStamina,
    hpPct: percent(body.hp, body.maxHp),
    staminaPct: percent(body.stamina, body.maxStamina),
    health: keys.has('knockedOut') ? 'down' : keys.has('wounded') ? 'wounded' : 'whole',
    staminaState: keys.has('fatigued') ? 'fatigued' : 'fresh',
    effects,
  };
}

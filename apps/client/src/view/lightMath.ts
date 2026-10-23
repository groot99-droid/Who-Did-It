// The numbers of the lighting layer (SPRITES 10.10, 10.11; GDD 3.13), pure so they are tested without a renderer.
import balance from '@wdi/content/data/balance.json';
import metrics from '@wdi/content/data/metrics.json';
import palette from '@wdi/content/data/palette.json';
import { TICK_RATE, TILE_PX } from '@wdi/shared/constants';
import { radiusEllipse, toScreen } from '@wdi/shared/iso';
import type { DayPart } from './dayPart';
import type { MapObject } from './sceneMap';

const L = metrics.lighting;

/** Weighted, so both ends come back exactly (`a + (b - a) * t` gives 0.8999... for 0.2 to 0.9 at 1). */
export const lerp = (a: number, b: number, t: number): number => {
  const k = Math.min(1, Math.max(0, t));
  return (1 - k) * a + k * b;
};

const rgb = (hex: string): [number, number, number] => {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
};
const lerpColour = (a: string, b: string, t: number): number => {
  const [ar, ag, ab] = rgb(a);
  const [br, bg, bb] = rgb(b);
  return (
    (Math.round(lerp(ar, br, t)) << 16) | (Math.round(lerp(ag, bg, t)) << 8) | Math.round(lerp(ab, bb, t))
  );
};

type Token = keyof typeof palette.colors;
const token = (t: string): string => palette.colors[t as Token];

/**
 * The ambient darkness: outside dark scenes `ambient.day` eased to `ambient.night` by `darkness`; in a dark scene
 * `ambient.dark` in every phase (SPRITES 10.11).
 */
export function ambientFor(darkness: number, dark: boolean): { colour: number; alpha: number } {
  if (dark)
    return { colour: Number.parseInt(token(L.ambient.dark.color).slice(1), 16), alpha: L.ambient.dark.alpha };
  return {
    colour: lerpColour(token(L.ambient.day.color), token(L.ambient.night.color), darkness),
    alpha: lerp(L.ambient.day.alpha, L.ambient.night.alpha, darkness),
  };
}

/** Your vision radius in tiles: `balance.vision` eased by darkness, the night radius in a dark scene (SPRITES 10.10). */
export function visionTiles(darkness: number, dark: boolean): number {
  return dark
    ? balance.vision.nightTiles
    : lerp(balance.vision.dayTiles, balance.vision.nightTiles, darkness);
}

/** The alpha of the light texture at `t` of its radius: opaque to `lightCore`, then linear to 0 at the edge. */
export function lightAlphaAt(t: number): number {
  if (t <= L.lightCore) return 1;
  return Math.max(0, (1 - t) / (1 - L.lightCore));
}

/** Whether a light burns now: its `phases` (a comma list, empty or missing for always) holds the part of the day. */
export function burnsIn(phases: unknown, part: DayPart): boolean {
  if (typeof phases !== 'string' || phases.trim() === '') return true;
  return phases.split(',').some((p) => p.trim() === part);
}

/** A light of the scene, from its `lights` object. */
export interface SceneLight {
  id: string;
  kind: string;
  /** Pool centre, world px (the centre of its tile). */
  x: number;
  y: number;
  radiusTiles: number;
  /** Palette token. */
  colour: string;
  phases: unknown;
}

/** The default colour token of a light kind (WORLD 4.7): moss teal, moon and shaft moon, the rest lantern. */
export function defaultLightColour(kind: string): string {
  if (kind === 'moss') return 'teal';
  if (kind === 'moon' || kind === 'shaft') return 'moon';
  return 'lantern';
}

export function sceneLights(objects: MapObject[]): SceneLight[] {
  return objects.map((o) => ({
    id: o.name,
    kind: o.type,
    x: o.x + TILE_PX / 2,
    y: o.y + TILE_PX / 2,
    radiusTiles: typeof o.props.radiusTiles === 'number' ? o.props.radiusTiles : 2,
    colour:
      typeof o.props.color === 'string' && o.props.color !== '' ? o.props.color : defaultLightColour(o.type),
    phases: o.props.phases,
  }));
}

/** A stable phase offset in [0, 1) from a light's id, so neighbouring flames do not flicker together. */
export function idPhase(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

/** Torches and fires wobble their radius by `flicker.amp` at `flicker.hz`; other lights hold still. */
export function flickerRadius(kind: string, rTiles: number, timeMs: number, id: string): number {
  if (kind !== 'torch' && kind !== 'fire') return rTiles;
  const wobble = Math.sin((timeMs / 1000) * L.flicker.hz * Math.PI * 2 + idPhase(id) * Math.PI * 2);
  return rTiles * (1 + L.flicker.amp * wobble);
}

export interface Pool {
  /** Centre on the darkness texture, px. */
  x: number;
  y: number;
  /** Full width and height of the ellipse, px. */
  width: number;
  height: number;
}

/**
 * Where a pool of `rTiles` tiles at world point (wx, wy) lands on the darkness texture: the projected point less the
 * camera's world view, times the zoom, as an ellipse of `radiusEllipse(r)` (SPRITES 10.11).
 */
export function poolOnScreen(
  wx: number,
  wy: number,
  rTiles: number,
  zoom: number,
  view: { x: number; y: number },
): Pool {
  const s = toScreen(wx, wy);
  const e = radiusEllipse(rTiles);
  return {
    x: (s.x - view.x) * zoom,
    y: (s.y - view.y) * zoom,
    width: 2 * e.rx * zoom,
    height: 2 * e.ry * zoom,
  };
}

/** Alpha of a light's glow: `glowAlpha` times the darkness (SPRITES 10.11). */
export const glowAlpha = (darkness: number): number => L.glowAlpha * darkness;

const PHASE = { dusk: 4, night: 5, dawn: 6, finalNight: 11 } as const;

/**
 * 0 in full day, 1 at night; dusk (and dawn, eased the same way) goes between them over its length.
 * `duskTicks` is that length: `balance.phases.duskS` by default.
 */
export function darknessOf(
  phase: number,
  ticksLeft: number,
  duskTicks = balance.phases.duskS * TICK_RATE,
): number {
  if (phase === PHASE.night || phase === PHASE.finalNight) return 1;
  if (phase === PHASE.dusk || phase === PHASE.dawn)
    return 1 - Math.min(1, Math.max(0, ticksLeft / duskTicks));
  return 0;
}

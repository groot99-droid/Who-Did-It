import palette from '@wdi/content/data/palette.json';

/**
 * Round 8 (8G, motion.md 2): the effects, drawn as runtime particles from a few shapes the client draws at boot, so
 * they cost no atlas page (A142) and scale with any figure. Colours are steps of the world ramps.
 */
export const FX_KINDS = [
  'hitSpark',
  'blood',
  'poisonPuff',
  'coinBurst',
  'stepDust',
  'fallDust',
  'koStars',
  'crumbs',
  'buildDust',
  'ledger',
  'mailbag',
] as const;
export type FxKind = (typeof FX_KINDS)[number];

/** The particle shapes, each a small texture `fx_<shape>` drawn once at boot. */
export const FX_SHAPES = ['spark', 'drop', 'puff', 'coin', 'star', 'chip', 'slip'] as const;
export type FxShape = (typeof FX_SHAPES)[number];

const ramps = palette.world.ramps as Record<string, string[]>;
/** A world ramp step as a Phaser colour number. */
export const ramp = (name: string, i: number): number => parseInt(ramps[name]![i]!.slice(1), 16);

export interface FxSpec {
  shape: FxShape;
  /** Tints picked at random per particle. */
  tints: readonly number[];
  count: number;
  /** Speed in px/s, the launch angle range in degrees (Phaser: 0 is right, -90 up) and gravity in px/s². */
  speed: readonly [number, number];
  angle: readonly [number, number];
  gravity: number;
  lifespanMs: number;
  scale: readonly [start: number, end: number];
  /** Height above the feet the burst starts at, in px. */
  lift: number;
  /** Spin in degrees per lifespan, for slips, coins and stars. */
  spin?: number;
}

const UP: readonly [number, number] = [-160, -20];
const ROUND: readonly [number, number] = [0, 360];

export const FX: Readonly<Record<FxKind, FxSpec>> = {
  hitSpark: {
    shape: 'spark',
    tints: [ramp('bone', 3), ramp('lantern', 3)],
    count: 8,
    speed: [90, 170],
    angle: ROUND,
    gravity: 0,
    lifespanMs: 360,
    scale: [1, 0.2],
    lift: 34,
  },
  blood: {
    shape: 'drop',
    tints: [ramp('blood', 1), ramp('blood', 2)],
    count: 9,
    speed: [50, 120],
    angle: UP,
    gravity: 420,
    lifespanMs: 520,
    scale: [1, 0.6],
    lift: 30,
  },
  poisonPuff: {
    shape: 'puff',
    tints: [ramp('moss', 3), ramp('moss', 4)],
    count: 6,
    speed: [12, 30],
    angle: [-120, -60],
    gravity: -20,
    lifespanMs: 900,
    scale: [0.6, 1.4],
    lift: 40,
  },
  coinBurst: {
    shape: 'coin',
    tints: [ramp('brass', 2), ramp('lantern', 2)],
    count: 10,
    speed: [80, 150],
    angle: [-150, -30],
    gravity: 480,
    lifespanMs: 700,
    scale: [1, 1],
    lift: 26,
    spin: 720,
  },
  stepDust: {
    shape: 'puff',
    tints: [ramp('fog', 1)],
    count: 2,
    speed: [6, 14],
    angle: [-170, -10],
    gravity: 0,
    lifespanMs: 380,
    scale: [0.35, 0.7],
    lift: 2,
  },
  fallDust: {
    shape: 'puff',
    tints: [ramp('fog', 1), ramp('fog', 2)],
    count: 8,
    speed: [30, 70],
    angle: [-180, 0],
    gravity: 0,
    lifespanMs: 600,
    scale: [0.6, 1.3],
    lift: 4,
  },
  koStars: {
    shape: 'star',
    tints: [ramp('lantern', 3), ramp('bone', 3)],
    count: 5,
    speed: [30, 55],
    angle: [-150, -30],
    gravity: 30,
    lifespanMs: 900,
    scale: [1, 0.5],
    lift: 44,
    spin: 360,
  },
  crumbs: {
    shape: 'chip',
    tints: [ramp('plaster', 2), ramp('wood', 4)],
    count: 6,
    speed: [30, 70],
    angle: [-140, -40],
    gravity: 380,
    lifespanMs: 500,
    scale: [0.8, 0.6],
    lift: 36,
  },
  buildDust: {
    shape: 'puff',
    tints: [ramp('plaster', 2), ramp('fog', 2)],
    count: 16,
    speed: [30, 90],
    angle: [-180, 0],
    gravity: -10,
    lifespanMs: 1100,
    scale: [0.8, 1.8],
    lift: 10,
  },
  ledger: {
    shape: 'slip',
    tints: [ramp('bone', 3), ramp('plaster', 3)],
    count: 4,
    speed: [30, 60],
    angle: [-120, -60],
    gravity: 60,
    lifespanMs: 1000,
    scale: [1, 0.8],
    lift: 40,
    spin: 270,
  },
  mailbag: {
    shape: 'slip',
    tints: [ramp('bone', 2), ramp('plaster', 3), ramp('bone', 3)],
    count: 7,
    speed: [40, 80],
    angle: [-135, -45],
    gravity: 80,
    lifespanMs: 1200,
    scale: [1, 0.8],
    lift: 30,
    spin: 360,
  },
};

/** Under reduced motion an effect is a static mark: this many of its particles, still, for `STILL_MS`. */
export const STILL_COUNT = 3;
export const STILL_MS = 400;

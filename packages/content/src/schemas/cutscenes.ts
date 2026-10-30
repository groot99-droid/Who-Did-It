import { z } from 'zod';
import { GddRef, Id, WorldId } from './common.js';

// Cutscenes (GDD 3.18, round 6, Session 6J; docs/round6/cutscene-music.md 1.1). A cutscene is data played in-engine
// by the client; caption text lives in the client's copy modules by copy id, durations live here. The index maps a
// death cause and a map to a cutscene id. Pre-seeded by 6Z with an empty index; 6J fills it.

const Tile = z.strictObject({ x: z.number().int().nonnegative(), y: z.number().int().nonnegative() });
const Seconds = z.number().positive();

/**
 * `DeathCause` of the protocol, as the index keys it; `vanished` never has a cutscene. Round 8 (8A, GDD 3.22) adds
 * `creature` (a boar, bat or rat bite); round 10 (A6) retires `bled` and `sickened`.
 */
export const CutsceneDeathCause = z.enum(['knife', 'ejected', 'poison', 'shot', 'wolf', 'creature']);
export type CutsceneDeathCause = z.infer<typeof CutsceneDeathCause>;

export const CutsceneKind = z.enum(['opening', 'death', 'memorial']);
export type CutsceneKind = z.infer<typeof CutsceneKind>;

const withPrevious = { withPrevious: z.boolean().optional() };

export const CutsceneStep = z.discriminatedUnion('t', [
  z.strictObject({
    t: z.literal('camera'),
    sceneId: WorldId,
    from: Tile,
    to: Tile,
    zoomFrom: z.number().positive().optional(),
    zoomTo: z.number().positive().optional(),
    durationS: Seconds,
    ease: z.enum(['linear', 'sine', 'quad']),
    ...withPrevious,
  }),
  z.strictObject({
    t: z.literal('caption'),
    /** A copy id of the client's `ui/copy/cutscenes.ts`; the text never lives here. */
    copyId: z.string().regex(/^[a-z][A-Za-z0-9.]*$/),
    durationS: Seconds,
    style: z.enum(['narrator', 'title', 'whisper']),
    ...withPrevious,
  }),
  /** An `AudioBus` key: an SFX, or a `narr_*` or `sting_*` key. */
  z.strictObject({ t: z.literal('audio'), key: z.string().min(1), ...withPrevious }),
  z.strictObject({ t: z.literal('vfx'), kind: Id, sceneId: WorldId, at: Tile, ...withPrevious }),
  z.strictObject({ t: z.literal('wait'), durationS: Seconds }),
  /** The own role chip slams in (an opening's last step). */
  z.strictObject({ t: z.literal('cardSlam'), ...withPrevious }),
  /** A key of `assets/video/manifest.json`; memorials only (round 7). */
  z.strictObject({ t: z.literal('video'), key: z.string().min(1) }),
  /** Death only: hold the last frame until the ghost handoff. */
  z.strictObject({ t: z.literal('hold') }),
]);
export type CutsceneStep = z.infer<typeof CutsceneStep>;

export const Cutscene = z.strictObject({
  id: Id,
  kind: CutsceneKind,
  skippable: z.boolean(),
  /** The whole timeline is clamped to this many seconds. */
  maxS: Seconds,
  steps: z.array(CutsceneStep).min(1),
});
export type Cutscene = z.infer<typeof Cutscene>;

/** `cutscenes/cutscenes.json`: the index, plus every cutscene by id. */
export const CutscenesFile = z.strictObject({
  gddRef: GddRef,
  /** Death cause -> cutscene id. */
  deaths: z.partialRecord(CutsceneDeathCause, Id),
  /** Map id -> opening cutscene id. */
  openings: z.record(WorldId, Id),
  cutscenes: z.record(Id, Cutscene),
});
export type CutscenesFile = z.infer<typeof CutscenesFile>;

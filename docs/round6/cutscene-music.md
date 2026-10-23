# Round-6 contract: cutscenes, loading, transitions, the trailer, music

The owner's request: "dying cutscenes, opening cutscenes, gameplay music playlists, starting screen trailers and
animations for loading, transitioning and more." The decisions (DECISIONS A81): cutscenes are **in-engine and
data-driven**, with only two real videos (`media.md` 3); **every sound comes from the ROSW sound library**
(the owner's tracks ingested as a batch, the stingers and ambiences picked from the catalog; `media.md` 1 and
4), with CC0 beds only for a playlist slot the library cannot fill, lazy-loaded per map under its own budget. Sessions: 6J (cutscenes), 6K (loading,
transitions, the trailer, the media budgets), 6L (music and the settings panel), 6N (the binaries). The rules
go in GDD 3.18 (6J and 6L write their lines), the seconds in `balance.json`. Paths shorten `apps/client/src/`
to `client/` and `apps/server/src/` to `server/`.

## 1. Cutscenes (6J)

### 1.1 Data

`packages/content/data/cutscenes/<id>.json`, one file per cutscene, and `cutscenes.json`, the index; zod
`packages/content/src/schemas/cutscenes.ts` (pre-seeded, `strictObject`, the index empty of ids until 6J):

```ts
Cutscene { id: Id; kind: 'opening' | 'death' | 'memorial'; skippable: boolean; maxS: number; steps: Step[] }
Step =
  | { t: 'camera'; sceneId: SceneId; from: Tile; to: Tile; zoomFrom?: number; zoomTo?: number; durationS: number; ease: 'linear' | 'sine' | 'quad' }
  | { t: 'caption'; copyId: string; durationS: number; style: 'narrator' | 'title' | 'whisper' }
  | { t: 'audio'; key: AudioKey }                     // an SFX or a narr_* / sting_* key
  | { t: 'vfx'; kind: string; sceneId: SceneId; at: Tile }
  | { t: 'wait'; durationS: number }
  | { t: 'cardSlam' }                                 // the own role chip slams in (opening only)
  | { t: 'video'; key: string }                       // memorial only; a key of assets/video/manifest.json
  | { t: 'hold' }                                     // death only: hold the last frame until the ghost handoff
```

Any step may carry `withPrevious: true` to start with the step before it. `cutscenes.json` maps `deaths:
{ knife, poison, shot, ejected, wolf }` and `openings: { hollowmere, blackpine }` to cutscene ids; `vanished`
has no cutscene. **Caption text lives in `client/ui/copy/cutscenes.ts` by copy id** (the bug #126 convention),
**durations in content**, never the other way round. The HollowMere opening narration is the Bible's Book I.1
trimmed to captions of at most 90 characters each; the Port-au-Levain and BlackPine openings are round-7 and
round-8 content (BlackPine ships a two-step camera pan with no narrator in round 6).

### 1.2 Wire and server

- `S2C.cutscene { id: string; scope?: 'all' }` (pre-seeded). Round 6 sends it once, for the opening; the
  `scope: 'all'` form is the round-7 memorial seam (`bible-seams.md` 2.1).
- `killed` gains `cutsceneId?: string` (pre-seeded optional field): `Death.ts markDead` adds
  `cutsceneId: deathCutsceneFor(cause)` to the existing payload (pre-seeded line; the pure rule
  `packages/shared/src/rules/cutscenes.ts`, 6J fills, returns the id from the index or null).
- **The opening** is sent in `lobby.ts beginPlay` after `publishLooks` (pre-seeded line, 6J fills):
  `room.broadcast(S2C.cutscene, { id: openingFor(mapIdOfRoom(room)) })` and `setPhase(Phase.grace,
  p.graceS + p.openingS)`. `balance.phases.openingS` (pre-seeded `0`; 6J sets it with the GDD 3.3 line in the
  same PR). **Round 7 (7A, A101):** grace grows by the opening's own `maxS`, which equals its intro track's
  length rounded down (HollowMere 117 s, BlackPine 80 s); `openingS` (120) is only the cap. **No new phase**: NPCs walk during the pan, the grace just runs longer, and a seat that skips sees
  the world under the remaining grace. Order on the client: role card (20 s; the cover pick closes with it) ->
  `beginPlay` -> the opening pan with the narrator -> `cardSlam` of the known chip -> grace.
- The server never waits for a client to finish a cutscene.

### 1.3 Client

- `client/view/cutscene/sequencer.ts` (pre-seeded, 6J fills): pure `planTimeline(cutscene): TimelineEntry[]`
  (absolute start times, `withPrevious` resolved, total clamped to `maxS`) and `advance(timeline, nowMs)`.
  Unit-tested without Phaser.
- `client/view/cutscene/CutscenePlayer.ts` (pre-seeded no-op, 6J fills): `play(cutscene, ctx): Promise<'done' |
  'skipped'>`; `ctx` gives it the camera (`pan`, `zoomTo`, `pan` on the scene's `GroundView` bounds), the DOM
  overlay root for `Captions.ts`, the `AudioBus` and the input for Skip (Esc, a tap on the Skip button, both
  only when `skippable`). Under `prefers-reduced-motion` camera steps become cuts; `?cutscene=0` (dev flag in
  `view/devFlags.ts`) disables every cutscene.
- **Round 7 (7A, A101): shots in other scenes.** A `camera` step whose `sceneId` is not the scene the seat stands in
  is filmed on `cutscene/CutsceneStage.ts`, a Phaser scene launched over the World for the cutscene: it loads the
  cutscene's other maps at the start, builds one scene's `GroundView` and `StaticView` per shot as the World does,
  and is stopped when the cutscene ends (`cutscene/staging.ts` holds the Phaser-free decisions; a shot whose map has
  not loaded holds the shot before). A change of scene between shots is a 250 ms dip from black, none under
  reduce-motion, where moves stay cuts. A vfx `dip` is a longer one. No `World.ts` line changes.
- **Round 7 (7A, A101): the `video` step.** `cutscene/video.ts` finds the step's `key` in
  `assets/video/manifest.json` (fetched once) and mounts a full-frame `<video playsinline>` at the back of the
  cutscene layer, under the captions and Skip; its sound follows the music slider and mute, falling back to muted when
  autoplay with sound is refused. The step is open-ended (`sequencer.ts`), so captions over it carry `withPrevious`;
  the cutscene finishes `done` when the video ends, and Skip, Esc or `maxS` release the stream. A missing row or a
  decode error drops the picture with a warning and the cutscene runs on.
- `World.ts` plays the opening after its `fadeIn` (`client/scenes/World.ts:263`) when `REG_CUTSCENE` is set
  (pre-seeded registry key and the mount line; `worldRouter.ts` sets it from the `cutscene` feed event); the
  `onKilled` handler plays the death cutscene of `killed.cutsceneId` and then enters ghost mode exactly as
  today (`refreshGhost`). The HUD and the input are hidden while a cutscene plays.
- `net/world.ts` `WorldFeedEvents.cutscene` (pre-seeded type); `worldColyseus.ts` routes `S2C.cutscene`;
  `mock/worldMock.ts` emits the Hollowmere opening at mock Start.
- Tests: the sequencer; `e2e/cutscene.spec.ts` on the mock asserts the first caption, Skip, and the ghost
  handoff after a mock kill.

## 2. Loading and transitions (6K)

- **`client/view/LoadingScreen.ts`** (pre-seeded no-op, 6K fills): a DOM overlay with a progress bar bound to
  `Phaser.Loader.Events.PROGRESS`, shown only once a load has run past 300 ms, with a tip every 4 s from
  `client/ui/copy/tips.ts` (no role tells: tips describe controls and the world, never a role's powers).
  Mounted in `Preload.ts` (pre-seeded line) and in the match preloads (the map's manifests on Start). On a match
  load it asks `MusicBus` for the map's `loading` class (`music.json`; the owner's per-map speech-and-music pieces,
  `media.md` 1 and 4), which keeps playing under the opening cutscene until the first `phaseChange` picks `day`;
  the load never waits for the piece.
- **`client/view/Transition.ts`** (pre-seeded no-op, 6K fills): a full-screen DOM layer with `fade`, `iris`
  and `wipe`; `transition(kind, ms, then)` runs `then` on `transitionend` or a timeout fallback, synchronously
  when `ms` is 0 (the pre-seeded value, and every duration under `prefers-reduced-motion`), so the router's
  scene starts keep their timing until 6K sets the seconds. `worldRouter.ts` wraps its three `scene.start`s (pre-seeded calls:
  `sceneEnter` fade, `meetingStart` iris, `gameOver` wipe at `worldRouter.ts:75`, `:86`, `:96`). Durations
  in `balance.json ui.transitionS { fade, iris, wipe }` (pre-seeded zeros; 6K sets them with the GDD 3.13
  line). `World.ts`'s own camera `fadeIn` stays (6K does not touch it).
- **The landing trailer**: `ui/Landing.ts` gains `<video muted loop playsinline autoplay preload="none"
  poster>` on `assets/video/landing_loop.webm` (6N's file; a missing file shows the poster), skipped under
  `prefers-reduced-motion`, `navigator.connection.saveData` or `?video=0`. Its soundtrack (`trailer`) plays
  only after the first tap, through `MusicBus` (autoplay policy).
- **Budgets**: `tools/sprites/test/media.test.ts` (pre-seeded skeleton, 6K fills) sums `audio/manifest.json`
  (SFX and ambience <= 6 MB), `audio/music/manifest.json` (<= 12 MB in all, <= 4 MB per map), every entry of
  `assets/video/manifest.json` (<= 2 MB each), the first load (<= 12 MB: everything `Preload.ts` queues plus the
  Hollowmere map) and `public/assets` (<= 150 MB). 6K writes the ASSETS 6.8 text.

## 3. Music (6L)

- **`apps/client/public/assets/audio/music/manifest.json`** (6L's shape; 6N fills the rows):
  `{ tracks: [{ key, url, gain, durationS, bytes, map?: MapId }], playlists: [{ id, tracks: string[], crossfadeS,
  shuffle, loop? }] }`. A track with `map` counts against that map's 4 MB; a track without one counts against every
  map it is listed under. `loop: false` (round 7, 7A) plays a playlist once and leaves the bus silent at its end
  (`MusicBus.onFinish` tells the director); a playlist without it loops.
- **Round 7 (7A, DECISIONS A101): the opening piece.** The owner's `load_hollowmere` and `load_blackpine` are the
  maps' intro tracks, in the `<map>_opening` playlists (`loop: false`) of the `opening` class. No map lists a
  `loading` playlist, so the match load leaves the bus alone and the lobby piece plays on: the opening's `cutscene`
  message reaches the client before the World preloads, and a `loading` request then cut the opening piece off
  0.2 s after it began (the owner's report of 2026-10-23, A101). The director starts `opening` when the router leaves the opening's id
  under `REG_CUTSCENE`, holds every phase class until the piece ends or the player emits `CUTSCENE_END` with
  `skipped` (`cutscene/sequencer.ts`), then cross-fades to the class the phase wants (the `day` during grace).
- **`packages/content/data/music.json`** (pre-seeded empty, zod `schemas/music.ts`): `byMap[map][class]` ->
  playlist id, classes `loading | opening | lobby | day | dusk | night | meeting | finalNight | gameOver`, plus `onub: { kitchen,
  night, rush, over }`. The validator checks every playlist id exists in the manifest shape (a test over the
  committed manifest). Numbers (`crossfadeS`, `gain`) live in the manifest, the mapping in content.
- **`client/view/MusicBus.ts`** (pre-seeded no-op, 6L fills): two `<audio>` elements, `crossfadeTo(playlistId)`,
  `setVolume`, `setMuted`, lazy `src` (a track is fetched when first needed), `prefetch(playlistId)` called when
  the map is picked in the lobby. **`client/view/MusicDirector.ts`** (pre-seeded no-op): listens to
  `phaseChange`, the lobby, `meetingStart` and `gameOver` on the net bus and picks the class; the ONUB classes
  come from the Kitchen and Night scenes. The server sends no music message.
- **Settings**: `localStorage['wdi:audio'] = { music, sfx, muted }` beside `wdi:art` (`client/flags/index.ts`,
  `view/audioSettings.ts`); `ui/SettingsPanel.ts` (a gear on Landing, Lobby and the HUD) with two sliders and a
  mute; `AudioBus.setSfxVolume` (6L's API addition). Music keys are data-driven; `AUDIO_KEYS` (`view/AudioBus.ts:4`)
  stays the SFX union plus the `narr_*` and `sting_*` keys of `media.md` 4.
- GDD 3.18 gets the music lines (which class plays when, the lazy-load rule); 6N's tracks arrive through
  `media.md`, from the ROSW sound library by catalog id; 6L fills a slot from the library before any CC0 bed
  (`media.md` 4).

## 4. Order and ownership

6J, 6K and 6L run in parallel from 6Z's pre-seed and touch different files; the one shared point is
`worldRouter.ts`, whose transition wrappers and `REG_CUTSCENE` line are pre-seeded and locked. 6N delivers the
binaries last, when `media.test.ts` passes with them, and edits no `.ts`.

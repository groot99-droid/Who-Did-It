# Map intro tracks and cinematic openings (7A)

The owner, 2026-10-23: "the other music files were for the world theme music. the files titled HollowMere,
BlackPine and Port AU Levain are the intro tracks they need to play for their exact lengths and they do not
loop, increase the lengths of overview of the maps, also choose more dynamic and cinematic trailers for the maps,
dont just pan around, and feature the rooms and the caves". DECISIONS A101 (7A) records the per-map length.

## 1. Findings (6Z, 2026-10-23)

The three pieces ship as `load_hollowmere.ogg`, `load_blackpine.ogg` and `load_port_au_levain.ogg` in the
`loading` class of `music.json`; `MusicBus` loops a one-track playlist, so they loop today. The opening cutscene
is clamped to `phases.openingS` (`validate.ts`) and grace is `graceS + openingS` (`handlers/lobby.ts`).
`CutscenePlayer` pans only the scene the player stands in, so rooms and caves need other scenes staged.
`openingHollowmere` is 22 steps; `openingBlackpine` is short and has no narrator. Port-au-Levain's map is
round 8 (A96 keeps its piece out of every playlist until then).

## 2. The contract

- **Music**: a class `opening` per map in `music.json`; playlists carry `loop: false`; a once-only playlist goes
  silent at its end; the director starts the opening class when the opening's `cutscene` message arrives and
  lets it play whole, crossfading to `day` only after the track ends or the cutscene is skipped. The `loading`
  class no longer holds the owner's three pieces; the day themes are untouched.
- **Length**: each opening runs its track's measured length (GDD 3.3 and 3.18 carry the figures; `openingS`
  becomes the cap); the server lengthens grace by the chosen map's opening length, read from the cutscene data,
  not from the flat number; content validation requires an opening's total to match its track within a second.
- **Cinema**: a `camera` step whose `sceneId` is not the current scene stages that scene (tilemap and statics,
  built by the World's own scene-build path, disposed after the shot), with cuts and zoom pushes between shots;
  the openings visit the rooms and the caves of their map with the narration spread over the whole piece and
  `cardSlam` last. In-engine only, no video (A81, the media caps).
- **The `video` step**: 7I's memorial cutscene (`vendettas.md` 3) is the first to use the schema's `video` step;
  7A renders it in `CutscenePlayer` (a full-frame `<video>` from the video manifest, captions over it, Skip as
  for every cutscene) as its last step, so 7I never edits the player.
- **Out**: the Port-au-Levain opening moves to round 8 with its map (`bible-seams.md` 2.1 had it here; the
  player stages real scenes now, and the map does not exist yet). A105 records the change.

Owner: 7A. Files: `music.json`, `cutscenes.json` and their schemas, `view/{MusicBus,MusicDirector}.ts`,
`view/cutscene/**`, the grace line of `handlers/lobby.ts`, the cap in `validate.ts`, GDD 3.3 and 3.18,
`docs/round6/cutscene-music.md` 1 and 3, DECISIONS A101, UI.md 14.20 if a caption line changes.

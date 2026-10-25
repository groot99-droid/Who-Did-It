# Admin Studio: creative mode, the room editor and reports (owner request, 2026-10-25)

The owner's words: "could you create a way for me to do all those editing features specifically built for this
application, like blender but only relevant tools?" and "a direct link for trouble shooting for me, when i walk
around the game in this creative mode, i have access to take screen shots, write a message that you can pick up
later, etc. basically give me all the tools necessary to get in there and do the real work. these are all admin
tools btw."

This document is the contract for sessions 9S (server, Opus) and 9T (client, Sonnet). It is tooling: nothing in a
`party` room changes, no game rule changes, and `GDD.md` gains only a short 3.19 paragraph naming the Studio (9S).
Paths shorten `apps/server/src/` to `server/` and `apps/client/src/` to `client/`.

## 1. The link and the gate

- **The link:** `https://groot99-droid.github.io/Who-Did-It/#/studio`. Same sign-in as `#/admin`: GitHub says who
  the browser is, `WDI_ADMIN_GITHUB_LOGINS` decides, and the signed bearer token of `server/services/adminAuth.ts`
  travels in the join options. No password, no cookie (ARCHITECTURE 5.11).
- **`StudioRoom`** (`server/rooms/StudioRoom.ts`, new) registers only beside `AdminRoom`, when `adminConfig` is not
  null (`server/server.ts:28`). It refuses a join without a valid admin token. It is never a `party` room, deals no
  cards and runs no match, so role secrecy has nothing to protect in it; it still never reads a `party` room's state.
- Every Studio HTTP route (section 5) checks the same bearer token and is rate-limited with `TokenBucket`.

## 2. Creative mode (walk the world)

The Studio loads one scene at a time from `@wdi/content` with the normal sim pieces (`Collision`, `Portals`,
lights, mobs, townsfolk routines) and one admin figure.

- **Move:** walk as normal; **noclip** toggle (walk through walls); **teleport** to any scene and spawn from a
  searchable list, or to a clicked tile.
- **World controls:** time of day (scrub dawn, day, dusk, night), pause and step the sim, sim speed 1x to 10x
  (the round-6 clock), art style (8-bit, low poly, HD; the Studio may switch it live, the game itself does not).
- **Spawn:** any mob, townsfolk figure or look as a stand-in NPC; give the admin figure any item; clear spawns.
- **Overlays** (each a toggle): collision grid, nav mesh, tile coordinates under the cursor, ids of props, portals,
  spawns and spots, light radii, sight cones, footprints, `minProfile` gating (show what Small, Medium and Large
  hide).
- Doors work as in the game, so walking through one loads the next scene.

## 3. The room editor

An **Edit** toggle in creative mode freezes the sim and turns the view into the editor over the same renderer, so
what the owner sees is what plays.

- **Grid paint:** wall, floor, door, spot and the scene's `material` cells; rectangle and fill tools; resize the
  scene (`size`), keeping every id's tile valid or listing the ones a shrink would cut.
- **Props:** a palette of the prop kinds the content allows, with their real art and footprints; place, move,
  delete, duplicate; snap to tiles; footprints shown.
- **Portals, spawns, lights, paths, gates:** place and move them; a portal's `to` and `toSpawn` are picked from
  lists, and the paired portal on the other side is offered too.
- **Ids are frozen** (CLAUDE.md, GDD 3.13, WORLD 4.3): existing ids never change; a new object gets a new id with
  the scene's `prefix` (`bk.` for the bakery) and a name the owner types; deleting a frozen id that other data
  references (clues, tasks, routines, quests) is refused with the list of references.
- **Undo and redo** (every edit), and a **diff** panel listing what changed against the committed scene.
- **Checks, live:** the panel runs the same zod schemas and validators as `@wdi/content` and the scene lints
  (`tools/grid`), plus reachability from every spawn, overlapping footprints, portals whose target spawn is missing,
  and props on walls. A save with an error is refused; warnings are shown and allowed.
- **Walk it:** leaves Edit and drops the admin figure into the edited scene, unsaved, to try it.
- **Save** sends the scene (and the regenerated `.nav.json` from the existing exporter) to section 5's save route,
  which opens a draft PR. The editor never writes the live game.

## 4. Reports (screenshots and notes Claude picks up)

A **Report** button (and a key, F8) in creative mode and the editor:

- takes a screenshot of the game canvas, and lets the owner draw an arrow or circle on it;
- takes a note in a text box (any length);
- attaches the context automatically: scene id, tile x and y, facing, time of day, art style, sim tick, the build
  version, the active overlays, open check warnings, and the last 50 lines of the Studio room's log;
- sends it to section 5's report route.

An **Inbox** panel lists the owner's reports with their state (open, answered, fixed) and Claude's replies, so the
owner sees the answer in the Studio.

## 5. Where it all goes: GitHub

The server keeps nothing between restarts (GDD 3.21). Reports and saves go to the repository through one token.

- **`WDI_ADMIN_GITHUB_TOKEN`**: a fine-grained GitHub token for `groot99-droid/Who-Did-It` only, with Issues,
  Contents and Pull requests set to read and write. The owner creates it and sets it on Railway. Its value is never
  written to a file, a log, a message or a response. Without it, the Studio still walks and edits, and Report and
  Save say "NFY: the Studio's GitHub token is not set".
- **`POST /studio/report`** (bearer): commits the screenshot PNG to the branch `admin-reports` at
  `reports/<yyyy-mm-dd>/<id>.png`, then opens an issue labelled `admin-report` with the note verbatim, the context
  as a table, and the image linked. The issue body ends with the build version.
- **`GET /studio/reports`** (bearer): the issues labelled `admin-report`, with their comments, for the Inbox.
- **`POST /studio/save`** (bearer): re-runs the checks on the server (never trusts the client), then creates a
  branch `studio/<scene>-<yyyymmdd-hhmm>`, commits `packages/content/data/scenes/<scene>.json` and its `.nav.json`,
  and opens a draft PR titled `Studio: <scene>` against the base branch, with the diff summary and the owner's note
  in the body. 6Z reviews and merges it like any other PR.
- **Limits:** a screenshot over 4 MB is refused; 30 reports and 20 saves an hour.

**Claude's side.** 6Z (or whichever session the owner names) lists open `admin-report` issues, answers each on its
issue (the Inbox shows the comment), links any fix PR, and closes it when the fix merges.

## 6. Pull requests

Each under 400 lines, each with tests; the build green at every merge.

| PR | Session | What | Depends on |
|---|---|---|---|
| **S1** | 9S (Opus) | `StudioRoom` behind the admin gate: load a scene, the admin figure, noclip, teleport, time of day, pause, speed, spawn and give; tests that it refuses without a token and never registers without `adminConfig` | – |
| **S2** | 9S | The GitHub client (`server/services/github.ts`, injectable `fetch`), `POST /studio/report`, `GET /studio/reports`; tests on a fake GitHub | – |
| **S3** | 9S | `POST /studio/save`: server-side checks with `@wdi/content`, nav regeneration, branch, commit, draft PR; tests on a fake GitHub, including a refused invalid scene and a refused frozen-id rename | S2 |
| **T1** | 9T (Sonnet) | `#/studio` route, sign-in reuse, creative-mode HUD (scene list, noclip, time, speed, style, spawn, give) over `StudioRoom` | S1 |
| **T2** | 9T | Overlays (section 2) | T1 |
| **T3** | 9T | Report tool and Inbox | T1, S2 |
| **T4** | 9T | Editor 1: props and portals, spawns, lights; undo and redo; the diff panel | T2 |
| **T5** | 9T | Editor 2: grid paint, resize, paths and gates; live checks; Walk it; Save | T4, S3 |

## 8. Modes: Overview, World, Room and NPC (owner, 2026-10-25)

The owner's words: "the toggle button is for world editor, room editor, npc editor", and for the two map modes, "one
is Overview which is the zoomed out map, and world editor is the first" (the outdoor maps). The NPC editor covers
all four of: routes and schedules, placement and spawns, dialogue and tips, looks and outfits.

A mode toggle in the Studio header switches between four modes. Creative mode (section 2) runs underneath all of
them; Edit, Report and the Inbox work in every mode.

- **Overview.** A zoomed-out map of every scene of the current map (`SCENE_IDS`, grouped by `maps/<mapId>.json`),
  drawn as cards with their door links between them (portal `to` and `toSpawn`). Click a card to enter it in the
  World or Room editor; drag a door link's end to re-target a portal (a scene edit, saved through section 5's save).
  New scenes are out of scope here (ids are frozen and appended by hand, GDD 3.13).
- **World editor.** Section 3's editor on the outdoor scenes (`kind` not `interior`): the material palette, moving
  and rotating buildings, multi-tile props, trees and other kit, roads and paths, gates.
- **Room editor.** Section 3's editor on the interiors (`kind: interior`): the same tools, scoped to the room.
- **NPC editor.** Edits the NPC data, never a seat's card or anything secret (CLAUDE.md role secrecy):
  - *Routes and schedules:* `routines.json` (activities, holds, each townsfolk's `stations`, `maps`, `fixed`); drawn
    as paths and station markers over the world, with a phase scrubber to preview who goes where.
  - *Placement and spawns:* where townsfolk and quest givers start (`givers` in scenes, townsfolk homes and stations).
  - *Dialogue and tips:* the NPC lines. Today the small-talk and template lines live in code
    (`apps/server/src/services/talk/templates.ts`), so the first step moves them into a content file with a zod schema,
    unchanged, before the editor can edit them. Quest NPC names and `lore.json` shelves are already data.
  - *Looks and outfits:* which look of `looks.json` each townsfolk and quest NPC wears (existing art only).
  - Saving goes through a generalised save route: `POST /studio/save` takes `{ file, json }` for a fixed allowlist
    of content files (`scenes/*.json`, `routines.json`, `quests.json`, `lore.json`, the new lines file), re-runs
    `validateContent` with the edit swapped in, refuses unknown keys, and opens one draft PR, like a scene save.
  - Live preview: the Studio room loads the edited NPC data like a draft scene (section 3, Walk it), so stand-ins
    walk the edited routes before saving.

**The hook (M1).** `apps/client/src/studio/modes.ts` holds `StudioMode` (`overview | world | room | npc`) and
`registerMode(mode, panel)`: a panel is `(ctx: { root, send, sceneId }) => Screen`, mounted when its mode is picked and
destroyed when another is. The header toggle lists World and Room always and Overview and NPC once they register, so
their sessions add one `registerMode` call and no toggle code. `StudioStore.mode` is the current mode (World first); in
World and Room it follows the scene the owner stands in, in Overview and NPC it stays where the owner put it. The scene
list shows the exteriors in World, the interiors in Room and every scene in the others (`scenesFor`).

| PR | Session | What |
|---|---|---|
| **M1** | 9U | The mode toggle; Room and World editors scoped by scene kind (after 9U's redraw, palette, buildings and rotation PRs) |
| **M2** | 9W | Overview: the scene cards and door links, enter a scene, re-target a portal |
| **N1** | 9V | Server: the save route for the content allowlist, and the NPC-data draft for live preview |
| **N2** | 9V | The NPC lines move from `templates.ts` into a content file with a schema, unchanged |
| **N3** | 9W | NPC editor 1: routes, schedules and stations over the world, with the phase scrubber |
| **N4** | 9W | NPC editor 2: placement, looks, dialogue lines; Save |

## 7. Not in scope

Editing art (the Blender masters stay as they are), editing `balance.json` or any rule, editing Blackpine is
allowed by the same tools but Hollowmere comes first in testing, and nothing in the Studio is reachable from a
`party` room or a player's client.

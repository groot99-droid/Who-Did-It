# Parties, profiles, friends and Quit

The owner's second answer of 2026-10-23 (DECISIONS A103, A104): "Ask on Start, instead of the code list parties
(create open parties for everyone, and private parties for friends with invites only"; and Create Profile,
Friends and Quit, which the menu mockup shows, are built this round. The rules and the numbers are GDD 3.21;
this document is the contract between 7D (server, wire, numbers) and 7C (client). Nothing here needs a
database: the server stays stateless, and a profile is a thing the device keeps.

## 1. The rule in one paragraph

A party is **open** or **private**, chosen by the leader when it is created (open by default). Open parties in
the lobby phase appear in the party list every player sees under Join Game. A private party appears there
only to a device whose profile code the leader **invited** (picked from the leader's friends list at create)
and is otherwise joinable only by its code or link, as every party is today. A **profile** is the device's name
and a profile code made on the device, shown under Create Profile and shareable; it is not a secret and proves
nothing. **Friends** is a list of profile codes with the name last seen under each, kept on the device. **Quit**
leaves any party, silences the music and shows a goodbye panel. The lengths, caps and refresh period are in
GDD 3.21 and `balance.json` `party`.

## 2. Wire (7D; `packages/shared/src/protocol/index.ts`, `PROTOCOL.md` regenerated)

- `JoinOptions` gains `profile?: string` (the device's profile code, format-checked in `onAuth` like `name`;
  absent for a device without a profile and for the bots).
- `CreateOptions extends JoinOptions { visibility: 'open' | 'private'; invited?: string[] }`, accepted by
  `create("party", ...)` only; `invited` is a list of profile codes, capped by GDD 3.21, ignored for an open
  party. `joinById` keeps `JoinOptions`.
- `Player.profile: str()` on the public roster (schema version 4; `schema.test.ts` pins it empty), filled from
  the join options, so a seat row and a game-over row can offer Add friend. It says nothing about a role: it is
  constant per device across matches, like a name.
- `GET /parties?profile=CODE` on the server beside `/health`: `{ parties: PartyListing[] }`, where
  `PartyListing = { code, leader, players, max, mode, map, visibility }`, for rooms in the lobby phase that are
  not locked: every open one, and the private ones whose invited list holds `profile`. Newest first, capped per
  GDD 3.21. It never carries a seat id, a device id, a role, the invited list or anything of a room past the
  lobby. The route sits behind the matchmake guard's per-IP bucket and the global cap (ARCHITECTURE 5.3) and
  answers a bad `profile` with an empty list, not an error.
- The share link stays `#/join/CODE` and works for both kinds.

## 3. Server (7D)

- `PartyRoom.onCreate` reads `visibility` and `invited`, keeps them in room memory (never on the schema), and
  publishes the listing fields through `setMetadata` (`visibility`, `leader`, `players`, `max`, `mode`, `map`,
  `invited`); it updates them in the step when a seat joins or leaves, the leader passes, or `lobby.settings`
  changes mode or map, and clears them at Start (the room leaves the list when it locks). The matchmaking stays
  `private: true` for every party so the Colyseus matchmaker's own listing never exposes a room; the `/parties`
  route reads `matchMaker.query({ name: 'party' })` and filters by the metadata.
- `onAuth` validates `profile` (length and alphabet of GDD 3.21) and, for a create, `visibility` and `invited`
  (each entry a valid profile code, the list under the cap); anything else throws the generic join error, as a
  bad name does.
- `balance.json` `party { profileCodeLength, friendsMax, invitedMax, listMax, listRefreshS }` with its schema
  and positive checks; the client reads `listRefreshS` from `@wdi/content` as it reads the player minimum.
- Tests in a new `apps/server/test/parties.test.ts` (6P's integration PR touches the existing test files; a new
  file keeps the two apart): an open party is listed and a private one is not; an invited profile sees it; a
  stranger's profile does not; Start removes the room; a bad `profile` or an over-long `invited` is the generic
  error; the route obeys the bucket; the listing never carries ids or roles (assert the key set).
- `tools/bots/swarm.ts` passes `visibility: 'private'` so a swarm never fills the public list.
- ARCHITECTURE 5.3 gains the create options, the route and the metadata; GDD 3.21's server paragraph is 7D's.

## 4. Client (7C)

- **Profile** (`ui/menu/profile.ts`): the device's name and profile code in `localStorage` under `wdi:profile`
  (`net/storage.ts` wrappers; the old `wdi:name` is read once and migrated). Create Profile opens a glass panel:
  the name field (the existing `validateName`), the profile code shown large with a Copy button, a line saying
  what the code is for. The menu's top-right chip shows the profile name or "Guest" and opens the same panel.
- **Start Game**: a glass dialog asks the name (prefilled from the profile), Open or Private, and for Private a
  pick list of friends to invite; Create Party sends `create` with `CreateOptions`. The e2e helper `createParty`
  drives it.
- **Join Game**: the party list (`ui/menu/partyList.ts`): rows from `GET /parties?profile=...`, refreshed every
  `listRefreshS` while open, each row the leader's name, players / max, the mode and map, a tag for a friend's
  private party; a tap asks the name if no profile exists and joins by code. A "Have a code?" link opens the
  code box (the old field, glass-styled), and `#/join/CODE` opens the list with that code's box prefilled and
  focused, so the deep link works as before. An empty list shows the no-parties line and the code box.
- **Friends** (`ui/menu/friends.ts`): the list under `wdi:friends` (`{ code, name }`, capped), add by code (a
  field that accepts a pasted code or a share link), remove, and the lobby roster's and game-over rows' Add
  friend action on seats that carry a `profile` (7E and 7G render the action from a shared helper 7C exports).
- **Quit** (`ui/menu/quit.ts`): leaves the party through the existing consented leave if one exists (clearing the
  reconnection token), crossfades the music to silence, and shows a glass goodbye panel with "Back to the menu";
  in a window the page opened itself it calls `window.close()` first.
- **Settings** opens the existing sound panel in a glass dialog; **How to Play** opens `${BASE}help/`
  (restyled by 7C to the night palette, fonts self-hosted from the same files); **Credits** opens the repository's
  `CREDITS.md` on GitHub in a new tab.
- Copy in `ui/copy/menu.ts` and UI.md 14.25; DECISIONS A107.

## 5. What this design accepts and records

- A profile code is sent by the client and never proven, so a device that knows a friend's code sees the private
  parties that friend was invited to. The game is played among friends; the leader sees who joins and the
  M7 kick and ban stay the remedy. Recorded as the open column of A104.
- A profile lives on one device. Moving it is copying the code and name by hand; no account, no sync, no server
  storage this round.
- Nothing here touches role secrecy: the listing stops at the lobby, and a profile code is as public as a name.

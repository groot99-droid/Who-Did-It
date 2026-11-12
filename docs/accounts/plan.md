# Player accounts: the plan

> Planning session, 2026-11-07. A plan, not code: no dependency changes, no DECISIONS row (one is proposed in 9).
> Trigger: the owner's W2 (`docs/story/arc.md` 8, DECISIONS A517, "build player accounts now, as part of the story
> work") and F10 (arc.md 7, "saves linked to the account (sign-in)"). Rules and numbers stay in `docs/GDD.md` and
> `packages/content/data/balance.json`; this file restates none of them. Operational limits that are not game rules
> (token lifetimes, rate buckets) follow the `TOKEN_TTL_S` precedent of ARCHITECTURE 5.11: named constants in one
> server file, not in `balance.json`.
>
> Source note: `docs/story/arc.md` and `docs/story/part2.md` are not on `claude/zen-turing-m1jnw0` yet; they were read
> from `origin/claude/story-answers`. Section numbers cited below are theirs.

## 1. What exists today (verified in the tree at `2f70cb5b`)

**There are no player accounts.** A search of `apps/`, `packages/` and `tools/` for "account" finds only the economy's
bank accounts (`sim/economy/*`). What does exist:

| Thing | Where | What it is |
|---|---|---|
| Device profile | `apps/client/src/ui/menu/profileModel.ts` | `{name, code}` in `localStorage['wdi:profile']`. The code is 8 characters of `ROOM_CODE_ALPHABET` (`packages/shared/src/constants.ts:21`) made on the device. GDD 3.21: "not a secret and proves nothing". |
| Profile code on the wire | `JoinOptions.profile?` (`packages/shared/src/protocol/index.ts:564`), checked in `PartyRoom.onAuth`, copied to the public `Player.profile` (ARCHITECTURE 5.3) | Unverified: any client may send any code. |
| Friends | `apps/client/src/ui/menu/friendsModel.ts` | `{code, name}[]` in `wdi:friends`, capped by `balance.json` `party.friendsMax`. Leaves the device only as the leader's `invited` list at Create. |
| Device id | `apps/client/src/net/storage.ts` (`deviceId()`, `wdi:deviceId`) | Random UUID; the server uses it for room bans (5.3). Not a secret. |
| Story progress | `apps/client/src/ui/story/model.ts:64` (`wdi:story:finished`) | Finished chapter ids, per device, unverified. No story save exists (README Q-S3 said none; part2.md adds one, P2/P3). |
| Achievements | nothing in code | GDD 3.28 is a stub ("Not built yet"). `gdd-map.md` 2.2 and `living-world.md` 4.4 chose **option A, device only**, with "the device record migrates once" when accounts ship. P4 builds `achievements.json` and the record. |
| GitHub sign-in | `apps/server/src/services/adminAuth.ts`, `github.ts`; ARCHITECTURE 5.11 | **Admin only.** OAuth app of the owner, allowlist of logins (`WDI_ADMIN_GITHUB_LOGINS`), stateless HMAC `state` and a one-hour bearer token in the join options and an `Authorization` header; no cookie. Off unless `WDI_ADMIN=1`. It admits an allowlist, not players, and its token purpose is `admin`. |
| What the server keeps | GDD 3.21, `living-world.md` 4.4, `admin-studio.md` 5 | **Nothing between matches or restarts.** Single process on Railway Hobby, no Redis, no database (ARCHITECTURE 5.10). The only writes outside memory go to the GitHub repo (Studio). |
| Server patterns to reuse | `services/TokenBucket.ts` (`KeyedBuckets`), `matchmakeGuard.ts`, `server.ts` Express hook and CORS (`isAllowedOrigin`), `adminAuth.ts` seal/unseal | Rate limiting per forwarded IP, the CORS rule, HMAC sealing with a purpose prefix. |

Consequences: accounts are **the first thing in the project that makes the server remember**. That breaks the GDD 3.21
promise ("the server keeps nothing between matches") and needs real infrastructure (section 3), a privacy stance
(section 4) and a GDD edit (3.21 and 3.28) in the same PRs that change behaviour.

## 2. Owner-facing choices, each with a recommended default

### 2.1 Sign-in method

| Option | For | Against |
|---|---|---|
| **Anonymous account that upgrades to Google (recommended)** | The game is playable at once; a device gets a server-held account on first need; one tap to link Google for other devices. Google OAuth is free and no password or mailer is needed. Store only Google's stable subject id (`openid` scope), no email, no real name. | Friends need a Google account; a lost anonymous account with no linked identity is unrecoverable (that is the trade). |
| Email link | No third-party account. | Needs an outbound mail provider, deliverability and a stored email (more personal data). |
| GitHub | The OAuth code exists. | Most players have no GitHub account; wrong audience. Keep it admin-only. |
| Google only, no anonymous | Simplest model. | Forces sign-in before play; contradicts the open-door game. |

Default: **anonymous-with-upgrade, Google as the first provider**, the identity table provider-neutral so email or Apple
can be added later. **Guests stay first class**: the whole game, including the story and the device save, works with
no account; an account adds saves and achievements that follow the person across devices.

### 2.2 What the server stores, and where

Default: **SQLite on a Railway volume, behind an `AccountStore` interface** (section 5). Reasons: one process already,
a few thousand rows at most, no new service to run or pay a second plan for, backup is one file. Alternatives, same
interface: Railway Postgres (more cost and a driver dependency, for no benefit at this size) and a JSON file written
with atomic rename (zero dependencies, fine below a few hundred accounts, no transactions).

Two honest costs of the default, both owner-visible:

1. **A volume is a manual host step.** ARCHITECTURE 5.10 says "nothing is typed into the Railway UI"; a volume mounted
   at a path in `WDI_DATA_DIR` is the first exception. A Railway volume also stops overlapping deploys, so a deploy
   becomes a restart of a few seconds (the process is single already).
2. **A dependency decision.** `node:sqlite` ships with Node and needs no package, but runs without a flag only from
   Node 22.13 (it still prints an experimental warning); the repo pins `engines.node >= 22.12` and ARCHITECTURE 5.1
   says sessions never upgrade dependencies. PR A2 starts with a check on the pinned Node, raises `engines` to
   `>=22.13` **only with the orchestrator's sign-off** (a 5.1 row), and otherwise falls back to the JSON-file store.
   `better-sqlite3` (a native build on Railway's builder) is the option I would not take.

Everything is behind `WDI_ACCOUNTS=1` plus `WDI_DATA_DIR`, exactly like `WDI_ADMIN`: unset, there are no routes, the
client hides the sign-in entry, and the game is the game of today.

### 2.3 What an account holds (the whole list)

| Table | Columns (all of it) |
|---|---|
| `account` | `id` (random 128-bit, never from a sim stream), `createdAt`, `lastSeenAt`, `name` (2 to 16, the server profanity list), `code` (the profile code, section 6) |
| `identity` | `accountId`, `provider` (`google`), `subject` (provider's id). No email, no token from the provider is kept. |
| `session` | `idHash` (SHA-256 of an opaque 256-bit token), `accountId`, `createdAt`, `expiresAt` |
| `friend` | `accountId`, `code`, `name` (last seen); capped by `party.friendsMax` |
| `storySave` | `accountId`, `storyId`, `rev`, `blob` (zod-validated, at most a few KB), `savedAt` |
| `achievement` | `accountId`, `record` (the E1 record: step ids and counters, with its `schemaVersion`) |

Nothing else. In particular no match history, no seat, no role, no card, no cover, no inventory, no chat, no IP, no
device id, no email.

### 2.4 Sessions

An **opaque random token** (not the admin's stateless HMAC token) kept as a hash in `session`, so sign-out, deletion and
"sign out everywhere" take effect at once, which a stateless token cannot do. Lifetime is an ops constant (default 30
days, sliding). The client keeps it in `localStorage['wdi:account']` and sends it in the join options and as
`Authorization: Bearer`; no cookie, because the client (GitHub Pages) and server are different sites, the same reason the
admin gate uses none. A page has no user-supplied HTML, which is what keeps `localStorage` acceptable.

### 2.5 Cost to run

| Item | Cost |
|---|---|
| Railway | Already paid (Hobby, ARCHITECTURE 5.10). A small volume and an idle SQLite file add cents a month; confirm on Railway's current pricing page in PR A2 rather than trusting this number. |
| Google OAuth | Free for `openid`. The owner makes the OAuth client (as for the GitHub admin app); check Google's current consent-screen rules in PR A5 (a screen left in "Testing" caps users). |
| Mail | None with the default. Email link would add a provider's free tier at best. |
| Backup | Free: an owner-run export of the file (section 7). |
| Work | About ten PRs of under 400 lines (section 8); the first is shared with the story work. |
| Ongoing | The owner owns a privacy notice and answers deletion requests (section 7). |

## 3. Where it sits in the code (paths for the contract)

New paths owned by this workstream, so no existing session's paths are touched (`docs/SESSIONS.md`):
`apps/server/src/accounts/**`, `apps/server/test/accounts/**`, `apps/client/src/accounts/**`,
`packages/shared/src/accounts/**` (zod schemas and the HTTP types, exported from `@wdi/shared`), `docs/accounts/**`.
Edits outside them are small and listed as **contract requests** in the PR that makes them: `JoinOptions.token?`
(`protocol/index.ts`), one `story.start` field and one S2C message (P2/P3's files), `server.ts` route registration,
`PartyRoom.onAuth`, the menu entry (`ui/Landing.ts`/`ui/menu/**`), GDD 3.21 and 3.28, ARCHITECTURE 5.10/5.11.
`adminAuth.ts` is **not** touched: accounts copy its small seal helper into `accounts/seal.ts` with their own purposes,
so a session token can never verify as an admin token or the reverse.

## 4. Privacy and role secrecy

The rules, each one testable:

1. **The store has no column that could say what a seat was.** The list in 2.3 is closed. A new column needs a review
   against `CLAUDE.md` "Role secrecy".
2. **The account id never reaches a schema field, a view, a listing or a log line.** In a room it lives in room memory
   beside `deviceId` (5.3), never on `Player`. `GET /parties` keeps copying only `PartyListing` keys.
3. **Nothing public changes shape.** `Player.profile` stays the one public identity (section 6). There is no public
   "profile page", no online status, no "friend is in a match" and no lookup route by code.
4. **Writes never happen inside `step()` and never feed back into it.** A chapter break emits a bus event; a listener
   enqueues the save write on a job queue that the step does not await and whose result it never reads. Achievements
   are awarded at game over (and in a story at the break), never mid-match, and reach the player as the private `achv`
   message (P4) to their own client only, so a mid-match toast cannot be seen by anyone else and the timing of a DB
   write cannot be a side channel.
5. **No shared randomness.** Ids and tokens come from `node:crypto`, never from `sim/seeds.ts` streams.
6. **Records are the owner's only.** `GET /account/*` returns only the caller's rows. A friend never learns who lists
   them. A record never carries the role of a match in progress (the `living-world.md` 4.4 rule, kept).
7. **Trophies are not worn.** A cosmetic unlock shown on a figure would tell the room that this account once played a
   branch (a Killer branch is a tell). Default: unlocks appear on the owner's own screens only, until the owner
   decides otherwise (Q6).
8. **Data minimisation.** Google's subject id only; no email; no real name; no IP stored (the rate buckets are memory).
   A privacy notice (a page in the client, text in `docs/accounts/`) says this in plain words, including that the game
   is for friends and that a child's guardian can have the account deleted.
9. **Leak tests.** Every PR that adds an S2C message or an HTTP route adds a case to the existing leak suites
   (`apps/server/test/story/leak.test.ts`, the party-room view tests): join as account A and as guest B in one room and assert
   that nothing B receives names A's account, and that a token never appears in any outgoing frame.

## 5. The save store (story saves attach here)

One small interface, called by the story **server**, with the device implementation first and the account one replacing
it. The server decides when to save (a chapter break, from the bus event `story.chapterEnd` that already exists) and
what to save, so a client cannot invent a finished chapter.

```ts
// packages/shared/src/accounts/saves.ts (types + zod) ; apps/server/src/accounts/saves.ts (port)
interface StorySave {            // validated, at most a few KB, no secret of a live match
  v: 1; storyId: string;         // frozen ids from story.json
  nextChapterId: string | null;  // null = finished
  finished: string[];            // chapter ids, in order
  handOn: unknown[];             // exactly what a chapter hands on (arc.md 5, HandOn), validated per kind
  replayUsed: string[];          // chapters whose single replay is spent (Q-P4)
  summaries: ChapterSummary[];   // for the end screen
  rev: number; savedAt: number;
}
interface SaveStore {
  get(ctx: SaveCtx, storyId: string): Promise<StorySave | null>;
  put(ctx: SaveCtx, save: StorySave): Promise<'ok' | 'stale'>;   // compare-and-set on rev
  clear(ctx: SaveCtx, storyId: string): Promise<void>;
}
```

- **`DeviceSaveStore` (PR A1, no account needed).** `put` sends the validated save to the player's own client as a
  private S2C message `story.saved`; the client writes it to `localStorage['wdi:story:save']`. `get` reads the save the
  client sent back in `story.start {resume}` and re-validates it with the same zod schema, clamps it, and ignores
  anything that does not parse. It is unsigned on purpose: a forged device save lets a person skip ahead in their own
  single-player story, and nothing it holds feeds anything but the story (achievements come from events in a room
  the server ran, never from a save; "story complete" steps are granted only from a server-held save or a played
  chapter). This is `living-world.md` 4.4 option A for saves.
- **`AccountSaveStore` (PR A8).** Rows in `storySave`, `get` and `put` keyed by the account bound to the connection;
  `story.start {resume: true}` makes the server read the row, so the client sends nothing to forge. Same schema, same
  size cap, `rev` makes a double write from two tabs lose cleanly (`stale`).
- **Choosing.** The story room asks `saveStoreFor(ctx)`: an authenticated connection gets the account store, a guest
  the device store. A signed-in device that has a device save offers to import it once (section 6).
- **Client side** needs only `readDeviceSave()`/`writeDeviceSave()` in `ui/story/` (P3's folder, a contract request) and
  an account-aware "Continue" row in the story menu; the resume decision is the server's.
- **Resume is a replay from the break.** The save holds break state, not simulation state: the story is seeded and
  fixed (GDD 3.34), so resuming starts the next chapter with `handOn` and the saved counters. No world snapshot is
  stored, which is also why a save can hold no hidden state of a match.
- One slot per `(account, storyId)`: one slot per story, which is one slot today (part2.md Q-P3 default, kept).

## 6. Migration: how a device becomes an account

**Rule: a guest's device data never disappears and is never silently copied.** On first sign-in the client offers
"Bring this device's profile, friends and story progress into your account?" (default yes) and calls
`POST /account/import` once with the device's data. The server validates everything with the same validators as join
(`isProfileCode`, the name range, `friendsMax`, the story save schema) and ignores the rest.

| Data | Rule |
|---|---|
| **Name** | Taken if the account has none. |
| **Profile code** | Kept as the account's code **if no other account holds it**; otherwise the account gets a server-made code and the device keeps its old one as a guest code. First come wins; a held code is never reassigned (an owner CLI can, section 7). This keeps existing friends lists working. |
| **Friends** | Union with the account's list, device entries first, capped at `friendsMax`. After import the server copy is the truth and `friendsModel.ts` reads and writes through a `FriendsStore` port (device implementation today, account implementation signed in) with `localStorage` as an offline mirror. |
| **Finished chapters** | Merged into the account's story save as `origin: 'device'`; they unlock menu entries but earn no server-verified achievement. |
| **Story save** | If the account has none, the device save is adopted after validation; if both exist the newer `savedAt` wins and the loser is kept in the client until the player drops it (the one place the player is asked). |
| **Achievements** | The E1 record has a `schemaVersion` and a pure `mergeAchievements(a, b)` (union of steps, max of counters). Device entries merge as `unverified`; rewards are cosmetic by rule (`living-world.md` 4.4), so a forged entry hurts nobody. A one-time import: after it the device record is read-only. |
| **Device id** | Untouched; bans stay `deviceId`+name (5.3). |

**Identity on the wire.** Today any client may send any profile code, so a friend's code is also a key to the private
parties they were invited to. Once accounts exist the server **takes `Player.profile` from the verified token** for a
signed-in seat, and **drops** a guest's claimed code if some account holds it (the guest joins as a guest with no
code). The roster shape does not change; impersonating a registered person in the party list stops working. This is
strictly better than today and costs one lookup in `onAuth`. Old, unclaimed codes keep behaving as now.

**Account switching.** Signing in on a device that already has account A to account B signs A out; device data is not
imported again (it already was). Merging two accounts is not offered (Q10).

## 7. Abuse, limits, deletion, export, retention

**Rate limits** (`KeyedBuckets`, same idiom as `/parties` and the admin callback; sizes are ops constants):
account creation per forwarded IP (low: the one abuse path that grows storage), sign-in start and callback per IP,
account routes per session, import once per account, save writes at most one per ten seconds per account and only
from the server's own break event. A hard cap on total accounts (a constant; at the cap creation answers 503 and guests
still play). Every failure of the Google callback answers the one uniform `403` of the admin callback, saying nothing
about which check failed. `OPTIONS`/CORS follow `isAllowedOrigin`. Bodies are capped (a few KB) before parsing.

**Deletion.** `DELETE /account` (session required, plus a confirm token from `GET /account/delete-token` so a stray
request cannot do it) removes every row of 2.3 in one transaction and the sessions with it; the client clears
`wdi:account` and keeps the device data, so the person is a guest again. Account ids are not reused.

**Export.** `GET /account/export` returns the caller's rows as one JSON document (schema in `@wdi/shared`), the same
data the privacy notice lists. Rate limited like deletion.

**Retention.** An anonymous account (no linked identity) untouched for a long period is swept at boot and daily (an ops
constant, default 90 days; the client warns before it with a "link an account to keep your progress" line). A linked
account is never auto-deleted.

**Owner operations**, a CLI run in Railway's shell, no UI: `accounts:stats`, `accounts:delete <id|code>`,
`accounts:reassign-code <id> <code>` for squatting, `accounts:backup` (`VACUUM INTO` a dated file). A weekly backup
the owner downloads is the default; the volume's file is the only copy otherwise (Q11).

**Bans.** Not changed: room bans stay `deviceId`+name. A site-wide ban by account is not built.

## 8. Split into PRs (each under 400 lines, in order, tests listed)

Docs ride with the code that changes behaviour: each PR edits GDD 3.21 or 3.28 and ARCHITECTURE 5.10/5.11 for its own
part. DECISIONS rows are the orchestrator's (section 9). One branch and one session per PR, off the integration branch.

| # | PR | Contents | Tests |
|---|---|---|---|
| **A1** | **Save port + device store** *(starts now; shared with story P2/P3)* | `StorySave` zod schema and `SaveStore` in `@wdi/shared`/server; `DeviceSaveStore`; `story.saved` S2C message and `resume` on `story.start` (contract request to P2/P3); client `readDeviceSave`/`writeDeviceSave` and a Continue row. | Schema accepts a real save and refuses oversize, unknown keys and a forged `nextChapterId`; resume from a break reproduces the uninterrupted run's digest (the S4 replay fixture); `story.saved` reaches only the player's own client (leak suite); a damaged `localStorage` value is a no-save, not a crash. |
| **A2** | **Account store: interface, SQLite, memory** | `accounts/store.ts` port, `sqliteStore.ts` with migrations (`user_version`), `memoryStore.ts`, config gate `WDI_ACCOUNTS`/`WDI_DATA_DIR`, ARCHITECTURE 5.1/5.10 rows (Node check, `engines` only with sign-off). | One contract suite run against memory **and** SQLite: create, read, friends cap, save `rev` compare-and-set, delete cascade; migrations idempotent; server boots with the gate off and registers nothing. |
| **A3** | **Sessions and anonymous accounts** | `accounts/seal.ts`, `session.ts`, routes `POST /account/anon`, `GET /account`, `POST /account/signout`, buckets, CORS, `shared/accounts/http.ts`. | Token hashing and expiry (injected clock); sign-out kills the token at once; a session token never verifies as an admin token; flood returns 429; account cap; body cap; bad `Origin`. |
| **A4** | **Join integration and the identity rule** | `JoinOptions.token?`; `onAuth` binds the account in room memory, sets `Player.profile` from the token, drops a claimed code from a guest, treats a stale token as a guest. | Guest join unchanged; signed-in join sets the verified code; a guest sending a registered account's code joins with none; **leak test**: no schema field, view, listing, bus event or outgoing frame carries an account id or token; generic join error unchanged for bad build/name. |
| **A5** | **Google sign-in and upgrade** *(needs the owner's OAuth client)* | `GET /auth/google/login|callback`, link to the current anonymous account or sign in to an existing one, stateless `state` (purpose `acct-state`). | Fake Google server (as `test/fakeGitHub.ts`): happy path, wrong or expired `state`, replayed code, uniform `403`, link to an identity already on another account refuses, no email or provider token stored. |
| **A6** | **Profile, friends, import (server)** | `PUT /account/profile`, `PUT /account/friends`, `POST /account/import`, the code-claim rules of section 6. | Validators shared with join; cap at `friendsMax`; import twice is a no-op; a held code is kept by its owner; hostile names refused. |
| **A7** | **Client account model and ports** | `apps/client/src/accounts/{api,session,friendsStore,profileStore}.ts`; `friendsModel`/`profileModel` read through the ports; offline mirror. | Unit tests with an injected `fetch` and memory storage; the device path is byte-identical to today when signed out (existing `profile.test.ts` and `partyList` tests stay green unchanged). |
| **A8** | **Sign-in UI and migration prompt** | Menu entry, the sign-in/upgrade panel, the import prompt, privacy-notice link, 2.1's wording. | Playwright at 390x844 and 1280x720 against a mock account server (`?mock=1` style): guest path unchanged, upgrade, import prompt yes/no, sign-out, a failed callback. |
| **A9** | **Account save store** | `AccountSaveStore`, `saveStoreFor(ctx)`, the offer to adopt a device save, the end-screen "saved to your account" line. | The same save/resume suite as A1 run against the account store; cross-account isolation (A cannot read or overwrite B's slot by any route); a stale `rev` loses; guest path still device. |
| **A10** | **Achievements store** *(waits for P4's record; skip until it merges)* | `achievement` row, `mergeAchievements` use, award at game over / break through the existing private `achv` path. | Merge is idempotent and commutative; nothing is written mid-match; `achv` private to the owner; device record imported once as `unverified`. |
| **A11** | **Deletion, export, retention, owner CLI** | `DELETE /account`, `GET /account/export`, sweep, `accounts:*` scripts, the privacy notice text. | Delete leaves no row in any table and no live session; export round-trips through its schema; sweep removes only old anonymous accounts (injected clock); CLI refuses without the data dir. |

Order and parallelism: A1 first and alone (it unblocks P2/P3). A2, A3, A4 are one chain (A4 can start once A3's
token verify function is merged). A5 needs only the owner's Google client and can run beside A6. A7 needs A3 and A6's
types. A9 needs A1 and A4. A10 waits for P4. A11 is last and must merge before the first real player signs in.
**Gate before any public use:** A4's leak test, A9's isolation test and A11 all green.

## 9. Proposed DECISIONS row (the orchestrator adds it; this session does not)

> **A518 (proposed). Player accounts (owner W2/F10, 2026-11-07; plan `docs/accounts/plan.md`).** Anonymous accounts
> that upgrade to Google sign-in; guests stay first class. SQLite on a Railway volume behind an `AccountStore`
> interface, gated by `WDI_ACCOUNTS`; opaque hashed session tokens, no cookie. The store holds a closed list of
> columns with no role, seat, card or match state. Story saves go through a `SaveStore` the server calls at the chapter
> break, device implementation first, account implementation replacing it. The server's "keeps nothing between
> matches" promise (GDD 3.21) is replaced by the account store for signed-in players only. Open questions: plan 10.

## 10. Open questions for the owner (each with its default)

| # | Question | Default |
|---|---|---|
| Q1 | Sign-in provider | Anonymous start, Google to upgrade; no email, no GitHub for players |
| Q2 | Can a guest still play everything? | Yes. Accounts add cross-device saves and achievements only |
| Q3 | Storage | SQLite on a Railway volume (you add the volume once, in Railway) |
| Q4 | Node `>=22.13` for built-in SQLite | Yes, if the orchestrator signs the 5.1 row; otherwise a JSON-file store |
| Q5 | Save slots | One per story (one today) |
| Q6 | Are trophies and unlocks ever shown on a figure or a roster? | No; owner's own screens only |
| Q7 | What personal data may be stored? | Google subject id and the chosen name only; no email |
| Q8 | Retention of unused anonymous accounts | 90 days with a warning; linked accounts never swept |
| Q9 | Friends | One-way list of codes as today; no requests, no online status |
| Q10 | Merge two accounts | Not offered; signing in to another account signs the first out |
| Q11 | Backup | You download a weekly export; there is no automatic off-host copy |
| Q12 | Who makes the Google OAuth client and when | You, before A5 (same steps as the admin GitHub app) |
| Q13 | Account moderation | Owner CLI only (delete, reassign a squatted code); no ban by account |
| Q14 | A privacy notice and a minimum-age line | Short plain-language page in the client; the game is for friends and guardians can ask for deletion |

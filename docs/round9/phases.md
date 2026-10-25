# Round 9 (9A): the phase screens

World mode has no vote (`world-mode.md` 5). The pauses that the meeting, the vote and the reveal fill today become
full-screen **phases**: the town gathers, evidence is laid out, and the server reads the verdict. This document
lists every such screen: what it shows, who sees what, and how long it lasts. It ends with a mock-up list for a
later UI session.

**Status.** Design only (owner, 2026-10-24). The timings come from `world-mode.md` 7. Every claim about today's
client and server cites a file and line at `88453d9`, or a GDD section. Nothing here is built.

**Owner answers folded in (9D, 2026-10-25).** `owner-answers.md` overrides this document where they disagree. Changed
paragraphs are marked "(owner answer <ID>)", and section 14 lists the reconciliations.

## 0. What the meeting is today

| Today | Where |
|---|---|
| A meeting is a centred grid: the board beside a 320 px side panel, `width: min(1180px, 100%)`, one column on a phone | `apps/client/src/ui/styles.css:46-55` (`.wdi-meet`); the mock-up is `apps/client/public/mockups/meeting.html` |
| The screen holds a portrait grid (`wdi-portraits`), a vote count per portrait and a Skip button | `apps/client/src/ui/Meeting.ts:64` (`mountMeeting`), `:73` (the grid), `:81-89` (Skip), `:344-349` (Skip state) |
| The Phaser scene over the world mounts the DOM screen and the in-match art switch | `apps/client/src/scenes/Meeting.ts:12,62-66` |
| The phases run discussion, then vote, then reveal, then immunity | `apps/server/src/sim/Meeting.ts:203-213` (`runMeeting`); GDD 3.3 |
| The discussion is 60, 75 or 90 s by party size; the vote 25 s; the reveal 8 s; immunity 15 s | `balance.json` `byCount.*.discussionS`, `phases.*`; GDD 3.3 |
| Votes open `meeting.minVoteS` (15 s) into the discussion | `Meeting.ts:34-40,84,97-104` |
| The Final Night trial is a meeting with reason `final` and a 120 s discussion | `Meeting.ts:80-82`; `FinalNight.ts:18-57`; GDD 3.3 |
| Everyone is placed on the hub's meeting spawns; living or dead | `Meeting.ts:18-32` (`placeAtSquare`) |
| The meeting opens with locked hooks: Nightshade resolves, disguises end, knocked-out seats wake, figure bodies clear, the civic hooks run | `Meeting.ts:50-58,85` |

Two things carry over: the **locked call sites** at `openMeeting` (`Meeting.ts:52-58,85`), which run at every
Inquest and trial; and **`placeAtSquare`**, which gathers the town. What goes: the vote, the tally, Skip, the
ejection and its reveal (`Meeting.ts:88-182`).

## 1. The phases at a glance

| # | Screen | Opens when | Lasts | Replaces |
|---|---|---|---|---|
| 1 | Arrival (role card and the Killer's pick) | Start | 30 s (`phases.roleRevealS`) | The role reveal (GDD 3.3), longer for the pick (`world-mode.md` 4.1) |
| 2 | Dawn and the train | The day phase begins | about 8 s overlay, during the day clock | Nothing (new). The train is a scene event today (GDD 3.3) |
| 3 | The Inquest | A body is reported (the bell no longer opens one, owner answer WM2) | Discussion `byCount.*.discussionS`, then a 15 s finding | The meeting's discussion, vote and reveal |
| 4 | The Tribunal | A cuffed suspect reaches the county jail after a manhunt (owner answer WM2); or the Activist's Redemption trial opens | 30 s case, 30 s defence, 8 s verdict | The ejection (and the round-8 `lawStage` seam) |
| 5 | The Final Night and the end trial | After `finalNight.afterCycle` cycles | Hunt 135 s, then the end trial: 120 s, then 8 s per case | `FinalNight.ts` hunt and forced vote |
| 6 | On the line | A seat dies by day | Until the next train | The ghost view, for a day death (`world-mode.md` 6) |
| 7 | The victories ledger | The match ends | 30 s (`phases.gameOverS`) | The game-over screen (GDD 3.8) |
| 8 | Story chapter cards | A beat of a story chapter fires | Until dismissed (the clock pauses) | Nothing (new, `world-mode.md` 9) |
| 9 | The Vicar's memorial | The Vicar dies by the Knife | The video's length | Unchanged (GDD 3.20, the `memorial.vicar` cutscene) |
| 10 | The petition and the manhunt | A human opens a petition; it opens a manhunt when signed | Not a pause: a form, then a 120 s world phase with a banner | Nothing (new, owner answer WM2; 13) |
| 11 | The briefing | 30 s after any clue is created | A toast and a police-board line, no pause | Nothing (new, owner answer WM2; 13) |
| 12 | Asleep, and the night skip | A seat holds at its bed; every active player is asleep | The sleeper's dimmed view; the skip is a dawn | Nothing (new, follow-up 2; 13) |
| 13 | The county jail | A sentence of jail | Until the next dawn; the world, in the cell scene | Nothing (new, owner answers LW9, WM11; 13) |

**What full-screen means.** Today the meeting is a centred card over the dimmed world (0). A phase screen fills the
viewport: edge to edge, the world hidden behind it, with the clock and the phase name in a top band. A phone gets
the same screen in one column. The world keeps running under it only where the phase says so (2, 6, 8).

**Same pauses.** The owner asked to "prolong everything" but keep the play the same (`world-mode.md` 7). The
pauses keep their lengths (`byCount.*.discussionS`, `immunityS`, `revealS`). Only the day and night clocks around
them grow.

## 2. Dawn and the train

**When.** At the start of every day phase. The train arrives `train.arriveAtS` into the day, which is 20 s in world
mode (`world-mode.md` 7.1), and the delivery `train.deliveryAfterS` (32 s) after that. Today the server ticks both
in `apps/server/src/sim/Train.ts:31-43` (`runTrain`), and the `train.arrive` and `train.delivery` events go on the
bus (GDD 3.20).

**What it is.** Not a pause. An overlay that plays over the world while the day clock runs, in two beats:

| Beat | When | Shows | Lasts |
|---|---|---|---|
| Dawn card | The day phase opens | "Day N" and the weather of the map; the cycle bar (`N` of `finalNight.afterCycle`) | 3 s, then it shrinks into the HUD's clock |
| The train | `train.arrive` | The whistle (`train_arrive`), a lower-third banner "The 6:10 is in", and the **manifest**: the portraits and character names of the seats returning on it (`world-mode.md` 6) and of the seats released from the county jail. Unchanged by the train, a public death stays public. On the Hitman's arrival day the manifest adds the public sign, "A stranger's coat was seen on the 6:10" (owner answer WM9, `world-mode.md` 1.5) | 5 s banner, the manifest stays in the HUD's log |
| The mail | `train.delivery` | Each seat's own mail, privately: a contract for the Hitman's mark (`contract.ts:58`), a letter for a quest. Nothing public | A toast, then the Notebook |

**After a night skip** (follow-up 2, owner answer NW2) the dawn card reads "You slept through" before "Day N", and
the day starts as any other.

**Owing the line** (owner answer WM1). The returning seat's "You are back" card also shows, privately, the fare it now
owes and what that does to its prices and stock (`world-mode.md` 6).

**Who sees what.** The banner and the manifest are public: who stepped off the train is something the platform
sees. The returning seat is placed on `hm.station` (the map's station scene) and its screen fades from the On the
line view (6) straight into the world, with a 3 s "You are back" card. The mail is private (`Private` view).

**Timing table.**

| Clock | Value | Source |
|---|---|---|
| Day | 480 s | `world-mode.md` 7.1 |
| Train in | 20 s into the day | `train.arriveAtS`, proposed |
| Delivery | 32 s after the train | `train.deliveryAfterS`, proposed |
| Dawn card | 3 s | new, `ui.*` |
| Train banner | 5 s | new, `ui.*` |

## 3. The Inquest

The Inquest replaces the meeting. The town gathers in the square (`placeAtSquare`, `Meeting.ts:22-32`), the body
and the evidence are laid out, and the town talks. Nobody votes and nobody is ejected. Its outcome is the **finding**:
the Case Board's suspect set, made public.

**Opens when.** A body is reported, as a meeting opens today (GDD 3.3, 3.4). The bell no longer opens an Inquest: it
only gathers NPCs (owner answer WM2, `world-mode.md` 3.1; 14, R2). The meeting's locked call sites run first
(`Meeting.ts:50-58,85`).

**Layout** (full screen, three columns on a wide screen, stacked on a phone):

| Region | Shows | Who |
|---|---|---|
| Top band | "Inquest", the reason (a body), the caller's portrait, the phase clock | All |
| Left: the body | The body's portrait, character name, where it was found, the death cause the Doctor confirmed (or "unknown") | All. The cause stays private until the Doctor confirms it, as today (GDD 3.4) |
| Centre: the board | The Case Board: every presented entry as a card (Verified, Claimed, Forged, Doubted), grouped by trait. The suspect set shown as a row of portraits, with "Fits" or "Ruled out" on each | All, with private marks on the seat's own entries |
| Right: the town | Every figure at the Inquest as a portrait and character name (`world-mode.md` 4.3). A seat that presented has a pin; a seat on the line is greyed with "On the line" | All |
| Bottom: the seat's own hand | The seat's Notebook entries that can be presented, with a "Present" button. The count left (`meeting.presentPerPlayer`, 3) | Own seat only |
| Chat | Discussion chat, as today | All living; ghosts read their own channel (GDD 3.7) |

**No ghost at the table.** A seat on the line does not attend (6). A ghost (a death after dark) watches and reads,
as today.

**Timing.**

| Step | Lasts | Note |
|---|---|---|
| Gathering | 3 s | The fade from the world and the placement (`placeAtSquare(room, false)`) |
| Discussion and presenting | `byCount.*.discussionS`: 60 / 75 / 90 s | Unchanged ("the same pauses"). Presenting is open from the first second: there is no vote to hold back (`meeting.minVoteS` is removed) |
| The finding | 15 s | The suspect set settles, the board flips to the finding view (below). Nobody can present |
| Return | `phases.immunityS` 15 s | As today: the announced placement and immunity (`Meeting.ts:197-200`, `enterImmunity`) |

**The finding view** (the last 15 s):

| Shows | Rule |
|---|---|
| "The town believes it was one of these" and the suspect set, at most `meeting.suspectSetMax` (3) portraits | GDD 3.4. Doubted and Forged entries are left out (`world-mode.md` 5) |
| "No one fits" when the set is empty | |
| A stamp "Case ready" if the set is exactly one seat, and a **Petition** button | Any living, free human may open a petition against that figure from here (13; owner answer WM2) |
| The Detective's stamp, private to the Detective | `lawStage` 0 to 1 when the Detective stamps the file (`world-mode.md` 3). The Detective's file counts as one signature on a petition it supports |

**NPCs at the Inquest.** At a drawn tick inside `npc.present.windowFrac` (it was `npc.vote.windowFrac`, 0.3 to 0.9
of the discussion; `npc/meeting.ts:101`), each NPC presents its best Claimed entry with chance
`presentChance` (it was `suspectVoteChance`). An NPC holding a Cabal confession presents it first, which is the old
"confession decides" rule (`npc/meeting.ts:59-99`).

## 4. The Tribunal

The Tribunal is the trial of one arrested seat (route 1 of `world-mode.md` 3), and the Activist's Redemption trial
(`world-mode.md` 2).

**Opens when.** One of:

- a manhunt ends with a cuffed seat walked to the county jail (owner answer WM2; 13). Cuffing is a hold
  (`law.cuffHoldS`) by any seat or a Constable, and a petition is refused against a seat in its grace after a
  dismissal (`trial.acquittalGraceS`, 30 s);
- the Activist's Redemption trial: after the Baron's death, the town tries her (Bible I.5 II).

**Layout.**

| Region | Shows | Who |
|---|---|---|
| Top band | "Tribunal", the accused's portrait and character name, the charge from the petition ("murder", "robbery", "conspiring with the Killer"; `world-mode.md` 5), the clock | All |
| Left: the prosecution | The arresting seat's portrait and the entries it filed, as cards | All |
| Centre: the scales | A balance with a pan for matches and a pan for exclusions. Each card lands in a pan as it is presented. A marker on the beam shows where the finding stands: Dismissed, Proven, Murder proven (`trial.convictAt`, `trial.murderAt`; owner answer WM11) | All |
| Right: the defence | The accused's own presented entries (it may present `meeting.presentPerPlayer` like anyone) | All |
| Bottom: the seat's hand | As at the Inquest | Own seat |

**Timing.**

| Step | Lasts | Note |
|---|---|---|
| The charge | 5 s | The accused is placed in the dock, the rest on the square |
| The case | 30 s | Anyone may present for or against |
| The defence | 30 s | Only the accused and those presenting exclusions may present |
| The verdict | `phases.revealS` 8 s | The beam settles; the verdict card (below) |
| Return | `phases.immunityS` 15 s | As after an Inquest |

**The verdict card.**

The verdict is the finding and then the sentence of the charge (owner answer WM11, `world-mode.md` 5):

| Verdict | Card | After |
|---|---|---|
| Dismissed | "Case dismissed" and the accused's portrait | 30 s of protection from a new petition |
| Fine | "Fined" and what was taken | A theft returns the goods; a Killer's checklist resets, privately |
| Jail | "Jailed until dawn", and for a robbery "Goods to the town chest" | The seat is walked to the cell (13). The victim of a robbery is told privately where its goods went (owner answer LW9) |
| Fine, demotion and jail | "Fined, stripped of the road, jailed" | A conspirator's evolved road reverts to its base card. Only for minion, brute and extortionist types |
| Defrocked | "Defrocked" | The religious conspirator's Faith goes to 0 and the chapel bars it (a proposal, `world-mode.md` 5) |
| Death | "Sentenced", then the gallows cut | Murder only. The accused dies for good and becomes a ghost. The role is shown, as an ejection's is today (`Meeting.ts:162-165`). A Gamekeeper fires its Last Shot here (`world-mode.md` 5). The Drifter's Gallows victory |

**The role on the verdict.** A death sentence shows the true role, so a convicted Killer is shown as the Killer
and the town learns which look it wore. This is the only time a cover is lifted before game over, the same as an
ejection lifts it today.

## 5. The Final Night and the end trial

Today: after cycle `finalNight.afterCycle` (5), a 45 s hunt with a 20 s Knife cooldown, then the trial, a
meeting with reason `final`, a 120 s discussion and a forced vote with no Skip. A Cabal ejection wins for the
Village, anything else for the Cabal (`FinalNight.ts:18-57`; GDD 3.3, 3.8).

**World mode keeps the hunt and replaces the vote.**

| Step | Lasts | Screen |
|---|---|---|
| The bells | 5 s | Full screen: "The Final Night". The map darkens. Every seat on the line is brought back now, by the last train (`world-mode.md` 6) |
| The hunt | 135 s (`finalNight.huntS`) | The world. The Knife with a 60 s cooldown (`finalNight.killCooldownS`). The HUD shows only the clock |
| The gathering | 3 s | The square, by lantern light |
| The end trial: filing | 120 s (`finalNight.trialS`) | Every living seat may file a case: pick one accused and present up to `meeting.presentPerPlayer` entries. NPCs file as at the Inquest. The screen shows each filed case as a column with its accused and its cards |
| The end trial: verdicts | 8 s per case, strongest first | Each case on the scales (4), sentenced by its charge (owner answer WM11). The first murder conviction of the Killer ends the trial with route 3 (`world-mode.md` 3). A murder conviction of anyone else hangs that seat; a lesser sentence is read out; then the next case is read |
| No case | 8 s | "The Killer walks free", and the Killer's Unseen victory (`world-mode.md` 2) |

**The strongest case first.** Cases are ordered by their match count, then by fewer exclusions, then by the
earliest filed. At most one case per accused counts: the strongest; the others' cards join it.

**One end trial.** It runs once. A match always ends at its close, whatever the verdicts.

## 6. On the line

The screen of a seat that died in the daylight phases (`world-mode.md` 6). It replaces the ghost view for that
seat until the next train.

| Region | Shows |
|---|---|
| Full screen | A dark railway carriage, the window showing the line at night, the seat's own figure seated (its true look for the Killer, `world-mode.md` 4.4) |
| Top band | "On the line", and the time to the next train (the rest of the day, the night, and `train.arriveAtS` into the next day) |
| Centre | How the seat died, in a line ("A wolf in the Low Woods"), from its own death (`S2C.killed`) |
| Bottom | The seat's Notebook, read only; its quests, read only |
| Not shown | The world, other seats, roles, the ghost and Cabal channels, any chat |

**Why so little.** A seat that comes back must not know more than it knew when it fell (`world-mode.md` 6). The
Cabal channel stays closed even to a Killer or an Accomplice on the line, so a returning Cabal seat learns nothing
it could not have learned alive.

**When the line ends.** At `train.arrive` the screen fades to the world (2). At the Final Night bells, every seat on
the line returns (5).

## 7. The victories ledger

Replaces the game-over screen. Today it names the winning faction and the Drifter in `alsoWon`
(`Deck.ts:74-80`, `Win.ts:26-29,32-81`).

| Region | Shows |
|---|---|
| Top band | "The week is over", how it ended (the Killer stopped by a route, or Unseen), and the match length |
| The Killer | The Killer's seat name, its true look beside the look it wore, its vendetta, and how far its checklist got |
| Victories | One row per seat that won: the seat's name, character, portrait and the kind of victory (Law, Peaceful, Heir, Bounty, Dead Letter, Role, Town, Trade, Verdict, Gallows, Getaway, Unseen, Paint The Town Red, a vendetta's kind). Grouped by kind, the stopping route first |
| Paint The Town Red (owner answer WM3) | In a 2-human match: each Killer's unique kills and total kills, ranked by total, beside the target |
| The Hitman (owner answers WM9, WM10) | If he came: the day he arrived, the seat that was turned and its dormant role, and how far the two chances got (`world-mode.md` 1.5) |
| Everyone else | The other seats, with their characters, roles and names. This is where player names and characters are paired for the first time (`world-mode.md` 4.3) |
| Timeline | The match's key events on a strip: deaths, trains, Inquests, petitions, manhunts, Tribunals, night skips, the Hitman's arrival, the Final Night |

**Timing.** `phases.gameOverS`, 30 s, then the lobby, as today (`Win.ts:88-149`, `resetToLobby`).

## 8. Story chapter cards

For story mode (`world-mode.md` 9). A card opens on a story beat, pauses the clock (the auto harness's pause,
`Auto.ts:76-86`) and waits for the player.

| Card | Shows | Closes |
|---|---|---|
| Chapter title | The chapter's name, the map, the player's character and a line of setup | A button |
| Beat | A line of narration or dialogue, a portrait, and the next goal, if any | A button, or after the cutscene the beat plays |
| Chapter end | What the player did, what the town became, and the next chapter | A button |

## 9. Arrival: the role card and the Killer's pick

Today the role card shows the card and, for a cover role, a look picker with hints (GDD 3.17 "The cover pick").

| Seat | The card shows | Lasts |
|---|---|---|
| Killer | The Killer card, the vendetta and its checklist, the partners it faces (by role, not by name), and **the pick**: a grid of the NPC-held cards it may live as, each with its look, home and chores (`world-mode.md` 4.1). The first hint is marked | 30 s (`phases.roleRevealS`) |
| Bandit (a Killer with the heist) | As the Killer, without the pick: his own look shown instead | 30 s |
| Accomplice, Drifter | The card and the pick, from what the Killer left. The Accomplice sees the Killer's pick live | 30 s |
| Everyone else | The card, its goal and its chores. Partners of a vendetta are told "Someone in town wants you dead" or the like, by role, without naming the vendetta | 30 s |
| Both Killers in Paint The Town Red (owner answer WM3) | The Killer card, the goal and the target, each other's worn look as Cabal mates see it today, and the pick | 30 s |

**The Hitman's card** (owner answer WM9) is not shown at Arrival. The turned seat gets it at its delivery (2): a
private full-screen card, the contract, the mark's look and the train it must catch, closed by a button while the world
runs on (the clock does not pause for one seat).

## 10. The art style in the menu

Not a phase, but a screen change round 9 asks for: the art style is picked in the menu only
(`world-mode.md` 10).

| Where | Shows |
|---|---|
| The lobby's art-style card (`ui/Lobby.ts:153`) | The three styles, each with a preview of the map, as today |
| The in-match HUD (`view/Hud.ts:84,146`) | No switch. The settings gear stays |
| The meeting scene (`scenes/Meeting.ts:66`) | No switch. The phase screens never show one |
| The settings panel in a match | The style shown read only, "Change it in the lobby" |

## 11. Mock-up list for the UI session

Each mock-up is a static HTML page beside `apps/client/public/mockups/meeting.html`, in the same style, at three
widths (phone 390 px, laptop 1280 px, wide 1920 px). The UI session builds them before any screen.

| # | Mock-up | File | Based on | Must show |
|---|---|---|---|---|
| M1 | Arrival: the Killer's pick | `mockups/arrival-pick.html` | `rolecard-front.html` | The vendetta checklist, a pick grid of 8 cards, the 30 s clock |
| M2 | Arrival: a partner's card | `mockups/arrival-partner.html` | `rolecard-front.html` | The warning line without the vendetta's name |
| M3 | Dawn and the train | `mockups/dawn-train.html` | `hud.html` | The dawn card, the train banner and a manifest of 2 returning seats over the HUD |
| M4 | On the line | `mockups/on-the-line.html` | none | The carriage, the time to the train, the death line, the read-only Notebook |
| M5 | The Inquest | `mockups/inquest.html` | `meeting.html` | Full screen; body, board, town, hand; 12 entries of all four kinds; a seat on the line greyed |
| M6 | The Inquest's finding | `mockups/inquest-finding.html` | M5 | A suspect set of 3, a "Case ready" stamp on a set of 1 |
| M7 | The Tribunal | `mockups/tribunal.html` | M5 | The scales with 2 matches and 0 exclusions, the beam on Heavy Fine; the prosecution and defence columns |
| M8 | The verdict cards | `mockups/verdicts.html` | M7 | Acquittal, Heavy Fine and Death side by side |
| M9 | The end trial | `mockups/end-trial.html` | M7 | 3 filed cases as columns, the strongest first, the reading order |
| M10 | The victories ledger | `mockups/ledger.html` | none | 5 winners of 4 kinds, the Killer's true and worn looks, the timeline |
| M11 | A story chapter card | `mockups/story-card.html` | none | A title card and a beat card |
| M12 | The lobby's art-style card | `mockups/lobby.html` (update) | `lobby.html` | Unchanged; adds the "menu only" note to the in-match settings panel |
| M13 | The petition form (owner answer WM2) | `mockups/petition.html` | M6 | The accused, the charge picker, the supporting entries, the signatures with the 60 s clock |
| M14 | The manhunt banner | `mockups/manhunt.html` | `hud.html` | The banner and clock, the accused marked on the map, the cuff prompt |
| M15 | Inspect: Walk with me (owner answer WM2) | `mockups/inspect-pair.html` | `hud.html` | The new section on an inspected figure, the request, the waiting state |
| M16 | The county jail (LW9, LW10, WM11) | `mockups/jail.html` | none | The cell with 3 seats, the three mini-game prompts, the time to dawn |
| M17 | Asleep (follow-up 2) | `mockups/asleep.html` | `hud.html` | The dimmed view, "2 of 3 in bed", the wake hint |
| M18 | The lock-pick mini-game (owner answer LT2) | `mockups/lockpick.html` | `minigame.html` if present, else none | The cylinder, the pick, the tension meter, a snapped pick |
| M19 | The inventory and crafting grid (owner answer LT4) | `mockups/inventory.html` | none | Hotbar, pack, belt, equipment slots, the 2 by 2 grid and its output, a 3 by 3 workbench grid |
| M20 | The Hitman's card and the briefing toast (WM9, WM2) | `mockups/hitman-card.html` | `rolecard-front.html` | The private contract card; a briefing toast over the HUD |

**Common rules for the mock-ups** (UI.md is the source of the tokens):

- The top band of every phase screen is the same component: phase name, reason, clock.
- Portraits and nameplates show characters (`world-mode.md` 4.3) until the ledger.
- Every phase screen is full screen and has one column on a phone, where today's `.wdi-meet` (`styles.css:46-55`)
  is a 1180 px centred grid.
- Contrast and the ROSW `ui-design` plugin's checks apply, as for every round-6 mock-up (`docs/ASSETS.md` 6.10).

## 12. What changes in the code, by screen

For the round-10 build plan (`gdd-map.md`). Design only: nothing here is a contract until that plan.

| Screen | Server | Client |
|---|---|---|
| Inquest | `Meeting.ts`: `openMeeting` kept (its locked call sites), `handleVote`, `allVoted`, `startReveal` removed; a `present` command; the finding step | `ui/Meeting.ts` becomes `ui/Inquest.ts`; `.wdi-meet` becomes full screen |
| Tribunal | New `sim/Tribunal.ts`: the arrest, the case, the defence, the verdict; `lawStage` | New `ui/Tribunal.ts` |
| Final Night | `FinalNight.ts`: `enforceFinalVote` and the Cabal verdict (`:36-57`) replaced by the end trial | New `ui/EndTrial.ts` |
| Dawn and train | `Train.ts`: the returning seats at `train.arrive` | A HUD overlay |
| On the line | New `Private` field for the line, no ghost view | New `ui/OnTheLine.ts` |
| Ledger | `Win.ts`: the victories list | `ui/GameOver` reworked |
| Story cards | The beat runner (`world-mode.md` 9) | New `ui/StoryCard.ts` |
| Art style | none | `world-mode.md` 10 |
| Petition and manhunt | New `sim/law/Petition.ts`, `sim/law/Manhunt.ts`, `sim/law/Constables.ts`; the briefing | New `ui/Petition.ts`, a HUD banner |
| Walk with me | `sim/inspect/index.ts`: the pair request; `npc/` answers it | A section in the inspect panel |
| Jail | New `sim/Jail.ts`; the `cj.` scene; sentences in `sim/Tribunal.ts` | The cell scene's prompts |
| Sleep | New `sim/Sleep.ts`: the bed hold, the active count, the skip in `Phases.ts` | `ui/Asleep.ts` overlay |

## 13. The new screens of the owner answers

Not pauses: none of these stops the clock for anyone but story mode's cards (8). Each keeps the rule that nothing waits
on an NPC (second follow-up).

### 13.1 The petition (owner answer WM2)

| Step | Shows | Who |
|---|---|---|
| Open | From the Case Board's suspect row, the police board, or a sighting in the Notebook: the accused's portrait and character name, a charge picker (the crimes of `world-mode.md` 5), and the opener's supporting entries | The opener |
| Sign | A toast to every living, free human: "A petition against the Baker's look: robbery. Sign?", with the entries attached and a 60 s clock (`petition.openS`) | All living, free humans |
| Opens a manhunt | When `petition.signaturesMin` others have signed. The form closes and the banner of 13.2 opens | All |
| Lapses | At the clock's end without enough names: "The petition lapsed." | The signers |

### 13.2 The manhunt

A banner in the top band: "Manhunt: the Baker's look", the clock (`manhunt.durationS`), and on each signer's map the
accused's last-seen scene, refreshed every `notices.sampleS`. The cuff prompt shows within reach. On a cuff the banner
reads "Cuffed" and the Tribunal of 4 opens once the accused reaches the jail (a 5 s walk, or at once if the scene has no
path). The accused sees the banner too: it knows it is hunted.

### 13.3 The briefing

A toast in every HUD log and a line on the police board, `law.briefingAfterS` (30 s) after a clue is created
(`world-mode.md` 3.1). It never opens a screen.

### 13.4 Asleep (follow-up 2, owner answers NW1, NW2)

The sleeper's view dims to its bedroom, sound drops, and a counter shows "2 of 3 in bed" (the count of active players,
never their names). A move or a hit wakes it. When the skip fires, every client plays the dawn card of 2 with "You slept
through".

### 13.5 The county jail

The cell is a scene, not a screen: the jailed seats walk in it, talk, and use its three mini-game props (`world-mode.md`
5.1). The top band shows "County jail" and the time to dawn. A jailed seat cannot open the petition form or sign.

## 14. Reconciled

- **R2. The bell.** The Inquest opens only on a reported body; the Tribunal opens at the jail; the bell only gathers
  NPCs (3, 4; `world-mode.md` 3.1).
- **R3. The petition is not a vote.** The petition form collects signatures to start a manhunt and never decides guilt;
  the Tribunal's scales do (4, 13.1).
- **R10. The verdict card.** The scales show a finding (Dismissed, Proven, Murder proven), and the card shows the charge's
  sentence (4).
- **No NPC holds a screen open** (second follow-up, owner answer NW4). NPCs present evidence and sign petitions only in
  time the players already spend; a petition, a manhunt or a night skip never waits for an NPC.

The full list of reconciliations is in `world-mode.md` 12 and `gdd-map.md` 4.

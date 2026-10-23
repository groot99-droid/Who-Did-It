# The re-skin: the owner's two mockups, every screen

The owner uploaded two Claude Design exports on 2026-10-23 ("can you swap the UI with these"): a **main menu**
and a **party lobby**, both 1280 x 720 artboards. Asked three questions, the owner answered (DECISIONS A103):

1. **Buttons without a feature** (Create Profile, Friends, Quit): "show all but grey them out where empty for
   now, add them to round 7". So every button of the mockup is on the live menu; a greyed one carries the
   "Coming later" note the HD art style already uses; and Create Profile, Friends and Quit are **built this
   round** (`parties.md`), so no button is grey when the round closes.
2. **Where the name lives**: "Ask on Start, instead of the code list parties (create open parties for everyone,
   and private parties for friends with invites only". So Start Game asks the name (prefilled from the device
   profile) and the party's visibility; Join Game lists parties instead of asking a code (`parties.md`); a code
   box stays one tap away for links and codes.
3. **Scope**: "Whole game in one go". Every screen moves to the mockups' style this round: menu, lobby, role
   card, HUD, notebook, meeting, game over, settings, loading, transitions, cutscene captions, the M5b panels,
   the mini-games, the intro's Skip, the help page and the admin page.

The screenshots are `docs/ui/menu-mockup-1280x720.png` and `docs/ui/lobby-mockup-1280x720.png`. The exports
themselves (React runtime inside) are design references kept by the orchestrator and are not committed.

## 1. What the mockups are

**Style.** A night palette over a looping video of the owner's Higgsfield clip (the same clip as the landing
loop of A98; 6N ships it as `landing_loop.webm` with a `.jpg` poster, A102), under a dark veil, a vignette and
faint scanlines. Pixel type: **Press Start 2P** for the title, the party code and button labels, **Pixelify
Sans** for everything else. "Frosted glass, pixel-stepped" panels and buttons: a translucent fill with a
backdrop blur, a stepped (clip-path) corner, a thin light rim, a faint checker sheen; the primary button is the
accent on dark. The title drops in letter by letter; a `prefers-reduced-motion` rule turns every animation off
and `?video=0` (the existing flag) keeps the poster in place of the video.

**Colours in the exports** (7B adds them to `palette.json`, which is then the only source; UI.md 2 mirrors it):
background `#0A0924`, title shadows `#4B36B8` and `#251A6B`, text lilac `#C9CEFF`, white at low alpha for rims
and sheens, accent `#FFB347`. The accent is the existing `lantern` (`#FFB457`, one digit from the export; the
export's value is not added). Proposed names: `night`, `violet`, `indigo`, `lilac`, `snow`; 7B may rename,
never add a sixth.

**Menu** (`menu-mockup`): the title "WHO DID IT?"; a column of large glass buttons Start Game, Join Game, Create
Profile, Friends, Settings; a row of small ones How to Play, Credits, Quit; top right a profile chip ("Guest")
and a sound toggle; a footer `v0.1.0`.

**Lobby** (`lobby-mockup`), three columns. **A**: the party code in display type, Copy Invite Link, Change Mode (goes with the quick mode, A115),
Add NPC, the NPC skill select with its locked note, then "Players n / 10" with You / Leader / NPC tags. **B**: the
Map cards (Hollowmere, Blackpine, a blurb each and a tick on the picked one), the Art style segment (8-bit, Low
poly, HD disabled "Coming later"), a "Locate" icon button. **C**: The Deck as chips with its two notes, then
Start (leader), Ready, Leave.

## 2. What exists and is kept

- **Ids and hooks.** The e2e suites drive the screens by `data-testid`, by label and by button name. Every id
  in `ui/Lobby.ts` (`party-code`, `player-list`, `player-count`, `start`, `confirm-start`, `confirm-fill`,
  `not-ready`, `lobby-ready`, `mode-chip`, `mode-toggle`, `add-npc`, `remove-npc`, `npc-difficulty`,
  `lobby-settings`, `lobby-map`, `map-select`, `art-style*`, `lobby-deck*`, `deck-card-*`, `deck-editor`,
  `deck-role-*`, `settings-*`), in the HUD, the meeting, the game over, the M5b panels stays (the quick mode's screens leave with the mode, A115).
  A re-skin changes classes, markup and copy, never an id. Where a visible label changes because the owner's
  mockup says so ("Create Party" becomes "Start Game"), the specs change in one place (`e2e/fixtures/party.ts`,
  7C) rather than an `aria-label` that lies.
- **Copy.** Every line stays a key in `ui/copy/`; a session that needs new lines adds its own module and a
  UI.md 14 subsection (7C 14.25, 7E 14.26, 7F 14.27, 7G 14.28). The landing keys of `ui/copy/lobby.ts` are left
  in place by 7C (its menu reads `ui/copy/menu.ts`); 7P deletes the dead ones.
- **The theme gate.** `ui/theme/theme.test.ts` forbids any hex outside `palette.json` and any font family but
  the self-hosted ones, and pins the type scale, spaces and radii to `style.json` `ui`. 7B extends the gate to
  every `.css` file under `apps/client/src` (today it reads `tokens.css` and `components.css` only) and to the
  two new families; nobody else edits the test.
- **Fonts.** OFL only (ASSETS 6.5): Pixelify Sans and Press Start 2P are both SIL Open Font License 1.1 on Google
  Fonts, self-hosted as Latin woff2 like Oswald and Inter (`apps/client/src/assets/fonts/`, `LICENSES/fonts/`,
  CREDITS rows). Oswald and Inter stay for the role card's body text and the notebook, where a pixel face at
  14 px fails the contrast and legibility checks of UI.md 10; 7B measures and decides per token.
- **Reduce motion, `?video=0`, mute.** The backdrop's video pauses under reduce-motion and never loads under
  `?video=0`; the first tap starts the `lobby` theme (A98) as `landingTrailer.ts` does today; the sound toggle
  on the menu is the settings mute, nothing new.
- **The first-load budget** (ASSETS 6.8, A93): the two fonts add to `firstLoadBytes`; the loop video is fetched
  after the first paint and counts under A98's pre-match bucket; `media.test.ts` keeps passing.

## 3. The theme pieces (7B), before any screen

One PR, first, so every screen session builds on it:

- `palette.json` gains the night set; `tokens.css` carries each colour and its RGB triplet; UI.md 2 lists them
  and UI.md 10 measures the new pairs (lilac on night, bone on night, night on lantern, lilac on glass over the
  loop's darkest and brightest frames).
- `style.json` `ui.fonts` gains `pixelDisplay` and `pixelText`; `tokens.css` self-hosts both; `theme.test.ts`
  accepts exactly the four families.
- `components.css`, a block "Round 7 (7B)": `.wdi-glass` (a surface: fill, blur, stepped corner, rim, sheen),
  `.wdi-glass-btn` (`--primary`, `--ghost`, `--sm`, an icon slot and a chevron slot, the disabled state with
  the "Coming later" note), `.wdi-glass-panel`, `.wdi-glass-input`, `.wdi-glass-select`, `.wdi-tag` (You,
  Leader, NPC, Ready), `.wdi-seg` restyled, `.wdi-title` (the drop-in letters), `.wdi-backdrop` (the video, the
  veil, the vignette, the scanlines; `prefers-reduced-motion` and `?video=0` rules). Every rule reads tokens.
- `ui/backdrop.ts`: a DOM layer mounted once under `#overlay` by the scenes that show a menu surface (Landing,
  Lobby, GameOver, the Intro's end), fed by 6N's `landing_loop` rows of the video manifest and the poster until
  the video plays. The Phaser `view/Backdrop.ts` (title and `{ok, build}` footer on the canvas) is removed in the
  same PR; the DOM title and footer replace it. The World keeps its canvas.
- UI.md 6 (components) rows for each new class, written before the CSS, as round 1 did.

Every later session writes its screen's rules in its own file (`ui/menu.css` 7C, `ui/lobby.css` 7E,
`ui/match.css` and `view/hud.css` 7F, `ui/table.css` 7G), imported by its screen, using
7B's classes and tokens; `components.css` and `tokens.css` are 7B's alone this round.

## 4. The screens and their owners

| Screen | Files | Session |
|---|---|---|
| Menu, name and visibility dialog, party list, code box, profile, friends, Quit, help page | `ui/Landing.ts` (becomes the menu), `scenes/Landing.ts`, `ui/menu/**`, `ui/copy/menu.ts`, `public/help/index.html`, `e2e/fixtures/party.ts`, `e2e/party.spec.ts` (menu half), `e2e/smoke.spec.ts` | 7C |
| Lobby (three columns), map cards, art-style segment, deck chips, deck editor, confirm dialog | `ui/Lobby.ts`, `ui/lobby/**`, `ui/artStyle/**`, `ui/main/{deckList,deckChip,deckView}.ts`, `scenes/Lobby.ts`, `ui/copy/lobby.ts` (lobby keys), `ui/lobby.css`, `Lobby.test.ts`, `MapPicker.test.ts`, `DeckEditor.test.ts`, `e2e/party.spec.ts` (lobby half) | 7E |
| Role card, HUD and log, notebook, settings panel, loading screen, transitions, cutscene captions and Skip, the intro's Skip, M5b layer and panels, mini-games | `ui/RoleCard.ts`, `view/Hud.ts`, `view/hud.css`, `view/NotebookPanel.ts`, `ui/SettingsPanel.ts`, `view/LoadingScreen.ts`, `view/Transition.ts`, the DOM of `view/cutscene/CutscenePlayer.ts` (captions and Skip only; 7A owns its camera), `scenes/Intro.ts` (the Skip button only), `ui/M5bLayer.ts`, `ui/{Inventory,Crafting,QuestLog}.ts`, `view/minigames/**`, `ui/match.css`, their tests, `e2e/m5b.spec.ts` | 7F |
| Meeting, game over, seat picker, the main-mode cards, shot toast and over view, the admin page (the quick mode's screens are removed with the mode, A115, not re-skinned) | `ui/Meeting.ts`, `ui/GameOver.ts`, `ui/SeatPicker.ts`, `ui/main/{cards,overMain,shotToast,lookPortraits}.ts`, `ui/portrait.ts`, the DOM of `scenes/{Meeting,GameOver}.ts`, `client/admin/**`, `ui/table.css`, `ui/onub/onub.css`, their tests, `e2e/{meeting,onub,night,kitchen}.spec.ts` | 7G |

Screens keep their behaviour: a re-skin PR changes no rule, no number and no wire. Where a mockup shows a
control the game does not have ("Locate"), it is left out; where the game has a control the mockup lacks
(Remove NPC, the deck editor), it is kept in the mockup's style and placed where
the column has room. The HD art style stays disabled with its note.

## 5. Order and gates

7B's theme PR merges first and alone. 7C, 7E, 7F and 7G cut their branches from it (they may start reading and
drafting before, against 7B's UI.md 6 rows). 7D (`parties.md`) is independent of 7B and lands before 7C's party
list PR. 7P runs the opt-in e2e suites and the two screenshot sets (1280 x 720 and 390 x 844, UI.md 12) at the
end; the owner signs the screens off by eye.

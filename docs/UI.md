# UI design system

The DOM overlay's look: what every screen the player meets shares, from the Landing buttons to
the dark loft of the quick mode. It is implemented in `apps/client/src/ui/theme/` (tokens and
component classes, one import per screen), drawn in `apps/client/public/assets/ui/` (frames,
marks, glyphs) and previewed in `apps/client/public/theme-preview.html` and
`apps/client/public/mockups/`. Numbers in this document that are rules of play (the 12 s card
hold, the 60 s discussion, the 4 to 10 players) are `docs/GDD.md`'s; this document only says how
they look. The scale in 4 and 5 is machine-readable in the `ui` block of
`packages/content/data/style.json`, and `apps/client/src/ui/theme/theme.test.ts` fails when the
CSS drifts from it, when a colour leaves `palette.json`, or when a pair in 10 drops below its floor.

Session I, 2026-10-10. Owner review pending on the role card and the meeting screen (see 12).

## 1. Principles

1. **Readable at 390 px wide and at 200% UI scale.** Every screen is a single column on a
   phone; nothing is narrower than one thumb. Type is in `rem`, strokes and spacing in `px`, so
   browser zoom scales the words and keeps the ink crisp. Nothing is set below 12 px.
2. **Night chrome, paper controls.** The page is `ink`, panels are `slate`, and everything the
   player can touch is `bone` paper with a 2 px `ink` stroke. The eye learns in one screen
   that paper is live.
3. **One saturated accent per element.** A button is mustard or it is paper; a chip has one
   colour; a card has one faction. Saturated tokens never cover more than a tenth of a screen
   (`palette.rules.maxSaturatedAccentShare`).
4. **Night-friendly contrast.** Light on dark by default, never pure white, never pure black;
   shadows tint toward `slate` or `moon`. Every text pair clears WCAG AA at its size (10).
5. **No information carried by colour alone.** Ready, away, dead, verified, forged, selected,
   voted: each has a glyph, a word, a stroke or a shape as well as a colour. The three faction
   frames differ in corner motif, not only in hue.
6. **Role secrecy is a layout rule.** The faction colour and frame exist on the player's own
   card and in the end-of-match reveal, nowhere else. Roster rows, portraits, chips and the HUD
   have no faction class and no slot for one.
7. **Motion respects `prefers-reduced-motion`.** Decorative motion (the flip, rises, pulses)
   disappears; progress that carries information (the card's draining timer) stays.

## 2. Palette

The ten tokens of `packages/content/data/palette.json` (docs/ASSETS.md 6.1) are the only
colours. CSS exposes each as `--wdi-<name>` and as `--wdi-<name>-rgb` so an alpha variant is
written `rgb(var(--wdi-bone-rgb) / 0.72)` and no new hex is ever born. The night roles:

| Role token | Palette | Used for |
|---|---|---|
| `--wdi-bg` | ink | page, world scrim, wells (timers, code boxes, chat log) |
| `--wdi-surface` | slate | panels, dialogs, the meeting board, the card back |
| `--wdi-paper` | bone (+ grain) | cards, buttons, inputs, chips, toasts, portraits, notebook, touch controls |
| `--wdi-text` | bone | text on bg and surface |
| `--wdi-text-muted` | bone at 72% | hints, meta, eyebrows on bg and surface |
| `--wdi-text-on-paper` | ink | text on paper |
| `--wdi-text-on-paper-muted` | slate | hints and meta on paper |
| `--wdi-stroke` | ink | the 2 px stroke of every paper element |
| `--wdi-hairline` | bone at 22% | panel edges, dividers, keycaps on dark |
| `--wdi-primary` / `--wdi-on-primary` | mustard / ink | the one primary action per screen, the lead chip, the selected tab rule, the focus ring on dark |
| `--wdi-interact` | teal | links, the ready chip, the selected portrait or claim glow, interactable toasts |
| `--wdi-hazard` | magenta | hazard glows, the scream cue, hazard toasts' rule: never small text |
| `--wdi-danger` / `--wdi-on-danger` | blood / bone | destructive buttons, the forged chip, errors on paper, the vote stamp |
| `--wdi-warm` | lantern | the card timer, clock digits, the Beware rule, errors on dark |
| `--wdi-cool` | moon | night clock, the verified chip, ghost and loft glows |
| `--wdi-faction-village` / `--wdi-on-village` | moon / ink | the Village stripe and frame |
| `--wdi-faction-cabal` / `--wdi-on-cabal` | blood / bone | the Cabal stripe and frame |
| `--wdi-faction-neutral` / `--wdi-on-neutral` | mustard / ink | the Neutral stripe and frame |

Rules the roles encode: `fog` is never text below 24 px (4.23 on ink, 2.95 on slate); `magenta`
and `blood` are never text on slate (3.50 and 1.85), so an error on a panel is lantern with a
warning glyph and an error on paper is blood; `teal` and `moon` are never text on paper (1.44 and
1.56), so links live on dark surfaces only.

## 3. Type

Oswald for display (titles, buttons, names, codes, chips: uppercase, tracked) and Inter for
text (body, hints, inputs, chat). Both are self-hosted variable fonts under the OFL
(`apps/client/src/assets/fonts/`, texts in `LICENSES/fonts/`); `tokens.css` declares them.

| Token | Size | Face | Where |
|---|---|---|---|
| `--wdi-display-xl` | 44 px (36 on phones) | Oswald 600, 0.18 em tracking for codes | the party code |
| `--wdi-display-lg` | 32 px (28 on phones) | Oswald 600 | screen titles, the role name |
| `--wdi-display-md` | 24 px | Oswald 600 | section titles, dialog titles, the HUD clock |
| `--wdi-display-sm` | 18 px | Oswald 600 | buttons, the card stripe, tabs, roster and portrait names |
| `--wdi-text-lg` | 18 px | Inter 600 | the card goal |
| `--wdi-text-md` | 16 px | Inter 400 | body, dialog text, inputs (16 stops iOS zooming) |
| `--wdi-text-sm` | 14 px | Inter 400 | hints, meta, abilities, chat, toasts, card text |
| `--wdi-text-xs` | 12 px | Oswald 600 caps, 0.12 em | chips, eyebrows, touch labels; the floor |

Line height 1.1 for display, 1.45 for text. Display tracking 0.04 em; caps labels 0.12 em; the
party code 0.18 em.

## 4. Space, radius, stroke, grid

Space on a 4 px base: 4, 8, 12, 16, 24, 32, 48 (`--wdi-space-1` to `-7`). Panels pad 24 (16 on
phones); rows are at least 44 px tall (`--wdi-touch`, the hit target); gaps inside a component
are 8, between components 12, between sections 24.

Radius: 2 (stroke corners, timer bars), 6 (chips, inputs, keycaps), 10 (buttons, rows, toasts),
16 (panels, dialogs), 20 (reserved for the card when it has no frame), pill for the HUD chip and
clock. The framed card is rectangular; its outer stroke corners are 2 px.

Stroke: 2 px (`palette.rules.uiStrokePx`), round caps and joins, `ink`. Icons, marks and frames
sit on the 48 px grid (`--wdi-grid`); the frames' nine-slice margin is 24 px (`--wdi-frame-margin`).

## 5. Ink stroke and paper fill

Paper is `bone` under a grain of `ink` noise at 10% or less (`--wdi-paper-grain`, an inline SVG
turbulence; no colour of its own). Every paper element has the 2 px ink stroke; on paper, a
divider is ink at 18% and a sunken field has a 2 px ink inner shadow at the top. On dark
surfaces the stroke is `ink` too (a panel edge against the page reads as a dark gap plus a
1 px bone hairline inset), and dividers are the hairline.

Ink-stroked glyphs vanish on slate, so on a dark surface an icon sits on a paper disc
(`.wdi-icon-disc`, 36 or 48 px), as `docs/SPRITES.md` 9 requires. The faction icons on a card
stripe sit on a bone circle for the same reason.

## 6. Components

**Buttons** (`.wdi-btn`). Oswald caps at 18 px, 44 px tall, 8/16 padding, radius 10, the ink
stroke, a slate shadow. Variants: `--primary` (mustard, ink text, the one per screen),
default (paper), `--ghost` (transparent, bone text, hairline stroke, for Leave and Not yet),
`--danger` (blood, bone text, for the eject vote). Sizes `--sm` 36 px, `--lg` 56 px, `--icon`
square, `--block`. States: hover lifts 1 px and deepens the shadow; active sinks 1 px with no
shadow; `:disabled` and `aria-disabled` fade to 50% with a not-allowed cursor (the "Waking the
village..." state is a disabled primary); `aria-busy` shows a spinner after the label. Focus is
a double ring: 2 px ink against the element and 2 px mustard outside it, so it passes on paper
(ink 12.21) and on slate or ink (mustard 6.90 / 9.88).

**Inputs** (`.wdi-field`, `.wdi-label`, `.wdi-input`, `.wdi-field__msg`). Paper fields, 44 px,
16 px Inter, placeholder in slate. `--code` is the party code: Oswald, centred, uppercase,
0.18 em, 7.5 em wide. `aria-invalid` doubles the stroke in blood and the message turns
`--error`: lantern plus the warning glyph on a panel, blood on paper. The message slot keeps
its height so the layout never jumps.

**Chips** (`.wdi-chip`). 28 px, Oswald caps 12 px, paper by default. `--lead` mustard,
`--ready` teal with the check glyph, `--verified` moon with the lens glyph, `--danger` blood
with the warning glyph (forged), `--quiet` an outline with muted text for away, dead, abstained
(always with a glyph). `--vote` is the tally: the vote stamp mark and a number at 16 px.
`--claim` is a tapped sentence ("I saw Marlow at the Apothecary around 3:40", "I was the
Sin-Eater: Pell's loaf was Mourner"): Inter 14 semibold, wraps, 36 px tall; `is-selected`
takes the teal stroke and glow.

**Roster rows** (`.wdi-roster__row`). Seat, name, meta, chips in a three-column grid, 52 px
tall, hairline dividers. `is-away` fades to 65% and shows the quiet "away" chip; `is-dead`
strikes the name and shows the ghost glyph in the seat. The same row serves the Case Board
with meta "fits 1/1 known traits, claimed 0, last house: Apothecary". The seat is a paper
circle with an initial, never a role tint.

**Dialogs** (`.wdi-scrim`, `.wdi-dialog`). Ink at 72% over the screen, a slate panel at most
400 px wide, title in display-md, body muted, actions in a row with the primary first and
widest. Escape and the ghost button close.

**Toasts** (`.wdi-toasts`, `.wdi-toast`). Bottom centre above the touch cluster, paper, a
6 px left rule in teal (`--interact`: "Hold E on a glowing clue"), magenta (`--hazard`: "A
scream from the north") or lantern (`--warm`: "B at the bell calls a meeting"), the matching
glyph on a disc, and the key as a keycap on the right. Text stays ink; the rule and glyph
carry the kind.

**HUD** (`.wdi-hud` with `__tl`, `__tc`, `__tr`, `__bl`, `__br`). Safe-area aware; nothing
takes pointer events but the controls. Top-left the chip (`.wdi-hud-chip`): a paper pill with
the notebook mark on a disc, "Your goal" in caps and the goal line, a button that reopens the
card (Tab). Top centre the clock (`.wdi-hud-clock`): an ink well with lantern digits in
display-md and the phase in caps; `--night` turns the digits moon and adds the moon glow. Top
right the log (`.wdi-log`) of fading lines. Edge cues (`.wdi-edge-cue`) are a 56 px ring with
the hazard glow, pulsing.

**Touch** (`.wdi-stick`, `.wdi-touch-btn`). The stick is a 128 px ring of ink at 55% with a 56 px
paper knob. Buttons are 64 px paper discs with the key in Oswald 20 px over a 12 px caps label;
`--primary` is the 80 px mustard Use button. They sit bottom-right in a two-by-two cluster, the
stick bottom-left.

**Portraits** (`.wdi-portraits`, `.wdi-portrait`). A grid of paper tiles at least 132 px wide
(104 on phones): a 2:3 picture slot on slate, the name in display-sm, the trait icons in a row,
the vote chip pinned to the top-right corner. `is-self` has a dashed inner outline; `is-selected`
(your vote) the teal stroke and glow; `is-dead` is greyscale with a struck name and the ghost
glyph top-left; the stamp (`.wdi-stamp`, 64 px, tilted 12 degrees) lands on the ejected
portrait when the tally is revealed.

**Chat and claims** (`.wdi-chat`, `.wdi-quick`, `.wdi-tabs`). The log is an ink well of 14 px
lines, names in Oswald caps, system lines muted italic; the form is a field and a button.
Quick chat is a wrap of claim chips. Tabs (Board, Notebook, Chat) are Oswald with a 3 px
mustard rule under the selected one.

**Notebook** (`.wdi-notebook`). A ruled paper page with a 6 px inner margin rule and the tab
mark on the HUD chip; entries are icon, text and a status chip (claimed, verified, forged).

**The dark loft** (`.wdi-loft`, `.wdi-bedroll`). Ink with a moon vignette at the top, one
bedroll per seat (72 px columns, every one drawn occupied), the player's own with the moon glow;
muted text; a loft edge cue in `--cool` for each fake creak. No clock, no stick, no buttons.

**Quick-mode marks.** `mark_plate` (a bone plate with a slate rim) labels a Wake Table seat and
the reveal's plate rows; `mark_loaf` (lantern crust, blood underside, three ink scores) is the
loaf token chip and the oven-ledge count.

## 7. The role card

The card is the one place the faction shows. Structure, top to bottom (`.wdi-card`):

1. **Stripe** (`__stripe`): the faction colour, the faction icon on a bone circle, the faction
   word. Village moon with ink text, Cabal blood with bone text, Neutral mustard with ink text.
2. **Title** (`__title`): the role name, display-lg, centred.
3. **Look** (`__look`): "You look like" and the three trait icons with their labels.
4. **Goal** (`__goal`): one line, text-lg semibold, between two ink rules.
5. **Abilities** (`__ability`): up to three rows of keycap, name, cooldown.
6. **Inventory** (`__inventory`): paper chips.
7. **Card text** (`__text`): two or three sentences at 14 px.
8. **Beware** (`__beware`): the warning glyph, a 4 px lantern rule, lantern at 14% behind.
9. **Your Cabal** (`__mates`) when there are teammates.
10. **Timer** (`.wdi-timer`): an 8 px ink well, the lantern bar drains over the hold.
11. **Footer**: the Ready primary button and "Tab reopens".

The frame (`--wdi-frame-*`, drawn by `build-frames.mjs` into `public/assets/ui/frames/`) is a
192 x 288 nine-slice with 24 px margins: a 2 px ink outer rule with 2 px rounded corners, a 2 px
faction rule 6 px inside it, and a corner motif between them. Village steps like a roofline
(two nested right angles), Cabal fans like blades (three diagonals), Neutral curves like a mask
(two arcs); the plain frame, for cards that are not roles, is one step in slate. The motif is
what tells the frames apart in greyscale. In CSS the frame is `border-image` with the SVG inline,
so a card needs no asset request; the file is the same picture for Illustrator and for Phaser.

The back (`.wdi-card--back`) is slate with a bone hairline double rule and no corner motif: it
hints at nothing. The flip (`.wdi-flip`) is a 600 ms rotation under perspective; the front
starts rotated so the flip lands it face up; under reduced motion there is no rotation, only
the swap, and the timer still drains.

**Static card artboard** (for `WhoDidIt_UI.ai`, ASSETS 6.3): 400 x 600 px at 1x (800 x 1200
at 2x), the frame at 24 px, the stripe 36 px tall at 16 px from the frame, the portrait slot
384 x 576 behind the title area in V1.5, type in the sizes of 3. The Tab reopen shows this
artboard as a flat image when the DOM card is not mounted.

## 8. Shadows and glows

`--wdi-shadow-1` (2/6 slate 55%) for buttons and chips at rest, `-2` (8/24 slate 70%) for
panels and toasts, `-3` (18/48 slate 85%) for the card. Glows are a 1 px ring plus a 16 to
24 px blur of the accent at 25 to 50%: `--wdi-glow-moon` for night and the loft, `-interact`
for a selection, `-hazard` for a cue. Never a black shadow.

## 9. Motion

| What | Duration | Easing | Reduced motion |
|---|---|---|---|
| hover, press | 120 ms | `--wdi-ease` | none |
| toast, dialog, stamp rise | 220 ms | `--wdi-ease` | appears in place |
| the card flip | 600 ms | `--wdi-ease` | swap, no rotation |
| the card hold timer | the hold (GDD 2 step 4) | linear | still drains |
| edge cue pulse | 1.2 s loop | `--wdi-ease` | static ring |
| busy spinner | 0.8 s loop | linear | kept (it is status) |

## 10. Accessibility checklist and measured contrast

- [x] Every text pair below clears WCAG AA at its size; `theme.test.ts` measures them.
- [x] Non-text indicators (focus ring, selected tab rule) clear 3:1 against their surface.
- [x] Focus is visible on every control, as a double ring that works on paper and on dark.
- [x] Hit targets are 44 px or more; touch buttons 64 and 80 px.
- [x] No text below 12 px; body 16 px; inputs 16 px so phones do not zoom.
- [x] Nothing below 390 px wide needs horizontal scrolling; mockups are checked at 390.
- [x] Nothing is conveyed by colour alone (1.5).
- [x] `prefers-reduced-motion` removes decorative motion and keeps progress.
- [x] Dialogs carry `role="dialog"`, `aria-modal`, a labelled title and Escape to close; the
      role card is `role="dialog"` with `aria-modal="false"` so the HUD stays reachable.
- [x] Live regions: toasts `role="status"` (hazard ones `role="alert"`), field messages
      `role="alert"`, the lobby hint `aria-live="polite"`.
- [x] Icons that carry meaning have `alt` text; decorative ones `alt=""`.
- [ ] Screen-reader pass on the real screens once Session F adopts the classes.

Ratios are WCAG 2 relative-luminance contrast; `name@0.72` means the colour at 72% alpha
composited over the background first. Floors: 4.5 for text, 3 for large text (24 px, or
18.66 px bold) and for UI components.

| Foreground | Background | Ratio | Floor | Grade | Use |
|---|---|---|---|---|---|
| `bone` | `ink` | 12.21 | 4.5 | AAA | text on the page and in wells |
| `bone` | `slate` | 8.52 | 4.5 | AAA | text on panels and the card back |
| `bone@0.72` | `slate` | 5.23 | 4.5 | AA | muted text and hints on panels |
| `bone@0.72` | `ink` | 6.80 | 4.5 | AA | muted text on the page and in the loft |
| `ink` | `bone` | 12.21 | 4.5 | AAA | text on paper: cards, buttons, inputs, chips, toasts |
| `slate` | `bone` | 8.52 | 4.5 | AAA | muted text on paper |
| `ink` | `mustard` | 9.88 | 4.5 | AAA | primary button, lead chip, neutral stripe |
| `bone` | `blood` | 4.61 | 4.5 | AA | danger button, cabal stripe, danger chip |
| `ink` | `moon` | 7.83 | 4.5 | AAA | village stripe, verified chip |
| `ink` | `teal` | 8.48 | 4.5 | AAA | ready chip |
| `lantern` | `ink` | 10.43 | 4.5 | AAA | HUD clock digits, warnings on the page |
| `lantern` | `slate` | 7.28 | 4.5 | AAA | field errors on panels |
| `moon` | `ink` | 7.83 | 4.5 | AAA | night clock digits |
| `teal` | `slate` | 5.92 | 4.5 | AA | links on panels |
| `teal` | `ink` | 8.48 | 4.5 | AAA | links on the page |
| `blood` | `bone` | 4.61 | 4.5 | AA | field errors on paper |
| `mustard` | `slate` | 6.90 | 3 | AA | selected tab rule, focus ring on panels (non-text, 3:1) |
| `mustard` | `ink` | 9.88 | 3 | AAA | focus ring on the page (non-text, 3:1) |
| `fog` | `ink` | 4.23 | 3 | AA large / UI | display text 24 px and up only (large text, 3:1) |

Pairs the system avoids, so nobody has to re-measure them: `fog` on `slate` 2.95, `bone` on
`fog` 2.88, `magenta` on `slate` 3.50, `magenta` on `bone` 2.44, `blood` on `slate` 1.85,
`teal` on `bone` 1.44, `moon` on `bone` 1.56, `mustard` on `bone` 1.24.

## 11. Adopting it in a screen (Session F)

One import next to the existing one in `src/main.ts`, `class="wdi-root"` on `#overlay`, then
the classes. Today's selectors map as follows:

| `styles.css` today | Theme class |
|---|---|
| `.panel` | `.wdi-panel` (`.wdi-panel--wide` for the meeting board) |
| `h1`, `h2` | `.wdi-display.wdi-display--lg`, `.wdi-subtitle` |
| `label`, `input`, `input#code`, `.hint`, `.msg` | `.wdi-field` + `.wdi-label` + `.wdi-input`, `.wdi-input--code`, `.wdi-field__msg`, `.wdi-field__msg--error` |
| `button`, `button.primary` | `.wdi-btn`, `.wdi-btn--primary`; Leave and Not yet `--ghost` |
| `.row`, `.row.center`, `.divider` | `.wdi-row`, `.wdi-row--between`, `.wdi-divider` |
| `.code` | `.wdi-display.wdi-display--xl` |
| `.players li`, `.pname`, `.count`, `li.away` | `.wdi-roster` + `.wdi-roster__row`, `.wdi-roster__name`, `.wdi-roster__meta`, `.is-away` |
| `.tag`, `.tag.lead` | `.wdi-chip`, `.wdi-chip--lead`, `--ready`, `--quiet` |
| `.scrim`, `.dialog` | `.wdi-scrim`, `.wdi-panel.wdi-dialog` with `__title`, `__body`, `__actions` |
| `.rolecard`, `.inner`, `.flipped`, `.face.front/.back` | `.wdi-flip`, `.wdi-flip__inner`, `.is-flipped`, `.wdi-card.wdi-flip__face--front`, `.wdi-card.wdi-card--back.wdi-flip__face--back` |
| `.team-*` + `.stripe` | `.wdi-card--village/--cabal/--neutral` + `.wdi-card__stripe` |
| `.role-name`, `.look`, `.goal`, `.abilities li`, `kbd`, `.inventory li`, `.text`, `.beware`, `.mates` | `.wdi-card__title`, `__look`, `__goal`, `__ability`, `.wdi-kbd`, `__inventory` > `.wdi-chip`, `__text`, `__beware`, `__mates` |
| `.timer`, `.timer-bar` | `.wdi-timer`, `.wdi-timer__bar.is-running` (set `--wdi-timer-duration` or rely on `--wdi-card-hold`) |
| `.wdi-world-chip` (the World HUD in `view/hud.css` keeps a `wdi-world-*` namespace until it adopts the theme) | `.wdi-hud-chip` inside `.wdi-hud > .wdi-hud__tl` |

Landing, Lobby and the role card use these classes since round 3 (Session M); every `data-testid` is
unchanged. `ui/styles.css` is down to the page chrome (`#game`, `#overlay`, the pointer-events rule) and
five small layout classes the theme does not have: `.wdi-meet` (the meeting's board beside its side
panel), `.wdi-over` (the game-over panel), `.wdi-rolechip` (the card's reopen button), `.wdi-banner` (the
"village wakes" line) and the overlay's transparent background over the canvas.

The `h()` factory needs no change. The role card's `no-motion` class becomes unnecessary: the
flip's transition is zero under `prefers-reduced-motion` already.

## 12. Mockups and screenshots

Static pages under `apps/client/public/mockups/` (served by the dev server at
`/Who-Did-It/mockups/<name>.html`), built from the tokens and classes only, with their
screenshots at 1280 x 720 and 390 x 844 in `docs/ui/`:

| Mockup | Screen | GDD |
|---|---|---|
| `landing` | title over the fog plate, name field, Create and Join | 2 step 1 |
| `lobby` | code, copy link, roster of five, hints, Start with the confirm dialog | 2 step 3 |
| `rolecard-front`, `rolecard-back` | the Detective's card and the back of the card | 2 step 4, 3.2 |
| `hud` | chip, night clock, log, stick and buttons, a toast over a dark world | 2 steps 5 to 7 |
| `meeting` | eight portraits, the tally, chat, claim chips, the vote | 2 step 8, 3.8 |
| `loft` | the dark loft with eight occupied bedrolls and a creak cue | 3.11 |

Owner sign-off requested on the role card and the meeting screen before the frames are final.

The meeting and game-over screens are built from the mockup (`ui/Meeting.ts`, `ui/GameOver.ts`): the
reason line, the portrait grid (the villager atlas drawn to a canvas from the public traits, an initial
on slate when the atlas is absent), Report and Chat tabs with room for the Notebook, and the reveal with
tally chips, the stamp and the role line. The faction chips on the game-over rows are the one place a
faction is shown for other players.

## 13. Open points

- The paper grain is procedural (SVG turbulence) until the Illustrator master provides a
  tile; swap `--wdi-paper-grain` for a PNG if the two should match exactly.
- Role portraits (384 x 576 WebP, ASSETS 6.3) are not drawn yet; the card leaves the title
  area for them and the portrait slot on the meeting tile is slate until then.
- The loaf and plate marks are the chip-sized versions; the Wake Table props are world sprites
  and belong to the art pipeline.

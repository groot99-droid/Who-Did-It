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
   shadows tint toward `slate` or `moon`. (The night theme of round 7 lets `snow` be the pixel
   labels on glass and the rims and sheens at low alpha, as the owner's mockups draw them; 2.) Every text pair clears WCAG AA at its size (10).
5. **No information carried by colour alone.** Ready, away, dead, verified, forged, selected,
   voted: each has a glyph, a word, a stroke or a shape as well as a colour. The three faction
   frames differ in corner motif, not only in hue.
6. **Role secrecy is a layout rule.** The faction colour and frame exist on the player's own
   card and in the end-of-match reveal, nowhere else. Roster rows, portraits, chips and the HUD
   have no faction class and no slot for one.
7. **Motion respects `prefers-reduced-motion`.** Decorative motion (the flip, rises, pulses)
   disappears; progress that carries information (the card's draining timer) stays.

## 2. Palette

The ten tokens of `packages/content/data/palette.json` (docs/ASSETS.md 6.1) and its five-colour
`night` set (round 7, below) are the only colours. CSS exposes each as `--wdi-<name>` and as `--wdi-<name>-rgb` so an alpha variant is
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

**The night set (round 7, 7B, DECISIONS A106).** The owner's two mockups (`docs/round7/ui-reskin.md`)
add five colours, kept in `palette.json` `night` apart from the ten tokens because they are DOM UI
only: never in art, never in the world palette, never a runtime tint. The accent stays `lantern`
(the mockups' `#FFB347` is one digit from it and is not added).

| Token | Hex | From the mockups |
|---|---|---|
| `night` | `#0A0924` | the page behind everything, the poster's frame |
| `violet` | `#4B36B8` | the title's near shadow, the You, NPC and Ready tags |
| `indigo` | `#251A6B` | the title's far shadow, the glass fill |
| `lilac` | `#C9CEFF` | text |
| `snow` | `#FFFFFF` | rims and sheens at low alpha, the pixel labels on glass; never a fill |

| Role token | Value | Used for |
|---|---|---|
| `--wdi-night-bg` | night | the page under the backdrop, and the page when there is no video |
| `--wdi-night-text` | lilac | text on night and on glass |
| `--wdi-night-text-muted` | lilac at 80% | hints and meta on night and on glass |
| `--wdi-night-label` | snow | the Press Start 2P labels of glass buttons |
| `--wdi-night-accent` / `--wdi-on-night-accent` | lantern / night | the primary glass button, the Leader tag, the selected segment, the focus ring on night |
| `--wdi-veil` | night at 60% | over the loop video, always |
| `--wdi-vignette` | night at 50% | added toward the edges, where the footer and the chip row sit |
| `--wdi-glass-fill` | indigo at 66% | the fill of every glass surface, under its blur |

The veil and the glass alphas are the ones 10 measures, over the darkest frame the loop can show
(`night`) and the brightest (`snow`): text on glass passes whatever the video shows. Bare text on
the backdrop is display size (24 px and up) or sits in the vignette.

## 3. Type

Oswald for display (titles, buttons, names, codes, chips: uppercase, tracked) and Inter for
text (body, hints, inputs, chat). Both are self-hosted variable fonts under the OFL
(`apps/client/src/assets/fonts/`, texts in `LICENSES/fonts/`); `tokens.css` declares them.

**The pixel faces (round 7, 7B, DECISIONS A106).** The night theme adds Press Start 2P
(`--wdi-font-pixel-display`, one weight) and Pixelify Sans (`--wdi-font-pixel-text`, variable 400 to
700), both OFL, self-hosted from Fontsource 5.3.0 as Latin woff2 (12.2 and 11.7 KiB, about 24 KiB
together, bundled with the stylesheet and fetched only by a screen that uses them). `style.json`
`ui.fonts` names all four and `theme.test.ts` refuses any other family in any stylesheet under
`apps/client/src` (generic families such as `monospace` aside). The sizes are the scale below;
which face each size takes on a night surface:

| Token | Night face | Why |
|---|---|---|
| `--wdi-display-xl`, `-lg` | Press Start 2P | the title, the party code, screen titles: the mockups' display type |
| `--wdi-display-md`, `-sm` | Press Start 2P for button labels and tags in caps; Pixelify Sans 600 for panel headings ("Players 1 / 10", "The Deck") | Press Start 2P is a full em wide, so it is kept to short caps |
| `--wdi-text-lg`, `-md`, `-sm` | Pixelify Sans | body, hints, selects and inputs on glass |
| `--wdi-text-xs` | Pixelify Sans 600 | tags and eyebrows; Press Start 2P at 12 px only for one-word tags |
| running text of more than two lines: the role card's text and abilities, the notebook, the chat log | Inter (Oswald for their headings) | a pixel face at 14 px over several lines reads as noise; the colours are the same, so the contrast in 10 holds |

Never below 12 px, never synthesised bold (Press Start 2P has one weight: `font-synthesis: none`),
and the pixel faces take no tracking beyond 0.04 em.

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

**Lobby settings** (`data-testid="lobby-settings"`, between the code row and the roster). The mode
chip (`mode-chip`) reads "Who Did It" or "One Night Ultimate Baguette, {min}-{max} min, {players}"
(length from `balance.onub.json`, counts from `balance.json`); the leader sees the toggle
(`mode-toggle`), "Add NPC" (`add-npc`, hidden when the party is full), "Remove NPC" (`remove-npc`,
hidden with no NPC seats) and the difficulty select (`npc-difficulty`, disabled below
`npc.difficultyMinNpcs` NPC seats, with a hint line). Others see the chip only. No seat is ever marked
as an NPC; Remove drops the most recently added one.

**Dialogs** (`.wdi-scrim`, `.wdi-dialog`). Ink at 72% over the screen, a slate panel at most
400 px wide, title in display-md, body muted, actions in a row with the primary first and
widest. Escape and the ghost button close.

**Toasts** (`.wdi-toasts`, `.wdi-toast`). Bottom centre above the touch cluster, paper, a
6 px left rule in teal (`--interact`: "Hold E on a glowing clue"), magenta (`--hazard`: "A
scream from the north") or lantern (`--warm`: "E at the bell calls a meeting"), the matching
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

**Round 7: the night glass (7B, A106).** The owner's mockups (`docs/round7/ui-reskin.md` 1): "frosted
glass, pixel-stepped" surfaces over the loop backdrop. A screen session builds every night screen from
these classes and writes only layout in its own file. All of them read tokens (the night roles of 2,
`--wdi-glass-*`, `--wdi-step`); nothing here is a faction colour.

| Class | What it is | Variants, slots and states |
|---|---|---|
| `.wdi-glass` | The surface: `--wdi-glass-fill` under a `--wdi-glass-blur` backdrop blur, the corners cut in two pixel steps of `--wdi-step` (a `clip-path`), a 1 px snow rim at 28% with a brighter top edge and a night bevel at the bottom, and a faint 4 px snow checker sheen. Where `backdrop-filter` is missing the fill is used alone (the contrast in 10 never counts the blur) | none; every class below is a `.wdi-glass` |
| `.wdi-glass-btn` | A menu or lobby button, 56 px tall, full width of its column: an optional icon slot, the label (a text node is enough) in Press Start 2P 16 px snow caps, a chevron slot at the right | `--primary` (the one per screen: a 2 px lantern rim and a lantern chevron, a lantern wash on hover); `--ghost` (no fill and no blur, the rim only, lilac label; only on a glass panel, never bare on the backdrop); `--sm` (44 px, the label at 12 px: How to Play, Credits, Quit, Copy Invite Link). Slots `__icon` (24 px, `currentColor`) and `__chev` (a stepped triangle, shown on hover and focus, always on `--primary`). Hover lifts 2 px and brightens the rim; active sinks; focus is a 2 px lantern ring outside the step. `:disabled` and `aria-disabled="true"` fade the icon and label to 50% and greyscale them, and show `__note` ("Coming later", Pixelify 12 px lilac, never faded), as the HD art style does |
| `.wdi-glass-panel` | A column or dialog: a `.wdi-glass` with 24 px padding (16 on phones) and the bigger 8 px step | `__eyebrow` (Press Start 2P 12 px caps, lilac at 80%: "PARTY CODE"), `__title` (Pixelify 600 at 24 px: "Players 1 / 10", "The Deck"), `__hint` (Pixelify 14 px, lilac at 80%) |
| `.wdi-glass-input` | A text field on glass: night at 55% sunk into the panel, a 1 px rim, Pixelify 16 px lilac, the placeholder lilac at 80%, 44 px | focus: the lantern ring; `aria-invalid="true"`: the rim turns lantern and the message below is lantern with the warning glyph |
| `.wdi-glass-select` | The same field as a native `select` (the NPC skill) with a stepped lilac chevron drawn from two gradients; its options are night with lilac text | `:disabled` fades to 50% and the screen shows the locked note under it (`__hint`) |
| `.wdi-tag` | A seat tag, 24 px, Press Start 2P 12 px caps, the 2 px step | `--you` (violet, lilac), `--leader` (lantern, night), `--npc` (a lilac rim, no fill), `--ready` (violet with a stepped tick before the word). Each says its word, so none is told by colour alone |
| `.wdi-seg--glass` | The glass look of the segmented radio group (`.wdi-seg`, `ui/artStyle/artStyle.css`): a `.wdi-glass` strip, options in Pixelify 600 14 px lilac | `.is-on` lantern with night text; `:disabled` 50% with `.wdi-seg__note` ("Coming later") beside the group |
| `.wdi-title` | The game's title: two lines in Press Start 2P at display-xl (display-lg on phones), snow then lantern at 1.875 times that (`__line--accent`), each letter a `__ch` span with its index in `--i`, with a stepped violet then indigo shadow. The letters drop in one after another (`--wdi-title-step` apart, in pixel steps); `prefers-reduced-motion` shows them in place | `ui/theme/title.ts` `titleLetters(text)` builds the spans; the line carries the whole text as its accessible name and the letters are `aria-hidden` |
| `.wdi-backdrop` | The loop behind the night screens (`ui/backdrop.ts`, 7B's third PR): the poster, the video, the veil, the vignette and the scanlines, fixed under `#overlay`'s content | `prefers-reduced-motion` pauses the video on its frame; `?video=0` never loads it and keeps the poster |

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

The night theme (round 7). A stack such as `snow@0.04 over indigo@0.66 over night@0.6 over snow` is
composited bottom up: the brightest frame the loop could show (`snow`), the veil, the glass fill, then
a cell of the glass's checker sheen (the worst place a letter can sit). The
alphas are read from `tokens.css` by the test, so a changed token re-measures the rows.

| Foreground | Background | Ratio | Floor | Grade | Use |
|---|---|---|---|---|---|
| `lilac` | `night` | 12.77 | 4.5 | AAA | text on the night page and over the poster |
| `lilac@0.8` | `night` | 8.38 | 4.5 | AAA | muted text on the night page |
| `bone` | `night` | 12.95 | 4.5 | AAA | Inter running text kept on night surfaces |
| `night` | `lantern` | 11.06 | 4.5 | AAA | primary glass button, Leader tag, selected segment |
| `lantern` | `night` | 11.06 | 4.5 | AAA | the party code, warnings and the focus ring on night |
| `lilac` | `violet` | 5.46 | 4.5 | AA | You, NPC and Ready tags |
| `lantern` | `indigo` | 8.28 | 3 | AAA | the title's second line against its stepped shadow (large text, 3:1) |
| `lilac` | `snow@0.04 over indigo@0.66 over night` | 9.81 | 4.5 | AAA | text on glass over the loop's darkest frame |
| `lilac` | `snow@0.04 over indigo@0.66 over night@0.6 over snow` | 6.23 | 4.5 | AA | text on glass over the brightest frame possible |
| `lilac@0.8` | `snow@0.04 over indigo@0.66 over night@0.6 over snow` | 4.63 | 4.5 | AA | muted text and hints on glass |
| `snow` | `snow@0.04 over indigo@0.66 over night@0.6 over snow` | 9.51 | 4.5 | AAA | pixel labels on glass buttons |
| `lantern` | `snow@0.04 over indigo@0.66 over night@0.6 over snow` | 5.40 | 3 | AA | the primary rim and the focus ring on glass (non-text, 3:1) |
| `snow` | `lantern@0.12 over snow@0.04 over indigo@0.66 over night@0.6 over snow` | 7.70 | 4.5 | AAA | the primary label under its hover wash |
| `lilac@0.8` | `night@0.55 over snow@0.04 over indigo@0.66 over night@0.6 over snow` | 6.83 | 4.5 | AA | placeholders in glass inputs and selects |
| `lilac` | `night@0.5 over night@0.6 over snow` | 7.21 | 4.5 | AAA | bare text at the vignetted edge: the footer, the chip row |
| `lilac` | `night@0.6 over snow` | 3.41 | 3 | AA large / UI | bare display text on the veil, 24 px and up (large text, 3:1) |

Pairs the system avoids, so nobody has to re-measure them: `fog` on `slate` 2.95, `bone` on
`fog` 2.88, `magenta` on `slate` 3.50, `magenta` on `bone` 2.44, `blood` on `slate` 1.85,
`teal` on `bone` 1.44, `moon` on `bone` 1.56, `mustard` on `bone` 1.24. On the night theme:
`lantern` bare on the veil 2.96 and `lilac@0.8` bare on the veil 2.76 at the bright bound (so the
title's lantern line keeps its indigo shadow and hints sit on glass), `violet` on `night` 2.34 and
`indigo` on `night` 1.34 (shadows and fills, never text), `lilac` on `lantern` 1.15 and `snow` on
`lantern` 1.76 (the accent always takes `night` text).

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
| the meeting's claim strip (quick mode, round 4) | `.wdi-claims` > `.wdi-claims__chips` of `.wdi-chip.wdi-chip--claim` (`data-testid="claim-<roleId>"`) and `.wdi-claims__form` (`claim-target`, `claim-saw`, `claim-post`); a seat's claim under its portrait is `.wdi-portrait__claim` |
| the end screen's quick-mode extras | `.wdi-over__onub`: the dead's loaves as `.wdi-chip`, the swap log as `.wdi-timeline` (`data-testid="swaplog"`), the vote lines; a winning row is `.wdi-roster__row.is-winner` |

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
| `menu-mockup` (owner, Claude Design, 2026-10-23) | the round-7 menu: title, glass buttons, profile chip, sound toggle over the loop (`docs/round7/ui-reskin.md`) | 2 step 1, 3.21 |
| `lobby-mockup` (owner, Claude Design, 2026-10-23) | the round-7 lobby in three columns: code and seats, map cards and art style, the deck and Start | 2 step 3 |

Owner sign-off requested on the role card and the meeting screen before the frames are final.

The meeting and game-over screens are built from the mockup (`ui/Meeting.ts`, `ui/GameOver.ts`): the
reason line, the portrait grid (the villager atlas drawn to a canvas from the public traits, an initial
on slate when the atlas is absent), Report and Chat tabs with room for the Notebook, and the reveal with
tally chips, the stamp and the role line. The faction chips on the game-over rows are the one place a
faction is shown for other players.

Quick mode (round 4, DECISIONS A43) changes the same two screens and adds nothing else: the reason line
reads the dawn line, the report tab lists the dawn traces and every claim, the `vote-skip` button is
hidden and your own portrait is disabled, the chat panel gets the claim strip (a role chip posts a
role that shows nothing at once; a role that looks at a loaf opens a seat and seen-role pick first) and
each portrait shows "Claimed: <role>" under the name. The reveal stamps every seat in `outs`, names each
with the final role and lists the abstainers. The end screen keeps one row per seat with the dealt role
(`gameover-role-<id>`) and the final one beside it (`gameover-final-<id>`), then the dead's three loaves,
the swap log as a timeline and one "A voted B" line per seat; winners carry the winner mark. Every line
comes from `ui/copy/meeting.ts`.

## 13. Open points

- The paper grain is procedural (SVG turbulence) until the Illustrator master provides a
  tile; swap `--wdi-paper-grain` for a PNG if the two should match exactly.
- Role portraits (384 x 576 WebP, ASSETS 6.3) are not drawn yet; the card leaves the title
  area for them and the portrait slot on the meeting tile is slate until then.
- The loaf and plate marks are the chip-sized versions; the Wake Table props are world sprites
  and belong to the art pipeline.

## 14. Copy deck (M3)

Session Q, 2026-10-16. Every line the M3 screens show during a match, with an id. Sessions M and N
paste from here; a later change edits the line here first, then the code. The deck describes the
rules of `docs/GDD.md` and DECISIONS A30 and never changes them. It holds no number: a value in
braces is filled at run time, from state (`{name}`, `{scene}`) or from content (`{duskS}` is
`balance.phases.duskS`, `{maxChars}` is `balance.chat.maxChars`). `{name}` is a seat's public name,
`{scene}` a scene's `name` from `scenes/*.json` ("The Drowned Lantern"), `{role}` a role's `name`
from `roles.json`, `{key}` the bound key shown as a keycap. Lines on the landing, lobby and role
card already exist in `ui/{Landing,Lobby,RoleCard}.ts` and are listed in 14.11 so the deck is whole.

House style: sentence case; no exclamation marks; the second person for the player ("You are a
ghost"); the past tense for what happened ("Hana rang the bell"); the village's own words over game
words where both are clear ("body", not "corpse"; "the bell", not "the emergency button"). A toast,
prompt or log line fits one row at 390 px (UI 1.1) with its placeholders filled. Never put a role, a faction or a death that is still private into a line
another player sees (UI 1.6, A30): a living player's screen says nothing about a kill until the
body is reported or the meeting opens.

### 14.1 Toasts (`.wdi-toast`, N)

| Id | Kind | Text | When |
|---|---|---|---|
| `toast.grace.sneak` | `--interact` | Shift to sneak | grace, first of three (GDD 2 step 5) |
| `toast.grace.collect` | `--interact` | Hold E on a glowing clue | grace, second |
| `toast.grace.bell` | `--warm` | E at the bell calls a meeting | grace, third |
| `toast.dusk` | `--warm` | Night falls in {duskS} s | on entering dusk (GDD 3.3) |
| `toast.night` | `--warm` | Night falls | on entering night |
| `toast.day` | `--warm` | Morning | on entering day after a night |
| `toast.immunity` | `--warm` | Back to the square | on the `sceneEnter` that ends a meeting |
| `toast.ghost` | `--hazard` | You are a ghost | on `killed`, and on entering a World as a ghost |
| `toast.clue.found` | `--interact` | Clue in your Notebook | on `clueFound`, while the Notebook opens |
| `toast.collect.cancel` | `--interact` | Collect cancelled | a hold released or broken before it ends |
| `toast.nothing` | `--interact` | Nothing to use here | E or Use with no target in reach (today's line) |

### 14.2 Prompts (`data-testid="prompt"`, N)

The keycap comes first and is drawn by the prompt, not typed into the text; on touch the Use or Act
disc carries the key instead.

| Id | Key | Text | Target |
|---|---|---|---|
| `prompt.report` | E | Report the body | a body in reach |
| `prompt.collect` | E (hold) | Hold to collect | a clue in reach; the ring fills over the cast time |
| `prompt.bell` | E | Ring the bell | `ov.bell` on the overworld in reach |
| `prompt.bell.spent` | – | The bell is spent for you | the bell in reach and no pulls left |
| `prompt.door` | E | Enter | a door in reach (today's line) |
| `prompt.door.boarded` | – | Boarded up | a portal closed at this profile (today's line) |
| `prompt.ability` | Q / R / F | {ability} {target} | an ability row of the card with a living player in reach; `{ability}` is the card row's `name` ("Kill", "Bandage") |
| `prompt.ability.cooldown` | – | {ability} in {s} s | the same row while its cooldown runs; `{s}` is the remaining seconds |

Touch labels (`.wdi-touch-btn`): `touch.use` Use, `touch.act` Act, `touch.run` Run, `touch.sneak`
Sneak.

### 14.3 Refusals (a toast after a refused action, N)

The server's refusal codes (ARCHITECTURE 5.5) map to one line each. A refusal never says why in
terms another player could learn from: "Too far" is safe; "They are protected" is not, so the
Bandage refusal reads exactly like a missed strike that the GDD calls "nothing happens".

| Id | Code | Text |
|---|---|---|
| `refuse.notNow` | 425 | Not now |
| `refuse.busy` | 426 | Your hands are full |
| `refuse.cooldown` | 424 | Not ready yet |
| `refuse.reach` | 427 | Too far |
| `refuse.nothing` | 422 on `kill` | Nothing happens |
| `refuse.reported` | 422 on `reportBody` | Someone already reported this body |
| `refuse.bell` | a refused `bell` | The bell is spent for you |
| `refuse.locked` | 423 | Locked (and `door_locked` plays) |
| `refuse.closed` | 428 | Boarded up (and `door_locked` plays) |
| `refuse.generic` | other 4xx | That did not work |

### 14.4 HUD and log (N)

| Id | Text | Notes |
|---|---|---|
| `hud.goal` | Your goal | caps label on the chip |
| `hud.card` | Role card (Tab) | the chip's button (today's line) |
| `hud.notebook` | Notebook (N) | the button beside the chip |
| `phase.grace` | Grace | clock caption |
| `phase.day` | Day | |
| `phase.dusk` | Dusk | |
| `phase.night` | Night | `--night` clock |
| `phase.meetingDiscussion` | Discuss | |
| `phase.meetingVote` | Vote | |
| `phase.reveal` | Reveal | |
| `phase.immunity` | Calm | kills are off; the word avoids promising more than that |
| `phase.gameOver` | Over | |
| `log.scream` | A scream from the {dir} | `{dir}` from `dir.*` below; also `scream` plays |
| `log.door` | A door to the {dir} | a door noise from another player |
| `log.steps` | Footsteps to the {dir} | a run noise |
| `log.bell` | The bell rings | the bell noise, before the meeting opens |

Directions (`dirFromVector` ids): `dir.n` north, `dir.ne` north-east, `dir.e` east, `dir.se`
south-east, `dir.s` south, `dir.sw` south-west, `dir.w` west, `dir.nw` north-west.

### 14.5 Notebook (N)

| Id | Text | Notes |
|---|---|---|
| `notebook.title` | Notebook | panel title |
| `notebook.empty` | No clues yet. Hold E on a glowing clue. | no entries |
| `notebook.entry.footprints` | Footprints, {stride}: {height} | `{height}` is the `traits.json` label |
| `notebook.entry.thread` | Thread, {wool} wool: {scarf} | `{scarf}` is the `traits.json` label |
| `notebook.meta` | {scene}, {time} | `{time}` is `m:ss` from `tick - startTick` |
| `notebook.status.claimed` | Claimed | `--quiet` chip: you saw it, nobody checked it |
| `notebook.status.verified` | Verified | `--verified` chip: a Detective's entry |
| `notebook.status.teaching` | Practice | the grace clue; it says nothing about anyone |

Stride words by height: `stride.short` short stride, `stride.mid` even stride, `stride.tall` long
stride. Wool words by scarf: `wool.red` red, `wool.green` green, `wool.blue` blue. So the teaching
clue reads "Footprints, long stride: Tall", as in GDD 2 step 5.

### 14.6 Meeting (M)

| Id | Text | Notes |
|---|---|---|
| `meeting.title` | Meeting | header |
| `meeting.reason.body` | {caller} reported {victim}'s body | `meeting-reason`; `{victim}` is `bodyOf`'s name |
| `meeting.reason.bell` | {caller} rang the bell | `meeting-reason` |
| `meeting.dead.one` | {names} was found dead | system line, at the start; every death since the last meeting (A30) |
| `meeting.dead.many` | {names} were found dead | `{names}` joined with commas and "and" |
| `meeting.vanished` | {name} has vanished | a seat that left during play (cause `vanished`) |
| `meeting.discuss` | Talk it over | caption beside the discussion timer |
| `meeting.vote.open` | Votes are secret until the reveal | caption beside the vote timer; voting is open in both phases |
| `meeting.vote.hint` | Tap a portrait to vote, or Skip | living players only |
| `meeting.vote.skip` | Skip | `vote-skip` button |
| `meeting.vote.mine` | Your vote: {name} | after a vote; may change until the vote closes |
| `meeting.vote.mineSkip` | Your vote: Skip | |
| `meeting.vote.change` | Tap another portrait to change it | under `meeting.vote.mine` |
| `meeting.chip.voted` | Voted | the `hasVoted` chip on a portrait |
| `meeting.chip.dead` | Dead | `--quiet` chip with the ghost glyph |
| `meeting.chip.you` | You | the self tile |
| `meeting.allVoted` | Everyone has voted | system line when the reveal starts early |
| `meeting.tab.report` | Report | tab |
| `meeting.tab.notebook` | Notebook | tab |
| `meeting.tab.chat` | Chat | tab |

### 14.7 Chat (M)

| Id | Text | Notes |
|---|---|---|
| `chat.placeholder` | Say something | `chat-input` placeholder |
| `chat.send` | Send | button |
| `chat.limit` | {n} / {maxChars} | counter, shown once the text nears the limit |
| `chat.channel.meeting` | Meeting | channel tag on a `meeting` line |
| `chat.channel.ghost` | Ghosts | channel tag on a `ghost` line |
| `chat.closed` | Chat opens at the next meeting | a living player's form outside a meeting |
| `chat.empty` | Nothing said yet | empty log |

### 14.8 Ghost (N in the world, M in the meeting)

| Id | Text | Notes |
|---|---|---|
| `ghost.killed` | You were killed in {scene} | on `killed` with cause `knife` |
| `ghost.ejected` | The village voted you out | on `killed` with cause `ejected` |
| `ghost.vanished` | You left the match | cause `vanished`, if the client is still up |
| `ghost.secret` | Nobody knows yet. Your body is the only sign. | after `ghost.killed`, until the next meeting |
| `ghost.roles` | You can see every role now | the roles from `killed` |
| `ghost.walk` | Walk anywhere. Only ghosts can see you. | the first World after death |
| `ghost.noVote` | Ghosts cannot vote | in the meeting, in place of `meeting.vote.hint` |
| `ghost.chat` | Only the dead read this | caption on a ghost's chat form |

### 14.9 Reveal (M)

| Id | Text | Notes |
|---|---|---|
| `reveal.title` | The tally | header over the counts |
| `reveal.skip` | Skip: {n} | the Skip count |
| `reveal.ejected` | {name} is ejected | the stamp lands; `stamp` plays |
| `reveal.role` | {name} was the {role} | `reveal-role`; the faction colour appears here only (UI 1.6) |
| `reveal.none.tie` | A tie. Nobody is ejected. | |
| `reveal.none.skip` | The village skipped. Nobody is ejected. | Skip plurality |
| `reveal.none.empty` | No votes. Nobody is ejected. | nobody voted |

### 14.10 Game over (M)

| Id | Text | Notes |
|---|---|---|
| `over.village` | The village wins | `gameover-winner` |
| `over.cabal` | The Cabal wins | `gameover-winner` |
| `over.why.cabalOut` | Every Cabal member is dead or ejected | Village win (GDD 3.8) |
| `over.why.parity` | The Cabal matches the living village | Cabal win by `parity` (GDD 3.8) |
| `over.why.lastVillager` | One villager is left standing | Cabal win by `villageAtMostOne` (GDD 3.8) |
| `over.roles` | Who was who | header of the role list |
| `over.row` | {name}: {role} | `gameover-role-<playerId>`, with the faction chip and the ghost glyph for the dead |
| `over.you.won` | You won | own row's tag |
| `over.you.lost` | You lost | own row's tag |
| `over.lobby` | Back to the lobby in {s} | countdown from `phases.gameOverS` |

### 14.11 Lines that exist today (for reference)

Landing: "Gather your party", "You are invited", "Your name", "{min} to {max} characters", "Create
Party", "Join Party", "or join a friend", "Party code", "Connecting...", "Waking the village..."
(GDD 2 step 1), "Name must be {min} to {max} characters.". Lobby: "Party code", "Copy invite link",
"Link copied", "Copy failed", "Players {n} / {max}", "you", "leader", "ready", "away", "Ready",
"Not ready", "Leave", "Waiting for the leader to start.", "Everyone in? Start when the party is
ready.", the confirm "Start with {n} players?", "Roles are dealt at once and the party locks. Nobody
can join after this.", "Deal the roles", "Not yet". Role card: "Village", "Cabal", "Neutral", "You
look like: {height} / {scarf} / {hat}", "Beware:", "Your Cabal:", "Tab reopens this card", "Your
role", "Keep your screen to yourself.", "Ready - role card (Tab)". The role name, goal, card text,
Beware line and ability names come from `roles.json` and `abilities.json`, never from this deck.

### 14.12 Quick mode: lobby chip, deck editor, Evening Prep and the prep board (5C)

Session 5C, 2026-10-18 (replaces the round-4 section; the night, the Rush, the claim form, the reveal and
the end screen are 14.14, 5D). Every line Evening Prep shows (GDD 3.11, DECISIONS A49). Names come from
content and are never restated here: station `name` and `gloss`, card `name` and `text`, role `name` and
`gloss`. No line shows another seat during prep, and nothing here changes when someone else commits (A21, A39).
The fiction's words stay put: a **pile**, the **thaw**, the **Mother Dough**, the **Pantry**.

**Lobby chip** (V, `data-testid="mode-chip"`; the length is `targetLengthMin`, the counts `balance.players`).

| Id | Text | Notes |
|---|---|---|
| `lobby.mode.main` | Who Did It | the chip in the main mode |
| `lobby.mode.onub` | One Night Ultimate Baguette, {min}-{max} min, {players} | `{players}` is `lobby.mode.players` |
| `lobby.mode.players` | {min}-{max} players | |
| `lobby.mode.toggle` | Change mode | leader-only `mode-toggle` |
| `lobby.mode.leaderOnly` | The leader picks the mode | under the chip for everyone else |
| `lobby.mode.onub.hint` | One night, one vote. What you hold at dawn is what you are. | under the chip in quick mode |

If the game is ever sold, `lobby.mode.onub` becomes the neutral label of GDD 3.11 (A22) and no other line uses
the parody title.

**Deck editor** (`deck-editor`; the leader toggles `deck-role-<roleId>`, `deck-reset` is leader-only,
`deck-problem` shows the first problem of `onubDeckProblem`; `{need}` is the party size after the NPC fill plus
`pantry.roles`).

| Id | Text | Notes |
|---|---|---|
| `onub.deck.title` | Quick-mode deck |  |
| `onub.deck.hint` | Pick the roles in play. The deck holds the party size plus {pantry} cards for the Pantry. |  |
| `onub.deck.count` | {n} cards, {need} needed |  |
| `onub.deck.reset` | Default deck |  |
| `onub.deck.copies` | x{n} |  |
| `onub.deck.problem.unknownRole` | The deck names a role that does not exist. | problem id `unknownRole` |
| `onub.deck.problem.notShipped` | The deck holds a role that is not in this version. | `notShipped` |
| `onub.deck.problem.copies` | A role appears too many or too few times. | `copies` |
| `onub.deck.problem.missingRequired` | The deck needs at least one Mold Spore. | `missingRequired` |
| `onub.deck.problem.size` | The deck needs {need} cards for this party; it has {n}. | `size` |

**Kitchen** (`kitchen`, `onub-clock`, `station-<stationId>`, `station-room`, `station-back`).

| Id | Text | Notes |
|---|---|---|
| `onub.kitchen.title` | Evening Prep |  |
| `onub.kitchen.caption` | Pick a station. Play its game, then play one card. |  |
| `onub.kitchen.clock` | {s} s |  |
| `onub.kitchen.clock.label` | Time left in the kitchen |  |
| `onub.kitchen.room.label` | {station}, {gloss} |  |
| `onub.station.back` | Back to the kitchen |  |
| `onub.station.room` | In {station} |  |

**Mini-games** (`minigame-<stationId>`, `minigame-assist` after `timers.minigameAssistS`; the result never
reaches the wire).

| Id | Text | Notes |
|---|---|---|
| `onub.mini.crates.hint` | Drag {steps} crates onto the cart, then stop the needle inside the cold band. |  |
| `onub.mini.crates.dial` | Stop the needle |  |
| `onub.mini.crates.load` | Load a crate |  |
| `onub.mini.crates.stop` | Stop |  |
| `onub.mini.pour.hint` | Hold to pour. Let go with the level inside the line. |  |
| `onub.mini.pour.flour` | Flour |  |
| `onub.mini.pour.water` | Water |  |
| `onub.mini.pour.spilled` | Too much. The bowl is empty again. |  |
| `onub.mini.pour.hold` | Hold to pour |  |
| `onub.mini.slide.hint` | Slide {steps} bannetons into the glowing slots. |  |
| `onub.mini.slide.next` | Slide in the next banneton |  |
| `onub.mini.stoke.hint` | Tap to feed the fire. Hold the needle in the band for {holdS} s. |  |
| `onub.mini.stoke.tap` | Feed oak |  |
| `onub.mini.stoke.progress` | {s} s held |  |
| `onub.mini.done` | Done. Choose a card. |  |
| `onub.mini.assist` | Done |  |
| `onub.mini.assist.hint` | Stuck? Skip the game. |  |

**Hand and commit** (`hand`, `card-<cardId>`, `prep-commit`, `prep-done`).

| Id | Text | Notes |
|---|---|---|
| `onub.hand.title` | Your hand |  |
| `onub.hand.hint` | Play one card into the pile. It cannot be taken back. |  |
| `onub.hand.sabotage` | Sabotage |  |
| `onub.hand.good` | Good |  |
| `onub.prep.commit` | Play this card |  |
| `onub.prep.pick` | Pick a card |  |
| `onub.prep.done` | Your card is in the pile. |  |
| `onub.prep.wait` | Waiting for the kitchen to close. |  |
| `onub.prep.auto` | The kitchen chose for you. | the server committed at the timeout |
| `onub.prep.yours` | You worked {station} and played {card}. |  |
| `onub.refuse.prep` | That card cannot be played here. | a 422 on `onub.prep` (the commit went unanswered) |

**The crime scenes** (`prep-board`, `pile-<stationId>`, `ruin-banner`, `under-mix-flag`, `perk-card`; 5D reuses
these through `renderPiles` on the Rush board).

| Id | Text | Notes |
|---|---|---|
| `onub.board.pile` | {station} |  |
| `onub.board.empty` | Nobody came here. |  |
| `onub.board.lost` | {count} card lost to the thaw |  |
| `onub.board.lost.many` | {count} cards lost to the thaw |  |
| `onub.board.net` | Sabotage weight {net} |  |
| `onub.board.underMix` | Under-mixed: one card is not a dough. |  |
| `onub.board.ruin` | The Mother Dough is ruined. |  |
| `onub.board.ruin.weight` | Ruin weight {n} |  |
| `onub.board.ok` | The Mother Dough holds, for now. |  |
| `onub.board.perk` | Someone proofed in peace and peeked at the Pantry. |  |
| `onub.board.perk.card` | The Pantry showed you {station}. | `perk-card`, a proofing visitor only |
| `onub.board.card.sabotage` | Sabotage | screen-reader suffix on a sabotage card, public by design after prep |
| `onub.board.card.good` | Good |  |

### 14.13 NPC lobby (V)

Session Y, 2026-10-16. The lobby lines of GDD 3.12 and DECISIONS A39. NPC seats look like every other
seat on the roster, so no line names, counts or tags a seat as an NPC except the leader's own
controls, and they only count (`Settings.npcSeats`, which is public). `{min}` is `balance.players.min`,
`{need}` is `npc.difficultyMinNpcs`, `{level}` a difficulty's label below.

| Id | Text | Notes |
|---|---|---|
| `lobby.npc.add` | Add NPC | leader-only `add-npc`; hidden when the party is full |
| `lobby.npc.remove` | Remove NPC | leader-only `remove-npc`; hidden when `npcSeats` is 0 |
| `lobby.npc.remove.hint` | Removes the NPC added last | `title` of `remove-npc` |
| `lobby.npc.difficulty` | NPC skill | label of `npc-difficulty` |
| `npc.level.easy` | Easy | option |
| `npc.level.normal` | Normal | option |
| `npc.level.hard` | Hard | option |
| `lobby.npc.difficulty.locked` | Skill opens with {need} NPC seats. Until then they play {level}. | the select disabled; `{level}` is the default's label |
| `lobby.hint.fill` | Short of players? NPC villagers take the empty seats at Start. | leader, when the party is below `{min}` |
| `lobby.confirm.fill` | NPC villagers fill the party up to {min}. | the Start confirm, under its question, when the party is below `{min}` |
| `lobby.practice` | Practice party: roles on, the Cabal wins with one villager left | at the practice size of GDD 3.9, NPC seats included (GDD 2 step 3) |

The difficulty labels are the keys of `balance.json` `npc.difficulty` in sentence case; a level the
deck does not list shows its key. `lobby.hint.fill` replaces the interim "NPC fill is coming" line
(A28, removed by A39).

### 14.14 Quick mode: night, morning and end (5D)

Round 5, Session 5D (GDD 3.11, DECISIONS A49, A55). Every line the ONUB v2 night, dawn, Morning Rush, CRUST,
reveal and end screen show, in the house style above; `ui/copy/onubNight.ts` carries them verbatim. Names come
from content (`roles.onub.json`, `balance.onub.json`) and are never restated here. `{key}` values are filled by
the caller. The narrator's lines are the same on every page and name only the window's role (invariant O9).


**The night**

| Id | Text |
|---|---|
| `onub.night.caption` | The kitchen is dark. Keep your eyes shut. |
| `onub.night.waiting` | The night shift has not been called yet. |
| `onub.night.clock` | Window closes in {s} s |
| `onub.night.slot.seatRole` | {name}'s Role card |
| `onub.night.slot.seatLoc` | {name}'s Location card |
| `onub.night.slot.pantryRole` | Pantry Role card {n} |
| `onub.night.slot.pantryLoc` | Pantry Location card {n} |
| `onub.night.slot.you` | You |

**The role scene**

| Id | Text |
|---|---|
| `onub.wake.title` | You wake as {role} |
| `onub.wake.mates` | You see: {names} |
| `onub.wake.seen` | The Spores are: {names} |
| `onub.wake.alone.champignon` | You are the only Spore at the table. The other card lies in the Pantry. |
| `onub.wake.alone.commis` | You are the only Commis at the table. The other lies in the Pantry. |
| `onub.wake.nothing` | Nothing to do but remember. |
| `onub.wake.must` | You must act before the lamp dims. |
| `onub.wake.done` | Done. Wait for the lamp to dim. |

**The narrator, one pair per waking role**

| Id | Text |
|---|---|
| `onub.narrator.boulanger.wake` | Le Boulanger, réveillez-vous… posez la cloche de fonte. |
| `onub.narrator.boulanger.sleep` | Le Boulanger, rendormez-vous. |
| `onub.narrator.champignon.wake` | Les Champignons, réveillez-vous… reconnaissez-vous dans le noir. |
| `onub.narrator.champignon.sleep` | Les Champignons, rendormez-vous. |
| `onub.narrator.levain.wake` | Le Levain, réveillez-vous… comptez les spores. |
| `onub.narrator.levain.sleep` | Le Levain, rendormez-vous. |
| `onub.narrator.apprenti.wake` | L'Apprenti, réveillez-vous… lisez le registre du poste. |
| `onub.narrator.apprenti.sleep` | L'Apprenti, rendormez-vous. |
| `onub.narrator.ratDeCave.wake` | Le Rat de Cave, réveillez-vous… soulevez la grille. |
| `onub.narrator.ratDeCave.sleep` | Le Rat de Cave, rendormez-vous. |
| `onub.narrator.commis.wake` | Les Commis, réveillez-vous… cherchez votre vis-à-vis. |
| `onub.narrator.commis.sleep` | Les Commis, rendormez-vous. |
| `onub.narrator.chef.wake` | Le Chef de Cuisine, réveillez-vous… ouvrez les dossiers. |
| `onub.narrator.chef.sleep` | Le Chef de Cuisine, rendormez-vous. |
| `onub.narrator.aboyeur.wake` | L'Aboyeur, réveillez-vous… regardez l'écran vert. |
| `onub.narrator.aboyeur.sleep` | L'Aboyeur, rendormez-vous. |
| `onub.narrator.sousChef.wake` | Le Sous-Chef, réveillez-vous… sonnez la cloche de laiton. |
| `onub.narrator.sousChef.sleep` | Le Sous-Chef, rendormez-vous. |
| `onub.narrator.tourrier.wake` | Le Tourrier, réveillez-vous… repliez la recette. |
| `onub.narrator.tourrier.sleep` | Le Tourrier, rendormez-vous. |
| `onub.narrator.plongeur.wake` | Le Plongeur, réveillez-vous… rangez les casseroles. |
| `onub.narrator.plongeur.sleep` | Le Plongeur, rendormez-vous. |
| `onub.narrator.gardeManger.wake` | Le Garde Manger, réveillez-vous… rentrez du bon pied. |
| `onub.narrator.gardeManger.sleep` | Le Garde Manger, rendormez-vous. |
| `onub.narrator.inspecteur.wake` | L'Inspecteur Sanitaire, réveillez-vous… dernière tournée. |
| `onub.narrator.inspecteur.sleep` | L'Inspecteur Sanitaire, rendormez-vous. |

**Night acts, one label and two pick prompts per act of balance.onub.json**

| Id | Text |
|---|---|
| `onub.act.cloche.label` | Set the Iron Cloche |
| `onub.act.cloche.pick` | Pick the card to cover |
| `onub.act.cloche.pick2` | Pick the card to cover |
| `onub.act.sporePeek.label` | Peek at the Pantry |
| `onub.act.sporePeek.pick` | Pick a Pantry Role card |
| `onub.act.sporePeek.pick2` | Pick a Pantry Role card |
| `onub.act.peekLoc.label` | Read the shift log |
| `onub.act.peekLoc.pick` | Pick another player's Location card |
| `onub.act.peekLoc.pick2` | Pick another player's Location card |
| `onub.act.vent.label` | Swap through the grate |
| `onub.act.vent.pick` | Pick the Location card to take: a player's or the Pantry's |
| `onub.act.vent.pick2` | Pick the Location card to take |
| `onub.act.peekRole.label` | Audit one file |
| `onub.act.peekRole.pick` | Pick another player's Role card |
| `onub.act.peekRole.pick2` | Pick another player's Role card |
| `onub.act.peekPantry.label` | Audit the Pantry |
| `onub.act.peekPantry.pick` | Pick a Pantry Role card |
| `onub.act.peekPantry.pick2` | Pick a second Pantry Role card |
| `onub.act.peekLocs.label` | Check the monitor |
| `onub.act.peekLocs.pick` | Pick another player's Location card |
| `onub.act.peekLocs.pick2` | Pick a second Location card |
| `onub.act.rob.label` | Ring the bell |
| `onub.act.rob.pick` | Pick the player whose Role card you take |
| `onub.act.rob.pick2` | Pick the player whose Role card you take |
| `onub.act.laminatePeek.label` | Fold in the recipe |
| `onub.act.laminatePeek.pick` | Pick a Pantry Role card to look at |
| `onub.act.laminatePeek.pick2` | Pick a Pantry Role card to look at |
| `onub.act.laminateSwap.label` | Fold it into the line |
| `onub.act.laminateSwap.pick` | Pick the player whose Role card takes it |
| `onub.act.laminateSwap.pick2` | Pick the player whose Role card takes it |
| `onub.act.drunk.label` | Stumble back |
| `onub.act.drunk.pick` | Pick a Pantry Role card to swap with yours |
| `onub.act.drunk.pick2` | Pick a Pantry Role card to swap with yours |
| `onub.act.dishRoles.label` | Swap two Role cards |
| `onub.act.dishRoles.pick` | Pick the first player's Role card |
| `onub.act.dishRoles.pick2` | Pick the second player's Role card |
| `onub.act.dishLocs.label` | Swap two Location cards |
| `onub.act.dishLocs.pick` | Pick the first player's Location card |
| `onub.act.dishLocs.pick2` | Pick the second player's Location card |
| `onub.act.inspect.label` | Sweep your own cards |
| `onub.act.inspect.pick` | Nothing to pick |
| `onub.act.inspect.pick2` | Nothing to pick |
| `onub.act.confirm` | Do it |
| `onub.act.picked` | {n} of {total} picked |

**What a peek, a swap or a sighting showed (nightReveal rows)**

| Id | Text |
|---|---|
| `onub.reveal.title` | What you learned |
| `onub.reveal.role` | {card} is {value} |
| `onub.reveal.loc` | {card} is {value} |
| `onub.reveal.own` | You now hold {value} |
| `onub.reveal.mate` | {name} was dealt {value} |
| `onub.reveal.face.dealt` | As dealt |
| `onub.reveal.face.seen` | Seen |
| `onub.cloche.token` | Iron Cloche |

**Dawn**

| Id | Text |
|---|---|
| `onub.dawn.title` | Dawn |
| `onub.dawn.text` | Grey light under the door. The night shift is over. |
| `onub.dawn.cloche` | The Iron Cloche lies on {card}. |
| `onub.dawn.noCloche` | No Iron Cloche was set down. |

**The Morning Rush**

| Id | Text |
|---|---|
| `onub.rush.title` | The Morning Rush |
| `onub.rush.deck` | In the kitchen tonight |
| `onub.rush.cloche` | The Iron Cloche lay on {card}. |
| `onub.rush.claims` | Claims |
| `onub.rush.claims.empty` | Nobody has claimed anything yet. |
| `onub.rush.claimed` | Claimed {role} |

**Claims**

| Id | Text |
|---|---|
| `onub.claim.open` | Make a claim |
| `onub.claim.edit` | Change your claim |
| `onub.claim.close` | Cancel |
| `onub.claim.role` | I was dealt |
| `onub.claim.station` | I worked at |
| `onub.claim.card` | and played |
| `onub.claim.saw` | I saw |
| `onub.claim.saw.add` | Add a sighting |
| `onub.claim.saw.remove` | Remove |
| `onub.claim.saw.target` | Whose card |
| `onub.claim.saw.pantry` | The Pantry |
| `onub.claim.saw.kind` | What it was |
| `onub.claim.saw.role` | a Role card |
| `onub.claim.saw.station` | a Location card |
| `onub.claim.saw.value` | Which |
| `onub.claim.none` | Not saying |
| `onub.claim.post` | Post claim |
| `onub.claim.line` | {name} says: {parts}. |
| `onub.claim.part.role` | dealt {role} |
| `onub.claim.part.station` | worked at {station} |
| `onub.claim.part.card` | played {card} |
| `onub.claim.part.saw` | saw {sightings} |
| `onub.claim.saw.seatRole` | {name}'s Role card was {role} |
| `onub.claim.saw.seatStation` | {name}'s Location card was {station} |
| `onub.claim.saw.pantryRole` | the Pantry holding {role} |
| `onub.claim.saw.pantryStation` | the Pantry holding {station} |

**The vote and CRUST**

| Id | Text |
|---|---|
| `onub.vote.pantry` | The Pantry |
| `onub.vote.pantry.hint` | Point at nobody |
| `onub.vote.count1` | Un… |
| `onub.vote.count2` | deux… |
| `onub.vote.count3` | trois… |
| `onub.vote.crust` | CRUST! |
| `onub.vote.countdown` | Un, deux, trois, CRUST! |

**The Final Bake**

| Id | Text |
|---|---|
| `onub.out.title` | The Final Bake |
| `onub.out.line` | {name} goes in the oven: {role} |
| `onub.out.hop` | The Critique's pen drags {name} in too. |
| `onub.out.pantry` | The Pantry was pointed at. |
| `onub.out.none` | Nobody goes in the oven. |
| `onub.out.abstained` | Did not point: {names} |
| `onub.out.votes` | Votes: {tally} |

**The end screen**

| Id | Text |
|---|---|
| `onub.over.row.croissantAndBakers` | The Croissant and the Bakers win |
| `onub.over.row.croissant` | The Stale Croissant wins alone |
| `onub.over.row.ruined` | The Mother Dough is ruined: Team Mold wins |
| `onub.over.row.sporeOut` | A Mold Spore goes in the oven: the Loyal Bakers win |
| `onub.over.row.sporesHide` | The Spores stay out of the oven: Team Mold wins |
| `onub.over.row.cleanTable` | A clean table: the Loyal Bakers win |
| `onub.over.row.moldOut` | Team Mold goes in the oven: the Loyal Bakers win |
| `onub.over.row.wrongOven` | The wrong oven: Team Mold wins |
| `onub.over.nobody` | Nobody wins |
| `onub.over.seats` | Every card |
| `onub.over.seat.role` | Role: dealt {dealt}, held at dawn {final} |
| `onub.over.seat.loc` | Location: worked {dealt}, held at dawn {final} |
| `onub.over.seat.card` | Played {card} |
| `onub.over.seat.auto` | The kitchen chose for them |
| `onub.over.seat.won` | Won |
| `onub.over.pantry` | The Pantry |
| `onub.over.pantry.role` | Role card {n}: dealt {dealt}, at dawn {final} |
| `onub.over.pantry.loc` | Location card {n}: dealt {dealt}, at dawn {final} |
| `onub.over.piles` | The piles |
| `onub.over.pile` | {station}: {cards} |
| `onub.over.pile.lost` | lost to the thaw: {cards} |
| `onub.over.pile.empty` | no cards |
| `onub.over.pile.net` | net weight {net} |
| `onub.over.ruin` | Ruin weight {weight}: {state} |
| `onub.over.ruin.yes` | ruined |
| `onub.over.ruin.no` | the dough held |
| `onub.over.cloche` | The Iron Cloche lay on {card} |
| `onub.over.votes` | Who pointed at whom |
| `onub.over.vote` | {from} pointed at {to} |
| `onub.over.vote.pantry` | the Pantry |
| `onub.over.vote.none` | Nobody pointed at anyone. |

**The night as a timeline**

| Id | Text |
|---|---|
| `onub.log.title` | The night, window by window |
| `onub.log.empty` | Nobody did anything all night. |
| `onub.log.auto` | (the kitchen chose for them) |
| `onub.log.cloche` | {role} set the Iron Cloche on {a} |
| `onub.log.sporePeek` | {role} peeked at {a} |
| `onub.log.peekLoc` | {role} peeked at {a} |
| `onub.log.vent` | {role} swapped their Location card with {a} |
| `onub.log.peekRole` | {role} peeked at {a} |
| `onub.log.peekPantry` | {role} peeked at {a} and {b} |
| `onub.log.peekLocs` | {role} looked at {a} and {b} |
| `onub.log.rob` | {role} took {a} |
| `onub.log.laminatePeek` | {role} looked at {a} |
| `onub.log.laminateSwap` | {role} swapped the Pantry card with {a} |
| `onub.log.drunk` | {role} swapped with {a}, without looking |
| `onub.log.dishRoles` | {role} swapped {a} and {b}, without looking |
| `onub.log.dishLocs` | {role} swapped {a} and {b}, without looking |
| `onub.log.inspect` | {role} checked their own cards |

### 14.16 Main deck, looks and the night roles (5G)

Session 5G, round 5. The main-mode screens of GDD 3.1, 3.2, 3.8 and 3.17, in `apps/client/src/ui/main/` with their
lines in `ui/copy/deck.ts` (`DECK_COPY`). The deck is public by design: every line below reads only the cards and
looks of `roles.json` and `looks.json`, never a deal. `{cards}` and `{players}` are counts, `{look}` a look's name with
its article ("the Baker"), `{name}` a seat's name.

| Id | Text | Where |
|---|---|---|
| `deck.title` | The deck | header of `lobby-deck` |
| `deck.size` | {cards} cards for {players} players | `lobby-deck-size`, the party filled to four at least |
| `deck.note` | Every Killer card is dealt. Two other cards stay in the box, and which two is secret. | under the lobby list |
| `deck.practice` | Practice party: the Cabal wins with one villager left. | `lobby-deck-practice`, at the practice size |
| `deck.twice` | {name} x2 | a repeated card (the ten-seat deck's second Killer) |
| `deck.chip.label` | Deck: {cards} cards | `hud-deck-toggle` |
| `deck.chip.open` / `deck.chip.close` | Show the deck / Hide the deck | `aria-label` of the toggle; the list is `hud-deck-list` |
| `look.badge` | Walks as {look} | `title` of the look tag on a meeting portrait (`look-<seatId>`) |
| `reveal.look` | Walking as {look}. | appended to the ejection line of a main-mode reveal |
| `shot.line` | {from} fired the Last Shot: {target} was the {role}. | `shot-toast`, during a reveal, for 7 s |
| `over.looks` | Who walked as who | header of `gameover-looks` |
| `over.looks.row` | {name} walked as {look} | `gameover-look-<seatId>` |
| `over.undealt` | The cards left in the box | header of `gameover-undealt` |
| `over.undealt.none` | No card was left in the box. | when `undealt` is empty |
| `over.alsoWon` | Also won | header of `gameover-alsowon`, from `gameOver.alsoWon` |
| `over.alsoWon.row` | {name} was ejected as the Drifter | an ejected Drifter's win beside the winning faction |

The lobby list shows nothing in the quick mode. The look tag takes the look's own base colour (`looks.json`
`palette.base`), and the trait portrait (height, scarf, hat) stays under it. The night-power picker and the Last Shot
aim list wait for 5F's `ui/SeatPicker.ts` and a mount point in the world HUD (5I's files).

### 14.17 Map row (5J)

Session 5J, round 5. The lobby's map row of GDD 3.13 (`ui/lobby/MapPicker.ts`, module `ui/copy/maps.ts`). It
shows only in the main mode (`showsMapRow`), under the frozen test id `map-select`, whose `data-map` is the
map shown as chosen. Each map shows its `name` and `blurb` from `maps/<id>.json` (data, not copy) and its
`thumb_<mapId>` image once the manifest has it. `{name}` is a map's `name`.

| Id | Text | Notes |
|---|---|---|
| `lobby.map.label` | Map | leader only: label of the radio group, one option per map (`role="radio"`, `aria-checked`) |
| `lobby.map.pick` | Play on {name} | `aria-label` of each option; picking sends `lobby.settings {map}` |
| `lobby.map.current` | Map: {name} | everyone but the leader: the one read-only line, with the blurb under it |

### 14.18 Art-style switch (5N)

Session 5N, round 5 (DECISIONS A79, A80). The segmented control of `ui/artStyle/ArtStyleSwitch.ts` (module
`ui/copy/artStyle.ts`). One option per shipped style of `style.json` `artStyles`, then one disabled option per reserved
id. It is a radio group: the checked option has `aria-checked="true"` and is the only tab stop, the arrow keys move and
select, and the buttons are at least `--wdi-touch` high. It sits in the lobby settings, in the World HUD's top right
and, in the DOM-only quick-mode screens, at the bottom left. The pick is per player and never sent. The loading veil
(`art-veil`, `role="status"`) covers the screen while textures swap; a failed swap shows `art-notice`
(`role="alert"`) for four seconds. A style name comes from `artStyle.name.<id>`.

| Id | Text | Notes |
|---|---|---|
| `artStyle.label` | Art style | group label; hidden visually in the compact placements |
| `artStyle.name.8bit` | 8-bit | option |
| `artStyle.name.lowpoly` | Low poly | option |
| `artStyle.name.hd` | HD | disabled option; `aria-describedby` the hint below |
| `artStyle.reserved.hint` | Coming later | beside a reserved option and its `title` |
| `artStyle.pick` | Play in {style} | `aria-label` of each shipped option |
| `artStyle.loading` | Changing the look... | the veil |
| `artStyle.changed` | Look: {style} | reserved for a screen-reader announcement |
| `artStyle.failed` | Could not load {style}. Staying on {current}. | the notice |
| `artStyle.hint` | Only your own screen changes. | reserved for the lobby hint |

Frozen test ids: `art-style` (the group), `art-style-<id>` (an option), `art-veil`, `art-notice`.

### 14.20 Cutscenes (6J)

Session 6J, round 6 (DECISIONS A92). `view/cutscene/CutscenePlayer.ts` plays a cutscene of
`packages/content/data/cutscenes/` over the World scene; module `ui/copy/cutscenes.ts`. A caption is one line at the
bottom of the screen, replaced by the next and faded out when its time is up (`data-style` `narrator`, `title` or
`whisper`); a caption is at most 90 characters and a content id never carries text. The HUD, the role-card chip and the
touch cluster are hidden while a cutscene plays (`body.wdi-cutscene-on`); the opening's `cardSlam` step brings only the
role chip back, slamming in (`body.wdi-cutscene-slam`). Skip is a ghost button at the top right and the Escape key,
present only when the cutscene is skippable. Reduce-motion turns camera moves into cuts and stops the fades.
`?cutscene=0` plays none; `?cutscene=1` makes the mock Start send the HollowMere opening.

| Id | Text | Notes |
|---|---|---|
| `cutscene.skip` | Skip | the button |
| `cutscene.skip.label` | Skip the cutscene | its `aria-label` |
| `cs.hollowmere.<line>` | the opening's captions | `title`, `seven`, `laid`, `own`, `train`, `dusk`, `end`, `vicar`, `letter`, `nobody`, `check`, `miss`; the Bible's Book I.1 trimmed |

Frozen test ids: `cutscene` (the layer, with `data-cutscene`), `cutscene-caption`, `cutscene-skip`.
### 14.22 Sound settings (6L)

Session 6L, round 6. The gear of `ui/SettingsPanel.ts` (module `ui/copy/settings.ts`), mounted in the landing's
`settings-slot`, in the lobby's settings block and in the World HUD's top right. A button of at least `--wdi-touch`
opens a small paper panel with two sliders, music and sound effects (0 to 100, one tab stop each), and a mute
checkbox; Esc closes it and returns focus to the gear. A change applies at once to the sound that is playing and is
kept in `localStorage['wdi:audio']`; it is per player and never sent. The panel reads the same on every screen.

| Id | Text | Notes |
|---|---|---|
| `settings.open` | Sound settings | `aria-label` of the gear |
| `settings.title` | Sound | `aria-label` of the panel group |
| `settings.music` | Music | slider label |
| `settings.sfx` | Sound effects | slider label |
| `settings.mute` | Mute all | checkbox label; silences music and effects |
| `settings.value` | {percent}% | the output beside a slider and its `aria-valuetext` |

Frozen test ids: `settings` (the wrapper), `settings-gear`, `settings-music`, `settings-sfx`, `settings-mute`.

### 14.19 Resources, crafting, quests and mini-games (6I)

Session 6I, round 6 (DECISIONS A91). The lines are `ui/copy/m5b.ts` (`M5B_COPY`); `{what}`, `{tool}`, `{title}`,
`{name}`, `{list}`, `{station}`, `{have}`, `{total}`, `{n}` and `{max}` are filled by the panel. A quest's own
words are `quest.<id>` (offer) and `quest.<id>.done` (hand-in), keyed by the quest's `copyId`. Numbers (hold times,
slots, stack size, active quests, reach) are never copied here; the panels read them from `balance.json` and the
content rows (GDD 3.14 to 3.16).

**Layer.** One DOM layer (`ui/M5bLayer.ts`, class `wdi-m5b`, test id `m5b`) mounts with the world views and shows in
the playing phases only, hidden for the dead. A key row at the bottom holds three buttons (Pockets `I`, Craft `C`,
Quests `J`), each a button with a `kbd` hint; the same keys toggle the panels, Esc closes the open one. Each panel is
a `role="region"` `wdi-m5b__panel` with a Close button, redrawn each tick from the feed, and at least `--wdi-touch`
high controls.

**Prompt.** A chip (`m5b-prompt`) shows for the nearest thing in reach: a node (`prompt.gather`, or
`prompt.gather.tool` when a tool is missing) or a giver (`prompt.giver`). `E` held (or the chip tapped, a
toggle on touch) starts the hold, which sends `act.hold` and shows a progress bar; releasing, moving away or Esc
stops it with `toast.gather.cancel`. `E` at a giver (or `T`) opens the quest log. E falls through to the clue, body, bell and door verbs when no node or
giver is in reach. A toast (`m5b-toast`, `aria-live="polite"`)
reports a gather, a craft or a quest for a few seconds.

**Panels.** Pockets lists the stacks with the slot count and, for a light in the pocket, a Light / Douse button
(`act.light`). Craft lists the recipes with what each needs, where it is made and a Make / Stop button; a recipe
missing inputs is listed with `craft.need` and its button disabled. Quests lists every offer in reach, then the quests
the seat holds (taken, done) with `have of total`; Take the work and Hand it in are live only beside the giver, and a
third quest shows `quest.full`.

**Mini-game modal.** `view/minigames/MinigameModal.ts` opens on `S2C.minigameStart` as `role="dialog"` over the world
(test id `minigame`, `data-kind`, `data-state` play, sent). The ONUB widget of the kind draws in the stage
(`minigame-stage`); the widget's `answer()` is the record the server replays, and the Done control sends the server's assist answer. After the kind's `assistS` a
`mini.assist` button appears (`minigame-assist`), and `mini.cancel` (`minigame-cancel`) steps away at any time. A Cabal
seat's fake task runs the same board; the wire carries no fake flag, so `mini.fake` titles the dialog only where a
fixture passes `fake`.

Frozen test ids: `m5b`, `m5b-inv`, `m5b-craft`, `m5b-quests`, `m5b-prompt`, `m5b-toast`, `inventory`, `inventory-list`,
`inventory-item-<id>`, `inventory-light`, `inventory-close`, `crafting`, `craft-<recipe>`, `crafting-close`, `quests`,
`quest-<id>` (`data-state` offer, taken, done), `quest-accept-<id>`, `quest-turnin-<id>`, `quest-close`, `minigame`,
`minigame-stage`, `minigame-assist`, `minigame-cancel`, `minigame-status`.

| Id                          | Text                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------ |
| `prompt.gather`             | Hold E: gather {what}                                                                |
| `prompt.gather.tool`        | Needs a {tool} to gather {what}                                                      |
| `prompt.gather.cancel`      | Release to stop                                                                      |
| `prompt.giver`              | Press E: speak to {name}                                                             |
| `toast.gather.cancel`       | You stopped gathering.                                                               |
| `toast.craft.cancel`        | You stopped crafting.                                                                |
| `toast.gather.done`         | Gathered {what}.                                                                     |
| `toast.craft.done`          | Made {what}.                                                                         |
| `toast.quest.taken`         | Quest taken: {title}                                                                 |
| `toast.quest.done`          | Quest done: {title}                                                                  |
| `inv.title`                 | Pockets                                                                              |
| `inv.key`                   | I                                                                                    |
| `inv.empty`                 | Nothing in your pockets.                                                             |
| `inv.slots`                 | {n} of {max} slots                                                                   |
| `inv.light.on`              | Light                                                                                |
| `inv.light.off`             | Douse                                                                                |
| `inv.close`                 | Close                                                                                |
| `craft.title`               | Craft                                                                                |
| `craft.key`                 | C                                                                                    |
| `craft.station`             | At the {station}                                                                     |
| `craft.anywhere`            | Anywhere                                                                             |
| `craft.make`                | Make                                                                                 |
| `craft.stop`                | Stop                                                                                 |
| `craft.need`                | Needs {list}                                                                         |
| `craft.ready`               | Ready to make                                                                        |
| `craft.close`               | Close                                                                                |
| `quest.title`               | Quests                                                                               |
| `quest.key`                 | J                                                                                    |
| `quest.none`                | Nobody here has work for you.                                                        |
| `quest.giver`               | From {name}                                                                          |
| `quest.wants`               | Wants {list}                                                                         |
| `quest.reward`              | Pays {list}                                                                          |
| `quest.accept`              | Take the work                                                                        |
| `quest.turnin`              | Hand it in                                                                           |
| `quest.taken`               | Taken                                                                                |
| `quest.done`                | Done                                                                                 |
| `quest.progress`            | {have} of {total}                                                                    |
| `quest.full`                | Your hands are full of work.                                                         |
| `quest.close`               | Close                                                                                |
| `quest.here`                | Here                                                                                 |
| `quest.log`                 | Your work                                                                            |
| `quest.caulkTheSkiff`       | The skiff leaks. Bring me resin and a plank of timber and I will lend you a lantern. |
| `quest.caulkTheSkiff.done`  | Tight as a drum. Mind the dark with that.                                            |
| `quest.mollsHerbs`          | Four sprigs of herb, dear. The fog is in everyone's chest.                           |
| `quest.mollsHerbs.done`     | There. A bandage for your trouble.                                                   |
| `quest.mollsMushrooms`      | Three mushrooms from the deep wood, and I will pay in salts.                         |
| `quest.mollsMushrooms.done` | Sharp eyes. Take the salts.                                                          |
| `quest.stackTheYard`        | Four lengths of timber for the yard stack, and the crowbar is yours.                 |
| `quest.stackTheYard.done`   | Square as a church. Pry carefully.                                                   |
| `quest.smithsOre`           | Three tin ore from the seam. I will make you a lantern for it.                       |
| `quest.smithsOre.done`      | Good ore. This burns bright.                                                         |
| `quest.colliersStone`       | Three good stones for the clamp, and take a torch with you.                          |
| `quest.colliersStone.done`  | It will hold. Keep that torch up.                                                    |
| `mini.title`                | The work                                                                             |
| `mini.fake`                 | A show of work                                                                       |
| `mini.assist`               | Done                                                                                 |
| `mini.assist.hint`          | Stuck? Finish up.                                                                    |
| `mini.cancel`               | Step away                                                                            |
| `mini.sent`                 | Checking your work...                                                                |

### 14.15 Looks and covers (5F)

Session 5F, round 5. The lines of GDD 3.17 on the role card and the seat picker; `ui/copy/looks.ts` holds them as
`LOOKS_COPY`. `{look}` is a look's name from `looks.json` ("the Baker"), `{name}` a seat's name. The card's deck strip and
walk line show in the main mode only (`RoleRevealPayload.deck`, `look`); a quick-mode card has neither.

| Id | Text | Notes |
|---|---|---|
| `card.deck` | The deck | eyebrow of `card-deck`; each card is a chip named by its role |
| `card.deck.hint` | Every character of this match. Two are in nobody’s hands. | `title` of the eyebrow |
| `card.walk` | You walk as {look} | opens the look line of a non-cover card, before the trait icons |
| `card.cover.title` | Choose the face you will wear | eyebrow of `cover-picker`, cover roles only |
| `card.cover.hint` | Everyone will see this character. A safe pick is a card nobody holds. | under the title |
| `card.cover.safe` | Safe | note of a hint (an undealt card), the first one preselected |
| `card.cover.dealt` | In play | note of the deck's other non-cover characters (a visible counter-claim) |
| `card.cover.mate` | Worn by {name} | note of a look a Cabal mate wears; the choice is disabled |
| `card.cover.pick` | Wear {look} | `title` of a choice; a click sends `role.cover {lookId}` |
| `seats.title.impersonate` | Whose face? | title of `seat-picker` for Impersonate; a night power uses its own name |
| `seats.title.aim` | Take your Last Shot | title of `seat-picker` while a dying Gamekeeper's `aim` window is open; it closes when the window ends |
| `seats.empty` | Nobody to pick | the list holds no publicly living seat |
| `seats.cancel` | Cancel | `seat-cancel`; Escape does the same |
| `toast.disguise.wait` | Waiting for a moment unseen | after Impersonate is sent: the face changes only unseen (GDD 3.17) |

`data-testid`s: `card-deck`, `card-look`, `cover-picker`, `cover-look` (with `data-look` and `data-safe`),
`seat-picker`, `seat-choice` (with `data-seat`), `seat-cancel`.

### 14.21 Loading, transitions and the trailer (6K)

Lines are in `apps/client/src/ui/copy/tips.ts` (`LOADING_COPY`, `TIPS`); the seconds are `balance.ui` (GDD 3.13).

| Key | Text | Where |
|---|---|---|
| `loading.title` | Setting the scene | the loading screen's heading |
| `loading.tipLabel` | Tip | the eyebrow above the tip |
| `loading.progress` | Loading | the progress bar's accessible name |

Tips are ten short lines about the controls and the world (hold E on a clue, Tab for the role card, Shift to sneak, locked doors, the Bell, dark places, meetings, clues in pairs, woods and caves); none names a role or what it can do. `data-testid`s: `loading` (the screen, hidden until the load passes `ui.loading.showAfterS`), `transition` (the cover layer), `landing-trailer` (the video's slot; the `<video>` inside it is `muted loop playsinline autoplay preload="none"` with the poster `landing_loop.jpg`, and the slot stays hidden until the poster or a frame arrives). The trailer is skipped under reduced motion, the data saver and `?video=0`.

### 14.23 Admin page (6D)

Session 6D, round 6 (DECISIONS A86; `docs/round6/auto-admin.md` 8). The owner's admin page at `#/admin`, module
`ui/copy/admin.ts`, panels in `client/admin/`. The brief reserved 14.18 for it, but 14.18 is the art-style switch
(5N), so the page takes the next free number. DOM only over the Phaser grid, in the "Round 6 (6D)" block of
`components.css`; every control is at least `--wdi-touch` high and a keyboard reaches all of them.

- **Signed out.** A panel (`admin-signin-panel`) with `admin.signin.lead` and one button, `admin-signin`
  (`admin.signin.button`), that goes to the server's `/auth/github/login`. A refused join clears the stored token and
  shows `admin.signin.failed` (`role="alert"`, `admin-signin-error`).
- **Controls** (`admin-controls`, top). Speed 1x/2x/5x/10x (`admin-scale-<n>`, `aria-pressed` on the current one), Pause or
  Resume (`admin-pause`), a tick count and Step (`admin-step-count`, `admin-step`), Start (`admin-start`: sends
  `admin.setup` then `admin.start`), Reset (`admin-reset`: sends `admin.reset` and clears the log), Sign out
  (`admin-signout`) and the status line (`admin-status`, `role="status"`, `admin.status` or `admin.status.paused`). A
  details block `admin-setup` holds the map, mode, difficulty, seats (4 to 10), the deck as role ids and the seed
  words, one stream per line (`world 1 2 3 4`); a bad line shows `admin.seeds.invalid` (`admin-seeds-error`).
- **Viewports.** Up to six scenes at once on the 1280x720 canvas (1, 2, 4 or 6 cells; six are 426x360), each captioned with
  its scene id; each seat is labelled name, true role and, for a cover, the look it wears. A click on a seat selects it.
- **Inspector** (`admin-inspector`, right). A button per seat (`admin-seat-<id>`), then role, cover, scene, position,
  state, brain, inventory and notebook (`admin-detail-<label>`); Follow seat (`admin-follow`) collapses the grid to that
  seat's scene and the same button shows the grid again; the scenes that did not fit queue as `admin-queue-<scene>`
  buttons that swap in. Inventory and notebook read `admin.inspector.unreported` until the snapshot carries them.
- **Log** (`admin-log`, bottom). Invariant failures first as red rows (`admin-log-failure`, `role="alert"`) that stay
  until Reset, then the events newest first (`admin-log-event`), 200 at most.

| Id | Text |
|---|---|
| `admin.signin.button` | Sign in with GitHub |
| `admin.start` / `admin.reset` | Start / Reset |
| `admin.status` | Tick {tick}, phase {phase}, speed {effective}x |
| `admin.status.paused` | Tick {tick}, phase {phase}, paused |
| `admin.inspector.cover.worn` | wears the look of {look} |
| `admin.log.invariant` | Invariant {name} failed at tick {tick}: {detail} |

The full list is `ui/copy/admin.ts`.

### 14.30 The Train and the memorial (7I)

Session 7I, round 7 (DECISIONS A113). The Daily Train (GDD 3.3) adds no screen: the server sends the arrival line on
the existing `chat.msg` `system` channel, so it lands in every seat's chat log and shows in the next meeting's chat
with the system style; the arrival and the brake are `noise` pulses whose `kind` is the `AudioBus` key
(`train_arrive`, `train_brake`) for the seats on the hub near the platform, which the World scene plays instead of drawing a ring.

| Line | Text | Where |
|---|---|---|
| the arrival (server, `Train.ts` `TRAIN_ARRIVE_LINE`) | The train pulls into the station. | `chat.msg` `system`, every seat, once per day |
| `log.train` (`ui/copy/world.ts`) | The train pulls in at the platform | the HUD log of a seat that hears `train_arrive`; `World.ring` plays the two `train_*` pulses as sounds and draws no ring |

### 14.24 Opening cinematic (6Q)

Lines are in `apps/client/src/ui/copy/intro.ts` (`INTRO_COPY`). The `Intro` scene sits between `Preload` and `Landing` (never before `Admin`).

| Key | Text | Where |
|---|---|---|
| `intro.begin` | Tap to begin | the button over the poster; the tap unlocks audio and starts the video |
| `intro.skip` | Skip | the corner button while the video plays |
| `intro.label` | Opening cinematic | the overlay's accessible name |

`data-testid`s: `intro` (the full-screen overlay, `role="dialog"`), `intro-begin`, `intro-video` (hidden until the tap; `preload="auto"`, `playsinline`, its own sound, muted only by the player's mute setting, volume the music slider), `intro-skip` (hidden until the tap). The poster is `intro.jpg` of the `intro` row of `assets/video/manifest.json`; with no poster the overlay is plain ink.

- **When it plays.** Once per browser session (`sessionStorage['wdi:introSeen']`, set at the tap). Not under `prefers-reduced-motion`, the data saver (`saveData`), `?intro=0`, a reload that rejoins a lobby (`#/lobby/CODE`), and in the mock (`?mock=1`) unless `?intro=1`. `?intro=1` overrides only the mock rule.
- **How it ends.** The video ends, Skip, a click or tap anywhere while it plays, or Esc (also before the tap). A stream that has not started 8 s after the tap, or a video error, ends it the same way. Then `Landing` starts as it always did.
- **A missing file.** No manifest, no `intro` row, a failed HEAD request for the file, or an HTML answer where a video should be: the scene starts `Landing` at once and shows nothing.

### 14.26 Lobby re-skin (7E, round 7)

The lobby's lines stay in `apps/client/src/ui/copy/lobby.ts`; the re-skin (A103, A109) changes markup and style, not wording. Every id of `ui/Lobby.ts` is kept (`ui-reskin.md` 2). New lines:

| Key | Text | Where |
|---|---|---|
| `lobby.friend.add` | Add friend | a seat row that carries a `profile` (`data-testid="add-friend"`) |
| `lobby.friend.add.label` | Add {name} as a friend | that button's accessible name |
| `lobby.friend.added` | Friend | the same button once the profile is on the device's list; it is disabled |

- **Columns.** A: the party code in display type (`party-code`), Copy invite link, Change mode (`mode-toggle`) beside Add NPC (`add-npc`) with Remove NPC (`remove-npc`) as a small minus (`aria-label` "Remove NPC"), the NPC skill select (`npc-difficulty`) with its locked note, the mode chip (`mode-chip`) in the card's corner, then "Players n / 10" with the You, Leader, Ready and Away tags. B: the map, the art style, the sound settings and the quick-mode deck editor. C: the deck as chips with its two notes, Start (leader), Ready, Leave. Below 900 px the columns stack.
- **Column B.** The map cards (`map-select`, one `radio` per map, the picked one with a tick; a non-leader sees the picked card only), the art-style segment (`art-style*`, `.wdi-seg--glass`, HD disabled with its "Coming later" note) and, in the quick mode, the deck editor (`deck-editor`, `deck-role-*`) as chips in the deck's style. A map whose thumbnail has not loaded keeps a dark frame. No line changes.
- **Tags.** The NPC tag is not shown: the lobby snapshot carries only the NPC seat count, not which seats they are, and the wire is not widened for a tag. Add friend shows only where a seat's `profile` is in the snapshot; until the client's roster mapping carries it, no row offers it.
- **Left out.** The mockup's "Locate" button has no feature.

### 14.27 Match screens on the night theme (7F)

The re-skin of the screens a match shows (`ui-reskin.md` 4, DECISIONS A110). Round 7 adds no copy to these screens
in this subsection's first PR: every line stays its key in `ui/copy/`, and a key a later PR adds is listed here.
The rules live in `ui/match.css` (role card, notebook sheet, settings) and `view/hud.css` (HUD and touch cluster),
tokens only, each rule under an ancestor class (`.wdi-flip`, `.wdi-notebook-sheet`, `.wdi-settings`, `.wdi-hud`) so
no other screen's card, chip or button changes. Ids, `data-testid`s and markup are kept.

| Element | Face | Fill and colour |
|---|---|---|
| Role card front | the nine-slice frame and the flip stay | indigo fill, lilac text, a faint snow sheen at the top |
| Faction word (`__stripe`) | Press Start 2P, 12 px | the faction colour with its `--wdi-on-*` text, as before |
| Role name (`__title`) | Press Start 2P, `display-md`, snow, a violet step shadow | |
| Card text, goal, abilities, Beware, mates | Inter (A103, A106: running text) | goal lantern on indigo, the rest lilac |
| Card chips, keycaps, cover picker | Oswald caps chips, Pixelify Sans notes | glass pills with a lilac rim; the picked look takes the lantern rim |
| Card back, role chip | Press Start 2P | night with a lilac double rule, nothing of the faction |
| Ready | Press Start 2P, 12 px | the primary: night on lantern |
| HUD chip, clock, log, toasts | Pixelify Sans; the clock digits Press Start 2P | glass (`--wdi-glass-fill`) with a lilac rim over the world; under `prefers-reduced-motion` the blur is dropped for the solid indigo |
| Notebook sheet | Inter for entries, Press Start 2P for the title | glass page, ruled in lilac at 12%, over the veil |
| Settings gear and panel | Pixelify Sans | glass; lantern sliders and focus ring |
| Loading screen, transitions | Press Start 2P title with a violet step shadow, Pixelify Sans tip | night page with an indigo glow; a stepped glass bar with a lantern fill; the transition layer is night, not ink |
| Cutscene captions | Pixelify Sans (a title caption Press Start 2P, `clamp(1.5rem, 5vw, 2.75rem)`) | a night scrim plate with a lilac rim; the title has none, a violet step shadow and a night halo for bright frames; a whisper is quieter, never slanted (no italic in the pixel face) |
| Cutscene Skip, the intro's Skip and Begin | Press Start 2P, 12 px and 14 px | Skip a scrim chip; Begin the primary, night on lantern |

**Numbers stay Inter.** Pixelify Sans' 2, 5 and 8 blur together at 12, 14 and 16 px (checked at 2x), so a line
that can show a number is not set in it: the HUD goal, log lines, toasts and phase ("Day 2"), the settings value
("70%"), hints and quantities in the panels ("2 wood", "x3", "3 of 8 slots") are Inter. Static labels with no number
keep the pixel face, and Press Start 2P's digits are clear (the clock). UI.md 3 lists Pixelify Sans for body text;
this is the exception, found while checking the HUD.

**Over the world.** The world has no veil, so a surface over it is measured against a bare white pixel. The shared
glass fill (indigo at 66%) is measured under the menu's veil (10) and gives lilac only 3.32 there, so the HUD, the
role chip, the settings gear and panel use `--wdi-match-glass` (`ui/match.css`: night at 85%): lilac on it is 8.61,
lilac at 80% is 6.12 and snow is 13.14 over white. The notebook sheet sits under its own veil and is a 7B `.wdi-glass`.

No focusable element is clipped to a stepped corner: a `clip-path` would cut the focus ring, so the pixel corner is
a 2 px radius with an inset snow rim. 7B's glass classes keep their stepped corner on a `::before` layer, so the ring
is never cut: the cutscene Skip, the intro's Skip and Begin (`.wdi-glass-btn--sm`, Begin `--primary`) and the notebook
(`.wdi-glass`) use them; the snow label is 9.51 at worst on that glass, so it holds over the world. The HUD chip, the
role chip, the settings gear and panel and the captions keep `--wdi-match-glass`, because their text is lilac or
muted lilac, which the 66% fill does not carry over bare white.

### 14.28 Table and quick-mode screens in the night theme (7G)

Session 7G, round 7 (DECISIONS A111; `docs/round7/ui-reskin.md` 4). The meeting, the game over, the main-mode cards and the
quick mode's screens wear the owner's mockups: `ui/table.css` (and `ui/onub/onub.css` for the quick mode) hold every rule,
scoped under `.wdi-table` so they beat the paper components without editing `components.css`, and read tokens only. Press Start
2P carries titles, the clock, tabs, button labels and one-word tags; Pixelify Sans carries headings, tile names, hints and
claim chips; Inter stays for chat and the report, which run past two lines (A106). Every id and class the specs find is
unchanged; the copy of 14.6 to 14.10, 14.14 and 14.16 is unchanged. New lines are in `ui/copy/table.ts` (`TABLE_COPY`).

| Key | Text | Where |
|---|---|---|
| `friend.add` | Add friend | a game-over row of a seat that carries a `profile`, never your own row; `add-friend-<profile>` |
| `friend.added` | Friends | the same button once the seat is in `wdi:friends` (disabled) |
| `friend.add.label` | Add {name} as a friend | the button's accessible name |
| `friend.added.label` | {name} is your friend | the disabled button's accessible name |
| `friend.full` | Friends list full | the button's text when `balance.party.friendsMax` is reached |

The action reads and writes `wdi:friends` (`{ code, name }`) through `ui/table/addFriend.ts`, a stand-in with the signature of
7C's shared helper until it lands. The faction chip on a game-over row stays the one place a faction shows for another seat.

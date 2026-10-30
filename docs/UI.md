# UI design system

The DOM overlay's look: what every screen the player meets shares, from the Landing buttons to
the game over. It is implemented in `apps/client/src/ui/theme/` (tokens and
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

**Lobby settings** (`data-testid="lobby-settings"`, between the code row and the roster). The leader
sees "Add NPC" (`add-npc`, hidden when the party is full), "Remove NPC" (`remove-npc`,
hidden with no NPC seats) and the difficulty select (`npc-difficulty`, disabled below
`npc.difficultyMinNpcs` NPC seats, with a hint line). No seat is ever marked
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
stick bottom-left. Round 8 (8A) adds a fifth disc, Strike (X, `touch-strike`), at the end of the cluster (14.32).

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
| `.wdi-backdrop` | The loop behind the night screens (`ui/backdrop.ts`, 7B's third PR): the poster, the video, the veil, the vignette and the scanlines (`--wdi-scanline`, which only darkens), fixed under `#overlay`'s content; `__title` (the `.wdi-title`, top left, opt-in; the menu draws its own title, so Landing leaves it off) and `__status` (lilac, bottom centre: Boot's "Waking the village..." and the refresh message, then `build <id>`, which replaces the canvas `{ok, build}` line). `showBackdrop` and `hideBackdrop` are called by the menu scenes (Boot, Landing, Lobby, RoleReveal; GameOver and the Intro's end may join); testids `backdrop`, `backdrop-status` | `prefers-reduced-motion` pauses the video on its frame; `?video=0` never loads it and keeps the poster |

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
| hover (`--wdi-dur-fast`, lift `--wdi-lift`) | 120 ms, 2 px up | `--wdi-ease` | changes colour in place, no lift |
| press (`--wdi-dur-press` down, `--wdi-dur-fast` back; `--wdi-press`, `--wdi-press-scale`) | 60 ms down, 1 px and 0.97 | `--wdi-ease` | changes colour in place |
| list row hover (`--wdi-nudge`) | 120 ms, 2 px in | `--wdi-ease` | wash only |
| tab and segment hover | 120 ms, colour and rule only | `--wdi-ease` | instant |
| focus ring closing in | 120 ms from 6 px out | `--wdi-ease-out` | appears in place |
| panel open (`--wdi-dur-panel`, `--wdi-rise`) | 200 ms, 8 px up and 0.98 to full | `--wdi-ease-out` | appears in place |
| panel close (`--wdi-dur-panel-out`), where `display` can transition | 140 ms, fade and 4 px down | `--wdi-ease-in` | disappears |
| list stagger (`--wdi-stagger`) | 28 ms per row, rows 1 to 10, the rest with row 10 | `--wdi-ease-out` | every row at once |
| press flash (`flash`, `--wdi-dur-flash`) | 180 ms, from 1.5 brightness and 1.06 | `--wdi-ease-out` | none |
| refused shake (`refused`, `--wdi-dur-shake`, `--wdi-shake`) | 320 ms, 4 px either way, a hazard glow | `--wdi-ease` | the glow only, in place |
| pop (`pop`; the E prompt appearing) | 200 ms, from 0.6 | `--wdi-ease-spring` | appears in place |
| cooldown sweep (`cooldown`) | the card's cooldown | linear | kept (it is status) |
| the E hold fill | follows the hold, smoothed over 60 ms | linear | kept, unsmoothed |
| purse change (`.wdi-anim-purse[data-change]`, `--wdi-dur-panel`, `--wdi-rise`) | 200 ms roll of the amount, up on a gain and down on a loss; the change label springs in | `--wdi-ease-out` | the new amount and label at once |
| coins to or from the purse (`--wdi-dur-slow`) | 360 ms, three coins flying in on a gain with a warm glow, out on a loss | `--wdi-ease-in` in, `--wdi-ease-out` out | none |
| health and stamina bars (`.wdi-body__fill`, `--wdi-dur-slow`) | 360 ms ease to the new width on a drain or a regen | `--wdi-ease-out` | the new width at once |
| hit on the health bar (`bodyMotion`, `wdi-fx-hit`, `--wdi-dur-shake`) | 320 ms, a bone flash with a red glow and a small shake of the track | `--wdi-ease-out` | none |
| Wounded, Down, Fatigued (`is-wounded`, `is-down`, `is-fatigued`) | a 360 ms swell as Wounded starts; Down and Fatigued breathe on a 1.2 s loop | `--wdi-ease-spring`, `--wdi-ease` | the colour change only |
| effect chip arriving, cured (`is-fresh`, `is-cured`) | 1.2 s pulse from 0.6 with one overshoot and a glow; 360 ms fade, shrink and rise out | `--wdi-ease-out` in, `--wdi-ease-in` out | appears and goes in place |
| low-health vignette (`.wdi-body::before`) | a faint red edge while Wounded or Down, stronger and pulsing on a 1.2 s loop while Bleeding | `--wdi-ease` | kept, no pulse (it is status) |
| Dazed blur (`--wdi-blur-dazed`) | the world canvas blurs 3 px, easing in and out over 360 ms | `--wdi-ease` | kept, no easing (it is status) |
| scene cover into the world, per portal (`view/Transition.ts` `portalTransition`) | `balance.ui.transitionS.fade` (GDD 3.13) | ease-in-out | a cut |
| toast, dialog, stamp rise | 220 ms | `--wdi-ease` | appears in place |
| the card flip | 600 ms | `--wdi-ease` | swap, no rotation |
| the card hold timer | the hold (GDD 2 step 4) | linear | still drains |
| edge cue pulse (`--wdi-dur-loop`) | 1.2 s loop | `--wdi-ease` | static ring |
| busy spinner | 0.8 s loop | linear | kept (it is status) |

Round 8 (8H, A143). Every interface motion reads a token of `ui/theme/tokens.css`: the durations
`--wdi-dur-*`, the stagger `--wdi-stagger`, the distances `--wdi-lift`, `--wdi-press`, `--wdi-nudge`,
`--wdi-rise`, `--wdi-shake` and the scale `--wdi-press-scale`, with the easings `--wdi-ease`,
`--wdi-ease-out` (arriving), `--wdi-ease-in` (leaving) and `--wdi-ease-spring` (one overshoot). Each
duration and distance is zeroed under `prefers-reduced-motion` in the same file (`motion.test.ts` checks
it), so a rule written against the tokens needs no reduced twin; only a loop needs `animation: none`.
The rules live in the "Round 8 (8H)" block of `components.css`, which moves controls through the `translate`
and `scale` properties and never through `transform`, so a control's own placing transform is kept.
Other sessions' panels are animated there by their classes; their files are not edited.

Controls that lift on hover and sink on press: `.wdi-btn`, `.wdi-glass-btn`, button chips, portraits, seat
cards, map options, the cover picker's looks, the menu chips and close button, the settings gear, the E
prompt, touch buttons (press only) and the admin buttons and seats. Tabs and segments brighten without
lifting. List rows (the inventory slots, recipes and quests of `.wdi-m5b__row`, the party list, the deck's
cards) lean in by `--wdi-nudge` on hover or focus inside them, and an M5b row takes a teal edge.

Panels that open (8H, A143): Pockets, Crafting and Quests (`.wdi-m5b__panel`), the settings panel, the
notebook sheet's page, the meeting's board and side panel, and any panel carrying `.wdi-anim-panel`, rise in
on every open (an animation replays when an element leaves `display: none`); their veils (`.wdi-m5b__modal`,
the notebook sheet, `.wdi-anim-veil`) fade. A panel hidden with `hidden` stops taking the pointer at once and
fades out where the browser can transition `display`. The lists inside them (`.wdi-m5b__list`, the notebook
list, the meeting's portraits, the deck's cards, the party list, `.wdi-anim-list`) stagger in row by row.
The round-8 panels other sessions build (the shop, the inspect card, the mugging prompt, the altar, mailbag,
notice and HQ panels) opt in with `.wdi-anim-panel` on the panel, `.wdi-anim-veil` on its scrim and
`.wdi-anim-list` on its list; nothing else is needed from them, and 8H owns no line of their files.

Activation (8H, A143). `ui/theme/motion.ts` gives a screen four one-shot calls on any control: `flash(el)`
when a press landed (an ability fired, an item used), `refused(el)` when the server refused it (the codes of
14.3), `pop(el)` when something arrives to be noticed, and `cooldown(el, ms)`, a night shade that unwinds
clockwise over the card's cooldown. Each restarts its animation on every call and removes its class at
`animationend`; none reads or changes state, so the caller decides what happened. Each owner calls them from its own code
(8A's strike button flashes and cools, 8C's shop buttons flash); the world scene's error handler calls
`refusedIn(overlay)`, which shakes whichever E prompt is showing as the refusal toast appears. The E prompt pops in as it
appears and its bar fills smoothly while E is held; a task's mini-game opens with the panel entrance.

Economy HUD (8H, A143). 8C's purse counter (14.34.2) carries `.wdi-anim-purse` and, for the moment its change
shows, `[data-change="gain"|"loss"]`. The 8H block rolls the amount in from below on a gain and from above on a loss,
springs the change label in (mustard on a gain; a loss keeps the counter's warm colour, since `--wdi-danger` is for
paper), glows the pill warm on a gain, and draws three coins flying into the pill on a gain (a wage, a sale) or out of it
on a loss (a buy). A wage, a shop sale and a shop buy all reach the purse as a change, so the counter's motion covers
them; the shop's own buttons flash or shake through `flash` and `refused`. `motion.test.ts` holds the hook names
against `PurseHud.ts`.

Body HUD (8H, A143). 8A's body panel (14.32) carries its states as classes and its effects as chips with
`data-effect`. It redraws its chips every second, so CSS alone cannot tell a hit or a new effect from a redraw: `bodyMotion`
(`ui/theme/motion.ts`, one locked line in `World.ts`, granted by 6Z) watches the panel's DOM, inserts nothing into it and
only adds classes; it stops itself once the panel leaves the page. The health bar flashes on a
drop, a new chip pulses once (its pulse resumes across redraws through a negative delay), and a cured chip leaves a copy
that fades out in bodyMotion's own `.wdi-body-ghosts` layer, where the chip last sat. The vignette is fixed to the viewport under the HUD's controls; nothing on the panel takes a `translate`,
which would hold it inside the panel. The Dazed blur lands on `#game canvas`. All of it reads this seat's own panel, so no
one sees another seat's body. A timer ring on a timed chip waits on its total duration, which the chip does not carry yet.
`motion.test.ts` holds the hook names against `BodyHud.ts`.

Transitions and transport (8H, A143). The World's cover follows the portal the seat came through (GDD
3.13): `wipe` for a door, `iris` for a level stair or crawl, `climbUp` and `climbDown` (the iris with
lantern rungs passing the way the seat goes) for a portal that changes height, `station` (night with
lantern-lit carriage windows sliding past) for an arrival at a map's Train station, and `fade` otherwise. The
meeting keeps its iris and the end screen its wipe. The in-transit veil is the cover itself: the 0.6 s door
transit of GDD 3.7 runs while it is down. The Train carries no seat today (GDD 3.3), so its journey card waits
for a rule that moves seats by Train; the `station` cover is ready for it.

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
| `menu-mockup` (owner, Claude Design, 2026-10-23) | the round-7 menu: title, glass buttons, profile chip, sound toggle over the loop (`docs/round7/ui-reskin.md`) | 2 step 1, 3.21 |
| `lobby-mockup` (owner, Claude Design, 2026-10-23) | the round-7 lobby in three columns: code and seats, map cards and art style, the deck and Start | 2 step 3 |

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
Sneak; the Strike disc's label is 8A's `body.strike` (14.32).

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

### 14.12 Quick mode: lobby chip, deck editor, Evening Prep and the prep board (removed)

Removed in round 7 with the quick mode (DECISIONS A115, GDD 3.11); `docs/round5/onub-contract.md` keeps the mode's contract as history. The section keeps its number.

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

### 14.14 Quick mode: night, morning and end (removed)

Removed in round 7 with the quick mode (DECISIONS A115, GDD 3.11). The section keeps its number.

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

The look tag takes the look's own base colour (`looks.json`
`palette.base`), and the trait portrait (height, scarf, hat) stays under it. The night-power picker and the Last Shot
aim list wait for 5F's `ui/SeatPicker.ts` and a mount point in the world HUD (5I's files).

### 14.17 Map row (5J)

Session 5J, round 5. The lobby's map row of GDD 3.13 (`ui/lobby/MapPicker.ts`, module `ui/copy/maps.ts`). It
shows only in the main mode (`showsMapRow`), under the frozen test id `map-select`, whose `data-map` is the
map shown as chosen. Each map shows its `name` and `blurb` from `maps/<id>.json` (data, not copy) and its
`thumb_<mapId>` image once the manifest has it. `{name}` is a map's `name`. The blurbs follow the canon of
`docs/round8/canon.md` (round 8, 8V): HollowMere is the railroad town on a drowned mere, BlackPine the Syndicate's
timber and coal camp.

| Id | Text | Notes |
|---|---|---|
| `lobby.map.label` | Map | leader only: label of the radio group, one option per map (`role="radio"`, `aria-checked`) |
| `lobby.map.pick` | Play on {name} | `aria-label` of each option; picking sends `lobby.settings {map}` |
| `lobby.map.current` | Map: {name} | everyone but the leader: the one read-only line, with the blurb under it |

### 14.18 Art-style switch (5N)

Session 5N, round 5 (DECISIONS A79, A80). The segmented control of `ui/artStyle/ArtStyleSwitch.ts` (module
`ui/copy/artStyle.ts`). One option per shipped style of `style.json` `artStyles`, then one disabled option per reserved
id. It is a radio group: the checked option has `aria-checked="true"` and is the only tab stop, the arrow keys move and
select, and the buttons are at least `--wdi-touch` high. It sits in the lobby settings, in the World HUD's top right. The pick is per player and never sent. The loading veil
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
| `cs.blackpine.<line>` | the BlackPine opening's captions (7A) | `title`, `intake`, `owns`, `day`, `night`, `pines`, `adits`, `blind`, `dawn`; the Bible's Book III.2 trimmed |
| `cs.death<Cause>.line` | the death cutscenes' one whispered line each | `Knife`, `Poison`, `Shot`, `Ejected`, `Wolf` (6J); `Creature`, `Bled`, `Sickened` (round 8, 8A, GDD 3.22) |

Both openings already agree with the canon (`docs/round8/canon.md` 2): the station sign, the Barons and the train of
Ledger I; the Harrow Timber & Coal Syndicate and the rack of Ledger VIII. They name no killer and not the Beast.

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
(`act.light`); since round 8 (8A, 14.32) a row whose item any holder may use also carries a Use button. Craft lists the recipes with what each needs, where it is made and a Make / Stop button; a recipe
missing inputs is listed with `craft.need` and its button disabled. Quests lists every offer in reach, then the quests
the seat holds (taken, done) with `have of total`; Take the work and Hand it in are live only beside the giver, and a
third quest shows `quest.full`.

**Mini-game modal.** `view/minigames/MinigameModal.ts` opens on `S2C.minigameStart` as `role="dialog"` over the world
(test id `minigame`, `data-kind`, `data-state` play, sent). The widget of the kind draws in the stage
(`minigame-stage`); the widget's `answer()` is the record the server replays, and the Done control sends the server's assist answer. After the kind's `assistS` a
`mini.assist` button appears (`minigame-assist`), and `mini.cancel` (`minigame-cancel`) steps away at any time. A Cabal
seat's fake task runs the same board; the wire carries no fake flag, so `mini.fake` titles the dialog only where a
fixture passes `fake`.

Frozen test ids: `m5b`, `m5b-inv`, `m5b-craft`, `m5b-quests`, `m5b-prompt`, `m5b-toast`, `inventory`, `inventory-list`,
`inventory-item-<id>`, `inventory-light`, `inventory-use-<id>` and `inventory-use-near-<id>` (8A, 14.32), `inventory-close`, `crafting`, `craft-<recipe>`, `crafting-close`, `quests`,
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
walk line come from `RoleRevealPayload.deck` and `look`.

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

Tips are ten short lines about the controls and the world (hold E on a clue, Tab for the role card, Shift to sneak, locked doors, the Bell, dark places, meetings, clues in pairs, woods and caves); none names a role or what it can do. `data-testid`s: `loading` (the screen, hidden until the load passes `ui.loading.showAfterS`), `transition` (the cover layer), `landing-trailer` was the video's slot; since round 7 the loop behind the menu is 7B's backdrop (`ui/backdrop.ts`, section 6) and the menu only starts the `lobby` theme on the first tap (7C, A107). The loop is skipped under reduced motion, the data saver and `?video=0` as before.

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

The Vicar's memorial (GDD 3.20) is a cutscene, `memorialVicar` in `cutscenes.json` (kind `memorial`), sent to every
seat as `cutscene { id: 'memorialVicar', scope: 'all' }` at the reveal after a seat in the Vicar's look dies by the
Knife. Its `video` step plays `memorial_vicar` once 7A's `CutscenePlayer` renders video steps; until then the client
drops a `scope: 'all'` cutscene. Its caption is one block at the end of `ui/copy/cutscenes.ts`:

| Copy id | Text | Where |
|---|---|---|
| `cs.memorial.vicar` | In memory of the Vicar of HollowMere, who fell to the Knife. | `title` caption over the first 5 s of the film |

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

### 14.25 Menu, dialogs, profile, friends, Quit and the party list (7C)

Round 7, Session 7C (DECISIONS A103, A104, A107). Lines are in `apps/client/src/ui/copy/menu.ts` (`MENU_COPY`); the
landing keys of `lobby.ts` stay until 7P deletes them. The numbers (name length, caps, refresh) are GDD 3.21 and
`balance.json`, never restated here. The menu replaces the old landing form: no field on the menu itself, the name is
asked where it is used.

| Key | Text | Where |
|---|---|---|
| `menu.title.top`, `menu.title.bottom` | Who did / it? | the title, two lines (accessible name `menu.title.label`: Who Did It?) |
| `menu.start` | Start Game | primary button; opens the Start dialog |
| `menu.join` | Join Game | opens the party list (until the list lands: the code box) |
| `menu.profile` | Create Profile | opens the profile panel; reads `menu.profile.edit` (Profile) once a profile exists |
| `menu.friends` | Friends | opens the friends list (greyed with `menu.soon` until it lands) |
| `menu.settings` | Settings | opens the sound panel of UI.md 14.22 in a dialog |
| `menu.help`, `menu.credits` | How to Play, Credits | small links, a new tab: `${BASE}help/` and the repository's `CREDITS.md` |
| `join.title`, `parties.title` | Join a game, Open parties | Join Game's dialog: the party list above the code field (`party-list`, rows `party-row` with `data-code`) |
| `parties.players`, `parties.tag.friend` | {n} / {max}, Friend's party | each row: the leader, players / max, mode and map; a private row (one the viewer is invited to) carries the tag |
| `parties.empty` | No open parties right now. Have a code? Type it below. | the empty state (`party-list-empty`), also what a 429, a network error or a bad body shows; the list asks again every `party.listRefreshS` |
| `parties.pick.name` | Type your name to join {leader}. | a tap on a row joins by its code; with no name typed it fills the code and asks for one |
| `invite.title`, `invite.empty`, `invite.count` | Invite friends, Add friends from the menu to invite them., {n} / {max} invited | the Start dialog's pick (`invite-pick`) when Private is chosen: the friends as checkboxes, capped by `party.invitedMax` |
| `menu.quit` | Quit | small button; opens the confirm below |
| `quit.title`, `quit.body` | Leave Who Did It?, If you are in a party you leave it, and the music stops. | the confirm dialog |
| `quit.confirm`, `quit.cancel` | Quit, Stay | `quit-confirm`; Stay closes the dialog |
| `quit.bye.title`, `quit.bye.body`, `quit.back` | See you soon, You can close this tab now., Back to the menu | the goodbye panel after the consented leave and the music to silence (`quit-bye`, `quit-back`); `window.close()` runs first, only in a window the page opened itself |
| `menu.soon` | Coming later | the note on a greyed button (the title and screen-reader text on the small one) |
| `menu.haveCode` | Have a code? | the party list's link to the code box |
| `menu.chip.guest`, `menu.chip.label` | Guest, Profile: {name} | the top-right chip |
| `menu.sound.on`, `menu.sound.off` | Sound on, Sound off | the sound toggle's name; it is the settings mute |
| `menu.footer` | v{build} | the footer; `{build}` is `/health`'s build |
| `start.title` | Start a party | the Start dialog |
| `start.name.label`, `start.name.hint`, `start.name.error` | Your name, {min} to {max} characters, Name must be {min} to {max} characters. | the name field, as before |
| `start.visibility`, `start.open`, `start.open.hint`, `start.private`, `start.private.hint` | Who can see it, Open, Anyone can find it in the party list., Private, Only people with the code or link. | the choice, Open by default |
| `start.create`, `start.cancel` | Create Party, Cancel | the dialog's buttons |
| `code.title`, `code.title.invited` | Join with a code, You are invited | the code box; the second when a `#/join/CODE` link opened it |
| `code.label`, `code.placeholder`, `code.name.label`, `code.join` | Party code, CODE, Your name, Join Party | the code box's fields and button |
| `settings.title` | Settings | the settings dialog |

A failed create or join says the generic error (`JOIN_FAILED_MESSAGE`, UI.md 1.6) in the dialog's one `role="alert"`
line, or the refresh line when the build is stale. `data-testid`s: `menu`, `menu-chip`, `menu-sound`, `menu-build`
(`landing-trailer` left with the trailer in #110). The e2e fixture `e2e/fixtures/party.ts` (`createParty`, `joinParty`) drives the buttons and
labels above; a visible label that changes changes there.

### 14.26 Lobby re-skin (7E, round 7)

The lobby's lines stay in `apps/client/src/ui/copy/lobby.ts`; the re-skin (A103, A109) changes markup and style, not wording. Every id of `ui/Lobby.ts` is kept (`ui-reskin.md` 2). New lines:

| Key | Text | Where |
|---|---|---|
| (`friends.seat.*`) | Add friend | a seat row that carries a `profile` (`data-testid="add-friend"`): 7C's `addFriendButton` from `ui/menu/friends.ts`, copy in 14.25 |

- **Columns.** A: the party code in display type (`party-code`), Copy invite link, Add NPC (`add-npc`) with Remove NPC (`remove-npc`) as a small minus (`aria-label` "Remove NPC"), the NPC skill select (`npc-difficulty`) with its locked note, then "Players n / 10" with the You, Leader, Ready and Away tags. B: the map, the art style and the sound settings. C: the deck as chips with its two notes, Start (leader), Ready, Leave. Below 900 px the columns stack.
- **Column B.** The map cards (`map-select`, one `radio` per map, the picked one with a tick; a non-leader sees the picked card only), the art-style segment (`art-style*`, `.wdi-seg--glass`, HD disabled with its "Coming later" note). A map whose thumbnail has not loaded keeps a dark frame. No line changes.
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

### 14.28 Table screens in the night theme (7G)

Session 7G, round 7 (DECISIONS A111; `docs/round7/ui-reskin.md` 4). The meeting, the game over, the main-mode cards, the seat picker and the over view wear the owner's mockups: `ui/table.css` holds every rule,
scoped under `.wdi-table` so they beat the paper components without editing `components.css`, and read tokens only. Press Start
2P carries titles, the clock, tabs, button labels and one-word tags; Pixelify Sans carries headings, tile names, hints and
claim chips; Inter stays for chat and the report, which run past two lines (A106). Every id and class the specs find is
unchanged; the copy of 14.6 to 14.10, 14.14 and 14.16 is unchanged. No new copy: the game-over Add friend action is 7C's `addFriendButton` (`ui/menu/friends.ts`, copy in `ui/copy/menu.ts`).

The Add friend action on a game-over row is 7C's `addFriendButton`, shown only for a seat that carries a `profile` and never on your own row. The faction chip on a row stays the one place a faction shows for another seat.

### 14.31 The admin page in the night theme (7G)

Session 7G, round 7 (DECISIONS A111). The owner's admin page (14.23) wears the table screens' dark glass: `ui/admin.css` holds every rule, each doubling its own class so it beats the paper rules of `components.css` (not edited) and does not depend on the `.wdi-admin` root, because the sign-in panel and the notice are mounted outside it. Indigo glass fill with a snow rim, lilac text; Press Start 2P on the controls, panel headings and sign-in title, Pixelify Sans on the rest, Inter on the log (running text, A106); the pressed speed button, the seat, Start and a failed invariant row take the lantern accent. No blur and no `clip-path`: six live viewports run behind the panels. The copy of 14.23, every id and testid, and the markup are unchanged, and no new lines are added.

### 14.29 Vendettas (7H)

Lines are in `apps/client/src/ui/copy/vendettas.ts` (`VENDETTA_COPY`, `vendettaGoal(id)`). The role card (`ui/RoleCard.ts`, 7F renders it) reads `Private.vendetta` (GDD 3.20): a Killer's own vendetta id, or for the Accomplice the ids of the Killers it knows, joined by commas. An empty value shows no line. No other seat's card, no world label and no toast names a vendetta; the doubted Vicar's note is its own.

| Key                        | Text                                                         |
| -------------------------- | ------------------------------------------------------------ |
| `vendetta.label`           | Vendetta                                                     |
| `vendetta.goal.zealot`     | Zealot: stay near the Vicar until doubt takes the flock.     |
| `vendetta.goal.activist`   | Activist: tamper with two of the company’s work stations.    |
| `vendetta.goal.bandit`     | Bandit: crack the manor’s strongbox after dark, alone.       |
| `vendetta.goal.hitman`     | Hitman: the Train brings you a contract. Take only its mark. |
| `vendetta.mate`            | Your Killer’s vendetta: {goal}                               |
| `vendetta.note.doubt`      | Doubt took the flock: your vote did not carry.               |
| `vendetta.note.contract`   | The mail brought a contract: {name}.                         |
| `vendetta.contract.accept` | Accept                                                       |

### 14.32 The body panel (8A, round 8)

Session 8A, round 8 (DECISIONS A136; GDD 3.22). `view/body/BodyHud.ts` (`mountBodyHud(parent)`) draws this seat's
`Private.body`: a health bar, a stamina bar and a row of effect chips, in a `section.wdi-body` the World mounts in
the HUD root (`mountBodyHud(hud.root)`) at the HUD's bottom-left, above the touch cluster, and feeds each frame with
the own body and the clock (`update(feed.body(), clock.tick)`; nothing is written when nothing changed; the feed's
`body()` reads the own `Private.body` and is null while the row is empty). The model is `view/body/model.ts` (`bodyHudModel`): the shares are
whole percentages and a sliver of health still reads 1; the states are read from the effects the server derived,
never from a number of the client's own: `is-wounded` under Wounded, `is-down` under Knocked out, `is-fatigued` under
Fatigued; a timed chip carries `is-timed` and counts down in whole seconds, the soonest to pass first, and an effect
that lasts until cured shows no count. An effect's name is its `effects.json` row's `name`; a chip is
`li.wdi-body__chip--<effect>`. The panel hides while the row is empty (the lobby, the card, a ghost). 8H's "Round 8
(8H)" block of `components.css` animates the states by class, and 8N's `effectIconUrl(effectId, style)` will give a
chip its icon; `view/body/body.css` holds the panel's own rules. Module `ui/copy/body.ts`.

| Id | Text | Notes |
|---|---|---|
| `body.label` | Your body | the section's `aria-label` |
| `body.health` | Health | the health bar's label and `aria-label` |
| `body.stamina` | Stamina | the stamina bar's label and `aria-label` |
| `body.effects` | Effects on you | the chip row's `aria-label` |
| `body.value` | {value} / {max} | after a bar's label; whole numbers as the wire carries them |
| `body.left` | {s}s | a timed chip's seconds left |
| `body.stacks` | ×{n} | a chip's stacks above one (Weakened from a rat) |
| `body.strike` | Strike | the Strike disc's label on touch (`touch-strike`) |
| `body.use` | Use | a pocket row's Use button (`inventory-use-<id>`): the item on yourself |
| `body.use.near` | Use on them | the second button of a cure (`inventory-use-near-<id>`), shown while an avatar stands in its reach |

Frozen test ids: `body` (the section), `body-health`, `body-stamina` (the bars, `role="meter"`), `body-effects`,
`touch-strike`, `inventory-use-<id>`, `inventory-use-near-<id>`.

**The strike key and the Use buttons** (8A, the last PR of its brief; GDD 3.22). `X` (or the Strike disc on touch, a
fifth `.wdi-touch-btn` after Sneak in the cluster) swings the fists: `view/body/verbs.ts` `strikeTarget` names the
nearest other avatar in reach (a handle, as the Kill does; never the own figure, a ghost or a figure in transit), else
the nearest living creature (its id; a dead one is no target), at the `strike` row's reach plus the one-tile slack of
the other verbs, and the World sends `act.ability {abilityId: 'strike', targetId}`; with nothing in reach the HUD says
`refuse.nobody`. The server resolves and refuses the rest (a knocked-out seat, a creature in another scene, the
cooldown), each a toast of 14.3. The strike has no prompt chip: it is a swing, not a use. In the pockets (14.19.2)
a row whose item any holder may use gets a Use button: `useVerbOf(itemId)` is the active ability of `scope` item or
universal that consumes or requires the item (the Medkit's `heal`, the Remedy's `antidote`, the Wake Loaf's `eat`),
sent with no target, so it works on yourself; a cure whose target is a player (`heal`, `antidote`) also shows
`body.use.near` while an avatar stands within its reach, sending that handle. A role's own item verbs (the Doctor's
Bandage and Salts, the Child's slingshot) stay the card's keys (Q, R, F) and get no button; a light keeps Light /
Douse. The mock refuses every verb but the Knife (a toast), as before.

### 14.33 Inspect (8B)

Lines are in `apps/client/src/ui/copy/inspect.ts` (`INSPECT_COPY`, `inspectLine(id)`); the card is `ui/inspect/` (GDD 3.22 "Inspect"). The server sends only copy ids and bands; a sign or hunch id this build has no line for is left out. The card and the toasts never name a card, a cover or a vendetta.

| Key | Text | Where |
|---|---|---|
| `prompt.inspect` | Inspect | the HUD prompt (`E`) on the nearest living figure in reach when nothing else is offered |
| `inspect.title` | {look} | the card heading; `{look}` is the drawn look's name, capitalised |
| `inspect.signs.none` | No sign of trouble | the card, when no sign shows |
| `inspect.light` | Carries a lit light | the card, when a light burns in hand |
| `inspect.close` | Close | the card's button (Esc also closes; it closes itself after 6 s) |
| `inspect.noticed` | {look} looked you over | a warm toast to the inspected seat; `{look}` is the inspector's drawn look |
| `inspect.noticed.someone` | Someone looked you over | the same, for a look this build cannot name |
| `inspect.health.unhurt` | Unhurt | the card, the health band |
| `inspect.health.bruised` | Bruised | the card, the health band |
| `inspect.health.badlyHurt` | Badly hurt | the card, the health band |
| `inspect.purse.unknown` | You cannot tell their purse | the card, the purse band |
| `inspect.purse.light` | A light purse | the card, the purse band |
| `inspect.purse.fair` | A fair purse | the card, the purse band |
| `inspect.purse.heavy` | A heavy purse | the card, the purse band |
| `inspect.sign.down` | Out cold | the card, a sign |
| `inspect.sign.stunned` | Stunned | the card, a sign |
| `inspect.sign.dazed` | Dazed, eyes swimming | the card, a sign |
| `inspect.sign.bloody` | Blood on their clothes | the card, a sign |
| `inspect.sign.bleeding` | Bleeding | the card, a sign |
| `inspect.sign.limping` | Limping | the card, a sign |
| `inspect.sign.pale` | Pale and sweating | the card, a sign |
| `inspect.sign.weary` | Weary, stumbling | the card, a sign |
| `inspect.sign.weak` | Drawn and weak | the card, a sign |
| `inspect.sign.hungry` | Hollow-cheeked | the card, a sign |
| `inspect.sign.hunted` | A hunted look | the card, a sign |
| `inspect.hunch.watchChain` | Their eyes lingered on your watch chain. | a warm toast to the inspected seat, a `relations.json` note |
| `inspect.hunch.collar` | They studied your collar as if it offended them. | a warm toast to the inspected seat, a `relations.json` note |
| `inspect.hunch.keys` | Their eyes counted the keys at your belt. | a warm toast to the inspected seat, a `relations.json` note |
| `inspect.hunch.rings` | Their stare went straight to your rings. | a warm toast to the inspected seat, a `relations.json` note |
| `inspect.hunch.measured` | They took your measure, slowly. | a warm toast to the inspected seat, a `relations.json` note |
| `inspect.hunch.confession` | They watched you as if waiting for a confession. | a warm toast to the inspected seat, a `relations.json` note |
| `inspect.hunch.blessing` | They looked at you the way one looks for a blessing. | a warm toast to the inspected seat, a `relations.json` note |
| `inspect.hunch.pockets` | Their glance went to your pockets. | a warm toast to the inspected seat, a `relations.json` note |

### 14.34 Scrip (8C)

Lines are in `apps/client/src/ui/copy/scrip.ts` (`SCRIP_COPY`, `shopName(id)`). The shop panel (`ui/shop/ShopPanel.ts`)
opens on `shop.open` after a `shop` hold at a counter (GDD 3.23); it lists what the shop sells and what it wants, one
item per press, and greys a Buy the purse cannot cover or a Sell with nothing in the pockets. The server decides each
trade; a refusal is the usual error line. 8H animates the panel by `wdi-anim-panel` and `wdi-anim-list`.
A trade that lands (the purse moves its way) flashes its button and pops the purse line; an error line while it
waits shakes the button instead (`ui/shop/feedback.ts`, with 8H's `flash`, `pop` and `refused`).

#### 14.34.1 The shop panel

| Key | Text | Where |
|---|---|---|
| `prompt.shop` | Hold E: trade at the {shop} | the hold prompt at a counter in reach |
| `shop.sells` | For sale | the heading of the shop's stock |
| `shop.buys` | Wanted | the heading of what the shop buys |
| `shop.none` | Nothing here. | a shop with neither list |
| `shop.price` | {n} Scrip | each row's price, its ask or its pay |
| `shop.buy` | Buy | a stock row's button (one item) |
| `shop.sell` | Sell | a wanted row's button (one item) |
| `shop.have` | You have {n} | each row: how many the pockets hold |
| `shop.short` | Not enough Scrip | a stock row the purse cannot cover |
| `shop.purse` | Your purse: {n} Scrip | under the shop's name |
| `shop.close` | Close | the panel's close button |
| `prompt.coins` | Hold E: pick up the coins | the hold prompt at dropped coins in reach (the hold lasts `economy.coinPickupS`) |
| `shop.<id>` | Bakery, Apothecary, General Store, Market, Gamekeeper's Stall, Lodge Store, Camp Market | the panel's title, by `economy.json` shop id |

#### 14.34.2 The purse counter

`view/purse/PurseHud.ts`: a pill under the goal chip in the HUD's top-left column, own client only. It shows the
purse and, for a moment after a change, the change beside it (`data-change="gain"` or `"loss"`); 8H animates the roll
by `wdi-anim-purse`. Entering a scene shows the amount alone, never the whole purse as a gain.

| Key | Text | Where |
|---|---|---|
| `purse.label` | Your purse | the counter's accessible name |
| `purse.amount` | {n} Scrip | the counter |
| `purse.gain` | +{n} | beside it after a wage, a sale or a pickup |
| `purse.loss` | −{n} | beside it after a buy, a deposit or a theft |

### 14.35 Rent, Faith, rumours and HQ (8D)

Lines are in `apps/client/src/ui/copy/civic.ts` (`CIVIC_COPY`, `stationName(id)`). The civic layer
(`ui/econ/CivicLayer.ts`) shows one prompt at the civic prop in reach (GDD 3.23). At the mailbag and a tally rack, E is
held (`act.hold`). At an altar, the back room, an HQ station or a bank counter, E opens the civic panel
(`ui/econ/CivicPanel.ts`), redrawn for that prop. The server decides every act; a refusal is the usual error line.
Showing a notice, and presenting an Indulgence or a Seal, happen at a meeting, in the meeting's Papers tab (14.35.6).
8H animates the panel by `wdi-anim-panel` and its lists by `wdi-anim-list`.

#### 14.35.1 The prompts

| Key | Text | Where |
|---|---|---|
| `prompt.altar` | Press E: the altar | the prompt at an altar in reach |
| `prompt.mailbag` | Hold E: collect the mailbag | the hold prompt at the mailbag (the hold lasts `clues.collectHoldS`) |
| `prompt.rack` | Hold E: hand in your quota | the hold prompt at a tally rack |
| `prompt.market` | Press E: the back-room buyer | the prompt at the back-room buyer (the black market) |
| `prompt.hq` | Press E: the {station} | the prompt at an HQ station, by its name |
| `prompt.bank` | Press E: pay what you owe | the prompt at a bank counter |

#### 14.35.2 The altar

| Key | Text | Where |
|---|---|---|
| `altar.title` | The altar | the altar panel's title |
| `altar.faith` | Your Faith: {n} of {max} | under the title: the own Faith |
| `altar.purse` | Your purse: {n} Scrip | under it: the purse |
| `altar.donate` | Give {n} Scrip | the two give buttons (1, and 5 or `faith.donateMax`) |
| `altar.indulgence` | An Indulgence | a row: the Indulgence |
| `altar.indulgence.hint` | Clears one rumour of your look. {faith} Faith and {scrip} Scrip. | its line, with its price |
| `altar.seal` | A Parish Seal | a row: the Parish Seal |
| `altar.seal.hint` | Presented at a meeting, the Church holds the charge. {faith} Faith and {scrip} Scrip. | its line, with its price |
| `altar.buy` | Buy | each row's button |
| `altar.short` | Not enough Faith or Scrip | a row the Faith or the purse cannot cover |

#### 14.35.3 The back room and the notices

| Key | Text | Where |
|---|---|---|
| `market.title` | The back room | the back room's title |
| `market.lead` | A man who buys what people would rather keep quiet. | under it |
| `market.none` | You hold no notices. | no notice held |
| `notice.line` | A figure in {look}'s look, in {place}, {when}. | each held notice (`{when}` one of the four below) |
| `notice.fence` | Sell for {n} Scrip | a notice's sell button (`notices.fencePrice`) |
| `notice.burn` | Burn | a notice's burn button (your own look's needs an Indulgence) |
| `notice.when.day` | by day | grace and day |
| `notice.when.dusk` | at dusk | dusk |
| `notice.when.night` | at night | night |
| `notice.when.finalNight` | on the last night | the Final Night |
| `notice.stranger` | a stranger | a look with no name |

#### 14.35.4 The HQ panel

| Key | Text | Where |
|---|---|---|
| `hq.tier` | Built: {n} of 3 | the bought tier |
| `hq.next` | Next: {scrip} Scrip, {materials} | the next tier's price |
| `hq.done` | Fully built. | all three tiers built |
| `hq.build` | Build | the build button |
| `hq.notYours` | Only someone in the {look} look may build here. | a seat not in the station look |
| `hq.short` | Not enough Scrip or materials | the Scrip or the materials fall short |
| `hq.<id>` | Crumb's Ovens, Chapel, Surgery, Gamekeeper's Lodge, Detective's Office, Lamplighter's Store | the panel's title, by `economy.json` station id |

#### 14.35.5 The bank counter

| Key | Text | Where |
|---|---|---|
| `bank.title` | The Company ledger | the bank panel's title |
| `bank.lead` | Rent falls due at midday and is owed by dusk. Pay all you owe at once. | under it |
| `bank.pay` | Pay what you owe | `act.payRent`, the whole debt or nothing |
| `civic.close` | Close | the panel's close button |

#### 14.35.6 The meeting's Papers tab

`ui/econ/meetingPapers.ts`, a tab of the meeting's side panel (`MeetingScreen.addTab`, mounted in `scenes/Meeting.ts`
beside the Notebook). Every seat sees the tab, so its presence says nothing; its rows are this seat's own. A row shows
only what the seat holds: a Seal, an Indulgence, each notice.

| Key | Text | Where |
|---|---|---|
| `papers.tab` | Papers | the tab's label |
| `papers.lead` | What you carry to the table. Only you see this tab. | the tab's first line |
| `papers.none` | You carry nothing to lay on the table. | when the seat holds none of them |
| `papers.seal` | A Parish Seal (you hold {n}) | the Seal row |
| `papers.seal.hint` | Every vote so far is cleared, and for a while no vote may name you. Everyone hears of it. | under it |
| `papers.indulgence` | An Indulgence (you hold {n}) | the Indulgence row |
| `papers.indulgence.hint` | Quietly clears the oldest notice of your look, wherever it is held. Nobody is told. | under it |
| `papers.present` | Present | `act.faith {kind}` in a meeting |
| `papers.show` | Show | `act.notice {op: 'show'}`, a notice row (the line is `notice.line`) |
| `notice.burn` | Burn | `act.notice {op: 'burn'}`, held back on a notice of the seat's own look without an Indulgence |

### 14.36 Townsfolk (8E)

Lines are in `apps/client/src/ui/copy/townsfolk.ts` (`TOWNSFOLK_COPY`, `figureName(lookId)`). An ambient figure (GDD 3.24) is an avatar whose `lookOf` is a `villager` look id rather than a seat: its nameplate is `figureName(lookOf)`, the plain `figure.villager` for a look with no line of its own, and it never shows a scarf, a hat glyph or a mask. The meeting text reads the count of townsfolk the creatures took since the last meeting (`meetingStart.figuresLost`, once that field lands) and adds one line below the reason; no count, no line.

| Key | Text | Where |
|---|---|---|
| `figure.villager` | Villager | the nameplate of any `villager` look without a line of its own |
| `figure.villager_clerk` | Company Clerk | the nameplate of HollowMere's Clerk (8F's look) |
| `figure.villager_tallyman` | Tallyman | the nameplate of BlackPine's Tallyman (8F's look) |
| `meeting.townsfolk.lost.one` | The wolves took one of the townsfolk. | the meeting text when one figure died since the last meeting |
| `meeting.townsfolk.lost.many` | The wolves took {n} of the townsfolk. | the meeting text when more did; `{n}` is the count |

#### 14.36.1 The mugging prompt

Lines are in `apps/client/src/ui/copy/mug.ts` (`MUG_COPY`); the panel is `apps/client/src/ui/mug/MugPrompt.ts` (`mountMugPrompt(root, feed, send)`), mounted by the World scene once the `mugPrompt` feed event lands. A private `mugPrompt { muggerId, endsTick }` (GDD 3.24) opens it over the world: a veil, and a glass panel with the mugger's name (`figureName` for a villager look, the character's name for any other look; a handle no avatar wears reads as a villager), the hint, the seconds left until `endsTick` by the feed clock (refreshed four times a second; at zero the panel closes by itself, the server having taken its share), and the choices. A choice sends `act.mug { choice }` and closes the panel; a second prompt replaces the first. Part one (DECISIONS A180) offers Pay alone; Run and Fight join the panel with the fists. Motion: the panel carries 8H's `wdi-anim-panel`, the veil `wdi-anim-veil` and the choice row `wdi-anim-list`, and nothing else of 8H's.

| Key | Text | Where |
|---|---|---|
| `mug.title` | {name} wants your purse. | the panel title; `{name}` is the mugger's nameplate |
| `mug.hint` | Pay a share of your purse. | under the title |
| `mug.timer` | {s} s to choose | the countdown; `{s}` is the seconds left |
| `mug.pay` | Pay | the Pay button |
| `mug.flee` | Run | the Run button, part two |
| `mug.fight` | Fight | the Fight button, part two |

### 14.38 Tasks: the chores panel, the station prompts and the village's work (7M)

Session 7M, round 7 (GDD 3.5, DECISIONS A133). The task list each seat is dealt at Start gets its screen half in the M5b layer (14.19): nothing here changes the layer's gather, craft or quest behaviour, and `ui/theme/**` is not edited; the new rules live in `ui/match.css`.

**Spots.** `ui/tasks.ts taskSpots` turns this seat's unfinished `fetch` tasks into targets in the current scene, from `tasks.json` and the scene file's props (loaded lazily, as the givers are): a real task's source while its tool is not in the pockets, a fake task's source always (its holder makes the same motion at the same shelf and takes nothing, 3.5), and every target. The layer's E picks the nearest of the active nodes, the givers and these spots; a spot wins a tie. Pressing E (or the prompt) sends the `task` hold once: at the source the server's pick-up puts the tool in the pockets and the layer says so when they change (`toast.task.took`); a fake list's holder gets `toast.task.show` instead, on the client only, so the wire carries the same hold either way. At a station the hold opens the mini-game as before (14.19.5).

**Prompts** (`ui/copy/tasks.ts`, read by `taskPrompt`): `prompt.task.take` "Press E: take the {tool}" at a real source; `prompt.task.do` "Press E: {name}" at a fake source, or at a station with the tool in hand; `prompt.task.tool` "Needs the {tool}: {name}" at a station without it; `prompt.task.night` "Only at night: {name}" at a `nightOnly` station by day (the server refuses the same, 3.5). A fake task never says what it needs: it has nothing to fetch, and its prompt reads like a real task's with the tool in hand.

**Chores (K).** `ui/Chores.ts mountChores`, the QuestLog's panel pattern and classes (`wdi-m5b__panel/row/done/empty`), fourth button of the layer's key row. One row per dealt task in deal order: the name, then `chores.fetch` "Fetch the {tool} from {scene}", `chores.bring` "Bring it to {scene}", `chores.go` "Go to {scene}" for a task without a tool, `chores.night` "After dark." under a `nightOnly` one, `chores.done` "Done" (name struck through). A fake list shows the same rows under the hint `chores.show` "A show of work": the list is `Private.tasks`, so only its holder sees that line. `chores.none` "No chores on your list." for a seat dealt none (an NPC seat, or Blackpine). Escape closes it with the other panels. Testids `chores`, `chores-list`, `chores-show`, `chores-empty`, `chore-<taskId>` (with `data-step` fetch, bring or done), `chores-close`.

**The co-op hold (GDD 3.5 "Shutter the windows").** `taskSpots` also offers every `coop` task's prop in the scene to every seat, with the task on its list or not, within `coopRadiusTiles` of it rather than the station reach (`nearest` honours a spot's own `reach`); its prompt is `prompt.task.coop` "Hold E: {name} (takes {n})". Holding E (or tapping the prompt) sends the `task` hold and keeps it, like a gather: the prompt turns to `prompt.task.coop.wait` "Waiting for hands: {holders} of {n}" or `prompt.task.coop.hold` "Keep holding: {holders} of {n}" from the server's `coopHold` (`WorldFeedEvents.coopHold`), and the prompt's bar is that shared progress, not a local clock. Letting go (the release, the prompt again, or walking off) sends `on: false` and says `toast.task.coop.cancel` "You let go."; `coopHold` at progress 1 ends the hold with `toast.task.coop.done` "Done, together.", whatever the seat's list said. The chores panel shows the task with `chores.coop` "Takes {n} hands, at {scene}" (`data-step` coop). The mock (`?mock=1`) plays the hold with a phantom second hand that joins after a second.

**The village's work.** `mountWorkBar`: the public task bar (`GameState.taskBar`, `WorldFeed.taskBar()`) as a thin meter with its percentage under the clock, `role="progressbar"` with `aria-valuenow`, title and label `work.title` "The village's work", `work.pct` "{pct}%". Its fill moves in 300 ms, none under reduced motion. Testids `work`, `work-pct`.

**Ghosts.** GDD 3.8 lets a ghost finish its own tasks, so the layer stays up for a dead seat with `data-ghost` on its root: only task spots are picked, the pockets, crafting and quests buttons hide and their panels close, and no gather or craft can start. The chores panel and the bar remain.

**Copy table.**

| Key                 | Line                             |
| ------------------- | -------------------------------- |
| `prompt.task.take`  | Press E: take the {tool}         |
| `prompt.task.do`    | Press E: {name}                  |
| `prompt.task.tool`  | Needs the {tool}: {name}         |
| `prompt.task.night` | Only at night: {name}            |
| `toast.task.took`   | Took the {tool}.                 |
| `toast.task.show`   | You make a show of it.           |
| `prompt.task.coop`  | Hold E: {name} (takes {n})       |
| `prompt.task.coop.wait` | Waiting for hands: {holders} of {n} |
| `prompt.task.coop.hold` | Keep holding: {holders} of {n} |
| `toast.task.coop.done` | Done, together.               |
| `toast.task.coop.cancel` | You let go.                 |
| `chores.title`      | Chores                           |
| `chores.key`        | K                                |
| `chores.none`       | No chores on your list.          |
| `chores.show`       | A show of work                   |
| `chores.fetch`      | Fetch the {tool} from {scene}    |
| `chores.bring`      | Bring it to {scene}              |
| `chores.go`         | Go to {scene}                    |
| `chores.coop`       | Takes {n} hands, at {scene}      |
| `chores.night`      | After dark.                      |
| `chores.done`       | Done                             |
| `chores.close`      | Close                            |
| `work.title`        | The village's work               |
| `work.pct`          | {pct}%                           |

### 14.40 Meeting notes (8T)

Lines are in `apps/client/src/ui/copy/notes.ts` (`NOTES_COPY`); the tab is `ui/meetingNotes.ts` (GDD 3.8 "Meeting
notes"). A note carries no speaker, so the tab shows only its text, and no line here names a seat. The named chat log
leaves `notes` lines out. A refused note (too soon, past the cap) is the usual refusal toast of 14.3.

| Key | Text | Where |
|---|---|---|
| `meeting.tab.notes` | Notes | the meeting tab beside Report, Chat and Notebook |
| `notes.title` | Meeting notes | the tab's accessible label |
| `notes.hint` | Notes carry no name. Anyone at the table may have written one. | above the notes |
| `notes.placeholder` | Leave a note | the field, a living seat |
| `notes.send` | Pin the note | the send button's label |
| `notes.empty` | No notes yet | the list, before the first note |
| `notes.ghost` | The dead leave no notes | the field, disabled, for a ghost |
| `meeting.reason.final` | The Final Night: the village must choose | the meeting's reason line for the Final Night's forced meeting (reason `final`, GDD 3.2) |

### 14.41 The shout (8R)

Lines are in `apps/client/src/ui/copy/hive.ts` (`HIVE_COPY`); the binder is `ui/hive/shout.ts` (GDD 3.12 "The body bands"). The private `shout {sceneId, x, y}` reaches only the nearest living Detective and Doctor. The toast names the place and never a card, a seat or the body.

| Key | Text | Where |
|---|---|---|
| `hive.shout` | Someone is shouting for help in {place} | a hazard toast; `{place}` is the scene's name |


### 14.42 The Studio (9T)

Lines are in `apps/client/src/ui/copy/studio.ts` (`STUDIO_COPY`); the page is `scenes/Studio.ts` at `#/studio`, behind the admin sign-in (`docs/round9/admin-studio.md` 2). Tooling copy for one reader; no player ever sees it. Values in braces are filled with `fill()`.

| Key | Text | Where |
|---|---|---|
| `studio.title` | Studio | the Studio page |
| `studio.signin.lead` | Sign in with the owner’s GitHub account to walk the world. | the Studio page |
| `studio.signin.button` | Sign in with GitHub | the Studio page |
| `studio.signin.failed` | The Studio refused this sign-in. Sign in again. | the Studio page |
| `studio.connecting` | Joining the Studio... | the Studio page |
| `studio.signout` | Sign out | the Studio page |
| `studio.status` | {scene} · tile {tx},{ty} · tick {tick} | the Studio page |
| `studio.mode` | Mode | the Studio header: the mode toggle |
| `studio.mode.overview` | Overview | the Studio mode toggle, once Overview is registered |
| `studio.mode.world` | World editor | the Studio mode toggle |
| `studio.mode.room` | Room editor | the Studio mode toggle |
| `studio.mode.npc` | NPC editor | the Studio mode toggle, once the NPC editor is registered |
| `studio.scene` | Scenes | the Studio page |
| `studio.scene.search` | Search scenes | the Studio page |
| `studio.teleport` | Go | the Studio page |
| `studio.overlays` | Overlays | the Studio page |
| `studio.overlay.collision` | Collision grid | the Studio page |
| `studio.overlay.nav` | Walkable links | the Studio page |
| `studio.overlay.coords` | Tile under the cursor | the Studio page |
| `studio.overlay.ids` | Ids | the Studio page |
| `studio.overlay.lights` | Light radii | the Studio page |
| `studio.overlay.sight` | Sight radius | the Studio page |
| `studio.overlay.footprints` | Footprints | the Studio page |
| `studio.overlay.gating` | Hidden at this profile | the Studio page |
| `studio.noclip` | Noclip | the Studio page |
| `studio.time` | Time of day | the Studio page |
| `studio.time.dawn` | Dawn | the Studio page |
| `studio.time.day` | Day | the Studio page |
| `studio.time.dusk` | Dusk | the Studio page |
| `studio.time.night` | Night | the Studio page |
| `studio.speed` | Speed | the Studio page |
| `studio.speed.pick` | {scale}x | the Studio page |
| `studio.pause` | Pause | the Studio page |
| `studio.resume` | Resume | the Studio page |
| `studio.step` | Step | the Studio page |
| `studio.profile` | Profile | the Studio page |
| `studio.profile.small` | Small | the Studio page |
| `studio.profile.medium` | Medium | the Studio page |
| `studio.profile.large` | Large | the Studio page |
| `studio.style` | Art style | the Studio page |
| `studio.spawn` | Spawn | the Studio page |
| `studio.spawn.kind.mob` | Mob | the Studio page |
| `studio.spawn.kind.townsfolk` | Townsfolk | the Studio page |
| `studio.spawn.kind.look` | Look | the Studio page |
| `studio.spawn.add` | Spawn here | the Studio page |
| `studio.spawn.clear` | Clear spawns | the Studio page |
| `studio.give` | Give | the Studio page |
| `studio.give.add` | Give item | the Studio page |
| `studio.items` | Holding: {items} | the Studio page |
| `studio.items.none` | Holding nothing | the Studio page |
| `studio.log` | Studio log | the Studio page |
| `studio.report` | Report | the Studio page |
| `studio.report.title` | Report a problem | the Studio page |
| `studio.report.arrow` | Arrow | the Studio page |
| `studio.report.circle` | Circle | the Studio page |
| `studio.report.undo` | Undo mark | the Studio page |
| `studio.report.note` | What is wrong, or what should change? | the Studio page |
| `studio.report.send` | Send report | the Studio page |
| `studio.report.sending` | Sending... | the Studio page |
| `studio.report.sent` | Sent as issue #{number}. | the Studio page |
| `studio.report.failed` | The report was not sent: {why} | the Studio page |
| `studio.report.offline` | The report was not sent: the server did not answer. | the Studio page |
| `studio.report.close` | Close | the Studio page |
| `studio.inbox` | Inbox | the Studio page |
| `studio.inbox.title` | Reports | the Studio page |
| `studio.inbox.loading` | Loading reports... | the Studio page |
| `studio.inbox.empty` | No reports yet. | the Studio page |
| `studio.inbox.count` | {n} reports | the Studio page |
| `studio.inbox.open` | Open | the Studio page |
| `studio.inbox.answered` | Answered | the Studio page |
| `studio.inbox.fixed` | Fixed | the Studio page |
| `studio.edit` | Edit | the Studio editor |
| `studio.edit.title` | Editor | the Studio editor |
| `studio.edit.add` | Add | the Studio editor |
| `studio.edit.select` | Select and move | the Studio editor |
| `studio.edit.name` | Name for the new object | the Studio editor |
| `studio.edit.kind.props` | Props | the Studio editor |
| `studio.edit.kind.portals` | Portals | the Studio editor |
| `studio.edit.kind.spawns` | Spawns | the Studio editor |
| `studio.edit.kind.spots` | Spots | the Studio editor |
| `studio.edit.kind.lights` | Lights | the Studio editor |
| `studio.edit.kind.buildings` | Buildings | the Studio editor |
| `studio.edit.kind.nodes` | Resource nodes | the Studio editor |
| `studio.edit.kind.spawners` | Creature spawners | the Studio editor |
| `studio.edit.kind.givers` | Quest givers | the Studio editor |
| `studio.edit.selected` | {kind} {id} at {x},{y} | the Studio editor |
| `studio.edit.nothing` | Nothing selected | the Studio editor |
| `studio.edit.duplicate` | Duplicate | the Studio editor |
| `studio.edit.delete` | Delete | the Studio editor |
| `studio.edit.rotate` | Turn 90° | the Studio editor |
| `studio.edit.noTurnArt` | No art for this angle yet: it is drawn mirrored until the art is made. | the Studio editor, under a turned prop or building |
| `studio.edit.keys` | Keys: R turns the selection, Delete or Backspace removes it. | the Studio editor |
| `studio.edit.undo` | Undo | the Studio editor |
| `studio.edit.redo` | Redo | the Studio editor |
| `studio.edit.radius` | Radius (tiles) | the Studio editor |
| `studio.edit.to` | Leads to | the Studio editor |
| `studio.edit.toSpawn` | Arrives at | the Studio editor |
| `studio.edit.paired` | Other side: {id} | the Studio editor |
| `studio.edit.unpaired` | No door on the other side yet | the Studio editor |
| `studio.edit.diff` | Changes | the Studio editor |
| `studio.edit.nodiff` | No changes | the Studio editor |
| `studio.edit.tool` | Tool | the Studio editor |
| `studio.edit.tool.objects` | Objects | the Studio editor |
| `studio.edit.tool.brush` | Brush | the Studio editor |
| `studio.edit.tool.rect` | Rectangle | the Studio editor |
| `studio.edit.tool.fill` | Fill | the Studio editor |
| `studio.edit.cell` | Tile | the Studio editor |
| `studio.edit.cell.floor` | Floor | the Studio editor |
| `studio.edit.cell.solid` | Solid | the Studio editor |
| `studio.edit.cell.D` | Door | the Studio editor |
| `studio.edit.cell.S` | Stairs | the Studio editor |
| `studio.edit.cell.H` | Hatch | the Studio editor |
| `studio.edit.cell.B` | Bed | the Studio editor |
| `studio.edit.material` | Material | the Studio editor |
| `studio.edit.material.floor` | Floor material: the tile becomes floor | the Studio editor |
| `studio.edit.material.solid` | Solid material: the tile becomes solid | the Studio editor |
| `studio.edit.width` | Width | the Studio editor |
| `studio.edit.height` | Height | the Studio editor |
| `studio.edit.resize` | Resize | the Studio editor |
| `studio.edit.tool.gate` | Gate | the Studio editor |
| `studio.edit.tool.path` | Path | the Studio editor |
| `studio.edit.profile` | Gate opens at profile | the Studio editor |
| `studio.edit.pathKind` | Path kind | the Studio editor |
| `studio.edit.pathFinish` | Finish path | the Studio editor |
| `studio.edit.pathClear` | Clear corners | the Studio editor |
| `studio.edit.routes` | Gates and paths | the Studio editor |
| `studio.edit.routeRemove` | Remove {id} | the Studio editor |
| `studio.edit.checks` | Checks | the Studio editor |
| `studio.edit.checks.ok` | Every check passes | the Studio editor |
| `studio.edit.checks.errors` | Errors (a save is refused) | the Studio editor |
| `studio.edit.checks.warnings` | Warnings | the Studio editor |
| `studio.edit.note` | Note for the pull request | the Studio editor |
| `studio.edit.walk` | Walk it | the Studio editor; uploads the edited scene as an unsaved draft and returns to the world |
| `studio.edit.walking` | Loading the draft... | the Studio editor, while the draft uploads |
| `studio.walk.title` | Walking an unsaved draft | the walk bar shown while the room serves the draft |
| `studio.walk.back` | Back to editing | the walk bar; reopens the editor on the same session |
| `studio.walk.discard` | Discard draft | the walk bar; the room serves the committed scene again |
| `studio.edit.save` | Save as a draft PR | the Studio editor |
| `studio.edit.saving` | Saving... | the Studio editor |
| `studio.edit.saved` | Draft PR #{number} opened on {branch} | the Studio editor |
| `studio.npc` | NPC | the Studio HUD; temporary button until the mode toggle lands |
| `studio.npc.title` | NPC routines | the NPC panel |
| `studio.npc.phase.dawn` / `.day` / `.dusk` / `.night` | Dawn / Day / Dusk / Night | the NPC panel's phase scrubber |
| `studio.npc.class` | Phase class: {cls} | the NPC panel, under the scrubber |
| `studio.npc.figure` | Townsfolk | the NPC panel's kind picker |
| `studio.npc.otherMap` | {id} (not on this map) | the kind picker, for a kind that does not walk this map |
| `studio.npc.maps` / `.maps.all` | Maps it walks / Empty means every map. | the NPC panel |
| `studio.npc.fixed` | Fixed: stands at its props, no route | the NPC panel |
| `studio.npc.stations` / `.stations.any` | Stations, in route order / No stations: it may use any prop that is not ignored. | the NPC panel |
| `studio.npc.up` / `.down` / `.remove` / `.add` | Up / Down / Remove / Add a station | the station list |
| `studio.npc.holds` / `.hold.none` | Holds / No hold | the NPC panel |
| `studio.npc.undo` / `.preview` / `.preview.clear` | Undo / Preview in the room / Clear preview | the NPC panel |
| `studio.npc.previewing` | Previewing: the room uses your routines | the NPC panel while a draft is up |
| `studio.npc.save` / `.saving` / `.saved` | Save as a draft PR / Saving... / Draft PR #{number} opened on {branch} | the NPC panel |
| `studio.npc.note` / `.close` / `.unused` | Note for the PR / Close / Not used in this phase | the NPC panel |
| `studio.people.title` | People | the NPC panel's People section |
| `studio.people.givers` | Quest givers here | the NPC panel's People section |
| `studio.people.givers.none` | No quest givers in this scene. | the NPC panel's People section |
| `studio.people.giver.move` | Move (click a tile) | the NPC panel's People section |
| `studio.people.giver.remove` | Remove | the NPC panel's People section |
| `studio.people.giver.add` | Add a giver | the NPC panel's People section |
| `studio.people.giver.name` | id name (lowercase) | the NPC panel's People section |
| `studio.people.giver.npc` | Quest NPC | the NPC panel's People section |
| `studio.people.giver.facing` | Facing | the NPC panel's People section |
| `studio.people.giver.at` | Tile {x},{y} | the NPC panel's People section |
| `studio.people.npc` | Quest NPC | the NPC panel's People section |
| `studio.people.npc.name` | Name | the NPC panel's People section |
| `studio.people.npc.look` | Look (villager family) | the NPC panel's People section |
| `studio.people.talk` | Meeting-note lines | the NPC panel's People section |
| `studio.people.talk.list.notes` | Notes | the NPC panel's People section |
| `studio.people.talk.list.herrings` | Red herrings | the NPC panel's People section |
| `studio.people.talk.list.smallTalk` | Small talk | the NPC panel's People section |
| `studio.people.talk.fills` | Placeholders: {fills} | the NPC panel's People section |
| `studio.people.talk.when` | Any time | the NPC panel's People section |
| `studio.people.talk.add` | Add a line | the NPC panel's People section |
| `studio.people.talk.remove` | Remove | the NPC panel's People section |
| `studio.people.preview` | Preview NPCs in the room | the NPC panel's People section |
| `studio.people.save` | Save people as draft PRs | the NPC panel's People section |
| `studio.people.saved` | {n} draft PRs opened | the NPC panel's People section |
| `studio.people.undo` | Undo | the NPC panel's People section |
| `studio.overview` | Overview | the Studio Overview (9W) |
| `studio.overview.title` | Overview of {map} | the Studio Overview (9W) |
| `studio.overview.layout.auto` | Automatic layout: maps/{map}.json has no layout, so cards sit in columns by doors from the hub. | the Studio Overview (9W) |
| `studio.overview.layout.map` | Layout from maps/{map}.json. | the Studio Overview (9W) |
| `studio.overview.help` | Click a card to open the scene. Drag a link’s dot onto a spawn of another scene to re-target the door. | the Studio Overview (9W) |
| `studio.overview.enter` | Open {scene} | the Studio Overview (9W) |
| `studio.overview.kind.exterior` | World | the Studio Overview (9W) |
| `studio.overview.kind.interior` | Room | the Studio Overview (9W) |
| `studio.overview.links` | Doors as a list | the Studio Overview (9W) |
| `studio.overview.to` | Scene that {portal} leads to | the Studio Overview (9W) |
| `studio.overview.spawn` | Spawn that {portal} lands on | the Studio Overview (9W) |
| `studio.overview.changed` | Unsaved doors in: {scenes} | the Studio Overview (9W) |
| `studio.overview.failed` | Not saved: {why} | the Studio Overview (9W) |
| `studio.overview.save` | Save changed scenes as draft PRs | the Studio Overview (9W) |
| `studio.overview.close` | Close | the Studio Overview (9W) |

### 14.43 Refusals (10A, round 10)

Lines are in `apps/client/src/ui/copy/refusals.ts` (`REFUSAL_COPY`, `refusalLine`), one per `RefusalReason` of
`packages/shared/src/protocol/refusals.ts`; the typecheck fails a reason without one. The words are the drafts of
`docs/round9/failures.md` 4.1 to 4.9 (FM3: plain second person, no jokes), with these rules:

- **Fills.** An item is named by its `items.json` name, lower case with its article ("a spade", "some salts"); a list
  reads "timber, pine resin and stone"; seconds and shortfalls round up to whole numbers. Each line reads whole
  without its args ("Not ready yet.", "Too far. Step closer.", "You are short of Scrip.").
- **`PHASE_CLOSED`** waits for the day, dusk, nightfall, dawn, a meeting or "the match to begin". **`TOO_FAR`** names
  them, the body, the clue, the door, the task, the pile, the counter or the bell. **`LOCKED`** is the owner's line
  ("Failed to pick the lock. Looks like you might need a lock pick.") with no pick, "Your pick is too thin for this
  lock." with too thin a one, and "It is locked." otherwise.
- **`ALREADY_DONE`**: "Someone already reported this body.", "That is in your Notebook already.", "That is built as
  far as it goes.", else "That is done already." **`LOBBY_RULE`**: "The party needs more players to start.", "The
  party is full.", "There is no NPC seat to remove."
- **Never shown.** `BAD_REQUEST` and `DEBUG_ONLY` show nothing in release (dev: "Bug: bad request"); `SAY_SOMETHING`
  and `ASLEEP` show nothing in any build. An unknown reason reads "Nothing happens." in release and "Bug: unhandled
  refusal {reason}" in dev; `VOIDED` reads "Nothing happens." whatever stopped the strike (FM4).
- **`NFY`** reads "NFY: {feature}." with the tag of the unbuilt system (`NFY_FEATURES`); `NFY_SHOWN` is the one switch
  that makes it read "Nothing happens." before release (FM1).
- No line names a role or an ability (rule 4; the test reads `roles.json` and `abilities.json`). A per-interaction
  `fail` line of `interactions.json` wins over these when the refusal names its interaction (A4).

### 14.44 The inventory screen and the crafting square (10H, round 10)

Lines are in `apps/client/src/ui/copy/m5b.ts` (`M5B_COPY`, keys `inv.*`, `hotbar.*`, `grid.*`). Item names come from
`items.json`; no line names a role. The screen (key I, the Pockets button) draws the slots of GDD 3.30 as grids:

| Key | Line |
| --- | --- |
| `inv.hotbar`, `inv.pack`, `inv.belt` | Hotbar, Pack, Belt |
| `inv.head`, `inv.body`, `inv.weapon` | Head, Body, Weapon |
| `inv.pick` | Pick a stack, then a slot that takes it. |
| `inv.slots` | {n} of {max} slots (the count of used slots over the whole layout) |
| `grid.title`, `grid.size2`, `grid.size3` | Craft; 2 by 2; 3 by 3 (workbench) |
| `grid.hint` | Pick a stack, then a square. Take what comes out. |
| `grid.bound` | That stays with you. It cannot be worked. |
| `hotbar.label` | Hotbar |

- **Moves.** Click a stack to pick it; the slots that would refuse the move (`inv.move`: the belt takes tools, a gear
  slot its own gear, a full stack of the same item) are dimmed and cannot be clicked, so a move offered lands. Click the
  picked stack again to put it down.
- **The hotbar strip** is always on screen during a match: a tap or the keys 1 to 6 select the held slot
  (`inv.select`); the held slot has a border. The same strip is the touch control.
- **The crafting square** shows the product the shared match gives as a preview; Take sends `craft.grid` and empties the
  square. A role-bound item cannot be placed (`grid.bound` on hover); the 3 by 3 button asks the server, which
  refuses `NEED_STATION` (workbench) away from one. The refusals read their lines from 14.43.
- The Light, Douse and Use buttons of 14.19.2 and 14.32 sit in a row under the grid for each stack that has the verb.

### 14.45 Showing a refusal (10G, round 10)

`World.ts` shows the server's reason, never its `msg` (the `lastVerb` guess and `refuse.generic` are gone):

- **Which line.** The interaction's own `fail` line for the reason when the frame names an interaction
  (`interactions.json`, `refusalText` in `apps/client/src/ui/copy/refusals.ts`), else the general line of 14.43. A
  server that sends no reason still gets the deck line of its code (14.3), and a bare 422 reads "Nothing happens".
- **Silent reasons** show nothing in a release build; an unknown reason reads "Nothing happens" (a development build
  reads `Bug: unhandled refusal <reason>`).
- **`NFY`** goes through the same log line, drawn apart: muted and italic, so a tester can tell "the game is unfinished"
  from "you are missing something". `NFY_SHOWN` (14.43) is the release switch.
- The refused prompt keeps its shake (`refusedIn`, UI.md 9), and the door sound still follows the legacy code.

### 14.46 Sleeping (10H, round 10)

Lines are in `apps/client/src/ui/copy/sleep.ts` (`SLEEP_COPY`). No line names a seat: a sleeper learns how many are in
bed, never who (GDD 3.32).

| Key | Line |
| --- | --- |
| `prompt.bed` | Press E: lie down |
| `prompt.cot` | Press E: lie down on the cot |
| `prompt.innBed` | Press E: rent the bed ({n} Scrip) |
| `asleep.title` | Asleep |
| `asleep.count` | {n} of {m} in bed |
| `asleep.hint` | Move to wake. |
| `asleep.through` | You slept through. |

- **The prompt** shows at a bed, cot or inn bed in reach at dusk or at night, and E sends `act.hold {action: 'sleep'}`. The
  server's refusals (`NO_BED`, `BOARDED_HOME`, `NEED_SCRIP`, `PHASE_CLOSED`, `TOO_FAR`) read their lines from 14.43.
- **The overlay** follows `Private.asleep`: the view dims to the bedroom, the count line reads `Private.inBed` of
  `Private.inBedOf` (hidden while the server writes none), and the hint says how to wake. It takes no pointer, so the stick and
  the keys still reach the server, where the first input wakes the sleeper and is refused `ASLEEP` without a line.
- **"You slept through"** shows for five seconds when the sleeper wakes outside dusk and night (a hit or a move wakes it inside
  them). A night skip and a natural dawn read the same, and both are true for the sleeper; phases.md 13.4's "every client"
  is every sleeper.

### 14.47 The train's returns (10C, round 10)

Session 10C, C1 (DECISIONS A230). The server's lines go on the `chat.msg` `system` channel to every seat, like the
arrival line of 14.30. C1b adds the On-the-line screen (`ui/OnTheLine.ts`): a full-screen dark carriage over the
world while `Private.onLine` is true, through a meeting too (a seat on the line does not attend, phases.md 4), with
the time to the morning train, how the seat died and what it keeps; when
the train brings the seat back the screen lifts and a 3 s toast says so. The manifest is the log line below.

| Line | Text | Where |
|---|---|---|
| a seat back on the morning train (server, `Train.ts` `trainReturnLine`) | {name} steps off the train. | `chat.msg` `system`, every seat, at the arrival |
| the Dusk Train (server, `Train.ts` `TRAIN_DUSK_LINE`) | The dusk train pulls out of the station. | `chat.msg` `system`, every seat, once per dusk |
| the fare owed (`purse.fare`, C2b) | You owe the line {n} Scrip | under the own purse counter, while a fare is owed |
| the screen's title (`line.title`) | On the line | On the line, top band |
| the time to the train (`line.train`) | The train in {time} | On the line, top band, as m:ss |
| how the seat died (`line.cause.wolf`, `.creature`, `.shot`, `.other`) | A wolf took you. / Something in the dark took you. / A shot took you. / You fell by day. | On the line, centre |
| what it keeps (`line.kept`) | Your card, your Notebook and your quests come back with you, and what you wear. Your coins lie where you fell; your pack is lost. | On the line, below |
| back (`line.back`) | You are back. | toast, 3 s, to the returning seat, after the morning train or the Final Night's bells |

### 14.48 The lock-pick and the Resistant effect (10D, round 10)

Session 10D. D5b draws the lock-pick inside the mini-game dialog of 14.19.6 (`view/minigames/lockpick.ts`), for the
`minigameStart` with `kind: 'lockpick'` the picker alone receives (GDD 3.29): one column per pin, the lifted pin drawn
as a block, a tension gauge with the snap line. The set points are felt, never drawn: a click (a short tone, a buzz on
a phone) and a jolt of the pin when a lifted pin crosses its band under light tension. Pointer: press a pin and drag
it up and down; hold the pick button for tension and let go to try the pin. Keyboard: Left and Right choose the pin,
Up and Down lift it, Space or Enter holds and lets go. The answer is the trace the server replays. D4a adds the effect
Resistant (`icon_effect_resistant`), named by the data and with no copy of its own.

| Line | Text | Where |
|---|---|---|
| the hint (`minigame.lockpick.hint`) | Choose a pin, lift it, then press the pick lightly and let go when you feel a click. Press too hard and the pick snaps. | the dialog, above the board |
| the pick button (`minigame.lockpick.press`) | Hold the pick | the dialog, below the board |
| progress (`minigame.lockpick.progress`) | {set} of {pins} pins set | the status line |
| a miss (`minigame.lockpick.miss`) | It slips back. | the status line |
| a snap (`minigame.lockpick.snap`) | The pick snaps. | the status line; the server's `PICK_SNAPPED` refusal follows |
| the Notebook entry of a Scratches clue (D5c, `notebook.entry.scratch`) | Scratches round a lock | the Notebook list, with the scene and time |

**Talk (D9c).** G asks the nearest avatar in reach about the town and H asks the time (`talk.ask`, GDD 3.24); a toast
says the ask went out ("You ask what the town is saying." / "You ask the time."), and the answer arrives as a system
line in the chat log (`from` the figure's name). The words live in `ui/talk/talk.ts`. A seat answers nothing: the
server refuses it like no target.

### 14.50 The law (10B, round 10)

The server fills these templates (`packages/content/data/laws.json` `briefing`, read by
`apps/server/src/sim/law/Briefing.ts` and, with D9, by a Constable's tips) and sends them on the `system` chat
channel, the same words to every client (GDD 3.31):

| Moment | Line |
|---|---|
| A briefing, an Anyone clue with a trait | Constables' briefing: {clue} in {scene}, {trait}. |
| A briefing, no trait | Constables' briefing: {clue} in {scene}. |

`{clue}` is the clue's `clues.json` name in lower case, `{scene}` the scene's name and `{trait}` the trait's
`traits.json` label in lower case. A line never names a seat, a handle, a card or a time, and never says Forged
or Verified.

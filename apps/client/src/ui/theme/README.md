# `apps/client/src/ui/theme`

The DOM overlay's design system: tokens, component classes and the frame generator. The design
itself is written up in `docs/UI.md`; this folder is what a screen imports.

| File               | What it is                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tokens.css`       | `@font-face` for Oswald, Inter, Pixelify Sans and Press Start 2P, every `palette.json` colour (the ten tokens and the night set) as `--wdi-<name>` (and `--wdi-<name>-rgb` for alpha), the role tokens (`--wdi-bg`, `--wdi-paper`, `--wdi-primary`, factions), type scale, spacing, radii, strokes, shadows, the paper grain, the four nine-slice card frames as data URIs, motion durations and z layers |
| `components.css`   | The `wdi-` classes: text, layout helpers, panels, buttons, inputs, chips, icons, roster rows, the role card and its flip, timer, dialogs, toasts, HUD, touch controls, portraits and votes, chat, tabs, notebook; since round 7 the night glass (`.wdi-glass*`, `.wdi-tag`, `.wdi-seg--glass`, `.wdi-title`)                                                                                              |
| `title.ts`         | `titleLetters(lines)`: the `.wdi-title` heading with one `aria-hidden` span per letter and its drop-in index `--i` (round 7)                                                                                                                                                                                                                                                                              |
| `build-frames.mjs` | Writes `public/assets/ui/frames/frame_*.svg` and prints the `--wdi-frame-*` tokens; run it after changing a motif, then paste the output into `tokens.css`                                                                                                                                                                                                                                                |
| `theme.test.ts`    | Palette-only colours, the 2 px stroke and 48 px grid on every UI SVG, frames identical to their data URIs, WCAG AA on every text pair, and the ratio table in `docs/UI.md`                                                                                                                                                                                                                                |

## Opting a screen in

One import, once, next to the existing stylesheet import in `src/main.ts`:

```ts
import './ui/theme/tokens.css';
import './ui/theme/components.css';
```

Then put `class="wdi-root"` on `#overlay` (or on `body`) so the fonts and colours apply, and use
the classes from `docs/UI.md` 11 (the mapping table from today's `styles.css` selectors) in the
`h()` calls. `tokens.css` alone is enough to recolour an existing screen: swap `var(--panel)` for
`var(--wdi-surface)` and so on; nothing in it selects an element, so it cannot fight `styles.css`.
When every screen uses the classes, `styles.css` keeps only `#game`, `#overlay` and the
`pointer-events` rule.

The static pages under `public/theme-preview.html` and `public/mockups/` link the same two files
through the dev server (`pnpm --filter @wdi/client dev`, then
`http://localhost:8080/Who-Did-It/theme-preview.html`), so what they show is what a screen gets.

## Rules the tests enforce

- No hex outside `packages/content/data/palette.json` (`colors` and `night`), and no literal
  `rgb()` or `hsl()`, in any `.css` file under `apps/client/src` (round 7) or in any SVG under
  `public/assets/ui/`. Alpha variants are `rgb(var(--wdi-bone-rgb) / 0.72)`, never a new hex.
- Fonts only through the `--wdi-font-*` tokens, in any `.css` file under `apps/client/src`
  (generic families such as `monospace` aside); the four `@font-face` rules live in `tokens.css`.
- Every SVG under `public/assets/ui/{frames,marks,glyphs}` sits on the 48 px grid with 2 px strokes.
  `icons/` is checked by `tools/sprites/test/icons.test.ts` against `docs/SPRITES.md` 9; do not add
  files there without a `SPRITES.md` row.
- `theme.test.ts` lists every text pair the components ship; adding a colour role means adding a
  row there and in `docs/UI.md` 10, with its measured ratio.

## Faction secrecy

`.wdi-card--village`, `--cabal` and `--neutral` (and the three faction frames) are for the
player's own card and the end-of-match reveal only. Roster rows, portraits, chips and the HUD
never take a faction class, and nothing in this folder maps a role or team to a colour anywhere
else.

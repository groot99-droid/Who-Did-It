# Round 8 icons (8N): the review sheets

The status icons of `docs/round8/teardown.md` 3 (DECISIONS A168, A172), for the owner's look sign-off before the
set is drawn. Each icon is one square on the 48 px grid of `docs/SPRITES.md` 9 (2 px ink stroke, palette colours
only), hand-built as an SVG master in `tools/sprites/icons.ts` and finished for the three art styles the way every
other render is (`tools/sprites/pixel.ts`):

| Style | On the sheet | How |
|---|---|---|
| 8-bit | the 24 px cell at 2x (as the client draws it) and at 8x | the flat master at 48 px, snapped to the world palette and mode-halved |
| Low poly | the same cell at 2x and 8x | the flat master box-halved and alpha-bled |
| HD | drawn from the vector at 48 and 192 px | the gradient master, linear filtering |

The "white" ground is the bone ramp's lightest tone (`#FFF1DC`): the palette has no white in art (UI.md 2).

- `sheet-01.png`: the first six, bleeding first in the owner's words ("a dagger partially stabbed in a white
  background with red and around it and seemingly dripping"), then wounded, poisoned, stunned, dazed and knocked out.
- `icon_effect_<id>.<style>.png`: each icon's packed cell (8-bit and low poly, 24 px) or 48 px HD render.

Regenerate with `pnpm --filter @wdi/sprites exec tsx icons-sheet.ts <out dir>`. Hand-made original art, CC BY 4.0
(`LICENSE-ASSETS`, A19); nothing third-party or generated went into it.

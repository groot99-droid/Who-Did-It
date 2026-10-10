# tools/sprites (`@wdi/sprites`)

Turns rendered frames into the atlases the client loads (`docs/SPRITES.md`). TypeScript run directly
by Node 22's type stripping; no build step.

| File | Does |
|---|---|
| `keys.ts` | Directions, passes, V1 clips, the frame regex, and the key builders (`char/<body>/<anim>/<dir>`, `<pass>/...`) |
| `pack.ts` | `packFrames` on free-tex-packer-core with the `ASSETS.md` 6.3 settings (`Phaser3` exporter, no rotation, trim, detect identical, power of two, padding 2, extrude 1, 2048 max, sorted inputs); pages are always named `<key>-<n>.png` and merged into one multiatlas JSON. `packCharacter` packs `char_<body>` and `ovl_<body>`; the CLI packs a `batch_render.py` output folder |
| `gen-anims.ts` | Writes each frame's Feet pivot (feet / untrimmed cell) into the atlas and builds Phaser `load.animation` JSON: 12 fps, loops repeat, one-shot clips hold the last frame |
| `placeholder.ts` | Generates every placeholder key of `SPRITES.md` 8 into `apps/client/public/assets/placeholder/` with its `manifest.json` |
| `test/pack.test.ts` | Synthetic frame set: trim and source sizes, determinism, detectIdentical, pivots, anim keys |

```sh
pnpm --filter @wdi/sprites test
pnpm --filter @wdi/sprites placeholder            # regenerate the placeholder art (byte-identical when unchanged)
node tools/sprites/pack.ts build/render/villager apps/client/public/assets/chars
```

Placeholder labels use Inter (OFL) from `@fontsource/inter`; no other font is used. New dependencies
(caret-pinned to the current release on 2026-10-10): `free-tex-packer-core` ^0.3.9, `@napi-rs/canvas`
^1.0.11, `@fontsource/inter` ^5.3.0.

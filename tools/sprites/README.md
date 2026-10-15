# tools/sprites (`@wdi/sprites`)

Turns rendered frames into the atlases the client loads (`docs/SPRITES.md`). TypeScript run through `tsx`
(Node >= 22.12, no reliance on Node's own type stripping); no build step.

| File | Does |
|---|---|
| `keys.ts` | Directions, passes, V1 clips, the frame regex, and the key builders (`char/<body>/<anim>/<dir>`, `<pass>/...`) |
| `pack.ts` | `packFrames` on free-tex-packer-core with the `ASSETS.md` 6.3 settings (`Phaser3` exporter, no rotation, trim, detect identical, power of two, padding 2, extrude 1, 2048 max, sorted inputs); pages are always named `<key>-<n>.png` and merged into one multiatlas JSON. `packCharacter` packs `char_<body>` and `ovl_<body>`; the CLI packs a `batch_render.py` output folder |
| `gen-anims.ts` | Writes each frame's Feet pivot (feet / untrimmed cell) into the atlas and builds Phaser `load.animation` JSON: 12 fps, loops repeat, one-shot clips hold the last frame |
| `bleed.ts` | Alpha bleed: transparent pixels next to the sprite take their neighbours' colour (alpha stays 0) so linear filtering never pulls in black and draws an ink halo; reads and writes 8-bit RGBA PNG through `node:zlib` because canvas libraries premultiply and would zero that colour. `readRender` bleeds every rendered frame before packing; the placeholder art is not bled and stays byte-identical |
| `contact.ts` | Contact sheet for review: every clip x direction with the scarf (tinted teal) and cap composited, plus one strip of each pass alone |
| `placeholder.ts` | Generates every placeholder key of `SPRITES.md` 8 into `apps/client/public/assets/placeholder/` with its `manifest.json` |
| `test/pack.test.ts` | Synthetic frame set: trim and source sizes, determinism, detectIdentical, pivots, anim keys |
| `test/bleed.test.ts` | PNG round trip, one and two bleed rings, determinism |

```sh
pnpm --filter @wdi/sprites test
pnpm --filter @wdi/sprites placeholder            # regenerate the placeholder art (byte-identical when unchanged)
pnpm --filter @wdi/sprites pack ../../build/render/villager ../../apps/client/public/assets/chars
pnpm --filter @wdi/sprites contact ../../build/render/villager ../../assets/source/review/villager-contact.png
```

Placeholder labels use Inter (OFL) from `@fontsource/inter`; no other font is used. New dependencies
(caret-pinned to the current release on 2026-10-10): `free-tex-packer-core` ^0.3.9, `@napi-rs/canvas`
^1.0.11, `@fontsource/inter` ^5.3.0; `tsx` ^4.23.0 (dev, the pin of `docs/ARCHITECTURE.md` 5.1) since 2026-10-10 round 2.

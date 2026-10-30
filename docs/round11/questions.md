# Round 11: questions for the owner

Round 11's two planning sessions have finished their designs:

- 11A, the render pipeline: [`pipeline.md`](pipeline.md);
- 11B, the materials, styles and budgets: [`look.md`](look.md).

These are their questions, 22 in all, in one list. Each has a proposed answer. You can answer **default** (take the
proposal) or **different** (with a note in your own words), in the form at
https://claude.ai/artifact/KTRrtfV3aRGprcyspSMM1E, which saves your answers, or in the chat. The plan, `round11-plan.md`, is written from your answers.
A question still unanswered by then takes its default and is marked _proposed_.

Where both documents asked the same thing, the question is asked once and names both sources. They disagreed twice
(SC1, SC2): those questions say so, and the default is 6Z's.

Nothing outside `docs/round11/` changes until you approve the plan. The asset list (`assets.md`) comes at round 10's
content freeze.

## Scope: what the makeover covers

### SC1. Which art stays outside Blender? (11A P9, 11B Q10)

Some things in the world are still drawn in code, not modelled: the creatures, the resource nodes, the quest givers,
the tools, and round 10's greybox frames (the beds, the tools, the logs). The round-11 brief reads the makeover as
"every world asset made in Blender". 11A proposes moving the code-drawn classes into the rig last, after the world and
the figures. 11B's draft kept the creatures, nodes and givers in code.

- **Proposed default:** everything that stands in the world is made in Blender, and the code-drawn classes come last.
  These stay outside Blender: the UI icons (their SVG masters), the card portraits and concepts (Higgsfield), the
  screens, and the run-time particle effects (A162).

### SC2. Models from Meshy (your ROSW `asset-3d` pipeline) in the shipped art? (11A P7, 11B Q8)

Your ROSW `asset-3d` pipeline turns a prompt or an image into a 3D model through Meshy. ASSETS 6.4 leaves open whether
a generated mesh is yours to ship. 11A's draft allowed props and creatures, and 11B's props, furniture and machinery.

- **Proposed default:** yes for props, furniture and machinery, once you confirm that Meshy's output on your plan is
  yours to ship. Each one is a master in ROSW with its run id and a `CREDITS.md` row, and it is re-dressed in the
  game's own materials when it is imported. Never the figures or the creatures: they stay on the repo's own rig.
- **If you don't answer:** no Meshy model ships in round 11.

### SC3. Export every master for V2, the first-person version? (11B Q13)

V2 is to load the same models as the sprite renders. Each master would also export a GLB with materials named by role,
the rig, and two lighter versions (LODs at a half and a quarter of the triangles).

- **Proposed default:** yes (`look.md` 8).

## Camera and light

### CL1. Keep the camera and the scale exactly as they are? (11A P1)

The isometric camera, the display scale, the figures' height cap and the pivots stay. Every image key and page the
game loads stays valid, so the client does not change: the makeover is new art in today's frames.

- **Proposed default:** yes (`pipeline.md` 2).

### CL2. One light for every style? (11A P2)

The key light keeps today's direction in all three styles. The renders bake ambient occlusion (the soft darkening in
corners and under eaves) and the figures' contact shadows, each style in its own amount (`look.md` 4.4). Buildings
cast no shadow on the ground: under this light about 98% of a building's shadow falls under its own roof anyway, and
the shadow is the most expensive part of a render. Day, night and the lamps stay the game's own lighting.

- **Proposed default:** yes (`pipeline.md` 3).

### CL3. Long shadows from buildings, as a ground layer that fades at dusk? (11A P3)

- **Proposed default:** no, not in round 11. Under today's light they are mostly hidden (`pipeline.md` 4.3).

### CL4. Lamps that light the walls as you carry them? (11A P4, 11B Q14)

This needs normal maps or depth for every sprite: a second page for every page of art, which breaks the memory cap for
the figures in every style.

- **Proposed default:** no. Light stays baked into the art, with today's lighting layer on top (`pipeline.md` 4.3,
  `look.md` 5.3).

## Styles and figures

### ST1. Keep all three styles: 8-bit, low poly and HD? (11B Q1)

Each style is a finish of one shared set of models, not a separate set of art. The alternatives are to merge 8-bit
and low poly into one style, or to keep one look only.

- **Proposed default:** yes, three finishes of one master set (`look.md` 4.3).

### ST2. 8-bit figures: flat colour or textured? (11B Q5)

Textures cost no bytes, but at 64 px a cloth texture reads as speckle on a coat and darkens the skin and the hands.
The sample sheet shows both: [`samples/look/figure-styles.png`](samples/look/figure-styles.png).

- **Proposed default:** flat figures. The world stays textured.

### ST3. Low-poly figures: flat colour or textured? (11B Q6)

Textures cost nothing here either, but low poly's posterising moves a look's colours off its palette: the baker's blue
coat turns green-grey.

- **Proposed default:** flat figures. Textured garments are kept for HD.

### ST4. HD figures: how do they fit? (11B Q2)

At HD size each figure takes about 16 times today's memory. Fifteen looks would need about 1.5 GB of video memory and
264 MB of downloads, far past every budget. The ways out:

1. **HD-1:** the HD world with the low-poly figures in it.
2. **HD-2:** HD figures at half the HD size, in a compressed GPU format. This needs a test on your desktop first, so it
   would come in a later round.
3. **HD-3:** a much larger memory cap. Not proposed, because a 4 GB device has no room for it beside the browser.

- **Proposed default:** HD-1. Where an HD image is missing, the game falls back to low poly, then to 8-bit. HD-2 stays
  open for a later round.

### ST5. Render the HD figures under the sky light? (11B Q15)

A164 left open whether HD figures should be lit by the PBR sky. Measured, it barely changes them.

- **Proposed default:** no. Figures render without it, and the question closes.

### ST6. Texture sizes: 1k maps for every sprite render, with the 2k maps kept for V2? (11B Q11)

- **Proposed default:** yes, with the rock face at 2k in HD only (`look.md` 3.2).

### ST7. A colour check for low poly and HD? (11B Q12)

8-bit art is checked pixel by pixel against the palette, and low poly and HD cannot be. The new check keeps their main
colours near the palette, saturated colour under 10% of a frame, and nothing darker than the ink.

- **Proposed default:** yes (`look.md` 3.3).

## Budgets

### BU1. A memory cap for HD alone? (11B Q3)

Nothing at HD's density fits today's cap of 9 page-equivalents.

- **Proposed default:** an HD-only cap of 18 page-equivalents (288 MiB), behind the HD device gate, checked once HD art
  exists.

### BU2. The HD download budget? (11B Q4)

- **Proposed default:** keep 80 MB. With HD-1, the HD set comes to about 18 MB.

### BU3. The first load: keep the 12 MiB cap, and leave the 8 MiB target for later? (11B Q7)

- **Proposed default:** yes. The makeover adds almost nothing to the 8-bit first load.

### BU4. The test phone and the frame-rate floor? (11B Q9)

No test device is written down today.

- **Proposed default:** your own Android, at 30 fps or more in the busiest scene with ten players, in 8-bit and low
  poly, measured on every art drop. Please say which phone it is.

## Where and how the renders run

### RN1. Where do the renders run? (11A P5)

Measured in a cloud session, the 8-bit and low-poly figures take about 9 hours on one session.

- **Proposed default:** cloud sessions in parallel: four for the figures and one for each map's world. Your laptop is
  used only if one test frame there shows that it is much faster.

### RN2. HD render quality: 8 samples instead of 32? (11A P5, 11B Q16)

8 anti-aliasing samples render HD 3.6 times faster than today's 32, with no visible difference (a mean difference of
0.44 out of 255 on a figure). With HD-1 (ST4), this applies to the HD world only.

- **Proposed default:** 8, raised to 16 if the first HD sheet shows noise in the soft edges or the shadows.

### RN3. May the cloud environment install Blender for every session? (11A P6)

The environment's setup script would install Blender's `bpy` 5.2.0 and three graphics packages, adding about a minute
to each session's start. It is a setting you change on the environment's settings page; no session can change it.

- **Proposed default:** yes.

### RN4. Keep a copy of the free Kenney model packs as a release download of this repo? (11A P8)

On 2026-10-29 the link to Kenney's Fantasy Town pack returned a web page instead of the zip, so the kit pieces built
from it cannot be re-made from a fresh checkout. Either way, a hash lock records each pack.

- **Proposed:** yes, keep a copy, with the hash lock.
- **If you don't answer:** the hash lock only.

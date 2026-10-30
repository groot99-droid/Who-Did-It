# Round 11: the owner's answers

The owner answered all 22 questions of [`questions.md`](questions.md) in the form
(https://claude.ai/artifact/KTRrtfV3aRGprcyspSMM1E) and submitted it at 2026-10-30T03:37:26.649Z. **Default** means
the owner took the proposed default in `questions.md`. The one **different** answer quotes the owner's note verbatim,
and it replaces the default. These answers win over `pipeline.md` and `look.md` wherever they disagree.

Totals: 21 defaults, 1 different (CL3).

| Question | Answer | Saved (UTC) |
|---|---|---|
| SC1. Which art stays outside Blender? | default | 01:28:09 |
| SC2. Models from Meshy (your ROSW `asset-3d` pipeline) in the shipped art? | default | 01:54:03 |
| SC3. Export every master for V2, the first-person version? | default | 03:01:04 |
| CL1. Keep the camera and the scale exactly as they are? | default | 03:01:19 |
| CL2. One light for every style? | default | 03:01:26 |
| CL3. Long shadows from buildings, as a ground layer that fades at dusk? | **different** | 03:02:50 |
| CL4. Lamps that light the walls as you carry them? | default | 03:03:11 |
| ST1. Keep all three styles: 8-bit, low poly and HD? | default | 03:03:16 |
| ST2. 8-bit figures: flat colour or textured? | default | 03:35:53 |
| ST3. Low-poly figures: flat colour or textured? | default | 03:36:01 |
| ST4. HD figures: how do they fit? | default | 03:36:11 |
| ST5. Render the HD figures under the sky light? | default | 03:36:26 |
| ST6. Texture sizes: 1k maps for every sprite render, with the 2k maps kept for V2? | default | 03:36:36 |
| ST7. A colour check for low poly and HD? | default | 03:36:41 |
| BU1. A memory cap for HD alone? | default | 03:36:43 |
| BU2. The HD download budget? | default | 03:36:52 |
| BU3. The first load: keep the 12 MiB cap, and leave the 8 MiB target for later? | default | 03:36:54 |
| BU4. The test phone and the frame-rate floor? | default | 03:36:56 |
| RN1. Where do the renders run? | default | 03:37:05 |
| RN2. HD render quality: 8 samples instead of 32? | default | 03:37:08 |
| RN3. May the cloud environment install Blender for every session? | default | 03:37:21 |
| RN4. Keep a copy of the free Kenney model packs as a release download of this repo? | default | 03:37:22 |

## CL3: the long shadows come in round 11

The proposed default was "no, not in round 11". The owner, verbatim:

> yes

So the buildings' long shadows are part of round 11, as the shadow layer of `pipeline.md` 4.3: a ground sprite that
the client draws under every y-sorted sprite and fades at dusk. The default had left them out because today's key
light hides most of them (`pipeline.md` 3.2), and CL2 keeps that key. `round11-plan.md` says which light casts the long
shadows and what the layer costs.

## What three defaults still need from the owner

- **SC2.** The default allows Meshy models "once you confirm that Meshy's output on your plan is yours to ship". Until
  the owner confirms, no Meshy model ships, which is the question's own fallback.
- **BU4.** The default names "your own Android". The owner has not yet said which phone it is.
- **RN3.** The setup script is a setting that only the owner can change, on the environment's settings page. Until it
  changes, a session that renders installs `bpy` itself (README, "Sample renders").

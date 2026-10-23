# Vendor terms

Each vendor's terms are recorded here as a dated link, with a saved copy when practical, **before the
first asset from that vendor lands** (`docs/ASSETS.md` 6.5, relaxed by `docs/DECISIONS.md` A17). File name: `<vendor>-<document>-<YYYY-MM-DD>.md` (or `.pdf`), the date being
the day it was saved, plus the source URL on the first line. When terms change, add a new dated copy;
never overwrite an old one, since an asset is governed by the terms in force when it was made.

| Vendor | Documents to save | Needed before | Saved |
|---|---|---|---|
| Higgsfield | Terms of Service; the clause on output ownership and commercial use; the plan page showing the account tier is paid and watermark-free (`DECISIONS.md` open question 5) | the hero concept or any generated image, mesh or video | **no: the hero concept and turnaround are in the art-pipeline PR, so the owner saves these before it merges.** Account tier checked on 2026-10-10: Plus (paid) |
| Meshy (via Higgsfield `generate_3d`) | Terms of Service and output licence, if Higgsfield's terms do not cover models it routes to | the first generated GLB or render from one | no |
| Adobe | General Terms of Use; Generative AI User Guidelines; Firefly / generative-feature terms (non-beta features only) | the first Adobe generative edit (Photoshop defringe with Generative Fill, Firefly) | no |
| Adobe (Mixamo) | Mixamo FAQ and the Adobe terms that cover Mixamo characters and animations | the first sheet rendered from Mixamo clips | no |
| Kenney | the CC0 licence file shipped in each pack used | the first Kenney-derived render or sound | yes, 2026-10-16: `kenney-rpg-audio-license-2026-10-16.txt`, `kenney-impact-sounds-license-2026-10-16.txt` (the two packs the M3 and M3b sounds come from); 2026-10-18: `kenney-{fantasy-town-kit,nature-kit,survival-kit,furniture-kit,graveyard-kit}-license-2026-10-18.txt` (the world-art packs, Session 5K) |
| KayKit | the CC0 licence file shipped in each pack used | the first KayKit-derived render | no: not used in round 5 (its packs are behind itch.io's download page, which the session could not fetch; Session 5K models the torches, rubble and pines from code and Kenney instead, DECISIONS A62) |
| Poly Haven | the CC0 licence page | the first Poly Haven texture or HDRI in a render | yes, 2026-10-18: `polyhaven-textures-license-2026-10-18.txt` (the licence and the list of textures taken, Session 5K) |
| Freesound | the CC0 licence of each sound (one row per sound in `CREDITS.md`) | the first Freesound SFX | no |
| Quaternius | the Quaternius Asset License (QAL) | the first sprite rendered from a Quaternius model | no |
| OpenGameArt | the licence of each entry (CC0 only) | the first OpenGameArt asset | yes, 2026-10-16: `opengameart-rain-long-thunder-license-2026-10-16.md` (the `storm` loop); 2026-10-18: `opengameart-ambience-license-2026-10-18.md` (the four `amb_*` loops) |
| Google (Nano Banana Pro, Gemini app, Google AI Pro) | Terms of Service; Generative AI Prohibited Use Policy | the 13 kitchen pictures the owner made (`assets/source/concepts/onub/`, DECISIONS A79; kept as source art after the quick mode's removal, A115) | no copy saved; links checked 2026-10-18 (Session 5M), below |

Fonts (OFL) live in `LICENSES/fonts/`, owned by Session B.

## Recorded links

| Vendor | Document | Date checked | Link | What it says |
|---|---|---|---|---|
| Higgsfield | Terms of Use, section 4.4 (summarised by the help center) | 2026-10-10 | https://higgsfield.ai/creator-hub/help-center/account-and-privacy/who-owns-my-generations-and-can-i-use-them-commercially | Higgsfield claims no ownership of inputs or outputs and does not restrict commercial use on any plan; paid plans are watermark-free. A terms update is announced for late August 2026 (https://higgsfield.ai/blog/terms-of-use-privacy-policy-update). |
| Google | Terms of Service ("Effective July 30, 2026" on the page) | 2026-10-18 | https://policies.google.com/terms | "Some of our services allow you to generate original content. Google won't claim ownership over that content." Nothing on the page restricts commercial use of generated content. Among the abuses it lists: "using AI-generated content from our services to develop machine learning models or related AI technology" and "misleading others into thinking that generative AI content was created by a human". It points to service-specific additional terms such as the Prohibited Use Policy. This is the version checked on 2026-10-18; the 13 images were made before 2026-10-17, under the version then in force. |
| Google | Generative AI Prohibited Use Policy ("Last Modified: December 17, 2024") | 2026-10-18 | https://policies.google.com/terms/generative-ai/use-policy | Lists prohibited uses: dangerous or illegal activity, compromising security, sexually explicit, violent or hateful content, harassment, misinformation, impersonation and fraud. Nothing in the ONUB rooms falls under it. |

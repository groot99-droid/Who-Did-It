# Round 8: the contract documents

What the round-8 sessions (8A to 8H) build against, written by 6Z on 2026-10-23 from the owner's request of that
evening (DECISIONS A134) and Book IV of the owner's Bible (`docs/round6/owner-brief.md`). The rules and every
number stay in `docs/GDD.md` and `packages/content/data`: these documents point at them and never restate a rule
differently.

**The owner's request** (2026-10-23, verbatim): "plan then add health, stamina, and metrics for health drain from
all the different attacks and the minor effects such as slowness, bleeding, weakness, poison, fatigue, and more.
I would also like for you to link this with other metrics, such as having a lot of money raises your chances of
getting mugged when alone with hungry/scared/angry/etc NPCs. Then create animations for everything, animate
wolves attacking, characters attack since all characters should be able to deal a small amount of damage, create
animations for collectible materials breaking after collection, and everything else including UI animations like
hover, transitions, transport, activation, and more."

**The owner's art request** (2026-10-23, after the plan, verbatim): "You have my permission to token max and assign
as many chats as needed to build out Who Did it. I want the maps to have perfect object placement, go ham on the art
and design details in every room, also increase the relative size of the characters for the players so they have a
closer look at them, design the characters beautifully and robustly with animations movements and more. Ive added
some photos for more references. Also create the HD mode." Then: "start round 8 when you are ready because I am
ready, you've got plenty of usage so use fable and opus mostly, use sonnet only for multi session swarm coding.
Whatever your max number of sessions can be find a comfortable range for you to deploy." The sixteen reference
pictures are described in [art.md](art.md) 1 and are not committed.

**The owner's four answers** (A134): a seat dies only to creatures, Bleeding and Poisoned at zero health, and fists
or a mugging only knock it out; the full Book IV economy comes now, ahead of evolutions and the law; NPC seats with
moods and new ambient townsfolk both mug; other players see only physical signs, and anyone can walk up to a
seat and press act to **inspect** it, which can raise suspicion depending on the setting and the roles dealt
("an Activist inspecting a Railroad Baron").

| File | What it holds | Sessions |
|---|---|---|
| [body.md](body.md) | Health, stamina, the effects and their sources and cures, the damage table, fists for everyone, the knockout, the death rule, inspect and the relations table | 8A, 8B |
| [economy.md](economy.md) | Book IV on today's maps and roles: the Scrip purse, wages, the market, shops and the bank; the tax loop and Indebted; Faith; rumours and the black market; the HQ tiers | 8C, 8D |
| [townsfolk.md](townsfolk.md) | Moods for NPC seats, ambient townsfolk, the mugging rule that links money, moods and being alone | 8E |
| [motion.md](motion.md) | Every new animation: characters, creatures (the wolf attack), resource nodes breaking, effects and VFX, and the UI's motion (hover, transitions, transport, activation) | 8F, 8G, 8H |
| [art.md](art.md) | The owner's sixteen references; characters redesigned and drawn larger; the HD art style; every room's placement rules and detail | 8F, 8I, 8J, 8K |
| [seams.md](seams.md) | What the sessions share: the wire (schema version 6), the status bits, the animation ids, the effect ids, the bus events, the locked one-line hooks and who owns which path | all |
| [teardown.md](teardown.md) | The owner's teardown answers (A168): anti-cheat, the rules changes (match length, the Final Night, card text from the data), every icon drawn, the canon pass's timing, and the process changes | 8L, 8M, 8N, 6Z |
| [living.md](living.md) | The living world (A173, A174): the world index, mob habitats, the NPC hive and its triggers, NPC roles and abilities, meeting notes and AI talk, briarberry | 8Q, 8R, 8S, 8T, 8U |
| [stations.md](stations.md) | The station widgets (A200): the owner's ask and questionnaire answers verbatim, the audit of every station, the well as set, the reader and the lore data, the PR split S0 to S8 | 7M |

**Re-scoped roadmap** (A135): ROADMAP R8 becomes "Bodies, coin, motion and art" (this round); evolutions, the law
pipeline and Port-au-Levain move to R9; the old R9 (world events, propagation, BlackPine industry, story mode)
becomes R10. The Port-au-Levain seed of round 7 (the ten kitchen pictures, A116) moves with it to round 9.

**Elsewhere.** The rules are `docs/GDD.md` 3.22 "Bodies: health, stamina and effects" (8A, with 8B's inspect
paragraph), 3.23 "The economy" (8C, 8D) and 3.24 "Moods, mugging and townsfolk" (8E); 3.6 and 3.15 are corrected
by 8A where the old two-hit-point model is replaced. The art is `docs/SPRITES.md` (8F, 8G, 8I, 8J, 8K) and the motion is
`docs/UI.md` 9 (8H). The decisions are A134 (the owner's requests and answers), A135 (this contract), A136 to
A146 reserved for 8A to 8K and A147 for the integration (8P); a second row takes the number plus 20 (A156 to
A167). A133 and A151 stay 7M's.

**Sessions, models and context.** Eleven sessions run at once beside 7M, which is a comfortable range for one
orchestrator to merge behind. The integration session (8P) is spawned when the last of them is green.
- **Models.** The owner's rule of 2026-10-23 replaces the old one: Fable 5.1 and Opus 5.5 for the sessions, and
  Sonnet 5.5 only for swarm coding.
  - Fable 5.1: 6Z, 7M, and the hardest systems and the art leads: 8A (bodies), 8E (moods and townsfolk), 8F
    (characters), 8I (HD).
  - Opus 5.5: 8B, 8C, 8D, 8G, 8H, 8J, 8K and 8P.
  - Sonnet 5.5: the subagents a session fans out for repetitive passes (per look, per room, per clip). The owner
    opted into that fan-out ("token max").
- **Context.** Every session compacts at 400k tokens through `.claude/settings.json` and follows `CLAUDE.md`
  "Compact instructions".

| Session | Builds | Contract | Model | Branch |
|---|---|---|---|---|
| 8A | Health, stamina, effects, fists, the knockout; the ids and schema version 6 | body.md 1-6, seams.md | Fable 5.1 | `claude/r8-body` |
| 8B | Inspect and the relations table | body.md 7 | Opus 5.5 | `claude/r8-inspect` |
| 8C | Scrip: purses, wages, shops, the bank, coins | economy.md 2 | Opus 5.5 | `claude/r8-scrip` |
| 8D | Rent and quota, Indebted, Faith, rumours, HQ tiers | economy.md 3 | Opus 5.5 | `claude/r8-civic` |
| 8E | Needs and moods, ambient townsfolk, mugging | townsfolk.md | Fable 5.1 | `claude/r8-townsfolk` |
| 8F | Characters redesigned and larger; every character clip | art.md 2, motion.md 1 | Fable 5.1 | `claude/r8-characters` |
| 8G | Creatures, resource breaks, VFX, transport, sounds | motion.md 2 | Opus 5.5 | `claude/r8-creatures-vfx` |
| 8H | Interface motion | motion.md 3 | Opus 5.5 | `claude/r8-ui-motion` |
| 8I | The HD art style | art.md 3 | Fable 5.1 | `claude/r8-hd` |
| 8J | HollowMere: every room's placement and detail | art.md 4 | Opus 5.5 | `claude/r8-hollowmere-rooms` |
| 8K | BlackPine: every room's placement and detail | art.md 4 | Opus 5.5 | `claude/r8-blackpine-rooms` |
| 8P | Integration (spawned last) | seams.md 7 | Opus 5.5 | `claude/r8-integration` |

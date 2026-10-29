# Round 10: world mode, the build

## Context

Round 9 designed world mode and wrote no code (`docs/round9/README.md`). The owner approved it, answered the
questionnaire (`docs/round9/owner-answers.md`) and the follow-up form (`docs/round9/followup-4.md`), and on
2026-10-29 asked 6Z to start the round (DECISIONS A223):

> start round 10s sessions, opus, sonnet, and fable towards the end to fix all other issues. autocompact the
> sessions at 500k for all precise work, 800k on sessions that need more context, and 300k for testing, fixing,
> organizing, etc.

Round 10 builds the round-9 design. The pull requests, their files, tests and dependencies are
`docs/round9/round10-plan.md`, as amended by `followup-4.md`, which wins where they disagree. This folder adds only
what the plan leaves to the round: who builds what, on which model, at which context size, and the seams the
sessions share (`seams.md`).

## The sessions

Eleven build sessions and 6Z. The plan's sessions 10A to 10E keep their pull requests (A1 to E2); 10A and 10D are
split by model, because a session runs on one model and the plan gives them both.

| Session | Model | Compaction | Pull requests | Starts |
|---|---|---|---|---|
| **10A. The slice's contracts** | Opus | 500k | A1 refusal reasons, A12 inventory slots, A7 sleeping (server) | now |
| **10F. The logic table** | Opus | 500k | A9 schema and validator, A10 the resolver, then D1 never-idle NPC seats | now |
| **10H. The slice's rules** | Sonnet | 500k | A5 pacing, A6 weaker mobs; then A11 tools on piles, A13 inventory screen, A8 sleeping screen | now |
| **10G. The refusal sweep** | Sonnet | 300k | A2 `rooms/` codemod, A3 `sim/` codemod (two parts), A4 refusal display | when A1 merges |
| **10B. The law** | Opus | 800k | B1 to B8 | when A3, A6 and A10 merge |
| **10C. Death's cost and arrivals** | Opus | 800k | C1 to C5 and C7; C6 after B6 | when A6 merges |
| **10D. The living world** | Sonnet | 500k | D2 to D9 | when A11 and D1 merge |
| **10E. Achievements and story** | Sonnet | 500k | E1, E2 | when B6 merges |
| **10X. Fixes: server and rules** | Fable | 300k | every open issue left on the server, rules and content side | toward the end (below) |
| **10Y. Fixes: client and screens** | Fable | 300k | every open issue left on the client, copy and art side | toward the end (below) |
| **10Z. The final sweep** | Fable | 800k | S6: `DECISIONS.md`, the `gdd-map.md` check, cross-references, `PROTOCOL.md`, the integration log | last |
| **6Z. Orchestrator** | Opus | 300k | this contract, merges, spawning, the owner's questions | throughout |

**Toward the end.** 10X and 10Y start when 10B, 10C and 10D have each opened their last pull request, and they keep
going while those merge. Their work is everything the build leaves open: a review finding a session parked, a
flaky or skipped test, an `NFY` tag whose system has since shipped, a "still waits" line in `GDD.md`, a failing
`pnpm auto` invariant, the owner's playtest notes, the round-9 leftovers (the Studio NPC editor's save, verified
end to end), and the stale draft #245. 10Z starts when every other round-10 pull request has merged.

**Models.** The plan's rule holds: Opus for a pull request that sets a contract, touches role secrecy or needs
judgement across systems; Sonnet for one that follows a merged contract; Fable, by the owner's call, for the
fixes and the sweep at the end. A session may fan out Sonnet subagents for repetitive passes and keeps the design
in the lead.

## Compaction

The owner's three sizes (A223), by the kind of work:

| Size | Work | Sessions |
|---|---|---|
| 500k | precise work: contracts and rules | 10A, 10F, 10H, 10D, 10E |
| 800k | work that needs more context across systems or documents | 10B, 10C, 10Z |
| 300k | testing, fixing and organizing | 10G, 10X, 10Y, 6Z |

`autoCompactWindow` is read when a session's worker starts; editing a settings file mid-session changes nothing
until the next start (6Z tested it on 2026-10-29). A worker restarts several times in a long session and reads
whatever branch is checked out, so the size is set in two places:

- `.claude/settings.json` on `claude/zen-turing-m1jnw0` holds **500000**, the default.
- `claude/r10-tier-300k` and `claude/r10-tier-800k` are that branch plus one commit that sets the window. 6Z
  spawns a 300k or 800k session from its tier branch, so its first worker starts at its size.
- **A tiered session's first action is to put its window in `.claude/settings.local.json`**: it creates the file
  as `{"autoCompactWindow": 800000}` (or 300000), or adds the key and keeps any keys already there. The file is
  git-ignored and overrides `.claude/settings.json`, so the size survives a restart on a pull request branch.
  Without it, 10G (spawned at 300k) read 500k after a restart on an A3 branch. After a container restart, the
  session checks the file and writes it again if it is gone.
- **A session never opens a pull request from its spawn branch.** Every pull request branch starts from
  `origin/claude/zen-turing-m1jnw0`, so no tier commit reaches the base.
- Compaction triggers at the window less 33k: 467k at 500k (10G's `autocompact_state` on 2026-10-29 reads
  `effective_window` 480000, `threshold` 467000), so about 267k at 300k and 767k at 800k.

The compaction summary keeps what `CLAUDE.md` "Compact instructions" lists. A session that resumes re-reads its
brief and `seams.md` before its next edit.

## How a session works

- **The spawn prompt** is "You are session 10X of docs/SESSIONS.md Round 10 (model, compaction size). Read your
  brief there, then docs/round10/README.md, docs/round10/seams.md, docs/round9/round10-plan.md and
  docs/round9/followup-4.md, and the design sections your pull requests name." 6Z adds the session's spawn
  branch and its first pull request.
- **One pull request per plan step**, a draft against `claude/zen-turing-m1jnw0`, under 400 lines, on a branch
  `claude/r10-<step>-<slug>` (for example `claude/r10-a1-refusals`). `pnpm lint && pnpm typecheck && pnpm test`
  clean before every push.
- **The session drives its pull request to green**: it subscribes to it, fixes its CI, answers review, merges the
  base when it falls behind, and writes "Complete" at the top of the description when it is ready. Then it sends
  6Z one line through `send_message` to `@parent`: "10X: #NNN (step) complete".
- **6Z merges**, in the order of `seams.md` 7, and messages each session whose gate opened. A session never starts
  a step before the steps it depends on have merged; it may read and plan meanwhile.
- **`GDD.md` changes in the same pull request** as the behaviour, in the section the plan names (the default of
  plan 7, question 1, which A224 settles). 10Z only sweeps.
- **Questions to the owner** go to 6Z in the pull request description or a message; 6Z asks the owner. A session
  in doubt takes the design document's proposed default, says so in its description and carries on.

## The playtest gate

After A13 merges, 6Z tells the owner the build is ready for the next playtest (plan 3). The owner's notes go to the
balance lab and to 10X and 10Y. 10B, 10C and 10D build on, and none of them tunes a number the playtest is
measuring.

## Status (2026-10-29)

- The contract: this folder, the Round 10 section of `docs/SESSIONS.md`, A223 and A224, the GDD stubs 3.27 to
  3.33, and the compaction default.
- 10A, 10F and 10H start now. The rest start at their gates.

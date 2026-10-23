# Round-7 seams

What one round-7 session learnt the hard way about a hook or a call site that another session may touch next.
Each row names the file, what happens, and what to do instead; `docs/round6/seams.md` keeps the pre-seeded hooks
of round 6, which still stand. Paths are from the repo root with `apps/server/src/` shortened to `server/`.

## 1. Module evaluation order

| Seam | What happens | Do instead |
|---|---|---|
| A module that `server/rooms/handlers/lobby.ts` imports **before** `server/sim/Npc.ts` may not itself import `server/sim/Npc.ts` (7M, PR 1) | `lobby.ts` is in an import cycle with `sim/Npc.ts` through `npc/seats.ts` and `npc/meeting.ts`. An import of `sim/Npc` from an earlier module moves the evaluation of `npc/meeting` forward: `lastShot.test.ts`, which `vi.mock`s `npc/meeting` with `importOriginal`, fails two tests, and `pnpm auto` hangs with NPC matches that never end and no CPU. Nothing in the suite names the cause. | Read what you need from the module below `Npc.ts`: `npcMemory(room).ids.has(id)` from `server/sim/npc/memory.ts` is `isNpcSeat`. Or import after the `sim/Npc` line of `lobby.ts`. When `lastShot.test.ts` fails on a change that touched no night power, suspect this first. |

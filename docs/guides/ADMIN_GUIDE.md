# Admin guide: auto-mode

The owner-only page runs a match in which every seat is an NPC, watched from a god view at up to ten
times speed, with the match invariants checked as it runs. It exists to find bugs. The contract is
[`docs/round6/auto-admin.md`](../round6/auto-admin.md); the design is [`docs/GDD.md`](../GDD.md) 3.19.

## Turning it on

The admin room and its login routes exist only when the server has the GitHub login configured.
`README.md` lists the six `WDI_ADMIN_*` variables: the flag, the GitHub OAuth app's client id and
secret, the allowlist of GitHub logins, a signing secret and the client URL. Without them a `party` room
never accepts an admin message and the `#/admin` route refuses.

1. Create a GitHub OAuth app whose callback URL is `https://<server host>/auth/github/callback`.
2. Set the variables on the server (Railway: Variables tab) and redeploy.
3. Open `https://<server host>/auth/github/login`. GitHub asks you to authorize; the server checks your
   login against the allowlist and sends you back to the client at `#/admin` with a token.

The token lives in the browser session only and expires on its own.

## The page

- **Setup**: map, mode, seat count, NPC difficulty, the quick mode's deck, and optionally the seed
  words. **Start** needs no leader and no human.
- **Clock**: 1x, 2x, 5x, 10x, pause and single step. Every timer in the game counts ticks, so phase
  lengths, cooldowns and countdowns keep their meaning at any speed. When the server cannot keep up it
  runs fewer ticks and reports the speed it reached; no tick is skipped.
- **Viewports**: one per occupied scene, up to six on a grid; extra scenes queue in the inspector.
  "Follow seat" collapses to one viewport.
- **Seat inspector**: role, cover, inventory, notebook and the brain's goal for the selected seat.
- **Log**: match events, with invariant failures in red.
- **Reset**: back to the lobby with the same seats, ids and options, paused.

## Replaying a failure

An auto match fixes the seed words of every random stream and the seat ids before Start, so the same
words replay the same match tick for tick. Paste the words from a failure line into Setup to watch it
again.

## The headless runner

```
pnpm auto -- --matches 20 --seed 7 --map blackpine --mode main --difficulty hard --json
```

One line per match (winner, ticks, rounds, invariant failures); a failure prints the seed words and
seat ids; exit code 1 on any failure. The weekly soak workflow runs it too.

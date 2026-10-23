# Quick-mode night-glass re-skin (session 7G, round 7), archived

The quick mode (One Night Ultimate Baguette) is being removed from the game; this keeps the re-skin work for a future, totally new quick mode.

- `onub.css`: the quick-mode screens' styles (kitchen rooms, station, hand cards, piles, night/wake/dawn panels, slots, claim form), scoped under `.wdi-table`.
- `table.css`: the shared `.wdi-table` glass system that `onub.css` builds on (corner polygon, rim, sheen, buttons, chips).
- `quick-mode-reskin-7G.patch`: the full commit 86f1076 (CSS, the view/rush imports, the `kitchen.spec`/`night.spec` e2e tweaks, UI.md and SESSIONS.md lines). Apply with `git apply`.

Lessons worth keeping (software-GL paint cost): no `clip-path` on many small layers or on panels over a photo, no blur over a full-screen photo; lay veils with a `::before` and `isolation: isolate`; keep pixel faces at 12px or more; the wake panel must keep its confirm button above the fold at 1280x720.

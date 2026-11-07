# 10A's plans for K1 and T4, with 6Z's answers

10A wrote these plans on 2026-10-30, before the stop, and sent them to 6Z in its handoff; nothing here is built. They
were read on the base at 23cf829d against:
- `scope.md` 0, 2.5, 2.6, 3 and 4;
- `seams.md` 3, rows 25 to 34, and 6;
- `docs/round9/logic-table.md` 8.3;
- `living-world.md` 5.2.

The secrecy rule is `seams.md` 6 and A276: nothing a seat does marks it human. Numbers live in `logic-table.md` 8.3
(proposed) until K1 moves them into `packages/content/data` and `GDD.md`.

## K1. Weapons (I24), after C6

**Data.** Each weapon gets a `weapon` block with `kills: false`, with the damage, effect, attack time and noise of
`logic-table.md` 8.3: the Club, the Hatchet or Axe, and the Pickaxe. Fists stay `balance.body.damage.strike`.
Against creatures a blow deals `dmg` × `creatureMult`, and a tool used as a weapon wears faster, as 8.3 says.

**Equipping.** `equip: 'weapon'` goes on the Club, the Axe and the Pickaxe. The weapon slot is private (A12, row 1).
`count()` reads every area, so an axe in the weapon slot still works the woodpile.

**The strike** (`handleStrike` in `sim/body/fists.ts`, as C6 leaves it). If the weapon slot holds an item with a
`weapon` block, the blow uses that block's damage, effects, cooldown and noise, then wears the item (faster for a
tool).
- Armour applies through `hurt` (D6a).
- At zero health the target is knocked out (and robbed, C6), never killed (A6). Only the Knife and a bite kill.
- D8's Strength adds as it does today.
- The slingshot is unchanged.

**6Z's answer 1.** The weapon in the slot stays private: no new field and no `seams.md` row. Its public signs are the
strike clip, the weapon's noise and the blow's effects.
- NPC seats equip a weapon they hold (from their kit, or bought by D2b's rule) by their routine, on their own stream.
- They swing it by their choices stream (`npcPlay:<seat>`) at the same chance they swing fists (`npc/world.ts`,
  `hive/bands.ts`, `townsfolk/mug.ts`), so neither the noise nor the clip marks a human.
- The pull request says which cards' NPC seats hold which weapon at the deal.
- A weapon no NPC seat can ever hold, and that makes its own noise, either names the step that gives NPC seats one or
  takes the fists' noise.

**Tests.**
- Each weapon's damage, effects and cooldown.
- A tool wears faster as a weapon.
- The armour cap holds.
- A blow at zero health knocks out and never kills.
- An NPC seat swings a weapon it holds.
- The weapon slot never appears on another client's view.
- `pnpm auto -- --matches 50`.

## T4. Town work, windows, stations and silhouettes (I37, I38, I39; row 30), after C4c and C4d

**One rule**, in `economy/townWork.ts`. A look's state is one of:
- at work;
- thin (owing the line);
- gone;
- dormant (the Hitman);
- in hardship (C4c).

The last four show one sign (6Z's C4c ruling). The rule reads `Player.look`, `Player.alive`, the fare and the
hardship, never the sim's death, `Avatar.lookOf` or the card. A look's work never changes at a private kill: a gone
look stops at the meeting's reveal, never at the kill.

**6Z's answer 2, on row 30.** `missing` is the theft's (T5, 10B) and `sigil` is the Zealot's chalk (I7, 10S). The
Hitman's props get a state of their own, `arrived`, appended to the list.
- T4 adds `lit`, `dark`, `warm`, `cold` and `arrived`.
- Whichever of T4, T5 and the Following lands first adds the states it uses.
- Row 30 carries this since the stop.

**T4a: windows, stations and the Hitman's props.**
- Each home interior's window is a prop with a public `PropState`. From dusk it is `lit` while its look is at work,
  and `dark` otherwise.
- Each look's work station is `warm` or `cold` by the same rule.
- The mailbag on the platform and the crow on the station roof (I39) take `arrived` in the tick of row 20's line, and
  never otherwise. The client draws them only in that state.
- The pull request says how NPC seats' windows and stations follow the same rule.
- Tests:
  - the dormant Hitman, a seat owing the line and a hardship show the same dark window and cold station;
  - nothing moves at a kill before the meeting;
  - the props stay hidden when he doesn't come.

**T4b: the I37 rules for the looks still `none`** (the `nfy` rows of `roles.json`). Each rule reads the look's state:
- the Lamplighter's look, at work, lights the square's lantern posts at dusk by itself;
- the Doctor's keeps a surgery counter selling Bandages;
- the Fisher's adds fish to the market's stock each day;
- the Tinner's adds tin ore to the forge's stock;
- the Gamekeeper's keeps the wolf habitats' leash short;
- the Watchman's keeps the curfew doors locked at night;
- the Detective's shortens a briefing's delay;
- the Medium's has none.

`GDD.md` 3.23, "What breaks when I'm gone", changes with it.

**T4c: silhouettes.** A scene-scoped `Silhouette {windowId, x, y}`, carrying no handle, look or height. From dusk, a
lit window shows the outline of each figure standing inside within `windows.silhouetteTiles` (a new key). Only seats
outside, in sight of the window, are sent it.

**6Z's answer 3.** The split into T4a, T4b and T4c is approved, all three on row 30.

## Code read at 23cf829d

- `sim/body/fists.ts`: `handleStrike`, `hurtCreature`, `handleSlingshot`. C6 changes this file.
- `sim/Inventory.ts`: the gear areas are head, body and weapon (A12).
- `sim/interact/resolve.ts`: `toolHeld` uses `count()` across every area, and `wear()` is there.
- `sim/body/armour.ts` and `damage.ts`: D6a's armour.
- `economy/townWork.ts`:
  - `workOf` returns work, thin or gone, from `Player.look`, `Player.alive` and `owesFare`;
  - it also holds `stockLeft` and `propsAtRest`.
- `items.json`: the Quilted coat and the jerkin carry `armor` blocks; no item has a `weapon` block yet.

## Branches

Each step is one draft pull request under 400 lines, cut from `origin/claude/zen-turing-m1jnw0`, with its GDD change
in the same pull request:
- K1 on `claude/r10-k1-weapons`;
- T4a on `claude/r10-t4a-windows`;
- T4b on `claude/r10-t4b-work`;
- T4c on `claude/r10-t4c-silhouettes`.

10A's rows are A225 plus 20 per row (`seams.md` 5). Its copy goes under `UI.md` 14.43, in `####` subsections.

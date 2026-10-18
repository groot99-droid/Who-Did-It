# Deck data: the main deck, the new roles, Impersonate and the look catalogue (round 5, 5F and 5G)

Exact rows for `packages/content/data/` and the zod changes in `packages/content/src/schemas/`. Every
existing id is kept. GDD text for every number here is `docs/GDD.md` (3.1 to 3.3, 3.8, 3.9, 3.17); nothing
below adds a number the GDD does not state. Ownership: `roles.json`, `abilities.json`, `items.json`, `balance.json` rows and
`decks` are 5G's; `looks.json` and `balance.impersonate` are 5F's; 5L draws what `looks.json` lists.
Everything here landed in the round-5 pre-seed, since content is locked during the round, and the
pre-seed is additive (X1): it removes nothing and makes nothing required that the code at 265bda9 reads.
`rosters`, `standIn`, `RosterRow`, `rosterFor` and the roster block of `validate.ts` stay until 5G's
contract phase (`deck-wire.md` 10.2), and the new role fields are optional in zod until then.

**As landed (2026-10-17).** `roles.json`, `abilities.json`, `items.json`, `balance.json` and `clues.json` changed and
`looks.json` is new; the schemas `common.ts`, `roles.ts`, `abilities.ts` and `balance.ts` changed and `looks.ts` is
new; `validate.ts` and `index.ts` (`looks`, `deckFor`, `lookOf`) follow sections 7 and 8. `rosters` and `standIn`
stay beside `decks`. The new test `packages/content/test/looks.test.ts` covers the looks, the decks, the roles and
the rejections. Two existing tests changed because the data did: the Killer card test now expects `impersonate` (it
checks the Lock door's 6+ gate on a temporary role row), and the content cycle check in `content.test.ts` is now
170 s, the cycle of GDD 3.9.

Contents: 1 roles.json, 2 abilities.json, 3 items.json, 4 balance.json, 5 clues.json and ClueKind,
6 looks.json (new), 7 validate.ts, 8 content index, 9 art keys for 5L.

---

## 1. roles.json

### 1.1 Schema (`schemas/common.ts`, `schemas/roles.ts`)

```ts
// schemas/common.ts (new export)
/** A look id from looks.json (GDD 3.17): the atlas body id of `char/<lookId>/<anim>/<dir>`, so lowercase letters and digits only. */
export const LookId = z.string().regex(/^[a-z][a-z0-9]*$/, 'look ids are lowercase letters and digits');

// schemas/roles.ts
export const Role = z.strictObject({
  id: Id,
  name: z.string().min(1),
  faction: Faction,
  /**
   * Wears the look of another card of the deck instead of its own (GDD 3.17): Killer, Accomplice, Drifter.
   * Optional in the pre-seed (every row carries it); 5G makes it required in its contract phase.
   */
  cover: z.boolean().optional(),
  /**
   * The character on this card (looks.json). Null for a row no deck deals: the Townsfolk class row and
   * unshipped roles. Optional in the pre-seed (every row carries it); 5G makes it required in its contract phase.
   */
  look: LookId.nullable().optional(),
  /** A profession names the class row it plays as; every rules field equals that row's (validate.ts). Always optional. */
  plays: Id.optional(),
  ships: Ships,
  firstPlayable: z.boolean(),
  goal: z.string().min(1),
  winsWith: z.enum(['village', 'cabal', 'self']),
  win: z.string().min(1),
  parity: z.enum(['village', 'cabal', 'nobody']),
  startKit: z.array(KitEntry),
  abilities: z.array(Id).max(3),
  cardText: z.string().min(1),
  beware: z.string().min(1),
  bellPulls: z.number().int().nonnegative(),
  gddRef: GddRef,
});

/** One deck row (GDD 3.1, 3.9). Sits beside `RosterRow` until 5G's contract phase removes it. */
export const DeckRow = z.strictObject({
  /** Practice party: lobby warning, no ranking (GDD 3.1). */
  practice: z.boolean(),
  /**
   * Card role ids in display order (cover cards, village specials, professions), player count + 2.
   * Every Killer card is always dealt; two of the other cards stay undealt.
   */
  cards: z.array(Id).min(6).max(12),
  gddRef: GddRef,
});
export type DeckRow = z.infer<typeof DeckRow>;

export const RolesFile = z.strictObject({
  gddRef: GddRef,
  factions: z.strictObject({ village: FactionInfo, cabal: FactionInfo, neutral: FactionInfo }),
  roles: z.record(Id, Role),
  /** Kept by the pre-seed; 5G removes it in its contract phase (the professions replace the stand-in). */
  standIn: Id,
  /** Kept by the pre-seed; 5G removes it in its contract phase. */
  rosters: byPlayerCount(RosterRow),
  /** Keyed "4".."10": `decks[String(n)].cards`. Replaces `rosters` and `standIn` once 5G's contract phase lands. */
  decks: byPlayerCount(DeckRow),
});
```

`RosterRow`, `rosters` and `standIn` stay in the pre-seed, so today's roster deal and its tests keep
passing. In its contract phase (`deck-wire.md` 10.2) 5G removes them, makes `cover` and `look` required, and
the shared `Roster` / `assignRoles` pair gives way to `dealDeck` (`deck-wire.md` section 2.1).

### 1.2 Changed rows

Insert `"cover"` and `"look"` right after `"faction"` in every existing row:

| Row | `cover` | `look` | Other changes |
|---|---|---|---|
| `killer` | `true` | `"killer"` | `abilities`, `cardText`, `beware` below |
| `accomplice` | `true` | `"accomplice"` | `beware` below |
| `detective` | `false` | `"detective"` | none |
| `doctor` | `false` | `"doctor"` | none |
| `butler` | `false` | `null` | none (out of the decks until M4) |
| `child` | `false` | `null` | none (out of the decks until M4) |
| `townsfolk` | `false` | `null` | none; it is the class row the professions play as and no deck lists it |
| `drifter` | `true` | `"drifter"` | `win`, `beware` below |
| `ranger` | `false` | `null` | none (V1.5) |
| `thief` | `false` | `null` | none (V1.5; its cover flag is decided when it ships) |
| `medium` | `false` | `null` | none (V2) |

```json
"killer": {
  "abilities": ["kill", "impersonate", "dragBody"],
  "cardText": "Walk in a borrowed character. Strike after dark when the room is empty, clean one clue, wash at the well, then be the loudest voice asking who did it.",
  "beware": "Clues match your own traits whatever face you wear; your height never changes; Blood shows within 3 tiles; a guarded target voids your kill."
},
"accomplice": {
  "beware": "Inspect marks plants Forged; a Forged entry tells the village an Accomplice exists; your cover is a claim someone may test."
},
"drifter": {
  "win": "Get ejected (solo win; the match continues and the end screen lists you among the winners).",
  "beware": "A calm village; dying to the Killer is a loss; counts as nobody for parity; you wear a cover like the Cabal, but alone."
}
```

### 1.3 New rows (the four night roles)

```json
"vicar": {
  "id": "vicar",
  "name": "Vicar",
  "faction": "village",
  "cover": false,
  "look": "vicar",
  "ships": "V1",
  "firstPlayable": false,
  "goal": "Learn one soul's faction each night and steer the vote.",
  "winsWith": "village",
  "win": "Village.",
  "parity": "village",
  "startKit": [{ "item": "candle", "qty": 2 }, { "item": "pocketWatch", "qty": 1 }],
  "abilities": ["confession"],
  "cardText": "Everyone in Hollowmere confesses to you sooner or later. Each night, learn where one soul stands, then choose how much to say.",
  "beware": "Everyone can see you are the Vicar, the Cabal first among them; if your card was not dealt, a Cabal player may wear your face and lie in your name.",
  "bellPulls": 1,
  "gddRef": "3.2"
},
"watchman": {
  "id": "watchman",
  "name": "Watchman",
  "faction": "village",
  "cover": false,
  "look": "watchman",
  "ships": "V1",
  "firstPlayable": false,
  "goal": "Stand guard over one neighbour each night.",
  "winsWith": "village",
  "win": "Village.",
  "parity": "village",
  "startKit": [{ "item": "lantern", "qty": 1 }, { "item": "pocketWatch", "qty": 1 }],
  "abilities": ["keepWatch"],
  "cardText": "You walk the lanes after dark. Each night, choose one door to stand by; if a blade comes for that soul tonight, it fails.",
  "beware": "You cannot watch yourself or the same soul two nights running; poison and the Gamekeeper's shot go past you.",
  "bellPulls": 1,
  "gddRef": "3.2"
},
"herbalist": {
  "id": "herbalist",
  "name": "Herbalist",
  "faction": "village",
  "cover": false,
  "look": "herbalist",
  "ships": "V1",
  "firstPlayable": false,
  "goal": "Save one life and end one, once each, and be right both times.",
  "winsWith": "village",
  "win": "Village.",
  "parity": "village",
  "startKit": [
    { "item": "remedy", "qty": 1 },
    { "item": "nightshade", "qty": 1 },
    { "item": "candle", "qty": 1 }
  ],
  "abilities": ["remedy", "poison"],
  "cardText": "One bottle saves, one bottle ends. Pour the first where the knife will fall and the second only where you are certain.",
  "beware": "Nightshade kills a villager as readily as a killer, and a Remedy cannot stop it.",
  "bellPulls": 1,
  "gddRef": "3.2"
},
"gamekeeper": {
  "id": "gamekeeper",
  "name": "Gamekeeper",
  "faction": "village",
  "cover": false,
  "look": "gamekeeper",
  "ships": "V1",
  "firstPlayable": false,
  "goal": "If you fall, take the right one with you.",
  "winsWith": "village",
  "win": "Village.",
  "parity": "village",
  "startKit": [{ "item": "fowlingPiece", "qty": 1 }, { "item": "lantern", "qty": 1 }],
  "abilities": ["lastShot"],
  "cardText": "Vane paid you to keep the wood. If they come for you, you will not go alone; make sure the one you take is the one who came.",
  "beware": "You never see the blow that fells you, and the face that walked up may have been borrowed; a wasted shot kills a friend.",
  "bellPulls": 1,
  "gddRef": "3.2"
}
```

### 1.4 New rows (the professions)

Every rules field copies `townsfolk` (the validator checks it); only `id`, `name`, `look`, `cardText`
and `plays` differ.

```json
"lamplighter": {
  "id": "lamplighter",
  "name": "Lamplighter",
  "faction": "village",
  "cover": false,
  "look": "lamplighter",
  "plays": "townsfolk",
  "ships": "V1",
  "firstPlayable": true,
  "goal": "Do your chores in pairs and vote with evidence.",
  "winsWith": "village",
  "win": "Village.",
  "parity": "village",
  "startKit": [
    { "item": "lantern", "qty": 1 },
    { "item": "pocketWatch", "qty": 1 },
    { "item": "chalk", "qty": 1 },
    { "item": "rope", "qty": 1 }
  ],
  "abilities": ["tasks", "chalk", "rope"],
  "cardText": "You light the lanterns that keep the wolves off the square. Work beside others, mark what you see, vote with evidence.",
  "beware": "Weak alone; strong in pairs.",
  "bellPulls": 2,
  "gddRef": "3.2"
},
"baker": {
  "id": "baker",
  "name": "Baker",
  "faction": "village",
  "cover": false,
  "look": "baker",
  "plays": "townsfolk",
  "ships": "V1",
  "firstPlayable": true,
  "goal": "Do your chores in pairs and vote with evidence.",
  "winsWith": "village",
  "win": "Village.",
  "parity": "village",
  "startKit": [
    { "item": "lantern", "qty": 1 },
    { "item": "pocketWatch", "qty": 1 },
    { "item": "chalk", "qty": 1 },
    { "item": "rope", "qty": 1 }
  ],
  "abilities": ["tasks", "chalk", "rope"],
  "cardText": "Up before anyone, flour to the elbows. Do your chores in company, mark what you see, vote with evidence.",
  "beware": "Weak alone; strong in pairs.",
  "bellPulls": 2,
  "gddRef": "3.2"
},
"fisher": {
  "id": "fisher",
  "name": "Fisher",
  "faction": "village",
  "cover": false,
  "look": "fisher",
  "plays": "townsfolk",
  "ships": "V1",
  "firstPlayable": true,
  "goal": "Do your chores in pairs and vote with evidence.",
  "winsWith": "village",
  "win": "Village.",
  "parity": "village",
  "startKit": [
    { "item": "lantern", "qty": 1 },
    { "item": "pocketWatch", "qty": 1 },
    { "item": "chalk", "qty": 1 },
    { "item": "rope", "qty": 1 }
  ],
  "abilities": ["tasks", "chalk", "rope"],
  "cardText": "The fog keeps the boats in. Mend the nets beside a neighbour, mark what you see, vote with evidence.",
  "beware": "Weak alone; strong in pairs.",
  "bellPulls": 2,
  "gddRef": "3.2"
},
"tinner": {
  "id": "tinner",
  "name": "Tinner",
  "faction": "village",
  "cover": false,
  "look": "tinner",
  "plays": "townsfolk",
  "ships": "V1",
  "firstPlayable": true,
  "goal": "Do your chores in pairs and vote with evidence.",
  "winsWith": "village",
  "win": "Village.",
  "parity": "village",
  "startKit": [
    { "item": "lantern", "qty": 1 },
    { "item": "pocketWatch", "qty": 1 },
    { "item": "chalk", "qty": 1 },
    { "item": "rope", "qty": 1 }
  ],
  "abilities": ["tasks", "chalk", "rope"],
  "cardText": "The mine is shut; your hands are not. Work in pairs, mark what you see, vote with evidence.",
  "beware": "Weak alone; strong in pairs.",
  "bellPulls": 2,
  "gddRef": "3.2"
}
```

### 1.5 `decks` (beside `rosters` and `standIn` until 5G's contract phase)

```json
"decks": {
  "4": {
    "practice": true,
    "cards": ["killer", "detective", "vicar", "lamplighter", "baker", "fisher"],
    "gddRef": "3.9"
  },
  "5": {
    "practice": false,
    "cards": ["killer", "drifter", "detective", "vicar", "doctor", "lamplighter", "baker"],
    "gddRef": "3.9"
  },
  "6": {
    "practice": false,
    "cards": ["killer", "drifter", "detective", "vicar", "doctor", "watchman", "lamplighter", "baker"],
    "gddRef": "3.9"
  },
  "7": {
    "practice": false,
    "cards": [
      "killer", "accomplice", "detective", "vicar", "doctor", "watchman",
      "lamplighter", "baker", "fisher"
    ],
    "gddRef": "3.9"
  },
  "8": {
    "practice": false,
    "cards": [
      "killer", "accomplice", "detective", "vicar", "doctor", "watchman", "herbalist",
      "lamplighter", "baker", "fisher"
    ],
    "gddRef": "3.9"
  },
  "9": {
    "practice": false,
    "cards": [
      "killer", "accomplice", "detective", "vicar", "doctor", "watchman", "herbalist", "gamekeeper",
      "lamplighter", "baker", "fisher"
    ],
    "gddRef": "3.9"
  },
  "10": {
    "practice": false,
    "cards": [
      "killer", "killer", "detective", "vicar", "doctor", "watchman", "herbalist", "gamekeeper",
      "lamplighter", "baker", "fisher", "tinner"
    ],
    "gddRef": "3.9"
  }
}
```

(Prettier will lay the arrays out one id per line; the content is what matters.)

---

## 2. abilities.json

### 2.1 Schema (`schemas/abilities.ts`)

```ts
/** Phase names an ability can be limited to (GDD 3.3). */
export const AbilityPhase = z.enum(['grace', 'day', 'dusk', 'night', 'finalNight']);
export type AbilityPhase = z.infer<typeof AbilityPhase>;

export const Ability = z.strictObject({
  // ...every existing field unchanged, except `target`:
  /** `seat`: a seat picked from the roster list, never a figure in the world (GDD 3.2 night powers, 3.17). */
  target: z.enum(['none', 'self', 'player', 'seat', 'body', 'clue', 'door', 'spot', 'ground', 'water']),
  /** Works only in these phases; absent means every verb phase (`isVerbPhase`), except `lastShot`, which only the aim gates (`deck-wire.md` 5). */
  phases: z.array(AbilityPhase).min(1).optional(),
  /** A night power (GDD 3.2): at most `balance.nightPowers.perNight` uses per night; its result goes to the Notebook. */
  nightPower: z.boolean().optional(),
  /** A `seat` target may be the actor. */
  allowSelf: z.boolean().optional(),
});
```

`target: 'player'` keeps its meaning: a figure in the world within `rangeTiles`, named on the wire by
its avatar handle (`deck-wire.md` 3). `target: 'seat'` names a seat id and never has `rangeTiles`.

### 2.2 Changed rows

```json
"kill": { "phases": ["dusk", "night", "finalNight"] },
"bell": { "phases": ["grace", "day"] },
"inherit": { "effect": "When the last Killer dies or is ejected the Knife passes to you with a longer kill cooldown; your Hunger clock starts in the round you inherit." },
"killerLock": { "ships": "V1.5" },
"autopsy": { "effect": "Posts time of death (within the error) and cause (knife / wolf / poison / shot) as Verified." }
```

`killerLock` leaves the Killer's card (max 3 abilities) and stays in the file for V1.5. The Bell rings
only in grace and day (GDD 3.3). `inherit` keeps `params.killCooldownBonusS` (10); only its `effect`
changes (GDD 3.2, 3.3: the inheritor counts as having struck in that round).

### 2.3 New rows

```json
"impersonate": {
  "id": "impersonate",
  "name": "Impersonate",
  "scope": "role",
  "kind": "active",
  "target": "seat",
  "castS": 0,
  "phases": ["dusk", "night", "finalNight"],
  "effect": "Your character shows a living seat's name, look, scarf and hat glyph at your own height for balance.json impersonate.durationS. The face changes only unseen: at once if no other living seat is in your scene, otherwise at your next door; cancelled at no cost if it has not changed within impersonate.applyWindowS or when it is used again or day breaks first. A Knife strike drops it in place with a puff; a meeting or your death ends it; using it again, the time running out or daybreak drop it the next time you are alone in your scene or pass a door. The cooldown runs from the drop. Not self.",
  "ships": "V1",
  "gddRef": "3.17"
},
"confession": {
  "id": "confession",
  "name": "Hear Confession",
  "scope": "role",
  "kind": "active",
  "target": "seat",
  "castS": 0,
  "phases": ["dusk", "night", "finalNight"],
  "nightPower": true,
  "effect": "Your Notebook gets the seat's faction (Village, Cabal or Neutral) as Verified. Not self.",
  "ships": "V1",
  "gddRef": "3.2"
},
"keepWatch": {
  "id": "keepWatch",
  "name": "Keep Watch",
  "scope": "role",
  "kind": "active",
  "target": "seat",
  "castS": 0,
  "phases": ["dusk", "night", "finalNight"],
  "nightPower": true,
  "effect": "The seat survives the first Knife strike before the night ends; the strike fails as on a Bandaged target and your Notebook records it. Not self, and not the seat you watched the night before (balance.json nightPowers.watchRepeatAllowed).",
  "ships": "V1",
  "gddRef": "3.2"
},
"remedy": {
  "id": "remedy",
  "name": "Remedy",
  "scope": "role",
  "kind": "active",
  "target": "seat",
  "castS": 0,
  "consumes": "remedy",
  "phases": ["dusk", "night", "finalNight"],
  "nightPower": true,
  "allowSelf": true,
  "effect": "The seat survives the first Knife strike before the next meeting opens; your Notebook records it when it holds. It does not stop Nightshade or a shot.",
  "ships": "V1",
  "gddRef": "3.2"
},
"poison": {
  "id": "poison",
  "name": "Nightshade",
  "scope": "role",
  "kind": "active",
  "target": "seat",
  "castS": 0,
  "consumes": "nightshade",
  "phases": ["dusk", "night", "finalNight"],
  "nightPower": true,
  "effect": "The seat dies when the night ends, a meeting opens or the Final Night hunt ends, wherever it stands; its body lies there with no trait clue. Not self.",
  "ships": "V1",
  "gddRef": "3.2"
},
"lastShot": {
  "id": "lastShot",
  "name": "Last Shot",
  "scope": "role",
  "kind": "passive",
  "target": "seat",
  "requires": "fowlingPiece",
  "noise": "shot",
  "params": { "aimS": 10 },
  "effect": "When you are killed, poisoned or ejected you may pick one living seat within the aim time, before you learn any role; it dies too. Accepted only while you aim. Not self.",
  "ships": "V1",
  "gddRef": "3.2"
}
```

---

## 3. items.json (new rows)

```json
"remedy": {
  "id": "remedy",
  "name": "Remedy",
  "kind": "medical",
  "roleBound": true,
  "onDeath": "kept",
  "use": "remedy",
  "tooltip": "One seat survives the next knife before the next meeting.",
  "ships": "V1",
  "gddRef": "3.5"
},
"nightshade": {
  "id": "nightshade",
  "name": "Nightshade",
  "kind": "charge",
  "roleBound": true,
  "onDeath": "kept",
  "use": "poison",
  "tooltip": "One seat dies when the night ends.",
  "ships": "V1",
  "gddRef": "3.5"
},
"fowlingPiece": {
  "id": "fowlingPiece",
  "name": "Fowling Piece",
  "kind": "weapon",
  "roleBound": true,
  "onDeath": "kept",
  "use": "lastShot",
  "tooltip": "Your last shot, when you fall.",
  "ships": "V1",
  "gddRef": "3.5"
}
```

All three are role-bound (they never drop), so a dead Herbalist's bottles never reach another hand.

---

## 4. balance.json

### 4.1 Changed and new values

```json
"phases": { "roleRevealS": 20, "dayS": 60, "nightS": 100 },

"impersonate": { "applyWindowS": 10, "durationS": 15, "cooldownS": 45, "gddRef": "3.17" },

"nightPowers": { "perNight": 1, "watchRepeatAllowed": false, "gddRef": "3.2" },

"hunger": { "cyclesWithoutKill": 2, "trailEveryS": 1, "gddRef": "3.8" },

"finalNight": {
  "afterCycle": 4,
  "huntS": 90,
  "killCooldownS": 20,
  "skipAllowed": false,
  "tieEjectsNobody": true,
  "reportEndsHunt": true,
  "gddRef": "3.8"
},

"noise": { "shot": 10 }
```

Four existing values change: `phases.roleRevealS` 12 to 20 s (the cover pick needs the time), and the
M5a values of GDD 3.3, revisited in M5b once tasks and quests give the day work: `phases.dayS` 110 to
60 s, `phases.nightS` 80 to 100 s and `finalNight.afterCycle` 5 to 4 (the soak gate of GDD 3.9 checks
them). `impersonate` and `nightPowers` are new sections; `hunger` gains `trailEveryS`; `finalNight` gains `reportEndsHunt`;
`noise` gains `shot` (the Last Shot, as loud as a bolt). `byCount` is unchanged: the 10-seat row still
deals two Killers, with the same 40 s cooldown and 15 s global lock. The Gamekeeper's 10 s aim lives in
its ability record (`lastShot.params.aimS`) and the glowing footprints' 30 s in their clue record, so no
number lives in two files.

### 4.2 Schema (`schemas/balance.ts`)

```ts
export const NOISE_KEYS = [
  'walk', 'run', 'door', 'killScream', 'rag', 'skeletonKey', 'crowbar', 'bolt', 'lockpick',
  'hide', 'burst', 'oneWayDrop', 'goat', 'wispRattle',
  'shot',
] as const;

// in BalanceFile:
  /**
   * Impersonate (GDD 3.17): how long a requested face may wait to change unseen before it is cancelled,
   * how long a borrowed face lasts, and the cooldown from its drop.
   */
  impersonate: Section({ applyWindowS: Seconds, durationS: Seconds, cooldownS: Seconds }),
  /** Night powers (GDD 3.2): uses of each per night; whether the Watchman may watch one seat two nights running. */
  nightPowers: Section({ perNight: z.number().int().positive(), watchRepeatAllowed: z.boolean() }),
  hunger: Section({
    cyclesWithoutKill: z.number().int().positive(),
    /** A Hungry Killer who moves leaves one glowing footprint per this many seconds (GDD 3.3). */
    trailEveryS: z.number().positive(),
  }),
  finalNight: Section({
    afterCycle: z.number().int().positive(),
    huntS: Seconds,
    killCooldownS: Seconds,
    skipAllowed: z.boolean(),
    tieEjectsNobody: z.boolean(),
    /** A body report ends the Final Night hunt at once (GDD 3.3; the Bell is silent after dark). */
    reportEndsHunt: z.boolean(),
  }),
```

The `byCount` doc comment changes from "come from roles.json rosters" to "come from roles.json decks" in
5G's contract phase.

---

## 5. clues.json and `ClueKind`

```json
"hungerPrints": {
  "decay": { "kind": "seconds", "seconds": 30 },
  "description": "A Hungry Killer leaves a glowing footprint showing their own height on the tiles they cross, until they strike."
}
```

Only `decay` (was `never`) and `description` change. In `packages/shared/src/constants.ts`,
`ClueKind` gains `hungerPrints: 9` (append only; the indices are frozen). A `hungerPrints` clue's
`value` is the Killer's height index and `dir` their facing; `collectible` stays false.

---

## 6. looks.json (new file, `packages/content/data/looks.json`)

### 6.1 Schema (`schemas/looks.ts`, new)

```ts
import { z } from 'zod';
import { GddRef, Id, LookId, PaletteToken, Ships } from './common.js';

/** Clips every world character renders, in 8 directions (SPRITES 3; `swing` is AnimId 2, `interact` AnimId 4). */
export const LookClip = z.enum(['idle', 'walk', 'swing', 'interact', 'die']);
/** Overlay passes on every world character: the scarf (tinted at runtime) and Blood (shown while Bloody). */
export const LookPass = z.enum(['scarf', 'blood']);

export const Look = z.strictObject({
  id: LookId,
  /** Display name on the card, the roster and the reveal. */
  name: z.string().min(1),
  /** The roles.json row whose card this is; that row's `look` is this id. */
  role: Id,
  /** A Townsfolk profession card. */
  profession: z.boolean(),
  /** Manifest key of the 384x576 WebP card portrait (ASSETS 6.3). */
  portrait: z.string().regex(/^portrait_[a-z][a-z0-9]*$/),
  /** Texture key of the world character, `char/<id>/<clip>/<dir>`; null for a cover card, which is never drawn in the world. */
  bodyAtlas: z.string().regex(/^char_[a-z][a-z0-9]*$/).nullable(),
  /** Texture key of the overlay passes, `<pass>/<id>/<clip>/<dir>`; null exactly when `bodyAtlas` is. */
  overlayAtlas: z.string().regex(/^ovl_[a-z][a-z0-9]*$/).nullable(),
  /** The shape that must read at shipping size, in one line. */
  silhouette: z.string().min(1),
  /** Palette tokens for the artist (ASSETS 6.1): the two body tones and the one small accent. */
  palette: z.strictObject({ base: PaletteToken, second: PaletteToken, accent: PaletteToken }),
  /** Costume, carried prop and the `interact` pose. */
  notes: z.string().min(1),
  ships: Ships,
  gddRef: GddRef,
});
export type Look = z.infer<typeof Look>;

export const LooksFile = z.strictObject({
  gddRef: GddRef,
  clips: z.array(LookClip).min(1),
  passes: z.array(LookPass),
  looks: z.record(LookId, Look),
});
export type LooksFile = z.infer<typeof LooksFile>;
```

### 6.2 Data

Palette rule for world characters (checked by the validator): base and second from ink, slate, fog
and bone; the accent from mustard, lantern or bone, at most a tenth of the frame. Never blood (the
Blood overlay), teal or moon (two of the scarf tints) or magenta (the hazard token) on a world
character, so the scarf stays the one saturated colour on a walking figure. Cover portraits may use
blood. Looks differ first by silhouette (headgear, coat length, the carried prop), then by the
light/dark split, then by where the accent sits. No character wears a flat cap or a bowler, which are
hat-trait names.

```json
{
  "gddRef": "3.17",
  "clips": ["idle", "walk", "swing", "interact", "die"],
  "passes": ["scarf", "blood"],
  "looks": {
    "detective": {
      "id": "detective",
      "name": "the Detective",
      "role": "detective",
      "profession": false,
      "portrait": "portrait_detective",
      "bodyAtlas": "char_detective",
      "overlayAtlas": "ovl_detective",
      "silhouette": "Belted trench coat with the collar up and a snap-brim fedora, a lens raised in one hand.",
      "palette": { "base": "fog", "second": "ink", "accent": "lantern" },
      "notes": "The outsider from the mainland, cleaner and sharper than the villagers: a fog trench coat belted tight, ink fedora and gloves, the magnifier's lens the accent (a lantern glint). Interact: crouches with the lens to the ground.",
      "ships": "V1",
      "gddRef": "3.17"
    },
    "doctor": {
      "id": "doctor",
      "name": "the Doctor",
      "role": "doctor",
      "profession": false,
      "portrait": "portrait_doctor",
      "bodyAtlas": "char_doctor",
      "overlayAtlas": "ovl_doctor",
      "silhouette": "Short top hat and a long frock coat, a squat bag carried low: narrow on top, heavy at one hand.",
      "palette": { "base": "ink", "second": "bone", "accent": "mustard" },
      "notes": "Ink frock coat over a bone waistcoat and shirt, round spectacles, a short ink top hat, the black medical bag with a mustard clasp, a watch chain. Interact: kneels and opens the bag.",
      "ships": "V1",
      "gddRef": "3.17"
    },
    "vicar": {
      "id": "vicar",
      "name": "the Vicar",
      "role": "vicar",
      "profession": false,
      "portrait": "portrait_vicar",
      "bodyAtlas": "char_vicar",
      "overlayAtlas": "ovl_vicar",
      "silhouette": "Wide shovel-brimmed hat over an ankle-length cassock: a dark bell shape with a pale collar.",
      "palette": { "base": "ink", "second": "bone", "accent": "mustard" },
      "notes": "Black cassock to the boots, white collar band and cuffs, a small prayer book at the chest (bone pages, mustard clasp). The brim must read from all 8 directions; keep the cassock one dark mass so the scarf stands out. Interact: reads from the book, head bowed.",
      "ships": "V1",
      "gddRef": "3.17"
    },
    "watchman": {
      "id": "watchman",
      "name": "the Watchman",
      "role": "watchman",
      "profession": false,
      "portrait": "portrait_watchman",
      "bodyAtlas": "char_watchman",
      "overlayAtlas": "ovl_watchman",
      "silhouette": "Tall domed helmet and a shoulder-caped greatcoat, a pole lantern held up beside him: the one look with a light above the head.",
      "palette": { "base": "slate", "second": "fog", "accent": "lantern" },
      "notes": "Knee-length slate greatcoat with a short fog shoulder cape, a high stiff collar under the scarf, a domed watchman's helmet, a wooden rattle on the belt. The pole lantern's glass is the accent and glows in every frame; the whole figure stays inside the 1.75-tile silhouette. Interact: lifts the lantern and peers.",
      "ships": "V1",
      "gddRef": "3.17"
    },
    "herbalist": {
      "id": "herbalist",
      "name": "the Herbalist",
      "role": "herbalist",
      "profession": false,
      "portrait": "portrait_herbalist",
      "bodyAtlas": "char_herbalist",
      "overlayAtlas": "ovl_herbalist",
      "silhouette": "Deep hood up and a wide pocketed apron hung with bundles: a hunched, layered shape.",
      "palette": { "base": "fog", "second": "bone", "accent": "mustard" },
      "notes": "A hooded fog shawl over a bone apron with many pockets, dried herb bundles and a satchel at the hip (dried fog and bone tones, never teal), two small vial stoppers in mustard. The hood is the headgear. Interact: grinds in a mortar held at the waist.",
      "ships": "V1",
      "gddRef": "3.17"
    },
    "gamekeeper": {
      "id": "gamekeeper",
      "name": "the Gamekeeper",
      "role": "gamekeeper",
      "profession": false,
      "portrait": "portrait_gamekeeper",
      "bodyAtlas": "char_gamekeeper",
      "overlayAtlas": "ovl_gamekeeper",
      "silhouette": "A long gun slung barrel-up over one shoulder and a deerstalker: the one diagonal line above a shoulder.",
      "palette": { "base": "slate", "second": "fog", "accent": "mustard" },
      "notes": "Slate tweed shooting coat with a fog check, breeches and gaiters, a deerstalker with the flaps tied up, a game bag across the body, the fowling piece slung barrel-up (ink barrel, mustard brass). Interact: kneels and checks a snare.",
      "ships": "V1",
      "gddRef": "3.17"
    },
    "lamplighter": {
      "id": "lamplighter",
      "name": "the Lamplighter",
      "role": "lamplighter",
      "profession": true,
      "portrait": "portrait_lamplighter",
      "bodyAtlas": "char_lamplighter",
      "overlayAtlas": "ovl_lamplighter",
      "silhouette": "Bare head and a short hooded oilskin cape, a long lighting pole at a slant over the shoulder with a flame at its tip.",
      "palette": { "base": "slate", "second": "bone", "accent": "lantern" },
      "notes": "Short slate oilskin cape with the hood down, bone shirt with the sleeves rolled, a brass-hooked lighting pole carried at a slant inside the 1.75-tile silhouette, its small flame the accent. Interact: raises the pole to an unseen lamp.",
      "ships": "V1",
      "gddRef": "3.17"
    },
    "baker": {
      "id": "baker",
      "name": "the Baker",
      "role": "baker",
      "profession": true,
      "portrait": "portrait_baker",
      "bodyAtlas": "char_baker",
      "overlayAtlas": "ovl_baker",
      "silhouette": "Tall pleated toque and a long white apron: the one pale figure.",
      "palette": { "base": "bone", "second": "fog", "accent": "mustard" },
      "notes": "Bone toque and apron over a fog shirt and trousers, sleeves rolled, flour on the forearms, a long wooden peel or a basket of loaves (mustard crust). The pale base is deliberate, so the Baker reads at night; keep the scarf a clear band against the apron. Interact: kneads on a board held at the waist.",
      "ships": "V1",
      "gddRef": "3.17"
    },
    "fisher": {
      "id": "fisher",
      "name": "the Fisher",
      "role": "fisher",
      "profession": true,
      "portrait": "portrait_fisher",
      "bodyAtlas": "char_fisher",
      "overlayAtlas": "ovl_fisher",
      "silhouette": "Sou'wester sloping down at the back, a knee-length smock and tall boots, a coil of net over one shoulder.",
      "palette": { "base": "fog", "second": "ink", "accent": "mustard" },
      "notes": "Fog oilskin smock, ink sea boots to the knee, the sou'wester in mustard (the accent; keep it small), a coil of net and a cork float over the shoulder. Interact: mends a net held in both hands.",
      "ships": "V1",
      "gddRef": "3.17"
    },
    "tinner": {
      "id": "tinner",
      "name": "the Tinner",
      "role": "tinner",
      "profession": true,
      "portrait": "portrait_tinner",
      "bodyAtlas": "char_tinner",
      "overlayAtlas": "ovl_tinner",
      "silhouette": "A hard round hat with a lit candle pressed to the front, a leather jerkin and a short pick on the shoulder.",
      "palette": { "base": "slate", "second": "fog", "accent": "lantern" },
      "notes": "Hard felt tinner's hat with a candle stuck in a clay lump at the front (its flame the accent), slate leather jerkin, fog shirt, rolled trousers with ore dust at the knees, a short pick over the shoulder. Fits Hollowmere's shut tin mine and Blackpine's working one. Interact: swings the pick low at the ground.",
      "ships": "V1",
      "gddRef": "3.17"
    },
    "killer": {
      "id": "killer",
      "name": "the Killer",
      "role": "killer",
      "profession": false,
      "portrait": "portrait_killer",
      "bodyAtlas": null,
      "overlayAtlas": null,
      "silhouette": "Portrait only: a long coat and a brim that keeps the face in shadow, a knife held low behind the back.",
      "palette": { "base": "ink", "second": "slate", "accent": "blood" },
      "notes": "Never made, rendered or packed as a world character. The face stays unreadable (no eyes, a lantern rim light on the jaw); the blade's edge is the only blood. Nothing in it may echo a world look, so no portrait hints at a cover.",
      "ships": "V1",
      "gddRef": "3.17"
    },
    "accomplice": {
      "id": "accomplice",
      "name": "the Accomplice",
      "role": "accomplice",
      "profession": false,
      "portrait": "portrait_accomplice",
      "bodyAtlas": null,
      "overlayAtlas": null,
      "silhouette": "Portrait only: half turned away, a crowbar under the arm and a spool of red thread in the hand.",
      "palette": { "base": "slate", "second": "fog", "accent": "blood" },
      "notes": "Never a world character. A forger's shape: ink-stained cuffs, a footprint stencil tucked in the coat, the thread spool in blood, the face half lit.",
      "ships": "V1",
      "gddRef": "3.17"
    },
    "drifter": {
      "id": "drifter",
      "name": "the Drifter",
      "role": "drifter",
      "profession": false,
      "portrait": "portrait_drifter",
      "bodyAtlas": null,
      "overlayAtlas": null,
      "silhouette": "Portrait only: a patched travelling coat, a bindle and a grin, a wooden knife in the belt.",
      "palette": { "base": "fog", "second": "slate", "accent": "mustard" },
      "notes": "Never a world character. Neutral amber: mustard patches and bindle cloth, the replica knife plainly wooden. Looks like trouble on purpose.",
      "ships": "V1",
      "gddRef": "3.17"
    }
  }
}
```

The catalogue holds 13 looks: 10 world characters (6 specials, 4 professions) and 3 portrait-only
cover cards. The Butler and the Child get their looks when they return to the decks (M4).

---

## 7. validate.ts (rules to add or change)

Roles and decks (beside the roster block, which 5G removes in its contract phase):

- `cover` is true only for a `cabal` or `neutral` role (until 5G's contract phase an absent `cover`
  reads as false and an absent `look` as null).
- A non-null `look` exists in looks.json and that look's `role` is this role; no two roles share a look.
- `plays`: the named row exists, has no `plays` of its own and has `look: null`; the profession's
  `faction`, `winsWith`, `win`, `parity`, `goal`, `startKit`, `abilities`, `beware` and `bellPulls`
  equal that row's; no deck lists the class row.
- Every deck row: `cards.length === n + 2`; every card is a role with `ships: 'V1'` and a non-null
  `look`; at least one card has the `kill` ability and at most `n` do; at most 2 cards are `cover`;
  only a card with `kill` may appear twice; no two non-cover cards share a look; `practice` is true
  exactly at 4.
- The "ability on no role card" rule applies to `scope: 'role'` abilities with `ships: 'V1'` only.

Abilities:

- `nightPower` implies `target: 'seat'` and `phases` within `dusk`, `night`, `finalNight`.
- `target: 'seat'` never carries `rangeTiles`; `allowSelf` only with `target: 'seat'`.
- `phases`, when present, has no duplicates.

Looks:

- Key equals `id`; `portrait === 'portrait_' + id`.
- `bodyAtlas` and `overlayAtlas` are null exactly when the look's role is `cover`, else
  `'char_' + id` and `'ovl_' + id`.
- `profession === (roles[role].plays !== undefined)`.
- A world character's `base` and `second` are in {ink, slate, fog, bone} and its `accent` in
  {mustard, lantern, bone}.
- Every card of every deck has a look; every look's role is in some deck (no orphan art).

---

## 8. Content index (`packages/content/src/index.ts`)

- Import `../data/looks.json`, parse with `LooksFile`, add `looks` to `Content`, `parseContent` and the
  exported destructuring; `export * from './schemas/looks.js'`.
- Add `deckFor(n): DeckRow` (`roles.decks[countKey(n)]`) beside `rosterFor(n)`, which 5G removes in its
  contract phase.
- Add `lookOf(roleId): Look | null` (`roles.roles[roleId].look` resolved in `looks.looks`).
- `@wdi/content/server` needs nothing new: the deck, the looks and the role rows are public content
  (the deck list is public by design, 3.1).

---

## 9. Art keys for 5L (from this catalogue)

| Key | What | Size |
|---|---|---|
| `portrait_<lookId>` x 13 | Card portrait, every look in 6.2 | 384 x 576 WebP (ASSETS 6.3) |
| `char_<lookId>` x 10 | World character, `char/<lookId>/<clip>/<dir>`, clips `idle` 8 f, `walk` 8 f, `swing` 6 f, `interact` 8 f, `die` 8 f, 8 directions | At most one 1024 x 1024 page per look |
| `ovl_<lookId>` x 10 | `scarf/<lookId>/...` (grey, tinted at runtime) and `blood/<lookId>/...` (torso and hands) on the same frames | At most one 1024 x 512 page per look |
| `anims_<lookId>` x 10 | The animation file of each world look's clips (`gen-anims.ts`) | JSON |
| `vfx_disguise` | The Impersonate puff where a Knife strike drops a disguise, 8 f, palette `fog` and `ink` smoke with one `mustard` spark | In the `vfx` page |
| `icon_ability_impersonate`, `icon_ability_confession`, `icon_ability_keepwatch`, `icon_ability_remedy`, `icon_ability_poison`, `icon_ability_lastshot` | Card and HUD ability icons (SPRITES 9 rules; `icon_ability_<abilityId>` in lowercase) | 48 px SVG |

**Budget.** Frames are packed at half resolution (64 px cells, `die` 128 px) and drawn at scale 2,
`nearest` while `style.json` `pixelFinish.enabled.main` is true and `linear` when it is false (SPRITES
10.3). This lets the 10 world characters of the largest deck fit in at most 3.75 page-equivalents of
2048² (about 3 expected), beside a map's environment of at most 1.8 (SPRITES 10.14; the 6-page resident
limit of ASSETS 6.8). Every client loads the whole deck's
characters and portraits before the role card closes (3.17). The `villager` body of `traits.json`
stays, without hat passes (hats are nameplate glyphs), for characters that are not seats (round 6 quest
givers and mobs); in round 5 every seat has a look, so `char_villager` and `ovl_villager` load only with
`?art=placeholder`.

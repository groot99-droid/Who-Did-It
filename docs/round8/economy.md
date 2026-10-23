# The economy: Book IV on today's maps and roles (8C, 8D)

The owner chose "Full economy now" (A134), so Book IV (`docs/round6/owner-brief.md`) is brought forward from
the old R8 into this round. Book IV leans on cards and evolutions that do not exist yet: the Company Clerk,
Postmaster, Bartender and Undertaker, and the Fence or Embezzler evolutions. This round builds the loops on what
exists, and leaves every Book IV seam those cards need. The rules land in GDD 3.23 (new). The numbers live in
`economy.json` (new) and `balance.json` `economy`.

## 1. The four pillars, as built this round

| Pillar (Book IV) | This round | Where it lives |
|---|---|---|
| **Scrip** (money) | A purse per seat, wages, a market, shops, the bank, mugging and dropped coins (8C) | `Private.purse`; the bank and the town till in room memory and `GameState.economy` (counters only) |
| **Faith** | Donations at the chapel altar buy Indulgences and Parish Seals (8D) | `Private.faith` |
| **Rumour** | Ledger slips in the Train's mailbag become Blackmail Notices, which a seat can fence, use to deflect at a meeting, or cleanse at the chapel (8D) | `Private.notes` items; the server's rumour ledger |
| **Status / HQ** | Three tiers per role station, bought with Scrip and materials, each with a small passive perk (8D) | `GameState.hq` per station (public: a building visibly upgrades) |

Port-au-Levain's copper and yeast tokens wait for its map (R9). BlackPine's Syndicate Token Scrip is the same purse
under its own name. BlackPine's quota tax is built (8D).

## 2. Scrip (8C)

- **The purse.** `Private.purse` (schema version 6) is private like the inventory: only the seat sees the number.
  Others learn only the purse band, by inspect (body.md 7).
- **The starting stake** comes per card from `economy.json`, dealt at Start from a stream of its own (`purse`).
  Townsfolk start poor, and the wealthy figures of the Bible start richer where a card stands for one. The stake
  must never let a card be inferred from the band at Start, so two bands at most, and every band is shared by
  village and cabal cards.
- **Wages**:
  - each finished task pays (7M's deal, `taskDone` on the bus, seams.md);
  - each quest turn-in pays (`quests.json` gains a `scrip` reward);
  - selling gathered materials (timber, stone, resin, herb, mushroom, tin ore) at the market pays its price.
- **Shops.** Stalls and counters are scene statics with `shop` rows in `economy.json`: the bakery (Wake Loaf,
  flour), the apothecary (bandage, salts, remedy), the general store (rope, lantern oil, candle, planks) and the
  Gamekeeper's lodge (snare, torch). Buying is an `act.hold` on the counter with the shop panel (8H). Prices are
  numbers in `economy.json`.
- **The bank** (HollowMere's manor hall / strongbox room; BlackPine's intake office):
  - deposits are safe from mugging and knockouts;
  - the heist (7H's strongbox, GDD 3.20) now carries the bank's takings. A successful heist empties a share of
    every deposit into the strongbox's loot. 8C adds that as a consequence on the heist's existing bus event, not a
    new path.
- **Coins on the ground.** A knockout drops a share of the purse (body.md 5). A mugging takes a share (8E). Coins
  lie as a `coins` node anyone can collect (8G draws the burst).
- **Spending to survive.** Food (the Wake Loaf) is how stamina and Famished are managed (body.md 6), so money
  matters to every card from the first day.

## 3. Taxes, Indebted, Faith, rumours, HQ (8D)

- **The rent loop** (HollowMere, Book IV):
  - every midday the **Company Clerk**, an ambient townsfolk figure of 8E rather than a card, walks a route and
    collects `economy.rent` from each living seat that meets it, or a seat pays at the bank;
  - a seat unpaid by dusk becomes **Indebted**, a private status that inspect shows as "a hunted look", 6Z's call;
  - an Indebted seat at curfew has its house door locked for the night: its home portal refuses it, and it sleeps
    rough;
  - paying clears it.

  Forced labour at the mill waits for R9's law pipeline.
- **The quota loop** (BlackPine, Book IV): each shift change, a seat must have hauled `economy.quota` timber or coal
  to the tally rack, or pay a Scrip fine. Unpaid, it is Indebted as above.
- **Faith.** Donating Scrip at the chapel altar earns Faith. Faith plus Scrip buys:
  - an **Indulgence**, which clears one rumour naming you;
  - a **Parish Seal**, which you can present once at a meeting to make the accusation against you a heresy
    debate. In this round that means a meeting text plus a short vote shield of `economy.sealShieldS`, 8D's to
    tune. The full trial waits for R9's Tribunal.
- **Rumours.**
  - The Train's morning mailbag (7I, GDD 3.3) carries **ledger slips**: true, server-made one-liners from the bus
    ("a figure in the Doctor's look was in the cellar at dusk"). They name a look, never a card.
  - Whoever collects the mailbag at the station (`act.hold`) receives them as **Blackmail Notice** items.
  - A notice can be fenced at the black market for Scrip (8D picks the stall: the tavern back room).
  - It can be shown at a meeting, where it becomes public as a meeting line.
  - It can be burnt. Cleansing a notice that names you needs an Indulgence.
  - A notice that goes a whole day cycle unshown and uncleansed is read out at the next meeting ("the Gazette
    prints...").
  - Role secrecy holds: every line is what an observer could have seen.
- **HQ tiers.** Book IV's three tiers for each role station that exists today: the Baker's Crumb's Ovens, the
  Vicar's chapel, the Doctor's surgery or apothecary, the Gamekeeper's lodge, the Detective's office, the
  Lamplighter's store. 8D proposes the list and the perks before building.
  - A tier costs Scrip plus materials (`recipes.json` station sets, as the round-6 seam planned).
  - A tier gives a small passive perk, for example Tier 3 Crumb's Ovens: Book IV's "+20% stamina regen" for the
    Baker.
  - A tier visibly upgrades the building (8G draws the tier props).
  - A tier is public, since it is a building. The right to buy it follows the **public look**, not the card, the
    same rule as the martyr's due (A131): whoever walks in the Baker's look can invest in the bakery, whether
    they were dealt the Baker or wear it as a cover. Otherwise a cover-wearer who could not invest would give
    itself away.

## 4. What stays for R9

Evolutions (the Fence after a bakery tip, the Embezzler after a vault robbery), the Company Clerk as a card, the
Postmaster's steaming, forced labour and debtor's prison, the Tribunal and its fines, and Port-au-Levain's tariff.
8C and 8D leave a named seam for each (a bus event, an `economy.json` field) and list them in A138 / A139.

## 5. Tests the sessions owe

- **8C**:
  - the purse is private;
  - the stake is deterministic per seed and card-blind across bands;
  - wages, buying and selling, the bank, dropped coins and the heist's take;
  - an invariant `scripConserved`: Scrip only enters by wages, sales and the stake, and only leaves by purchases,
    rent and fines; theft and drops move it.
- **8D**:
  - rent, quota, Indebted and the locked door;
  - Faith and the Indulgence and Seal;
  - the mailbag slips are true and look-only;
  - fencing, showing and the Gazette read-out;
  - HQ tiers;
  - auto 50 clean.

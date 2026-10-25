# Round 9: the owner's brief (2026-10-24)

The owner wrote this after the first playtest of the round-8 build. It is kept here verbatim. DECISIONS A222 records it, and `docs/round9/` will hold the round-9 design notes built on it. Until those land in `GDD.md`, the GDD's rules stand.

## The owner's words, verbatim

> I need to clear up some things, all the roles have to be dealt because how the game is supposed to be structured in the new gameplay is that the killing is more of a variable than the actual game play. A lot of the current game mechanics fall under a quick round. I’m trying to build a world with all the roles in the lore, as I said the lore bibles are supposed to replace the old style of playing, the killers have vendettas that how they win, townsfolk have different conditions to win under. Also a new rule when 1 player is playing that’s story mode all fixed actions just playing through and triggering the action, on multiplayer the role of killer must always be given to a player since they have vendettas and actions that must be achieved for victory, you must also assign the player who is required for example: Zealot(human) must always have a Vicar(human), this makes the gameplay a minimum of 3 players for the zealot, activist, bandit, and even more for the Hitman. The game should also technically be able to function with the killer (even though it never will) characters should have more immersive day to day action the days should be longer, kills from hostile mobs need to do less damage, scrip/faith/minigames/lore/discovery/mob bosses/tasks/chores and more should become more interesting and integrated with the game. Players should have step by step achievements that branch out in different ways. I mentioned armor, weapons variety and more. The games overall needs more life, more NPCs that actually walk, chat, and give tasks. Another thing is that when I play right now stuff just says can’t do that yet, if it’s a problem on the my side mark it with NFY, if it takes an unlock creatively say why it fails “failed to pick lock, looks like you might need a lock pick” and more. One of them problems my friend brought up was “you’ve got so much going on in every room but not much actually going on” he’s right, chests are just a distraction and they aren’t intelligent dispersing with random location generation instead they’re everywhere as decorations, wood piles, rocks, and more liter the game without any purpose but decoration. So many easy to find items are trapped behind tool walls when really an axe should be able to cut up the random lumber piles in the town square, pick axe for the boulders, etc. the game needs a logic table to capture all of this and make the game make sense at a logic based level. Players should be able to work with features to create their own way of playing like the rouge who refused to buy bread and gathers food instead and makes his own lock picks to avoid paying taxes, this is something only a person could easily come up with but the game logic needs to think about all of those possibilities. Also voting has got to go, we need screens with those same pauses for the different aspects of the game, that full screen is going to take up a lot more game play we just need to plan it.

## The brief broken into workstreams (6Z's reading, for the owner to correct)

1. **World mode replaces the quick-round structure.** The lore bibles define the game. Killing is one variable among many, not the whole loop. Every role in the lore is dealt, and each role wins on its own conditions: killers by their vendettas, townsfolk by their own conditions.
2. **Dealing rules.**
   - With 1 player it is story mode: fixed actions that the player plays through and triggers.
   - In multiplayer, a human always holds the killer role.
   - A role that needs a partner always gets a human partner. For example, the Zealot needs a human Vicar. So the Zealot, the Activist and the Bandit need at least 3 players, and the Hitman needs more.
   - Every other role is dealt to NPC seats.
3. **Pacing and survival.** Days are longer, and hostile mobs do less damage.
4. **Integrated systems.** Scrip, Faith, mini-games, lore, discovery, mob bosses, tasks and chores feed each other instead of standing apart.
5. **Achievements** that unlock step by step and branch out in different directions.
6. **Gear.** Armour, and more variety of weapons and other gear.
7. **A living world.** More NPCs that walk, chat and hand out tasks.
8. **Failure messages.**
   - "Can't do that yet" goes away.
   - An unbuilt feature says "NFY" (not finished yet).
   - A locked action says in the world's voice why it failed and what would unlock it, for example "Failed to pick the lock. Looks like you might need a lock pick."
9. **A logic table.** Every placed thing (chests, wood piles, rocks, lumber, boulders and so on) has a purpose and a tool or action that works on it: an axe cuts lumber, a pickaxe breaks boulders. Chests are placed by rules, not scattered as decoration. A table drives what each tool can do to each object.
10. **Emergent play.** The rules support players finding their own way to play, like the rogue who gathers food instead of buying bread and makes his own lock picks to avoid taxes.
11. **Voting is removed.** It is replaced by full-screen phases that keep the same pauses, one for each aspect of the game. The screens need planning first.

## Follow-up answers (2026-10-24, verbatim where quoted)

- **Stopping the Killer** (asked: evidence and arrest, role goals, or a trial by evidence): "All 3 can stop the killer and give the person who stopped them one of their types of victories".
- **Order of work:** "Design only". Round 9 is a design round, and nothing is built until the owner approves the design.
- **Disguises:** "The killers get to chose which NPC role to fill, they get disguised as that character, they have to perform life as a villager, unless your the bandit they wear their own skin because they are fundamentally different. Killers should also have their own looks when they look at their screen vs when everyone else sees them."
- **More rules:** "in the new mode I want the 8bit/lowpoly/HD gone inside the game, it breaks it when used, menu only. The train brings in people who died in the day back the next morning by train, days should now last 8 minutes and nights last 5 keep the game play as it was before but prolong everything, I don’t want people to die from bleeding and things like that quite"
- **Unanswered:** whether "The game should also technically be able to function with the killer (even though it never will)" means a match must work with no Killer, or that the engine must allow an NPC Killer. This goes into the round-9 questionnaire.

The approved round-9 plan and its deliverables (`world-mode.md`, `phases.md`, `logic-table.md`, `failures.md`, `living-world.md`, `emergent-play.md`, `gdd-map.md`) are in `docs/round9/README.md`.

## Second follow-up (2026-10-25, verbatim)

> I’d also like to add sleeping in your bed, when all active players do this the game skips night. Also add that NPC with roles are almost never idle they act like they are doing tasks that a the view can interpret as a real player, they also do every action a real player can which is what allows them to trade with you, if a NPC sells an object it’s because it collected it, but also the game should never have to wait on NPCs to vote or take up time in a cut scene only real players

On 9C's living-world proposals (the owner's replies follow each one):

> Weaker creatures: a wolf bite drops from 25 damage to 12, a boar's from 18 to 9, a bat's from 6 to 3 and a rat's from 5 to 2.
> Good but health should be 100%, how does that change things

> Armour: three tiers that cut damage taken to 80%, 65% and 50%.
> This is good but amor should be a little more complicated (poison resistance, blood clotting for bless, etc)

> Who can kill: only the Killer's strike and a creature's bite kill a player; other weapons can't.
> No players can be killed by other players but then they spend the day in the county jail (a single roomed cell map that can hold multiple people at once with mini games in jail that can give you debuffs or buffs like hitting the gym (strength up), dropping the soap (health maximum decrease for the rest of the game, a little HIV joke)

> Achievements: stored on the device for now.
> When players make an account achievements stay with them. The achievements should mimic the complexity of skill trees and trophies.

> Lock picking: a picked lock leaves a scratch clue that doesn't point to any role, plus a small chance of a fine.

> Rent: you can pay it in scrip or labour, goods are taken from you if you can’t pay, if no goods house gets boarded up.

> The rogue: a play style any role can follow, not a role of its own.

### 6Z's reading (for the round-10 plan, owner to correct)

1. **Sleeping skips the night.** A bed is a hold. When every active human player is asleep in a bed, the night ends and the morning train arrives. Asleep means vulnerable. NPCs never hold the night open.
2. **Role NPCs are never idle.** They run task-like routines that a watching player cannot tell from a human's. An NPC can do every action a player can, including trade. An NPC sells only what it has itself gathered or bought (no stock from nowhere). Nothing ever waits on an NPC: no NPC vote or cutscene time holds a phase. Only human players' actions gate the clock.
3. **Health at 100%.** Max health is already 100 (`balance.json` `body.maxHp`), so health reads as a percentage. With the halved bites:
   - **Wolf:** bites every 1 s for a 6 s chase (`mobs.json`, `balance.json` `mobs.chaseS`). That was 6 × 25 = 150, dead in about 4 s. It becomes 6 × 12 = 72, so a full chase leaves you at about 28%. Healing starts only 8 s after the last hit (`regenAfterS`), so a second chase without a light or shelter would still kill.
   - **Boar:** about 4 bites a chase, 36% (it was 72%).
   - **Bat:** about 3 bites, 9%, and it can only drain you to half (A173).
   - **Rat:** about 3 bites, 6%.

   In short, one creature encounter becomes something you survive and run from, not instant death.
4. **Armour has properties, not just a damage cut.** Each piece has a damage factor plus resistances. Examples: poison resistance (a shorter or weaker Poisoned), clotting (Bleeding stops sooner; the owner wrote "bless", read here as bleed), cold or night resistance, and stamina weight.
5. **Player kills and the county jail.** The owner's sentence reads two ways, so it goes to the questionnaire:
   - **(a)** Players can kill each other, and the one who kills spends the rest of that day in the county jail.
   - **(b)** Players can't kill each other; a would-be killing blow sends the victim to jail instead.

   6Z proposes (a) as the default, because jail then works as the punishment for murder.

   Either way, the county jail is a single-room cell scene (new ids under a new prefix) that holds several people at once. It has jail mini-games that grant buffs or debuffs, for example working out in the yard for strength, or a lasting max-health loss.

   **6Z flags one line:** the "dropping the soap … HIV joke" is a prison-rape and HIV joke that would land badly with a lot of players. The design offers the same mechanic (a lasting max-health loss) through a different scene, such as a yard fight or a bad meal. The owner decides.

   This rule replaces 9A's "only the Killer's strike and a creature's bite kill", so the round-10 plan re-derives how the Killer's vendettas interact with jail.
6. **Achievements need accounts.** They are stored on the device until accounts exist; with an account they follow the player. They form skill trees plus trophies. Accounts are a new system: today GDD 3.21 keeps profiles on the device and the server keeps nothing.
7. **Lock picking** keeps the role-neutral scratch clue (reinstated over 9C's drop), plus a small chance of a fine.
8. **Rent** is paid in Scrip or labour. If you can't pay, goods are taken; if you have no goods, your house is boarded up.
9. **The rogue** is a play style any role can follow (confirmed).

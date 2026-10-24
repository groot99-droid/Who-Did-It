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

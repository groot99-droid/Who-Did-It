# Round 9: the owner's questionnaire answers

The owner answered all 54 questions in the round-9 questionnaire (https://claude.ai/artifact/NxXS7U23xjanKdN6paFaNB), saved 2026-10-25T02:40:57.978Z. The answers are reproduced exactly as saved. **Default** means the owner accepted the proposed default. Where the owner chose **Different**, their note is quoted verbatim and replaces the default. These answers override the round-9 design docs wherever the two disagree.

Totals: 42 defaults accepted, 12 answered differently.

## World mode: dealing, the Killer and the train

Design doc: `docs/round9/world-mode.md`.

### WM1. Answered in chat: the world must work without depending on the Killer, and every death must hurt the town. Does this match? Each role keeps something running (the Baker's bread, the Lamplighter's light, the Doctor's healing, the Vicar's Faith), and it stops for everyone when that role dies.

- Proposed default: Yes. Every role gets a "what breaks when I'm gone" entry, and the morning train brings the person back but not the day's lost work.
- **Answer: different.** The owner, verbatim:

  > it doesn't have enough of a repercussion, players when they die and come back are indebted,  this causes there prices to rise, stock to be lower than normal and more.

### WM1B. Story mode is one player playing several roles in a single game, the Killer among them. Does each chapter switch your role, at set story points?

- Proposed default: Yes. You switch at chapter breaks, and each role's part is a short thematic chapter.
- **Answer: default.**

### WM2. Is the third human in "a minimum of 3 players" the Detective (the law)?

- Proposed default: Yes.
- **Answer: different.** The owner, verbatim:

  > no, I mentioned law enforcement NPCs. they work the same, but at a quicker rate and leave briefing 30s after any clue is created, there is a petition request form the players can launch whether to pursue and bring to trial the perpetrator, this is how random npcs or non-killer roles end up in jail, face a fine, meet the gallows, or dismiss cases. this replaces the bell which can now only be used to gather NPCs for tasks like the activist, vicar, or other. this results in different things for differnt roles, the default for no purpose is just a ding. also when a petition is signed by the players, a man hunt period is convened where you hunt the suspect and cuff them but be careful you could always lose the fight so travel in pairs or groups. there should also be a feature to pair up with NPCs at night to stay safe, it should be an added section in inspect.

### WM3. With only 2 humans, no vendetta has a partner. What then?

- Proposed default: The Killer gets no vendetta and the other human is the Detective. The Killer's only way to win is to stay unseen.
- **Answer: different.** The owner, verbatim:

  > in two players as killers vs the NPCs and environment. goal "Paint The Town Red", kill as many NPCs roles as possible before you get caught. each kill counts towards the win even if they come back  but duplicate kills don't count towards wins just total kills.

### WM4. Should nameplates show the character ("Tamsin Crumb, the Baker") instead of the player's name, so the Bandit stays anonymous?

- Proposed default: Yes. Player names stay in the party list and show again on the end screen.
- **Answer: default.**

### WM5. The train brings back people who "died in the day". Does that mean daylight only, or any death?

- Proposed default: Daylight only. A death after dark is for good.
- **Answer: default.**

### WM6. With 8-minute days and 5-minute nights, 5 cycles plus the Final Night is about 70 minutes. Keep 5 cycles, or move the Final Night to after cycle 3 (about 45 minutes)?

- Proposed default: Keep 5 cycles.
- **Answer: default.**

### WM7. The martyr's 10 minutes (the Vicar's ghost tasks counting extra): stretch it with the longer cycle to 35 minutes?

- Proposed default: Stretch it.
- **Answer: default.**

### WM8. The Postmaster, Undertaker, Bartender and Company Clerk need cards and art first. Until then, use stand-in partners for the Activist, Bandit and Hitman?

- Proposed default: Yes.
- **Answer: default.**

### WM9. One Killer per match, however many humans?

- Proposed default: Yes.
- **Answer: different.** The owner, verbatim:

  > the hit man can (lower to higher chance depending on player pool) appear anywhere between days 3 and 5. when the hitman arrives everyone will see signs. as soon as the hitman is active, that roles place in the town goes dormant, this causes a noticeable shift in the economy that by going to the individual roles houses you can find out who the hitman is and try to stop them, if you fail report what you saw as fast as possible before they reach the train, if you fail again they win in one day.

### WM10. The lore says nobody starts as the Hitman, but a human Killer must be dealt at the start. Deal the Hitman at the start anyway?

- Proposed default: Yes, dealt at the start. The mailed version becomes the Postmaster's Handler route.
- **Answer: different.** The owner, verbatim:

  > hitman is different, in player parties of 3 the hitman is never human, at 4 very low chance, at 5 low chance, 6 40% hitman will be player, and so on, max player pool hitman 100% percent appears and is human

### WM11. The evidence trial: death sentence at 3 matching verified pieces of evidence, a heavy fine at 2, acquitted below that?

- Proposed default: Yes, tuned on playtests.
- **Answer: different.** The owner, verbatim:

  > death is crime dependent, kill=death, conspiring with killer = fine + demotion from gained role + jail (only applies for minion types, brute types, and extortionist types not religious types like cultist or priest). continue this logic for the rest of the crimes, rumors turned to a case = fine, etc

## The logic table: tools, objects and chests

Design doc: `docs/round9/logic-table.md`.

### LT1. Is a tool a speed-up or a wall? Can you get lumber and loose stone slowly by hand, with only boulders, locks and nailed crates needing a tool?

- Proposed default: As written: by hand slowly, and only boulders, locks and nailed crates are walled. The alternative is that everything needs its tool.
- **Answer: different.** The owner, verbatim:

  > if you cant currently access a resouce pile in this game, a tool should unlock it: there are these piles of stuff representing cut log piles, barrels, crates, trees, etc. there also needs to be resource logic, for example taking wood from trees need to be turned into lumber at the lumber mill, grain and other food items can be used at the bakery to create different recipes, for this you must use different sections of the bakery to make parts of dishes and bring them together in the oven. these dishes can be used for high scrip prices, favors, or buffs like max health up, stamina never drains, or other buffs distributed across different items.

### LT2. Is a lock a toll or a mini-game?

- Proposed default: A toll: a 5-second hold that uses up a pick, makes a noise and leaves a print. No mini-game.
- **Answer: different.** The owner, verbatim:

  > i want a traditional lock pick game, rotating clicking, pushing and pulling lock pick, lock pick tension causing it to break if player isn't careful

### LT3. What does the town square's chest become now that voting is gone?

- Proposed default: The town's lost-and-found, filled by arrests.
- **Answer: default.**

### LT4. Your pack holds 5 items. Where do tools go?

- Proposed default: 2 extra belt slots for tools, plus equipment slots for armour and one weapon.
- **Answer: different.** The owner, verbatim:

  > default option is fine, but pockets need to be bigger, i want a inventory exactly like minecraft with crafting table in it.

### LT5. How much faster can tools make gathering?

- Proposed default: About twice as fast as a gathering spot, never ten times. Final numbers come from the pacing table.
- **Answer: default.**

### LT6. Does armour or a held tool show on the character?

- Proposed default: Not at first (icon and HUD only). A held tool or weapon is the first thing added if the art budget allows.
- **Answer: default.**

### LT7. Do NPCs use up the world's stock (wood, stone and so on)?

- Proposed default: No. Their work is for show.
- **Answer: different.** The owner, verbatim:

  > yes but it comes back after sometime

### LT8. How strict is ownership? Taking from a shop shelf is theft when…

- Proposed default: …a witness (an NPC or a player in sight) sees it and writes a notice.
- **Answer: default.**

### LT9. Iron tools and tin mail need BlackPine's forge. Is that OK?

- Proposed default: Yes, BlackPine first. HollowMere players carry ingots across.
- **Answer: default.**

## Failure messages and NFY

Design doc: `docs/round9/failures.md`.

### FM1. How loud is "NFY"?

- Proposed default: Shown in every build while the game is in playtest. One switch hides it before release, and then it reads "Nothing happens".
- **Answer: default.**

### FM2. Does a missing-unlock line name the exact item ("you might need a lock pick")?

- Proposed default: Yes, like your example.
- **Answer: default.**

### FM3. What voice do the messages use?

- Proposed default: Plain second person: one short sentence for what happened, one for what's missing. No jokes.
- **Answer: default.**

### FM4. When a Killer's strike fails because the target was protected, does it say why?

- Proposed default: No. It stays silent, so the Killer learns nothing about who's protected.
- **Answer: default.**

### FM5. If you try the same thing twice in 30 seconds, does it give a hint about where to find what you need?

- Proposed default: Yes.
- **Answer: default.**

### FM6. Do ghosts get the same failure messages?

- Proposed default: Yes.
- **Answer: default.**

### FM7. May the game grey out an action before you try it, for tool and key checks?

- Proposed default: Yes, but never for anything that depends on hidden information.
- **Answer: default.**

### FM8. Where are the messages kept?

- Proposed default: General lines in the client, and each object's own lines in the logic table.
- **Answer: default.**

## The living world: NPCs, systems, gear and achievements

Design doc: `docs/round9/living-world.md`.

### LW1. Can a townsperson say what it needs in words? AI players stay silent.

- Proposed default: Yes.
- **Answer: default.**

### LW2. Can a townsperson's tip name a look and a place (a rumour)?

- Proposed default: Yes, one tip per conversation, with a short wait before the same townsperson tips again.
- **Answer: default.**

### LW3. Do chores exist (small pay, standing, an alibi), with no part in any win?

- Proposed default: Yes.
- **Answer: default.**

### LW4. How many quest chains for the five quest-givers?

- Proposed default: Build two first (Mother Moll and Ada Kerrow) and judge them in play.
- **Answer: default.**

### LW5. Achievements: you said they stay with players once they make an account, and should feel like skill trees and trophies. Accounts are a new system (today profiles live only on the device). Build accounts in round 10, or keep achievements on the device until later?

- Proposed default: Device first in round 10. Accounts get their own design pass, and achievements move to them when accounts ship.
- **Answer: default.**

### LW6. Do achievement unlocks ever change how strong you are?

- Proposed default: No. They're cosmetic, or a starting option of equal power.
- **Answer: default.**

### LW7. When do bosses come?

- Proposed default: Not before round 11, and only on their own variant scenes. The town maps never get one.
- **Answer: default.**

### LW8. Armour with properties: each piece cuts damage (80%, 65%, 50% by tier) and adds resistances, for example poison resistance (Poisoned wears off sooner), clotting (Bleeding stops sooner), warmth at night and a stamina weight. Is that the kind of complexity you meant?

- Proposed default: Yes. Each tier has one or two resistances, and heavier armour costs stamina.
- **Answer: default.**

### LW9. You wrote: "No players can be killed by other players but then they spend the day in the county jail." Which did you mean? (a) Players can kill each other, and the one who kills spends the rest of the day in jail. (b) Nobody can kill another player, and the blow sends the victim to jail instead.

- Proposed default: (a): a kill is possible, and the one who kills goes to the county jail for the rest of the day.
- **Answer: different.** The owner, verbatim:

  > beating someone till knock can get you reported, other player doesnt die just loses all there stuff, if the abuser gets caught the victim can get their stuff back from the town chest, but hurry up other players can get to it first if they know about it

### LW10. Jail mini-games: working out in the yard for strength, and a mini-game that costs max health for the rest of the match. For that last one, a yard fight or a bad meal instead of "dropping the soap"? A prison-rape and HIV joke would land badly with a lot of players.

- Proposed default: A yard fight: you can lose it, and you keep a max-health loss.
- **Answer: default.**

### LW11. Creature bites at 12/9/3/2 with health at 100: a wolf's full 6-second chase now leaves you at about 28% instead of killing you in 4 seconds, so you survive one encounter and run, but a second chase before you heal (healing starts 8 s after the last hit) still kills. Is that the feel you want?

- Proposed default: Yes.
- **Answer: default.**

### LW12. Is Faith earned through a chapel vigil, the shrine chore, devotional reading and calming scared villagers?

- Proposed default: Yes, all four.
- **Answer: default.**

### LW13. Who can skin a creature? (Only the Killer and the Drifter carry knives, so knife-skinning would give them away.)

- Proposed default: Anyone, with a skinning knife any role can buy.
- **Answer: default.**

## Playing your own way (the rogue)

Design doc: `docs/round9/emergent-play.md`.

### EP1. Is raw foraged food edible, with a 1-in-3 chance of being poisoned (never deadly)?

- Proposed default: Yes.
- **Answer: default.**

### EP2. Can a curfew door be picked with lock picks (leaving a print, and a notice if someone sees)?

- Proposed default: Yes.
- **Answer: default.**

### EP3. Rent is paid in Scrip or labour. If you can't pay, goods are taken, and if you have no goods your house is boarded up. A boarded house means no bed, so no sleeping to skip the night. Is that right?

- Proposed default: Yes. You can unboard it by paying the debt.
- **Answer: default.**

### EP4. Does the Clerk collect only from your purse, so the bank hides your money but not your debt?

- Proposed default: Yes.
- **Answer: default.**

### EP5. Can a player steal from a stall (the stallholder angers, you lose standing, and you risk being mugged later)?

- Proposed default: Yes.
- **Answer: default.**

### EP6. Is the rogue a role, or a play style any role can use?

- Proposed default: A play style open to every role.
- **Answer: different.** The owner, verbatim:

  > default is fine, but rouge stands more for players intentional using other elements of the game to work around challenges

### EP7. Should an automatic test check that every need (food, money, a way through locks) has three ways to meet it?

- Proposed default: Yes.
- **Answer: default.**

### EP8. Keep the three extra play styles (the Quartermaster, the Lantern Warden, the Scribe)?

- Proposed default: Yes, all three.
- **Answer: default.**

## Your newest rules: sleep and busy NPCs

Design doc: `docs/round9/owner-brief.md`.

### NW1. Sleeping skips the night once every active player is in bed. Does "active" leave out ghosts, players in jail and players who disconnected?

- Proposed default: Yes, only living, free, connected players count. Sleepers are vulnerable while asleep.
- **Answer: default.**

### NW2. When the night is skipped, what happens to night-only things (the Killer's window, creature spawns, night tasks)?

- Proposed default: They end early, like a normal dawn. A Killer who is still awake doesn't count as "in bed", so the night can't skip while a human Killer stays up.
- **Answer: default.**

### NW3. NPCs sell only what they gathered or bought. Can they run out, so a stall can be empty?

- Proposed default: Yes. Restocking is visible: you see them gathering.
- **Answer: default.**

### NW4. Nothing waits on NPCs. Meetings and cutscenes never wait for NPC turns. Do NPCs still speak in meetings?

- Proposed default: Yes, but only in the time players already spend talking. They never add time.
- **Answer: default.**


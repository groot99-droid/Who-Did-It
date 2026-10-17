# Round 5: the owner's brief and ONUB spec (2026-10-17, verbatim)

The owner's request that started round 5, and the One Night Ultimate Baguette text the owner attached, quoted
word for word. The decisions taken on them are DECISIONS A49 (the owner's answers) and A50 (the round-5
contract); the rules are `docs/GDD.md`. The 13 room images the owner attached are listed in `art-index.md`
and ship through Session 5M.

## The brief

> Create another group of sessions to fix all of the remaining bugs. Create logic for NPCs, so they aren't
> running around all the time. Make the game look like a realistic and high depth environment. Also create
> individual characters for each role and the killers have to dress up who ever they choose. Really use the
> werewolf card game for inspiration on game design. Id also just like a lot more depth to the game, I can't
> really interact and 90% of the game is boring traversal inside of poorly aesthetic world. Try to add mini
> games, quests, random mobs that spawn. Create different maps to choose from, I'd also like a resource
> collection part of the game where you find resources and build tools for the game. The maps need to have
> caves, and forests. Also for one night ultimate baguette read the attached text, I've also attached images
> for how I'd like the game art to look like in ultimate baguette.

### Itemised (orchestrator)

1. Fix all remaining bugs (round-4 leftovers: docs/SESSIONS.md "Integration log, round 4").
2. NPC logic: NPCs should not run around all the time (idle, work, purposeful movement).
3. Look: realistic, high-depth environment (the main game's world is called "poorly aesthetic").
4. Individual characters for each role; the killers dress up as whoever they choose (a disguise).
5. Use the Werewolf card game (One Night Ultimate Werewolf and classic Werewolf) as design inspiration.
6. Depth: interaction, mini-games, quests, random mob spawns ("90% of the game is boring traversal").
7. Several maps to choose from; every map has caves and forests.
8. Resource collection: find resources and build tools that matter in the game.
9. ONUB: rebuild to the attached spec (two cards per player, 4 prep stations, prep piles, night roles,
   5-minute Morning Rush, final vote), in the art style of the attached images.

## The ONUB spec

In One Night Ultimate Baguette, every player experiences a two-part gameplay loop: first, they physically visit one of the 4 Main Kitchen Stations during the Evening Prep (Among Us task phase), and second, they execute their secret Brigade Role Action from their personal station during the Night Phase (One Night Werewolf manipulation phase).
Here is exactly what the player does in each scene, broken down by station and role.

### Part 1: The 4 Physical Prep Stations (Evening Task Phase)

Before the lights go out, every player secretly chooses one of the four main rooms to visit by placing that Location Card face-down in front of them, then contributes one card to that room's specific Prep Pile.

#### 1. La Chambre Froide (The Walk-In Fridge)
 * In-World Action: You are checking temperatures, harvesting wild yeast, and pulling cold butter and milk crates from the frosted shelves.
 * Player Mechanic:
   * Loyal Bakers add Pure Dairy & Active Yeast cards into the Fridge Prep Pile.
   * Saboteurs slip Spoiled Milk or Unpasteurized Mold into the pile, or flip the thermostat switch (forcing one random card from the Fridge pile to be discarded blindly).
 * The Alibi Risk: Because the floor is covered in frost, anyone who visits the Walk-In Fridge leaves "chilled" footprints—if the Fridge is sabotaged, anyone claiming they were here immediately becomes a prime suspect.

#### 2. Le Pétrin (The Industrial Mixer)
 * In-World Action: You are hauling heavy sacks of Farine (flour), pouring buckets of water, and running the giant spiral dough hook.
 * Player Mechanic:
   * Loyal Bakers play T55 Flour and Sea Salt cards into the Mixer Bowl pile.
   * Saboteurs dump Sawdust, Plaster, or Floor Sweepings into the mixer.
 * The Alibi Risk: The Mixer requires at least two ingredient cards to run. If only one person visits Le Pétrin, the dough is under-mixed, automatically triggering a caution flag in the morning.

#### 3. La Chambre de Pousse (The Proofing Drawer)
 * In-World Action: You are sliding wooden banneton baskets of shaped dough into the warm, humid glass cabinets and monitoring the fermentation dials.
 * Player Mechanic:
   * Loyal Bakers play Warm Steam and Time cards.
   * Saboteurs play Cold Draft or Over-Proofing cards to collapse the dough.
 * Station Perk: Because the Proofing Drawer has glass doors and bright warm bulbs, if zero Sabotage cards are played here, the players who visited this station get to collectively peek at one unused Location Card from the center Pantry before the Night Phase begins.

#### 4. Le Four à Pain (The Brick Oven)
 * In-World Action: You are stoking the wood fire, wielding the long wooden peel, and injecting steam for the coup de buée (the crispy crust).
 * Player Mechanic:
   * Loyal Bakers play Oak Firewood and Steam Injection cards.
   * Saboteurs play Charcoal Ash or Wet Wood to choke the heat.
 * The High Stakes: Sabotage cards played at the Brick Oven count double toward ruining the Mother Dough, making it the hottest battleground for accusations during the Morning Rush.

### Part 2: The Role Scenes (Night Phase Actions)

Once the Prep Piles are revealed (showing where sabotage happened, but not who did it), the lights go out. The narrator calls each role in order. Here is what you do when your station is called:

#### 1. The Saboteurs' Cellar (Le Champignon & Le Levain)
 * Le Champignon (The Mold Spore):
   * In-Scene Action: You crawl out from behind the glowing green damp bricks and sacks of spoiled flour.
   * Tabletop Action: Open your eyes and look around for other Mold Spores. If you are the only Spore among the players, you may secretly look at one center Pantry Role Card so you can safely bluff as that role in the morning.
 * Le Levain (The Sourdough Starter):
   * In-Scene Action: Your giant glass fermentation jar bubbles over in the candlelight, feeding the spores.
   * Tabletop Action: Keep your eyes closed while the Spores stick their thumbs up. You open your eyes, see who the Spores are, and spend the morning discussion lying to protect them (even trying to get yourself voted into the oven in their place).

#### 2. The Sub-Basement Vent (Le Rat de Cave & L'Apprenti)
 * L'Apprenti (The Unpaid Intern):
   * In-Scene Action: Exhausted by a 16-hour shift on a wooden stool, you snoop through the shift logs by a single hanging bulb.
   * Tabletop Action: Wake up after the Spores and peek at one other player's Location Card. When morning comes, you can whisper or signal to your fellow Saboteurs which room is safe to claim as an alibi.
 * Le Rat de Cave (The Cellar Rat):
   * In-Scene Action: You pry open the iron floor grate and vent out of the crime scene, leaving a trail of flour footprints leading to someone else's station.
   * Tabletop Action: Swap your own Location Card with one of the extra Location Cards in the center Pantry—or swap yours with an innocent player's Location Card so they get blamed for your sabotaged room!

#### 3. The Shaping Bench (Le Boulanger — Head Baker)
 * In-Scene Action: You slam the heavy Cast Iron Cloche down onto the floured wooden table to protect your prized dough from tampering.
 * Tabletop Action: Wake up first and place the physical Iron Cloche Token on top of any player's Role Card or Location Card (including your own). For the rest of the night, no other role can peek at or swap that card.

#### 4. The Command Desk (Le Chef de Cuisine & Le Sous-Chef)
 * Le Chef de Cuisine (Executive Chef):
   * In-Scene Action: Sitting under the green banker's lamp with your magnifying glass, you audit the kitchen's personnel files and blueprints.
   * Tabletop Action: Wake up and either peek at one other player's Role Card OR peek at two Role Cards in the center Pantry.
 * Le Sous-Chef (Second-in-Command):
   * In-Scene Action: You ringside the brass desk bell and reassign kitchen staff mid-shift to cover a station.
   * Tabletop Action: Wake up and swap your Role Card with another player's Role Card, then look at your new card. (Warning: If you steal a Mold Spore card, you are now on Team Mold and must immediately pivot to defending the Saboteurs in the morning!)

#### 5. The Expediter's Pass (L'Aboyeur)
 * In-Scene Action: Standing under the red heat lamps, you check the order tickets against the grainy green-tinted CRT security monitor watching the four kitchen rooms.
 * Tabletop Action: Wake up and look at two different players' Location Cards. You don't know what role they are, but you know with 100% certainty which stations they actually visited during the Prep Phase—allowing you to instantly catch anyone lying about their room alibi.

#### 6. The Lamination Room (Le Tourrier — Dough Sheeter)
 * In-Scene Action: You feed blocks of Beurre (butter) and dough back and forth through the heavy mechanical rollers, folding an unused recipe into the active lineup.
 * Tabletop Action: Wake up and look at one center Pantry Role Card. You must then swap that Pantry card with any player's Role Card (even your own), completely changing who holds that role at the table.

#### 7. The Cold Pantry (Le Garde Manger)
 * In-Scene Action: Surrounded by hanging cured meats, wheels of cheese, and a few too many spilled glasses of cooking wine, you stumble out of the pantry and forget what station you were assigned to.
 * Tabletop Action: Wake up and swap your own Role Card with a center Pantry Role Card without looking at it. You enter the Morning Rush having no idea if you are still a Loyal Baker or if you accidentally just became a Mold Spore.

#### 8. The Dish Pit (Le Plongeur — The Dishwasher)
 * In-Scene Action: Blinded by overflowing soapsuds, steam, and "Wet Floor" cones, you frantically grab stacks of dirty sheet pans and return them to the wrong stations.
 * Tabletop Action: Wake up and blindly swap two other players' Role Cards OR two other players' Location Cards. You create pure deduction chaos—forcing players to realize in the morning that their identities or alibis have been switched behind their backs.

#### 9. The Hygiene Station (Le Commis & L'Inspecteur Sanitaire)
 * Le Commis (The Line Cooks):
   * In-Scene Action: Chopping mirepoix side-by-side at the stainless steel prep table, you two watch each other's backs the entire shift.
   * Tabletop Action: Both Commis players wake up together and make eye contact. Because you verify each other's identity, you can form an unbreakable voting bloc in the morning (unless the Sous-Chef or Plongeur swapped one of you later in the night!).
 * L'Inspecteur Sanitaire (The Health Inspector):
   * In-Scene Action: Equipped with a clipboard, thermometer, and UV flashlight by the handwashing sink, you do the final sweep before the bakery opens.
   * Tabletop Action: Wake up dead last at the end of the night and look at your own Role Card and Location Card. You are the only player at the table who knows for a fact whether your cards were swapped during the night.

#### 10. Front of House (Le Croissant Rassis & Le Critique Gastronomique)
 * Le Croissant Rassis (The Stale Croissant):
   * In-Scene Action: You sit alone under a dramatic spotlight inside the glass pastry display case, hard as a rock, praying someone throws you back into the hot brick oven.
   * Tabletop Action: You do not wake up at night. During the Morning Rush, you act just suspicious enough—faking bad alibis about the Walk-In Fridge or Brick Oven—to trick both the Bakers and the Mold Spores into voting for you. If you get voted into the oven, you win alone.
 * Le Critique Gastronomique (The Food Critic):
   * In-Scene Action: Sitting behind the velvet rope at a candlelit table with an empty plate and a fountain pen, you wait to pass devastating judgment on the kitchen.
   * Tabletop Action: You never wake up at night, OR you wake up very first to copy another player's role. If you play with the Restaurant Shutdown rule and the group mistakenly votes you into the oven, you immediately reveal your notebook—and whoever you pointed your finger at is dragged into the oven with you.

### Overview (second attachment)

One Night Ultimate Baguette is a fast-paced social deduction game (10–15 minutes) that combines the room-based tasks and alibis of Among Us with the single-night card swapping of One Night Ultimate Werewolf.
You and your friends are French bakers working the graveyard shift before the Paris Bake-Off. Hidden among you are Mold Spores trying to ruin the Mother Dough. There are no player eliminations during the game—everyone plays until the timer runs out, and the entire game comes down to a single explosive 5-minute argument and one final vote.

### The Setup: Two Cards Per Player
Unlike normal Werewolf where you only have an identity, every player in this game manages two secret cards face-down in front of them:
 * Your Role Card (Who you are): Your job in the kitchen brigade (e.g., Mold Spore, Chef de Cuisine, Sous-Chef, Dishwasher). Three extra Role Cards are placed face-down in the center of the table (The Pantry).
 * Your Location Card (Where you worked): Which of the 4 physical kitchen stations you visit during the shift (Walk-In Fridge, Industrial Mixer, Proofing Drawer, or Brick Oven).

### Phase 1: The Evening Prep (The Among Us Phase)
Before anyone closes their eyes, everyone completes a 60-second simultaneous task phase:
 * Pick a Room: Every player secretly selects one of the 4 Location Cards and places it face-down in front of them.
 * Add to the Dough: Players secretly contribute one Ingredient Card from their hand into the face-down "Prep Pile" of the room they chose.
   * Loyal Bakers must play good ingredients (Flour, Water, Yeast, Steam).
   * Mold Spores can play Sabotage Cards (Sawdust, Spoiled Milk, Bleach)—or play good ingredients to blend in.
 * Reveal the Crime Scenes: Each room's Prep Pile is shuffled and flipped face-up.
   * If the Walk-In Fridge has Spoiled Milk in it, the whole table immediately knows that someone who visited the Fridge is a traitor. This sets up the physical alibis and spatial paranoia before the Night Phase even begins.

### Phase 2: The Baking Cycle (The One Night Werewolf Phase)
Everyone closes their eyes. A dramatic French narrator (via an app or moderator) calls out roles one by one to wake up and tamper with the cards on the table in total silence.
Because players have both a Role Card and a Location Card, night actions mess with both your identity and your alibi:
 * The Saboteurs (Mold Spores, Sourdough Starter, Cellar Rat): Wake up to see who their fellow traitors are, peek at unpicked center cards to fake claims, or "vent" by swapping their Location Card with another room so they aren't caught at a sabotaged station.
 * The Investigators (Chef de Cuisine, Expediter): The Chef peeks at players' Role Cards (identities), while the Expediter checks the "security cameras" by peeking at players' Location Cards (seeing which rooms they actually visited).
 * The Chaos Swappers (Sous-Chef, Dishwasher, Dough Sheeter): They swap Role Cards or Location Cards between players in the dark without them knowing.
 * The Closer (Health Inspector): Wakes up last to check their own cards to see if anyone swapped them.

### Phase 3: The Morning Rush (5-Minute Emergency Meeting)
Everyone opens their eyes. Rule #1: You are NOT allowed to look at your Role Card or Location Card anymore.
A 5-minute timer starts, and everyone argues at once to figure out two puzzles before time runs out:
 * Who sabotaged the stations during Phase 1? ("Three of us claim we went to the Brick Oven, and there's Charcoal Ash in the pile! One of us is lying!")
 * Whose cards got swapped during Phase 2?
   * The Twist: You always play for the team of the Role Card currently sitting in front of you, not the card you started with!
   * Example: If you started the game as a Mold Spore and sabotaged the Walk-In Fridge, you start the morning trying to lie about it. Halfway through the argument, another player says, "Wait—I was the Sous-Chef and I swapped Role Cards with you last night!" Suddenly, you realize they have your Mold Spore card now, and you are a Loyal Baker! You immediately betray your former partner and snitch on your own crime from Phase 1 to get the Sous-Chef voted out!

### Phase 4: The Final Bake (Voting & Winning)
When the 5-minute timer rings, everyone counts down "Un, deux, trois—CRUST!" and points at one player to throw into the Brick Oven. The player with the most votes flips their cards over.
 * Team Loyal Baker Wins: If at least one player currently holding a Mold Spore card is voted into the oven. (If all Mold Spore cards ended up in the center Pantry, Bakers win by pointing at the center of the table).
 * Team Mold Spore Wins: If no Mold Spores are voted out—OR if the Saboteurs successfully slipped 3+ Sabotage weight into the Prep Piles during Phase 1 (the baguette is ruined no matter who gets voted out!).
 * The Stale Croissant Wins Alone: If the player holding the Stale Croissant (Tanner) card successfully acts suspicious enough to trick the group into voting them into the oven, they win and everyone else loses.

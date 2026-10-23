# How to play Who Did It

A hidden-role whodunit for a party of friends in a browser. Most of you are villagers; a few are the
Cabal, who kill after dark and lie about it. Find the bodies, read the clues, argue, and vote. The
numbers (phase lengths, light radius, cooldowns, win thresholds) are in [`docs/GDD.md`](../GDD.md),
sections 2, 3.3 and 3.8.

## Getting in

1. Open the game link your host sent you, or go to the game page and press **Join Party**.
2. Type a name and the party code (the link prefills it). You land in the lobby.
3. Press **Ready**. When the leader presses **Start**, roles are dealt and the party locks.

Headphones help: screams, doors and footsteps come with a direction.

## Controls

| Action                    | Keyboard                       | Touch                     |
| ------------------------- | ------------------------------ | ------------------------- |
| Move                      | WASD or the arrow keys         | drag on the left half     |
| Sneak (quiet, slower)     | hold Shift                     | **Sneak**                 |
| Run (louder)              | Space                          | **Run**                   |
| Use a door, bell or body  | E                              | **Use**                   |
| Collect a clue            | hold E until the ring fills    | hold **Use**              |
| Role ability              | Q, R or F, as the card shows   | **Act**                   |
| Role card                 | Tab                            | the chip top-left         |
| Notebook                  | N                              | the button beside the chip |
| Skip a cutscene           | Esc or the Skip button         | tap Skip                  |

A prompt near your character names what E will do ("Enter", "Report the body", "Ring the bell").
Refusals are short on purpose ("Too far", "Not now", "Nothing happens") so that no message gives away
another player's role.

## Your role card

The card shows your faction stripe, your role, the character you walk as, your goal in one line,
your abilities with their keys, and a **Beware** line. Cabal members also see their teammates. Read it
during the role reveal; press Tab to open it again at any time.

Everyone in the main mode walks as their card's character, so the Vicar looks like the Vicar. The
exceptions are the **cover roles** (the Killer, the Accomplice and the Drifter), who pick another
card's look and wear it all match. A look is a claim, not proof: two players in the same look means one
of them is a cover. GDD 3.17 has the full rule.

## The loop of a match

- **Grace.** Everyone spawns around the hub. Nobody can be killed. A glowing clue by the well teaches
  the collect verb. The map's opening cinematic plays over this; skip it with Esc.
- **Day.** Free roam in good light. Gather resources, craft, take quests, do tasks at the stations.
  The bell on the square calls a meeting, once per player.
- **Dusk.** "Night falls." The Knife and the night powers wake. If a body has gone unreported, or
  someone has not been seen for a whole cycle, a roll-call meeting opens instead.
- **Night.** Short sight, wolves in the woods, the hunt. A scream pulses at your screen edge with its
  direction. A Killer carries blood for a while and heads for water.
- **Meeting.** A body report or the bell brings everyone to the square. Portraits, trait icons, a
  Notebook entry you can **Present**, and tapped claims ("I saw X at the Apothecary"). Votes are secret
  until the reveal. An ejected player's role is shown. A short calm follows, then a new day.
- **Final Night.** If nobody has won after enough cycles, one last hunt and a forced vote with no
  Skip decide the match.

## Clues and the Notebook

Bodies, footprints, dropped items and traces are clues. Hold E on a glowing one to collect it into your
Notebook, which records what it says about the culprit's traits ("long stride: Tall"). A **Verified**
entry (the Detective's, or one the board confirms) carries more weight in a meeting than a **Claimed**
one. The meeting board shows, for each player, how many known traits they fit.

## Gathering, crafting, quests, creatures

Six resources grow at nodes in the forests, caves and camps. Hold E at a node to gather, and at a
station to craft a Lantern, Crowbar, Lockpicks, Snare, Torch or Spade. Quest givers (the figures with a
marker) trade resources for tools. Wolves and other creatures roam after dark and flee from light; a
lit Lantern or Torch widens what you can see at night. GDD 3.14 to 3.16.

## Winning

- **The village** wins by ejecting every Cabal member, by finishing the task bar, or by ejecting a Cabal
  member in the Final Night vote.
- **The Cabal** wins at parity, or when the Final Night vote misses.
- **The Drifter** wins alone by getting ejected, and the match goes on without them.

Dead players become ghosts: they see every role, read the ghost channel, can finish their tasks and
cast a non-binding "ghost suspect" shown on the end screen.

## Tips for a first game

- Stay in pairs by day and compare Notebooks before the bell.
- Report a body at once: an unreported body still forces a roll-call at dusk, later and with less to go on.
- Sneak when you are near a house at night. Running makes noise others can hear and log.
- Say where you were and with whom. A quiet player with no alibi gets voted out first.
- Sound settings (music, effects, mute) are behind the gear on the landing page, the lobby and the HUD.
  The art style switch (8-bit or low poly) is on the landing page.

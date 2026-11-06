# Story mode: the script of A Winter in HollowMere

_Generated from `packages/content/data/story.json` (S1, story mode). The copy lives in that file only; this page is what the owner reads. To change a line, change the data and regenerate this page: `python3` over the JSON is enough, there is no second source._

**A Winter in HollowMere.** One town, three nights and days, three trades: the Baker whose coin has a story, the Watchman who follows the boots, and the Bandit who made them.

One human, 7 NPC seats, map `hollowmere`, fixed seed words for every stream, so the story plays the same way each time. Three chapters; the seat moves from card to card at each break, and only a letter, a lead or an item crosses over.

**The through-line.** Chapter 1 is the Baker's day: loaves, flour, a stranger who tips in gold (the Fence road is the turn). Chapter 2 is the Watchman's night: the same stranger's boots, seen from the other end of town. Chapter 3 is the Bandit's heist: the man who made the boots, the safe at Vane Manor, and the sea door. The Killer is the NPC whose crimes the chapters cut across; the Bandit chapter is played on the Thief card (DECISIONS A401).

## Chapter 1: The Wake Loaf

- **Role:** `baker`
- **Starts:** cycle 1, day

### Title card

> Day one in HollowMere. Crumb's ovens are cold, the train is due, and the whole town wants bread by nine. You are the Baker.

### Goals

- Haul the morning flour from the train _(`gFlour`; done on taskDone (taskId=fetchFlour) by you)_
- Mix the dough at the bakery _(`gDough`; done on taskDone (taskId=mixDough) by you)_
- Prove the loaves and stoke the oven _(`gBake`; done on taskDone (taskId=proofLoaves) by you)_
- Find out who has been in your back room _(`gTip`; done by a beat)_

### Beats

**open** — fires on: 0 s into the chapter

_Cutscene: openingHollowmere._

> Before light, the cold room hums and the oven ticks as it cools. Out on the line the morning train is already a smudge of smoke. Flour first, then the fire.
>
> **Dawn in HollowMere**

**train** — fires on: train.arrive

> The iron beast rolls in on time and drops its sacks on the platform. Nobody carries flour for you; nobody ever has. Haul it to the bakery before the damp gets in.
>
> **The morning train**

**flour** — fires on: taskDone (taskId=fetchFlour) by you

> Twelve sacks, and your shoulders know every one. The lane is waking up: shutters, a pump handle, a cough. Mix the dough while the ovens still hold last night's heat.
>
> **Crumb's Bakery**

**dough** — fires on: taskDone (taskId=mixDough) by you

> Dough that rises slow is dough that tastes of patience, as your mother said. A stranger's boots stand in the square by the bell. He does not buy bread. He buys a look at your door.
>
> **The back room**

**watcher** — fires on: 180 s into the chapter

_Stage direction: the thief NPC → goTo {'scene': 'overworld'}._

**visit** — fires on: 210 s into the chapter

_Stage direction: the thief NPC → goTo {'scene': 'bakery'}._

**pick** — fires on: 240 s into the chapter

_Stage direction: a scratch appears at bakery:door._

_Stage direction: the thief NPC → goTo {'scene': 'forest'}._

**tip** — fires on: clue (kind=scratch) or 270 s into the chapter

_Stage direction: a letter appears at bakery:door._

> Fresh scratches round the back-door lock, and on the cooling rack a single gold coin set square on a folded scrap: 'For the loaf. Keep the change.'
>
> **The back room** _(completes goal gTip)_

**fence** — fires on: 360 s into the chapter

> A coin is a coin. You drop it in the till and the drawer sticks a moment, as if it knew. Somebody out in the lanes now thinks you are a friend of a certain sort, and a friend of that sort is never only a friend.
>
> **The Fence road**

**bell** — fires on: bell

> The town bell is ringing. Whatever it means, it will not wait for the oven.
>
> **The bell**

### End card

_Ends on: 450 s into the chapter. The card counts: loavesBaked, coinsKept, tasksDone._

> The last loaf is cooling, the door is bolted and the coin is still in the till drawer.
> HollowMere has eaten, and not one neighbour has asked where the Baker's luck comes from yet.

If you die in the chapter: > Your hands go still on the dough. The oven ticks on without you, and another pair of hands will light it in the morning.

### Handed on

> You carry one thing out of the bakery: the scratch-marks round the back-door lock, and the face of the man who made them.  _(lead: `scratch`)_

## Chapter 2: The Watchman's Night

- **Role:** `watchman`
- **Starts:** cycle 1, night

### Title card

> The same night, the other end of town. The lamps are lit and the lanes empty. You are the Watchman, and you have a neighbour to stand over.

### Goals

- Walk the square with your lantern _(`gRound`; done by a beat)_
- Follow the stranger's prints _(`gPrints`; done on clue (kind=footprints))_
- Stand watch until the small hours _(`gWatch`; done by a beat)_
- See the night out _(`gDawn`; done by a beat)_

### Beats

**open** — fires on: 0 s into the chapter

> Dusk comes down on the mere like a lid. The Lamplighter has been round before you; the lanterns burn in a row to the chapel. Your round starts at the bell and ends when the sun does.
>
> **Dusk in HollowMere** _(completes goal gRound)_

**dusk** — fires on: train.dusk

> The dusk train whistles on the cutting and is gone. Whoever came in on it did not come to town by the front way.
>
> **The dusk train**

**lamps** — fires on: 15 s into the chapter

_Stage direction: the lamplighter NPC → goTo {'scene': 'overworld'}._

**round** — fires on: 60 s into the chapter

> Every door on the square is bolted. That is not comfort; it is information. Somebody told these people to be afraid, and they listened.
>
> **The square**

**stranger** — fires on: 120 s into the chapter

_Stage direction: the thief NPC → goTo {'scene': 'manor_hall'}._

_Stage direction: a footprints appears at manor_hall:front._

**prints** — fires on: clue (kind=footprints)

> Wet prints, size nine, crossing the manor's front step in a hurry, with a scrape where a heel dragged. The bakery's scratch-marks and these prints came out of the same boot.
>
> **The manor step** _(completes goal gPrints)_

**quiet** — fires on: death or 210 s into the chapter

> Past the second hour the town feels thinner: a shutter standing open, a lamp burnt dry, a gate that should be latched. Whatever the night is taking, it takes quietly.
>
> **The small hours** _(completes goal gWatch)_

**bell** — fires on: bell

> The bell, and then nothing. The Watchman's rule is simple: if the bell rings, you go; if you are late, someone is dead.
>
> **The bell**

**kill** — fires on: kill

> There is a body in the lane, and the cold on it says it has been there some time. You were forty yards off, looking at a closed door.
>
> **The lane**

**grey** — fires on: 270 s into the chapter

> Grey on the eastern roofs. You have lost count of the doors. The man with the wet boots is not on any road you walked tonight, which means he is not on any road he meant you to walk.
>
> **Before dawn** _(completes goal gDawn)_

### End card

_Ends on: 300 s into the chapter. The card counts: roundsWalked, cluesFound, neighboursWatched._

> Dawn finds you on the chapel step with a cold lantern and wet knees.
> HollowMere counts its heads in the half light; whoever is missing, you know the boots that walked past them.

If you die in the chapter: > The lantern goes over on its side and the flame gutters out. Somebody else will have to finish the round.

### Handed on

> You keep the Watchman's pocket watch. It says the Hall is empty between two and three in the morning, every night of the week.  _(item: `pocketWatch`)_

## Chapter 3: The Bandit's Heist

- **Role:** `thief`, look `drifter`
- **Starts:** cycle 2, night

### Title card

> Second night. The coin was a down payment, the watch a map. You are the Bandit, and Vane Manor has a safe worth the whole town's rent.

### Goals

- Case Vane Manor from the front step _(`gCase`; done on story.enter (sceneId=manor_hall) by you)_
- Open the safe in the hall _(`gCrack`; done by a beat)_
- Leave the Hall holding three heirlooms _(`gHaul`; done by a beat)_
- Reach the sea door at the back of the cave _(`gSea`; done on story.enter (sceneId=cave_entry) by you)_

### Beats

**open** — fires on: 0 s into the chapter

> Nobody locks a bakery door against a man who tips in gold. You stand in the cold with a pick in your glove, a smoke bomb in your pocket and a Watchman's round to beat.
>
> **Night two**

**baker** — fires on: 20 s into the chapter

_Stage direction: the baker NPC → goTo {'scene': 'bakery'}._

**square** — fires on: 45 s into the chapter

> The square is yours between the bell and the lamp, and the Baker has left the back door on the latch like a promise. The Hall is across the lane. Go while the round is the other way.
>
> **The square**

**hall** — fires on: story.enter (sceneId=manor_hall) by you

> Vane Manor, hall: a clock that keeps worse time than your pulse, a portrait that watches the safe, and the safe in the corner, solid as a pew. Pick, listen, and do not hurry.
>
> **Vane Manor** _(completes goal gCase)_

**pick** — fires on: clue (kind=scratch)

> The lock gives with a sigh. You leave a scratch on the plate and a story for the Watchman to follow, and you do not care for either.
>
> **The safe** _(completes goal gCrack)_

**haul** — fires on: story.pickup (item=heirloom) by you

> Heirlooms: a locket, a pair of spurs, a ring. Three of them, and the town will call you a Bandit for the rest of its life. Out the back way, and do not look at the portrait.
>
> **The haul** _(completes goal gHaul)_

**alarm** — fires on: bell or 270 s into the chapter

_Stage direction: the watchman NPC → goTo {'scene': 'manor_hall'}._

**cave** — fires on: story.enter (sceneId=cave_entry) by you

> The Tin Gallery's mouth, black and wet, and at the back of it the sea door the miners never bricked. You have the haul, the night, and a smoke bomb you will not need. The sea air takes the sound of your name.
>
> **The sea door** _(completes goal gSea)_

**smoke** — fires on: 315 s into the chapter

> Behind you the town finds out. Ahead is a dark boat and a longer road than the one you came by. The Baker's coin is spent; the Fence will make it back.
>
> **The Fence road**

### End card

_Ends on: story.enter (sceneId=cave_entry) by you or 340 s into the chapter. The card counts: heirloomsHeld, scratchesLeft, nightsUsed._

> The sea door shuts behind you, and for the first time in two nights nobody is watching.
> HollowMere wakes poorer by a safe and richer by a story, and the Baker keeps a coin that will not spend.

If you die in the chapter: > A hand on your collar, a lantern in your face, and the Hall's clock chiming a quarter-past of nothing at all.

## Open questions for the owner

- **Q-S1.** Add a Killer chapter? Default: no (three chapters). The format takes a fourth chapter with no code change.
- **The Bandit's card.** There is no Bandit card; the Bandit is the Killer's heist vendetta. Chapter 3 is played on the Thief (`look: drifter`). Say if you want the Killer card with the `bandit` vendetta instead.
- **Lines the NPCs speak.** Beats show narration only; NPC dialogue stays in the existing talk and lore files.


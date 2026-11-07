# Story mode: the script of A Winter in HollowMere

_Generated from `packages/content/data/story.json` (S1, story mode). The copy lives in that file only; this page is what the owner reads. To change a line, change the data and regenerate this page: `python3` over the JSON is enough, there is no second source._

**A Winter in HollowMere.** One town, four chapters, four hands: the Baker whose coin has a story, the Watchman who follows the boots, the Bandit who made them, and the Activist who comes for the works.

One human, 7 NPC seats, map `hollowmere`, fixed seed words for every stream, so the story plays the same way each time. Three chapters; the seat moves from card to card at each break, and only a letter, a lead or an item crosses over.

**The through-line.** Chapter 1 is the Baker's day: loaves, flour, a stranger who tips in gold (the Fence road is the turn). Chapter 2 is the Watchman's night: the same stranger's boots, seen from the other end of town. Chapter 3 is the Bandit's heist: the outlaw who made the boots, the strongbox at Vane Manor, and the sea door. Chapter 4 is the Activist's day: the same Knife, a new cause, and the town's own chores to undo. Chapters 3 and 4 are played on the Killer card, each with its own vendetta (`bandit`, `activist`); the Thief card stays the stranger NPC and is free for a later heist-man chapter (DECISIONS A430).

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

- **Role:** `killer` with the `bandit` vendetta (the outlaw), look `drifter`
- **Starts:** cycle 2, night

### Title card

> Second night. The coin was a down payment, the watch a map. You are the Bandit, the town's outlaw, and Vane Manor has a strongbox worth the whole town's rent.

### Goals

- Case Vane Manor from the front step _(`gCase`; done on story.enter (sceneId=manor_hall) by you)_
- Crack the strongbox, alone and still _(`gCrack`; done by a beat)_
- Reach the sea door at the back of the cave _(`gSea`; done on story.enter (sceneId=cave_entry) by you)_

### Beats

**open** — fires on: 0 s into the chapter

> Nobody locks a bakery door against a man who tips in gold. You stand in the cold, the outlaw of HollowMere, with the Knife in your boot and a Watchman's round to beat.
>
> **Night two**

**baker** — fires on: 20 s into the chapter

_Stage direction: the baker NPC → goTo {'scene': 'bakery'}._

**square** — fires on: 45 s into the chapter

> The square is yours between the bell and the lamp, and the Baker has left the back door on the latch like a promise. The Hall is across the lane. Go while the round is the other way.
>
> **The square**

**hall** — fires on: story.enter (sceneId=manor_hall) by you

> Vane Manor, hall: a clock that keeps worse time than your pulse, a portrait that watches the strongbox, and the strongbox in the corner, solid as a pew. Stand still beside it until it gives, and be alone when it does.
>
> **Vane Manor** _(completes goal gCase)_

**pick** — fires on: vendetta.heist.cracked

> The box gives with a sigh and comes away in your arms. A footprint at the foot of the safe now says everything about your height, and the Knife is warm in your boot again.
>
> **The strongbox** _(completes goal gCrack)_

**alarm** — fires on: bell or 270 s into the chapter

_Stage direction: the watchman NPC → goTo {'scene': 'manor_hall'}._

**cave** — fires on: story.enter (sceneId=cave_entry) by you

> The Tin Gallery's mouth, black and wet, and at the back of it the sea door the miners never bricked. You have the box, the night, and the town's name for you. The sea air takes the sound of it.
>
> **The sea door** _(completes goal gSea)_

**smoke** — fires on: 315 s into the chapter

> Behind you the town finds out. Ahead is a dark boat and a longer road than the one you came by. The Baker's coin is spent; the Fence will make it back.
>
> **The Fence road**

### End card

_Ends on: story.enter (sceneId=cave_entry) by you or 340 s into the chapter. The card counts: strongboxTaken, cluesFound, nightsUsed._

> The sea door shuts behind you, and for the first time in two nights nobody is watching.
> HollowMere wakes poorer by a strongbox and richer by a story, and the Baker keeps a coin that will not spend.

If you die in the chapter: > A hand on your collar, a lantern in your face, and the Hall's clock chiming a quarter-past of nothing at all.

## Chapter 4: The Works

- **Role:** `killer` with the `activist` vendetta, look `tinner`
- **Starts:** cycle 3, day

### Title card

> Third day. The outlaw has gone to sea; the Knife has not. You are the Activist now, and a town that cannot fix its pump, its fence and its lamps is a town that listens.

### Goals

- Tamper with a work, still and unseen _(`gTamper`; done on vendetta.sabotage.tampered)_
- Wreck the works _(`gWreck`; done by a beat)_

### Beats

**open** — fires on: 0 s into the chapter

> Bright morning, and a town at its chores. The pump, the fence, the lanterns: everything HollowMere needs to feel safe is a thing a patient pair of hands can undo. You have patient hands.
>
> **The Works**

**tamper** — fires on: vendetta.sabotage.tampered

> One work is loosened and nobody saw you stand there. Hold still, hold long enough, and the town's mending starts to undo itself.
>
> **The Works**

**wreck** — fires on: vendetta.sabotage.wrecked

> The works are wrecked, and the finished chores of the day fall back to undone. The Constable will ask who was near them. You were near all of them.
>
> **The Works** _(completes goal gWreck)_

**late** — fires on: 360 s into the chapter

> The light is going. A town can forgive a broken pump; it never forgives a pattern. Finish, or step back into the crowd.
>
> **Dusk**

### End card

_Ends on: vendetta.sabotage.wrecked or 420 s into the chapter. The card counts: targetsTampered, worksWrecked, tasksDone._

> The lamps are lit by people who no longer trust the pump, and nobody can say whose hands it was.
> HollowMere sleeps behind a mended fence it will not believe in.

If you die in the chapter: > Somebody counted the loosened bolts and then counted you. The Constable's lantern finds your face before the works can hide it.

## Open questions for the owner

- **Q-S1 (answered 2026-11-06, owner).** Add Killer chapters: chapters 3 and 4 are played on the Killer card.
- **The Bandit's card (answered 2026-11-06, owner).** The Bandit is the outlaw, the Killer card with the `bandit` heist vendetta. The Thief is free for a later heist-man chapter.
- **Chapter 4's cause.** The Activist (sabotage) was chosen because it needs no second card and no train timing. The Zealot (needs a Vicar) and the Hitman (arrives on days 3 to 5) are the other two Killer vendettas if a fifth chapter is wanted.
- **Lines the NPCs speak.** Beats show narration only; NPC dialogue stays in the existing talk and lore files.

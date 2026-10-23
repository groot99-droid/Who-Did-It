# Host guide

How to get a party into a match, and what to do when something sticks. Player counts, the NPC fill and
the lobby settings are in [`docs/GDD.md`](../GDD.md) 2, 3.9 and 3.12.

## Making a party

1. Open [https://groot99-droid.github.io/Who-Did-It/](https://groot99-droid.github.io/Who-Did-It/).
2. Type a name and press **Create Party**. You are the leader.
3. The lobby shows a short party code and **Copy invite link**. Send the link or the code. Friends who
   open the link find the code prefilled; everyone else presses **Join Party** and types it.
4. Watch the roster fill. Each player presses **Ready**.
5. Press **Start**. If someone is not Ready you get a confirm dialog listing them. Roles are dealt at
   once and nobody can join after this.

The game is best with six to eight players and runs with fewer: empty seats below the minimum are
filled with NPC villagers at Start, and even a single human can start a match for practice.

## Lobby settings

- **Map**: Hollowmere or Blackpine.
- **Add NPC / Remove NPC** and **NPC difficulty**: fill or thin the table with bots.
- **Art style** (landing page): 8-bit or low poly, per player, changed at any time.
- **Sound** (gear): music, effects and mute, per player.

After game over the party returns to the lobby with the same code and seats, so a second round is one
press of Start.

## When something sticks

| Symptom                                               | What is happening                                                                                                                                  |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| The buttons read "Waking the village..."              | The server is starting up. Wait a few seconds; the buttons go live on their own.                                                                   |
| "Party not found" on Join                             | Check the code: it never uses 0, O, 1 or I. The party may already have started, which locks it.                                                   |
| A player dropped                                      | They can reopen the link within about a minute and resume the same role. After that the seat is a ghost.                                          |
| The opening cinematic does not play                   | It plays once per browser session and is skipped under reduced motion or a data saver. Add `?intro=0` to the URL to turn it off for a session.      |
| No sound                                              | Browsers block audio until a tap or click. Click **Create** or **Join** once, then check the gear for mute.                                        |
| The page looks old after an update                    | Hard-reload (Ctrl+Shift+R or Cmd+Shift+R). The build version shows in the landing page footer.                                                    |
| Everyone sees different things                        | Report it with the party code and the build version from the footer; the owner can replay a match from its seed words (see the Admin guide).        |

## Running your own server

The client is a static page; the server is a Colyseus app. `README.md` lists the environment variables
and `docs/ARCHITECTURE.md` 5 the deployment. The client reads the server address from
`apps/client/.env.production` at build time, or from the `VITE_SERVER_URL` Actions variable.

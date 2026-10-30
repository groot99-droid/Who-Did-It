/**
 * Round 10, C5 (GDD 3.8, seams.md 3 row 18): the unique count Paint The Town Red's two Killers need, max(1,
 * ceil(`winUnique` x `npcSeats`)). The server fixes it at the deal (`sim/paintTown.ts`); the role card shows it with
 * `npcSeats` = the roster size - 2, which equals the deal's count because a seat leaving during play keeps its row
 * (`PartyRoom` `onLeave`); only the lobby removes seats.
 */
export const paintTarget = (winUnique: number, npcSeats: number): number =>
  Math.max(1, Math.ceil(winUnique * npcSeats));

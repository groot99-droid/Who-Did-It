// `checkWin` (GDD 3.8): all Cabal out, parity at 6+, living Village <= 1 at 4-5. Pure functions over
// plain data (ARCHITECTURE 5.8). Tasks and the Final Night vote are M4.

/** How the Cabal wins for a party size: `balance.byCount[n].cabalWin`. */
export type CabalWinRule = 'parity' | 'villageAtMostOne';
export type WinFaction = 'village' | 'cabal' | 'neutral';
export type WinResult = 'village' | 'cabal' | null;

/**
 * `living` lists the faction of every living seat. Neutral seats count for nobody (the Drifter; the
 * Thief of V1.5 will be passed as village by the caller). Village wins first when no Cabal lives.
 */
export function checkWin(living: readonly WinFaction[], rule: CabalWinRule): WinResult {
  let cabal = 0;
  let village = 0;
  for (const f of living) {
    if (f === 'cabal') cabal++;
    else if (f === 'village') village++;
  }
  if (cabal === 0) return 'village';
  if (rule === 'parity' ? cabal >= village : village <= 1) return 'cabal';
  return null;
}

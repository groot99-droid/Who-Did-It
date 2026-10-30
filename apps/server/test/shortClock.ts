import { abilities, balance, clues } from '@wdi/content';

/**
 * The clocks of GDD 3.3 as they were before round 10's pacing (A5): a 230 s cycle and a match of 5 cycles. The
 * long auto-match tests use them so the server suite stays near its old wall time; each still checks what it
 * checked, and `pnpm auto` runs the real 810 s cycle. `restore()` puts the scaled clocks back.
 */
export function shortClock(): () => void {
  const saved: Array<() => void> = [];
  const set = <T extends object, K extends keyof T>(obj: T, key: K, value: T[K]): void => {
    const was = obj[key];
    obj[key] = value;
    saved.push(() => {
      obj[key] = was;
    });
  };
  set(balance.phases, 'dayS', 120);
  set(balance.phases, 'duskS', 10);
  set(balance.phases, 'nightS', 100);
  const cooldown: Record<string, number> = { '4': 60, '5': 60, '6': 35, '7': 35, '8': 30, '9': 30, '10': 40 };
  const tasks: Record<string, number> = { '4': 3, '5': 3, '6': 4, '7': 4, '8': 4, '9': 4, '10': 5 };
  for (const n of Object.keys(cooldown) as Array<keyof typeof balance.byCount>) {
    const row = balance.byCount[n];
    set(row, 'killCooldownS', cooldown[n]!);
    set(row, 'tasksEach', tasks[n]!);
    if (n === '10') set(row, 'globalKillLockS', 15);
  }
  set(balance.finalNight, 'afterCycle', 5);
  set(balance.finalNight, 'huntS', 45);
  set(balance.finalNight, 'killCooldownS', 20);
  set(balance.impersonate, 'durationS', 15);
  set(balance.impersonate, 'cooldownS', 45);
  set(balance.snowball, 'killCooldownPenaltyS', 10);
  set(balance.snowball, 'lastKillerCooldownDeltaS', -5);
  set(balance.body, 'famishedAfterS', 480);
  set(balance.tasks, 'martyrS', 600);
  set(balance.train, 'arriveAtS', 5);
  set(balance.train, 'deliveryAfterS', 8);
  set(balance.vendettas.conversion, 'shareS', 45);
  set(balance.vendettas.contract, 'offTargetRestS', 30);
  set(balance.npc.aloneKill, 'afterS', 30);
  set(balance.npc.night.leaveDelayS, 'max', 15);
  for (const [id, old] of [
    ['plantClue', 60],
    ['bandage', 60],
    ['actShifty', 20],
  ] as const)
    set(abilities.abilities[id]!, 'cooldownS', old);
  set(clues.clues.footprints!, 'decay', { kind: 'seconds', seconds: 90 });
  return () => {
    for (const undo of saved.reverse()) undo();
  };
}

import { Phase } from '@wdi/shared';

/** Parts of the day a light burns in (GDD 3.13, SPRITES 10.11). */
export type DayPart = 'day' | 'dusk' | 'night';

/** `day` is grace, day and immunity; `dusk` is dusk and dawn; `night` is night and the Final Night. */
export function dayPartOf(phase: number): DayPart {
  switch (phase) {
    case Phase.dusk:
    case Phase.dawn:
      return 'dusk';
    case Phase.night:
    case Phase.finalNight:
      return 'night';
    default:
      return 'day';
  }
}

/** Lantern posts burn in the dusk and night parts of the day (SPRITES 10.13). */
export const isLit = (part: DayPart): boolean => part !== 'day';

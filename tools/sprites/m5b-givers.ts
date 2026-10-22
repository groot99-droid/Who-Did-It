// Code-drawn M5b quest givers (route R5, art plan 1.5): the five npcs of 6E's `quests.json`, each a standing
// figure on the villager's proportions with its trade's coat, hat and prop, rigged and projected like the mobs
// (m5b-mobs.ts) so the eight directions agree. Givers are scene statics, never seats, so they idle only.
import type { SKRSContext2D } from '@napi-rs/canvas';
import type { Dir } from './keys.ts';
import { ball, cap, drawRig, mirror, ramp as c, SIDES, type Part, type V3 } from './m5b-mobs.ts';

export const GIVER_IDS = ['harbourmaster', 'moll', 'foreman', 'smith', 'collier'] as const;
export type GiverId = (typeof GIVER_IDS)[number];
/** The givers' one animation: a breathing idle, looping. */
export const GIVER_IDLE = { frames: 4, fps: 6, repeat: -1 } as const;

interface Dress {
  coat: string;
  coatLit: string;
  legs: string;
  boots: string;
  skin: string;
  /** A long skirt in place of the legs. */
  skirt?: string;
  /** Parts on top: hat, hair, beard, apron, the prop in the right hand. */
  extra: (head: V3, hand: V3) => Part[];
}

const DRESS: Readonly<Record<GiverId, Dress>> = {
  harbourmaster: {
    coat: c('moon', 0),
    coatLit: c('moon', 1),
    legs: c('slate', 1),
    boots: c('ink', 1),
    skin: c('skin', 4),
    extra: (h) => [
      ball([h[0] + 6, 0, h[2] - 5], 6, c('bone', 2)),
      ball([h[0], 0, h[2] + 7], 9.5, c('moon', 0), c('moon', 1)),
      cap([h[0] + 4, 0, h[2] + 5], [h[0] + 12, 0, h[2] + 4], 2, c('ink', 1)),
      ball([10, 0, 66], 1.6, c('brass', 2)),
      ball([10, 0, 58], 1.6, c('brass', 2)),
    ],
  },
  moll: {
    coat: c('moss', 2),
    coatLit: c('moss', 3),
    legs: c('wood', 2),
    boots: c('ink', 1),
    skin: c('skin', 3),
    skirt: c('wood', 2),
    extra: (h, hand) => [
      ball([h[0] - 1, 0, h[2] + 3], 10.5, c('brick', 2), c('brick', 3)),
      cap([hand[0] + 2, hand[1] - 4, hand[2] - 3], [hand[0] + 2, hand[1] + 4, hand[2] - 3], 5, c('wood', 4)),
      ball([hand[0] + 2, hand[1], hand[2] + 1], 3, c('moss', 4)),
    ],
  },
  foreman: {
    coat: c('brick', 1),
    coatLit: c('plaster', 2),
    legs: c('stone', 2),
    boots: c('wood', 1),
    skin: c('skin', 3),
    extra: (h, hand) => [
      ball([h[0] - 1, 0, h[2] + 6], 9.5, c('stone', 3), c('stone', 4)),
      cap([h[0] + 3, 0, h[2] + 4], [h[0] + 11, 0, h[2] + 3], 2.2, c('stone', 3)),
      cap([hand[0] + 3, hand[1], hand[2] + 2], [hand[0] + 3, hand[1], hand[2] - 10], 3.5, c('plaster', 3)),
    ],
  },
  smith: {
    coat: c('plaster', 1),
    coatLit: c('plaster', 2),
    legs: c('wood', 2),
    boots: c('ink', 1),
    skin: c('skin', 3),
    extra: (h, hand) => [
      ball([h[0] - 4, 0, h[2] + 4], 8.5, c('wood', 1)),
      ball([h[0] - 9, 0, h[2] + 8], 4.5, c('wood', 1)),
      {
        kind: 'wing',
        pts: [
          [11, -9, 70],
          [11, 9, 70],
          [12, 10, 34],
          [12, -10, 34],
        ],
        fill: c('wood', 3),
      },
      cap([hand[0] + 1, hand[1], hand[2] + 2], [hand[0] + 1, hand[1], hand[2] - 16], 1.8, c('wood', 4)),
      cap([hand[0] - 3, hand[1], hand[2] - 17], [hand[0] + 6, hand[1], hand[2] - 17], 3.5, c('stone', 2)),
    ],
  },
  collier: {
    coat: c('stone', 1),
    coatLit: c('stone', 2),
    legs: c('stone', 0),
    boots: c('ink', 1),
    skin: c('skin', 2),
    extra: (h, hand) => [
      ball([h[0] - 1, 0, h[2] + 4], 10.5, c('fog', 0), c('fog', 1)),
      ball([h[0] + 9, 0, h[2] + 7], 2.8, c('lantern', 2)),
      cap([hand[0] + 2, hand[1], hand[2] + 1], [hand[0] + 2, hand[1], hand[2] - 12], 1.5, c('stone', 3)),
      cap([hand[0] - 2, hand[1], hand[2] - 13], [hand[0] + 8, hand[1], hand[2] - 15], 2.2, c('stone', 3)),
    ],
  },
};

/** A giver posed at idle frame `n`: legs (or a skirt), coat, arms, head, then its dress's extras. */
function giver(id: GiverId, n: number): Part[] {
  const d = DRESS[id];
  const br = Math.sin((2 * Math.PI * n) / GIVER_IDLE.frames);
  const head: V3 = [1, 0, 87 + br];
  const hand: V3 = [5, 14, 48 + br * 0.5];
  const parts: Part[] = [
    cap([0, 0, 52 + br * 0.5], [0, 0, 72 + br], 12, d.coat, d.coatLit),
    ball(head, 10, d.skin),
  ];
  if (d.skirt) parts.push(cap([0, 0, 14], [0, 0, 46], 13, d.skirt), ball([2, 0, 4], 6, d.boots));
  for (const side of SIDES) {
    if (!d.skirt)
      parts.push(
        cap(mirror(side, [0, 5, 46]), mirror(side, [0, 5, 6]), 5, d.legs),
        ball(mirror(side, [3, 5, 4]), 4.5, d.boots),
      );
    const h = side === 1 ? hand : mirror(-1, [3, 14, 49 + br * 0.5]);
    parts.push(cap(mirror(side, [0, 13, 73 + br]), h, 4, d.coat), ball(h, 3.5, d.skin));
    parts.push(ball(mirror(side, [head[0] + 8, 3.5, head[2] + 1]), 1.3, c('ink', 0)));
  }
  return [...parts, ...d.extra(head, hand)];
}

/** One giver frame at display scale, feet at `feet`. */
export function drawGiver(
  g: SKRSContext2D,
  id: GiverId,
  dir: Dir,
  n: number,
  feet: readonly [number, number],
): void {
  drawRig(g, giver(id, n), dir, feet);
}

import { describe, expect, it } from 'vitest';
import { titleLetterOrder } from './title';

describe('titleLetterOrder', () => {
  it('numbers the letters on from line to line', () => {
    const order = titleLetterOrder(['WHO', 'IT?']);
    expect(order.map((line) => line.map((l) => l.ch).join(''))).toEqual(['WHO', 'IT?']);
    expect(order.flat().map((l) => l.i)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('gives a space no turn of its own', () => {
    const [line] = titleLetterOrder(['WHO DID']);
    expect(line!.map((l) => l.i)).toEqual([0, 1, 2, 3, 3, 4, 5]);
  });

  it('keeps every character, so the visible title is the text', () => {
    const lines = ['WHO DID', 'IT?'];
    expect(titleLetterOrder(lines).map((line) => line.map((l) => l.ch).join(''))).toEqual(lines);
  });
});

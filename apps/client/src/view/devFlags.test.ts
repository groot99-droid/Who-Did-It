import { describe, expect, it } from 'vitest';
import { readDevFlags } from './devFlags';

describe('readDevFlags', () => {
  it('reads each flag from the query string', () => {
    expect(readDevFlags('?fps=1&touch=1&navdebug=1&cutscene=0')).toEqual({
      fps: true,
      touch: true,
      navDebug: true,
      noCutscene: true,
    });
  });

  it('leaves everything off by default; ?cutscene=1 is the mock opening, not a disable', () => {
    expect(readDevFlags('')).toEqual({ fps: false, touch: false, navDebug: false, noCutscene: false });
    expect(readDevFlags('?cutscene=1').noCutscene).toBe(false);
  });
});

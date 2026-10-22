/** World-scene dev flags read straight from the query string: ?fps=1, ?touch=1, ?navdebug=1, ?cutscene=0 (no cutscenes). */
export interface DevFlags {
  fps: boolean;
  touch: boolean;
  navDebug: boolean;
  /** `?cutscene=0` plays no cutscene (round 6, 6J). */
  noCutscene: boolean;
}

export function readDevFlags(search: string): DevFlags {
  const q = new URLSearchParams(search);
  return {
    fps: q.get('fps') === '1',
    touch: q.get('touch') === '1',
    navDebug: q.get('navdebug') === '1',
    noCutscene: q.get('cutscene') === '0',
  };
}

/** A coarse primary pointer means a phone or tablet. */
export function isTouchDevice(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
}

// UI.md 14.20 cutscene captions (Session 6J, round 6). A cutscene step names a line by copy id (`cs.<cutscene>.<line>`);
// durations live in `packages/content/data/cutscenes/`. The HollowMere opening is the Bible's Book I.1 narration trimmed
// to captions of at most 90 characters (docs/round6/cutscene-music.md 1.1).
export const CUTSCENE_COPY = {
  'cutscene.skip': 'Skip',
  'cutscene.skip.label': 'Skip the cutscene',

  // 14.20.1 The HollowMere opening
  'cs.hollowmere.title': 'HOLLOWMERE — EST. BY THE RAILROAD EXPANSE',
  'cs.hollowmere.seven': "Seven days' walk from the nearest soul, hemmed in by black pines and freezing mud.",
  'cs.hollowmere.laid': 'It was laid down, tie by tie and spike by spike, by the Railroad Barons.',
  'cs.hollowmere.own': 'They own the mill. They own the bank. They own the dirt under your boots.',
  'cs.hollowmere.train': 'And if you ever hope to leave, you wait for the train.',
  'cs.hollowmere.dusk': 'Folks lock their doors at dusk and tip their hats to the Detective.',
  'cs.hollowmere.end':
    "Nobody comes to the end of the line unless they're running from something, or hunting it.",
  'cs.hollowmere.vicar':
    'A new Vicar stepped off the platform. Someone is already measuring him for a coffin.',
  'cs.hollowmere.letter':
    "Somewhere in today's mailbag, a sealed letter offers one of you a fortune to kill.",
  'cs.hollowmere.nobody':
    'In HollowMere, nobody kills for nothing. Everyone has a price, a prayer, or a vendetta.',
  'cs.hollowmere.check': 'Check your pockets. Read your mail. Watch the shadows.',
  'cs.hollowmere.miss': "And whatever you do, don't miss the train.",

  // 14.20.2 The death cutscenes, one whisper each
  'cs.deathKnife.line': 'A cold edge, and the lantern goes out.',
  'cs.deathPoison.line': 'Something in the cup was not sugar.',
  'cs.deathShot.line': 'One shot, and the whole square goes quiet.',
  'cs.deathEjected.line': 'The town has spoken.',
  'cs.deathWolf.line': 'The pines were not empty.',

  // 14.30 The Vicar's memorial (round 7, 7I): played to every seat at the reveal after the Vicar falls to the Knife
  'cs.memorial.vicar': 'In memory of the Vicar of HollowMere, who fell to the Knife.',
} as const;

export type CutsceneCopyId = keyof typeof CUTSCENE_COPY;

/** The line of a copy id, or null for an id the module does not carry. */
export function cutsceneLine(id: string): string | null {
  return Object.hasOwn(CUTSCENE_COPY, id) ? CUTSCENE_COPY[id as CutsceneCopyId] : null;
}

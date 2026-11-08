import type {
  ArcBeat,
  ArcChapter,
  ArcStory,
  ChapterGoal,
  EndCard,
  HandOn,
  Section,
  Trigger,
} from '@wdi/content';

/**
 * The story's running unit is a *section* (docs/story/arc.md E1; the owner's A515: a failure replays the section,
 * not the chapter). A chapter groups sections: it owns the title card of its first section and the end card of its
 * last. `unitsOf` flattens the arc into sections in play order, each carrying the chapter facts the runner needs, so
 * the runner indexes one flat list. Event names and the card's `chapterId` keep naming this unit (the part-1 name)
 * until the wire moves to sections (P3).
 */
export interface Unit {
  /** The section id (part 1's chapter id): `story.chapterStart`/`End` and the card's `chapterId` carry it. */
  id: string;
  title: string;
  setup: string;
  roleId: string;
  look?: string | undefined;
  vendetta?: string | undefined;
  /** The vendetta the NPC Killer holds while this section runs (arc E4). */
  npcVendetta?: string | undefined;
  startPhase?: { cycle: number; part: 'day' | 'night' } | undefined;
  goals: ChapterGoal[];
  beats: ArcBeat[];
  end: Trigger;
  handOn: HandOn[];
  chapter: ArcChapter;
  /** The first section of its chapter: it opens with the chapter's title card. */
  first: boolean;
  /** The last section of its chapter: its break is the chapter's end card. */
  last: boolean;
  /** The card at this unit's break, or null for a plain handover between two sections of a chapter. */
  endCard: EndCard | null;
}

const unitOf = (chapter: ArcChapter, s: Section, i: number): Unit => {
  const first = i === 0;
  const last = i === chapter.sections.length - 1;
  return {
    id: s.id,
    title: s.title,
    setup: s.setup,
    roleId: s.roleId,
    look: s.look,
    vendetta: s.vendetta,
    npcVendetta: s.npcVendetta,
    startPhase: s.startPhase ?? (first ? chapter.startPhase : undefined),
    goals: s.goals,
    beats: s.beats,
    end: s.end,
    handOn: s.handOn ?? [],
    chapter,
    first,
    last,
    endCard: last ? chapter.end : (s.endCard ?? null),
  };
};

export const unitsOf = (story: ArcStory): Unit[] =>
  story.chapters.flatMap((ch) => ch.sections.map((s, i) => unitOf(ch, s, i)));

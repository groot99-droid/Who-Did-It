import { describe, expect, it } from 'vitest';
import {
  content,
  flatAction,
  STORY_STREAMS,
  StoryArcFile,
  storyCoverage,
  validateContent,
  type Content,
} from '../src/index.js';

// Story mode (docs/story/README.md 1, docs/story/arc.md 5): the arc schema of story.json, its cross-file checks, and
// the part-1 plays view the engine reads until P2.

const storyId = 'hollowmere_winter';

function broken(edit: (c: Content) => void): string[] {
  const copy = structuredClone(content);
  edit(copy);
  return validateContent(copy).filter((e) => e.startsWith('story.json'));
}

const arc = (c: Content) => c.storyArc.stories[storyId]!;
const act = (c: Content, n = 0) => arc(c).chapters[n]!;
const section = (c: Content, n = 0, s = 0) => act(c, n).sections[s]!;

describe('story.json', () => {
  it('ships valid, its sections played in order as the part-1 chapters', () => {
    expect(broken(() => undefined)).toEqual([]);
    expect(arc(content).chapters.map((c) => c.id)).toEqual(['act1_line', 'act2_score', 'act4_works']);
    const story = content.story.stories[storyId]!;
    expect(story.chapters.map((c) => c.id)).toEqual([
      'ch1_baker',
      'ch2_watchman',
      'ch3_bandit',
      'ch4_activist',
    ]);
    expect(story.chapters.map((c) => c.roleId)).toEqual(['baker', 'watchman', 'killer', 'killer']);
    expect(story.mapId).toBe('hollowmere');
  });

  it('gives a play its section end card, and the last play of a chapter the chapter end card', () => {
    const [p1, p2, p3] = content.story.stories[storyId]!.chapters;
    expect(p1!.end).toEqual({ trigger: section(content).end, ...section(content).endCard });
    expect(p2!.end).toEqual({ trigger: section(content, 0, 1).end, ...act(content).end });
    expect(p2!.startPhase).toEqual(section(content, 0, 1).startPhase);
    expect(p3!.startPhase).toEqual(act(content, 1).startPhase);
    expect(p2!.handOn).toEqual(section(content, 0, 1).handOn);
  });

  it('turns a spoken line into a beat card under the speaker', () => {
    expect(flatAction({ say: { text: 'Bread at six.', by: 'baker', goal: 'g' } }, content.roles)).toEqual({
      card: 'beat',
      line: 'Bread at six.',
      speaker: content.roles.roles.baker!.name,
      portrait: 'baker',
      goal: 'g',
    });
    expect(
      flatAction(
        { seq: [{ say: { text: 'Hush.', speaker: 'A voice', portrait: 'villager' } }] },
        content.roles,
      ),
    ).toEqual({ seq: [{ card: 'beat', line: 'Hush.', speaker: 'A voice', portrait: 'villager' }] });
  });

  it('fixes a seed for every stream, and only those', () => {
    const words = arc(content).seedWords;
    expect(Object.keys(words).sort()).toEqual([...STORY_STREAMS].sort());
    expect(new Set(Object.values(words).map((w) => w.join(','))).size).toBe(STORY_STREAMS.length);
  });

  it('rejects a seed missing a stream', () => {
    const errs = broken((c) => delete arc(c).seedWords.hitman);
    expect(errs).toEqual([expect.stringContaining('lacks stream hitman')]);
  });

  it('rejects a repeated beat id, an unknown role, cutscene and goal', () => {
    expect(broken((c) => section(c).beats.push({ ...section(c).beats[0]! }))).toEqual([
      expect.stringContaining('repeated beat id'),
    ]);
    expect(broken((c) => (section(c).roleId = 'bandit'))).toEqual([
      expect.stringContaining('unknown role bandit'),
    ]);
    expect(broken((c) => (section(c).beats[0]!.action = { cutscene: 'noSuchScene' }))).toEqual([
      expect.stringContaining('unknown cutscene noSuchScene'),
    ]);
    expect(broken((c) => (section(c).beats[1]!.action = { card: 'beat', line: 'x', goal: 'gNone' }))).toEqual(
      [expect.stringContaining('unknown goal gNone')],
    );
  });

  it('rejects an unknown scene, spawn and clue kind in a spawn action', () => {
    const spawnAt = (kind: string, at: string) => (c: Content) =>
      (section(c).beats[0]!.action = { spawn: { kind, at } });
    expect(broken(spawnAt('scratch', 'nowhere'))).toEqual([expect.stringContaining('unknown scene nowhere')]);
    expect(broken(spawnAt('scratch', 'bakery:nope'))).toEqual([expect.stringContaining('no spawn nope')]);
    expect(broken(spawnAt('unicorn', 'bakery'))).toEqual([expect.stringContaining('no clue or item')]);
  });

  it('rejects an npcOrder that is no goTo, or goes to no scene or spawn (arc E14)', () => {
    const order = (o: string, args?: Record<string, unknown>) => (c: Content) =>
      (section(c).beats[0]!.action = { npcOrder: { npcId: 'killer', order: o, ...(args && { args }) } });
    expect(broken(order('goTo', { scene: 'bakery' }))).toEqual([]);
    expect(broken(order('flee', { scene: 'bakery' }))).toEqual([expect.stringContaining('is not an order')]);
    expect(broken(order('goTo'))).toEqual([expect.stringContaining('needs args.scene')]);
    expect(broken(order('goTo', { scene: 'nowhere' }))).toEqual([
      expect.stringContaining('needs args.scene'),
    ]);
    expect(broken(order('goTo', { scene: 'bakery', spawn: 'nope' }))).toEqual([
      expect.stringContaining('has no spawn nope'),
    ]);
  });

  it('rejects a goal nothing can complete', () => {
    const errs = broken((c) => section(c).goals.push({ id: 'gOrphan', text: 'Never' }));
    expect(errs).toEqual([expect.stringContaining('goal gOrphan has no trigger')]);
  });

  it('rejects an empty all/any, a line with no speaker, and a section that goes back in time', () => {
    const copy = structuredClone(content.storyArc);
    copy.stories[storyId]!.chapters[0]!.sections[0]!.beats[0]!.trigger = { all: [] };
    expect(StoryArcFile.safeParse(copy).success).toBe(false);
    const mute = structuredClone(content.storyArc);
    mute.stories[storyId]!.chapters[0]!.sections[0]!.beats[0]!.action = { say: { text: 'Who?' } };
    expect(StoryArcFile.safeParse(mute).success).toBe(false);
    const errs = broken((c) => {
      act(c).startPhase.cycle = 3;
    });
    expect(errs).toEqual([
      expect.stringContaining('section ch2_watchman: starts at cycle 1, before ch1_baker'),
    ]);
  });

  it('rejects an id used twice, and a section end card on the last section', () => {
    expect(broken((c) => (section(c, 1).id = 'ch1_baker'))).toEqual([
      expect.stringContaining('id ch1_baker is used twice'),
    ]);
    expect(broken((c) => (section(c, 0, 1).endCard = act(c).end))).toEqual([
      expect.stringContaining("shows the chapter's end card"),
    ]);
  });

  it('holds a chapter to its cast: the seats, the cards played and the cards spoken', () => {
    expect(broken((c) => (act(c).cast = ['baker', 'watchman', 'killer']))).toEqual([]);
    expect(broken((c) => (act(c).cast = ['baker', 'killer']))).toEqual([
      expect.stringContaining('card watchman is not in the chapter'),
    ]);
    expect(broken((c) => (act(c).cast = ['baker', 'watchman', 'nobody']))).toEqual([
      expect.stringContaining('cast names unknown role nobody'),
    ]);
    const all = Object.keys(content.roles.roles);
    expect(broken((c) => (act(c).cast = all))).toEqual([expect.stringContaining('does not fit')]);
    const say = (by: string) => (c: Content) => {
      act(c).cast = ['baker', 'watchman'];
      section(c).beats[0]!.action = { say: { text: 'Evening.', by } };
    };
    expect(broken(say('watchman'))).toEqual([]);
    expect(broken(say('vicar'))).toEqual([expect.stringContaining('say by vicar, who is not in the cast')]);
    expect(broken(say('ghost'))).toEqual([expect.stringContaining('say by unknown role ghost')]);
  });

  it('holds a vendetta to its card, the mail excepted', () => {
    expect(broken((c) => (section(c).vendetta = 'bandit'))).toEqual([
      expect.stringContaining('vendetta bandit belongs to card killer, not baker'),
    ]);
    expect(broken((c) => (section(c).vendetta = 'nope'))).toEqual([
      expect.stringContaining('unknown vendetta nope'),
    ]);
    const hitman = (roleId: string) => (c: Content) => {
      Object.assign(section(c), { roleId, vendetta: 'hitman', hitman: { mark: 'baker' } });
    };
    expect(broken(hitman('gamekeeper'))).toEqual([]);
    expect(broken(hitman('killer'))).toEqual([expect.stringContaining('the mail never turns a killer card')]);
    expect(broken((c) => (section(c).hitman = { mark: 'baker' }))).toEqual([
      expect.stringContaining('`hitman` needs'),
    ]);
    expect(
      broken((c) =>
        Object.assign(section(c), { roleId: 'gamekeeper', vendetta: 'hitman', hitman: { mark: 'ghost' } }),
      ),
    ).toEqual([expect.stringContaining('hitman mark is unknown role ghost')]);
  });

  it("puts the NPC's vendetta on the Killer card, with the card it needs in the cast", () => {
    expect(broken((c) => (section(c).npcVendetta = 'zealot'))).toEqual([]);
    expect(
      broken((c) => {
        section(c).npcVendetta = 'zealot';
        act(c).cast = ['baker', 'watchman', 'killer'];
      }),
    ).toEqual([expect.stringContaining('needs card vicar')]);
    expect(
      broken((c) => {
        section(c).npcVendetta = 'zealot';
        act(c).cast = ['baker', 'watchman', 'killer', 'vicar'];
      }),
    ).toEqual([]);
  });

  it('lists the cards a full story leaves without a part', () => {
    const missing = storyCoverage(arc(content), content.roles);
    expect(missing).not.toContain('baker');
    expect(missing).toContain('vicar');
    const errs = broken((c) => (arc(c).full = true));
    expect(errs).toEqual([
      expect.stringContaining('is marked full but these cards have no section and no line'),
    ]);
    expect(errs[0]).toContain('vicar');
    const spoken = structuredClone(arc(content));
    spoken.chapters[0]!.sections[0]!.beats[0]!.action = { say: { text: 'Bless you.', by: 'vicar' } };
    expect(storyCoverage(spoken, content.roles)).not.toContain('vicar');
  });

  it('keeps a card to a screen of words', () => {
    for (const ch of content.story.stories[storyId]!.chapters) {
      for (const text of [ch.title, ch.setup, ...ch.end.lines, ch.end.failedLine])
        expect(text.length).toBeLessThanOrEqual(280);
    }
    for (const ch of arc(content).chapters)
      for (const text of [ch.setup, ch.summary]) expect(text.length).toBeLessThanOrEqual(280);
  });
});

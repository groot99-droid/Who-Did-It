import type { Content } from './validate.js';
import { STORY_STREAMS, type StoryAction, type Trigger } from './schemas/story.js';

/**
 * Story mode (docs/story/README.md 1): every id a story names exists (roles, cutscenes, quests, clues, items, scenes
 * and spawns, looks), chapters and beats are well-formed (no repeated beat id, every goal id used and defined), and the
 * seed words cover every stream so the story replays.
 */
export function checkStory(
  c: Pick<
    Content,
    'story' | 'roles' | 'cutscenes' | 'quests' | 'clues' | 'items' | 'scenes' | 'maps' | 'looks'
  >,
  err: (msg: string) => void,
): void {
  const sceneOf = (id: string) =>
    (c.scenes as Record<string, (typeof c.scenes)[keyof typeof c.scenes] | undefined>)[id];
  for (const [key, story] of Object.entries(c.story.stories)) {
    const at = `story.json ${key}`;
    if (key !== story.id) err(`${at}: key holds story ${story.id}`);
    const map = (c.maps as Record<string, (typeof c.maps)[keyof typeof c.maps] | undefined>)[story.mapId];
    if (!map) err(`${at}: unknown map ${story.mapId}`);

    for (const s of STORY_STREAMS) if (!(s in story.seedWords)) err(`${at}: seedWords lacks stream ${s}`);
    for (const s of Object.keys(story.seedWords))
      if (!(STORY_STREAMS as readonly string[]).includes(s))
        err(`${at}: seedWords names unknown stream ${s}`);

    const chapterIds = new Set<string>();
    for (const [n, ch] of story.chapters.entries()) {
      const cat = `${at} chapter ${ch.id}`;
      if (chapterIds.has(ch.id)) err(`${cat}: repeated chapter id`);
      chapterIds.add(ch.id);
      if (!(ch.roleId in c.roles.roles)) err(`${cat}: unknown role ${ch.roleId}`);
      if (ch.look !== undefined && !(ch.look in c.looks.looks)) err(`${cat}: unknown look ${ch.look}`);
      const card = c.roles.roles[ch.roleId];
      if (card && ch.look === undefined && card.look == null)
        err(`${cat}: card ${ch.roleId} has no world look, so the chapter needs a \`look\``);
      const prev = story.chapters[n - 1];
      if (prev && ch.startPhase.cycle < prev.startPhase.cycle)
        err(`${cat}: starts at cycle ${ch.startPhase.cycle}, before ${prev.id}`);

      const goalIds = new Set<string>();
      for (const g of ch.goals) {
        if (goalIds.has(g.id)) err(`${cat}: repeated goal ${g.id}`);
        goalIds.add(g.id);
        if (g.trigger) checkTrigger(g.trigger, `${cat} goal ${g.id}`, ch.roleId);
      }

      const beatIds = new Set<string>();
      const completed = new Set<string>();
      for (const b of ch.beats) {
        const bat = `${cat} beat ${b.id}`;
        if (beatIds.has(b.id)) err(`${bat}: repeated beat id`);
        beatIds.add(b.id);
        checkTrigger(b.trigger, bat, ch.roleId);
        checkAction(b.action, bat, goalIds, completed);
      }
      for (const g of ch.goals)
        if (!g.trigger && !completed.has(g.id))
          err(`${cat}: goal ${g.id} has no trigger and no beat completes it`);
      checkTrigger(ch.end.trigger, `${cat} end`, ch.roleId);
      for (const h of ch.handOn ?? []) {
        const ok =
          h.kind === 'item' ? h.ref in c.items.items : h.kind === 'lead' ? h.ref in c.clues.clues : true;
        if (!ok) err(`${cat}: handOn ${h.kind} ${h.ref} does not exist`);
      }
    }
  }

  function checkTrigger(t: Trigger, at: string, roleId: string): void {
    if ('all' in t) t.all.forEach((x) => checkTrigger(x, at, roleId));
    else if ('any' in t) t.any.forEach((x) => checkTrigger(x, at, roleId));
    else if ('event' in t && t.seat !== undefined && t.seat !== 'player' && !(t.seat in c.roles.roles))
      err(`${at}: trigger seat ${t.seat} is neither "player" nor a role id`);
  }

  function checkAction(a: StoryAction, at: string, goals: Set<string>, completed: Set<string>): void {
    if ('seq' in a) a.seq.forEach((x) => checkAction(x, at, goals, completed));
    else if ('card' in a) {
      if (a.goal !== undefined) {
        completed.add(a.goal);
        if (!goals.has(a.goal)) err(`${at}: card names unknown goal ${a.goal}`);
      }
      if (a.portrait !== undefined && a.portrait !== 'villager' && !(a.portrait in c.looks.looks))
        err(`${at}: unknown portrait look ${a.portrait}`);
    } else if ('cutscene' in a) {
      if (!(a.cutscene in c.cutscenes.cutscenes)) err(`${at}: unknown cutscene ${a.cutscene}`);
    } else if ('questStep' in a) {
      if (!(a.questStep.quest in c.quests.quests)) err(`${at}: unknown quest ${a.questStep.quest}`);
    } else if ('npcOrder' in a) {
      if (!(a.npcOrder.npcId in c.roles.roles)) err(`${at}: npcOrder names unknown role ${a.npcOrder.npcId}`);
    } else if ('spawn' in a) {
      const { kind, at: where } = a.spawn;
      if (!(kind in c.clues.clues) && !(kind in c.items.items))
        err(`${at}: spawn kind ${kind} is no clue or item`);
      const [sceneId, spawnId] = where.split(':') as [string, string | undefined];
      const scene = sceneOf(sceneId);
      if (!scene) err(`${at}: spawn at unknown scene ${sceneId}`);
      else if (spawnId !== undefined && !scene.spawns.some((s) => s.id === spawnId))
        err(`${at}: scene ${sceneId} has no spawn ${spawnId}`);
    }
  }
}

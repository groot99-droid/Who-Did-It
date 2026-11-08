import type { Content } from './validate.js';
import { type ArcAction, type Section, STORY_STREAMS, type Trigger } from './schemas/story.js';
import { storyCoverage } from './storyPlays.js';

/**
 * Story mode (docs/story/README.md 1, docs/story/arc.md 5): every id a story names exists (roles, vendettas, cutscenes,
 * quests, clues, items, scenes and spawns, looks), chapters and sections are well-formed (ids unique across the story,
 * no repeated beat id, every goal id used and defined, time never runs backwards), a chapter's cast holds what its
 * sections need, the seed words cover every stream so the story replays, and a story marked `full` gives every card of
 * roles.json a part.
 */
export function checkStory(
  c: Pick<
    Content,
    | 'storyArc'
    | 'roles'
    | 'cutscenes'
    | 'quests'
    | 'clues'
    | 'items'
    | 'scenes'
    | 'maps'
    | 'looks'
    | 'vendettas'
  >,
  err: (msg: string) => void,
): void {
  const sceneOf = (id: string) =>
    (c.scenes as Record<string, (typeof c.scenes)[keyof typeof c.scenes] | undefined>)[id];
  for (const [key, story] of Object.entries(c.storyArc.stories)) {
    const at = `story.json ${key}`;
    if (key !== story.id) err(`${at}: key holds story ${story.id}`);
    const map = (c.maps as Record<string, (typeof c.maps)[keyof typeof c.maps] | undefined>)[story.mapId];
    if (!map) err(`${at}: unknown map ${story.mapId}`);

    for (const s of STORY_STREAMS) if (!(s in story.seedWords)) err(`${at}: seedWords lacks stream ${s}`);
    for (const s of Object.keys(story.seedWords))
      if (!(STORY_STREAMS as readonly string[]).includes(s))
        err(`${at}: seedWords names unknown stream ${s}`);

    const ids = new Set<string>();
    const unique = (id: string, where: string) => {
      if (ids.has(id)) err(`${where}: id ${id} is used twice in the story`);
      ids.add(id);
    };
    let lastCycle = 0;
    let lastId = '';
    for (const ch of story.chapters) {
      const cat = `${at} chapter ${ch.id}`;
      unique(ch.id, cat);
      const cast = ch.cast === undefined ? null : new Set(ch.cast);
      for (const r of ch.cast ?? []) if (!(r in c.roles.roles)) err(`${cat}: cast names unknown role ${r}`);
      if (ch.cast && ch.cast.length > story.roster.npcCount + 1)
        err(`${cat}: cast of ${ch.cast.length} does not fit ${story.roster.npcCount + 1} seats`);

      for (const [n, s] of ch.sections.entries()) {
        const sat = `${at} section ${s.id}`;
        unique(s.id, sat);
        checkSection(s, sat, cast, story.mapId, map?.scenes);
        if (s.endCard && n === ch.sections.length - 1)
          err(`${sat}: the last section of a chapter shows the chapter's end card, not its own`);
        const phase = s.startPhase ?? (n === 0 ? ch.startPhase : undefined);
        if (phase) {
          if (phase.cycle < lastCycle) err(`${sat}: starts at cycle ${phase.cycle}, before ${lastId}`);
          lastCycle = phase.cycle;
          lastId = s.id;
        }
      }
    }

    if (story.full) {
      const missing = storyCoverage(story, c.roles);
      if (missing.length > 0)
        err(`${at}: is marked full but these cards have no section and no line: ${missing.join(', ')}`);
    }
  }

  function checkSection(
    s: Section,
    sat: string,
    cast: Set<string> | null,
    mapId: string,
    mapScenes: readonly string[] | undefined,
  ): void {
    const card = c.roles.roles[s.roleId];
    if (!card) err(`${sat}: unknown role ${s.roleId}`);
    else if (cast && !cast.has(s.roleId)) err(`${sat}: card ${s.roleId} is not in the chapter's cast`);
    if (s.look !== undefined && !(s.look in c.looks.looks)) err(`${sat}: unknown look ${s.look}`);
    if (card && s.look === undefined && card.look == null)
      err(`${sat}: card ${s.roleId} has no world look, so the section needs a \`look\``);

    for (const [field, id] of [
      ['vendetta', s.vendetta],
      ['npcVendetta', s.npcVendetta],
    ] as const) {
      if (id === undefined) continue;
      const v = c.vendettas.vendettas[id];
      if (!v) {
        err(`${sat}: unknown ${field} ${id}`);
        continue;
      }
      // The Hitman's row reaches a seat by the mail, on the card it already holds (GDD 3.33); every other row is
      // held on its own card, and the NPC's is always the Killer card's.
      const holder = field === 'npcVendetta' ? v.role : s.roleId;
      if (field === 'vendetta' && v.arrival) {
        if (card && (card.cover || card.faction === 'cabal' || s.roleId === 'thief'))
          err(`${sat}: the mail never turns a ${s.roleId} card, so it cannot hold ${id}`);
      } else if (v.role !== holder) err(`${sat}: vendetta ${id} belongs to card ${v.role}, not ${holder}`);
      if (v.maps && !(v.maps as readonly string[]).includes(mapId))
        err(`${sat}: vendetta ${id} does not run on this map`);
      if (v.needsScene && mapScenes && !mapScenes.includes(v.needsScene))
        err(`${sat}: vendetta ${id} needs scene ${v.needsScene}`);
      if (v.needsCard && cast && !cast.has(v.needsCard))
        err(`${sat}: vendetta ${id} needs card ${v.needsCard} in the chapter's cast`);
    }
    if (s.hitman) {
      if (s.vendetta === undefined || !c.vendettas.vendettas[s.vendetta]?.arrival)
        err(`${sat}: \`hitman\` needs the section's vendetta to be the mail's`);
      if (!(s.hitman.mark in c.roles.roles)) err(`${sat}: hitman mark is unknown role ${s.hitman.mark}`);
      else if (cast && !cast.has(s.hitman.mark))
        err(`${sat}: hitman mark ${s.hitman.mark} is not in the cast`);
    }

    const goalIds = new Set<string>();
    for (const g of s.goals) {
      if (goalIds.has(g.id)) err(`${sat}: repeated goal ${g.id}`);
      goalIds.add(g.id);
      if (g.trigger) checkTrigger(g.trigger, `${sat} goal ${g.id}`);
    }
    const beatIds = new Set<string>();
    const completed = new Set<string>();
    for (const b of s.beats) {
      const bat = `${sat} beat ${b.id}`;
      if (beatIds.has(b.id)) err(`${bat}: repeated beat id`);
      beatIds.add(b.id);
      checkTrigger(b.trigger, bat);
      checkAction(b.action, bat, goalIds, completed, cast);
    }
    for (const g of s.goals)
      if (!g.trigger && !completed.has(g.id))
        err(`${sat}: goal ${g.id} has no trigger and no beat completes it`);
    checkTrigger(s.end, `${sat} end`);
    if (s.startWhen) checkTrigger(s.startWhen, `${sat} startWhen`);
    for (const h of s.handOn ?? []) {
      const ok =
        h.kind === 'item' ? h.ref in c.items.items : h.kind === 'lead' ? h.ref in c.clues.clues : true;
      if (!ok) err(`${sat}: handOn ${h.kind} ${h.ref} does not exist`);
    }
  }

  function checkTrigger(t: Trigger, at: string): void {
    if ('all' in t) t.all.forEach((x) => checkTrigger(x, at));
    else if ('any' in t) t.any.forEach((x) => checkTrigger(x, at));
    else if ('event' in t && t.seat !== undefined && t.seat !== 'player' && !(t.seat in c.roles.roles))
      err(`${at}: trigger seat ${t.seat} is neither "player" nor a role id`);
  }

  function checkPortrait(portrait: string | undefined, at: string): void {
    if (portrait !== undefined && portrait !== 'villager' && !(portrait in c.looks.looks))
      err(`${at}: unknown portrait look ${portrait}`);
  }

  function checkAction(
    a: ArcAction,
    at: string,
    goals: Set<string>,
    completed: Set<string>,
    cast: Set<string> | null,
  ): void {
    const goal = (g: string | undefined) => {
      if (g === undefined) return;
      completed.add(g);
      if (!goals.has(g)) err(`${at}: names unknown goal ${g}`);
    };
    if ('seq' in a) a.seq.forEach((x) => checkAction(x, at, goals, completed, cast));
    else if ('say' in a) {
      goal(a.say.goal);
      checkPortrait(a.say.portrait, at);
      const by = a.say.by;
      if (by !== undefined && !(by in c.roles.roles)) err(`${at}: say by unknown role ${by}`);
      else if (by !== undefined && cast && !cast.has(by)) err(`${at}: say by ${by}, who is not in the cast`);
    } else if ('card' in a) {
      goal(a.goal);
      checkPortrait(a.portrait, at);
    } else if ('cutscene' in a) {
      if (!(a.cutscene in c.cutscenes.cutscenes)) err(`${at}: unknown cutscene ${a.cutscene}`);
    } else if ('questStep' in a) {
      if (!(a.questStep.quest in c.quests.quests)) err(`${at}: unknown quest ${a.questStep.quest}`);
    } else if ('npcOrder' in a) {
      if (!(a.npcOrder.npcId in c.roles.roles)) err(`${at}: npcOrder names unknown role ${a.npcOrder.npcId}`);
      const { order, args } = a.npcOrder;
      if (order !== 'goTo') err(`${at}: npcOrder ${order} is not an order (only goTo)`);
      else {
        const sceneId = args?.scene;
        const scene = typeof sceneId === 'string' ? sceneOf(sceneId) : undefined;
        if (!scene) err(`${at}: npcOrder goTo needs args.scene, a scene id (got ${String(sceneId)})`);
        else if (args?.spawn !== undefined && !scene.spawns.some((s) => s.id === args.spawn))
          err(`${at}: scene ${String(sceneId)} has no spawn ${String(args.spawn)}`);
      }
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

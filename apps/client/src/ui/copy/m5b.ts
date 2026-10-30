// UI.md 14.19 gathering, crafting, quests and the station mini-games (Session 6I, round 6). Item, resource and recipe
// names come from `items.json`; quest lines are keyed by the `copyId` of `quests.json` (`quest.<id>`, offer line;
// `quest.<id>.done`, the thanks). A screen reads its lines from here, never from a literal.
export const M5B_COPY = {
  // 14.19.1 Hold prompts (beside the Hold E clue prompt of 14.1)
  'prompt.gather': 'Hold E: gather {what}',
  'prompt.gather.tool': 'Gather {what} (needs {tool})', // greyed (round 10, 10Y; UI.md 14.51)
  'prompt.gather.cancel': 'Release to stop',
  'prompt.giver': 'Press E: speak to {name}',
  'toast.gather.cancel': 'You stopped gathering.',
  'toast.craft.cancel': 'You stopped crafting.',
  'toast.gather.done': 'Gathered {what}.',
  'toast.craft.done': 'Made {what}.',
  'toast.quest.taken': 'Quest taken: {title}',
  'toast.quest.done': 'Quest done: {title}',

  // 14.19.2 Inventory
  'inv.title': 'Pockets',
  'inv.key': 'I',
  'inv.empty': 'Nothing in your pockets.',
  'inv.slots': '{n} of {max} slots',
  'inv.light.on': 'Light',
  'inv.light.off': 'Douse',
  'inv.close': 'Close',
  // 14.44 The inventory screen and the crafting square (A13, round 10)
  'inv.hotbar': 'Hotbar',
  'inv.pack': 'Pack',
  'inv.belt': 'Belt',
  'inv.head': 'Head',
  'inv.body': 'Body',
  'inv.weapon': 'Weapon',
  'inv.pick': 'Pick a stack, then a slot that takes it.',
  'hotbar.label': 'Hotbar',
  'grid.title': 'Craft',
  'grid.size2': '2 by 2',
  'grid.size3': '3 by 3 (workbench)',
  'grid.hint': 'Pick a stack, then a square. Take what comes out.',
  'grid.bound': 'That stays with you. It cannot be worked.',

  // 14.19.3 Crafting
  'craft.title': 'Craft',
  'craft.key': 'C',
  'craft.station': 'At the {station}',
  'craft.anywhere': 'Anywhere',
  'craft.square': 'To the square',
  'craft.make': 'Make',
  'craft.stop': 'Stop',
  'craft.need': 'Needs {list}',
  'craft.ready': 'Ready to make',
  'craft.close': 'Close',

  // 14.19.4 Quest log
  'quest.title': 'Quests',
  'quest.key': 'J',
  'quest.none': 'Nobody here has work for you.',
  'quest.giver': 'From {name}',
  'quest.wants': 'Wants {list}',
  'quest.reward': 'Pays {list}',
  'quest.accept': 'Take the work',
  'quest.turnin': 'Hand it in',
  'quest.taken': 'Taken',
  'quest.done': 'Done',
  'quest.progress': '{have} of {total}',
  'quest.full': 'Your hands are full of work.',
  'quest.close': 'Close',
  'quest.here': 'Here',
  'quest.log': 'Your work',

  // 14.19.5 Quest lines, by `quests.json` copy id
  'quest.caulkTheSkiff':
    'The skiff leaks. Bring me resin and a plank of timber and I will lend you a lantern.',
  'quest.caulkTheSkiff.done': 'Tight as a drum. Mind the dark with that.',
  'quest.mollsHerbs': "Four sprigs of herb, dear. The fog is in everyone's chest.",
  'quest.mollsHerbs.done': 'There. A bandage for your trouble.',
  'quest.mollsMushrooms': 'Three mushrooms from the deep wood, and I will pay in salts.',
  'quest.mollsMushrooms.done': 'Sharp eyes. Take the salts.',
  'quest.mollsBrew': 'Come, help me brew. Two herb, two mushroom, and I will bind you a pair of bandages.',
  'quest.mollsBrew.done': 'Two bandages, wrapped. Mind the fog.',
  'quest.stackTheYard': 'Four lengths of timber for the yard stack, and the crowbar is yours.',
  'quest.stackTheYard.done': 'Square as a church. Pry carefully.',
  'quest.smithsOre': 'Three tin ore from the seam. I will make you a lantern for it.',
  'quest.smithsOre.done': 'Good ore. This burns bright.',
  'quest.smithsTemper': 'Two more ore and a length of timber, and I will temper you a hammer.',
  'quest.smithsTemper.done': 'Tempered, and still warm. Mind the head.',
  'quest.colliersStone': 'Three good stones for the clamp, and take a torch with you.',
  'quest.colliersStone.done': 'It will hold. Keep that torch up.',

  // 14.19.6 Station mini-games (main mode)
  'mini.title': 'The work',
  'mini.fake': 'A show of work',
  'mini.assist': 'Done',
  'mini.assist.hint': 'Stuck? Finish up.',
  'mini.cancel': 'Step away',
  'mini.sent': 'Checking your work...',
} as const;

export type M5bCopyId = keyof typeof M5B_COPY;

/** The giver's line for a quest copy id, or the id itself when the content has a line the deck lacks. */
export function questLine(copyId: string, done = false): string {
  const key = (done ? `${copyId}.done` : copyId) as M5bCopyId;
  return M5B_COPY[key] ?? copyId;
}

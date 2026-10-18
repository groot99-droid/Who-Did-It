// UI.md 14.14 quick-mode night, morning and end lines (Session 5D, round 5). Ids are the deck's; the ONUB lines
// are prefixed `onub.` so they never collide with a main-mode module (onub-contract.md 8). Names come from
// content (`roles.onub.json`, `balance.onub.json`) and are never restated here. `{key}` values are filled by the
// caller with `fill()`.
export const ONUB_NIGHT_COPY = {
  // The night
  'onub.night.caption': 'The kitchen is dark. Keep your eyes shut.',
  'onub.night.waiting': 'The night shift has not been called yet.',
  'onub.night.clock': 'Window closes in {s} s',
  'onub.night.slot.seatRole': "{name}'s Role card",
  'onub.night.slot.seatLoc': "{name}'s Location card",
  'onub.night.slot.pantryRole': 'Pantry Role card {n}',
  'onub.night.slot.pantryLoc': 'Pantry Location card {n}',
  'onub.night.slot.you': 'You',

  // The role scene
  'onub.wake.title': 'You wake as {role}',
  'onub.wake.mates': 'You see: {names}',
  'onub.wake.seen': 'The Spores are: {names}',
  'onub.wake.alone.champignon': 'You are the only Spore at the table. The other card lies in the Pantry.',
  'onub.wake.alone.commis': 'You are the only Commis at the table. The other lies in the Pantry.',
  'onub.wake.nothing': 'Nothing to do but remember.',
  'onub.wake.must': 'You must act before the lamp dims.',
  'onub.wake.done': 'Done. Wait for the lamp to dim.',

  // The narrator, one pair per waking role
  'onub.narrator.boulanger.wake': 'Le Boulanger, réveillez-vous… posez la cloche de fonte.',
  'onub.narrator.boulanger.sleep': 'Le Boulanger, rendormez-vous.',
  'onub.narrator.champignon.wake': 'Les Champignons, réveillez-vous… reconnaissez-vous dans le noir.',
  'onub.narrator.champignon.sleep': 'Les Champignons, rendormez-vous.',
  'onub.narrator.levain.wake': 'Le Levain, réveillez-vous… comptez les spores.',
  'onub.narrator.levain.sleep': 'Le Levain, rendormez-vous.',
  'onub.narrator.apprenti.wake': "L'Apprenti, réveillez-vous… lisez le registre du poste.",
  'onub.narrator.apprenti.sleep': "L'Apprenti, rendormez-vous.",
  'onub.narrator.ratDeCave.wake': 'Le Rat de Cave, réveillez-vous… soulevez la grille.',
  'onub.narrator.ratDeCave.sleep': 'Le Rat de Cave, rendormez-vous.',
  'onub.narrator.commis.wake': 'Les Commis, réveillez-vous… cherchez votre vis-à-vis.',
  'onub.narrator.commis.sleep': 'Les Commis, rendormez-vous.',
  'onub.narrator.chef.wake': 'Le Chef de Cuisine, réveillez-vous… ouvrez les dossiers.',
  'onub.narrator.chef.sleep': 'Le Chef de Cuisine, rendormez-vous.',
  'onub.narrator.aboyeur.wake': "L'Aboyeur, réveillez-vous… regardez l'écran vert.",
  'onub.narrator.aboyeur.sleep': "L'Aboyeur, rendormez-vous.",
  'onub.narrator.sousChef.wake': 'Le Sous-Chef, réveillez-vous… sonnez la cloche de laiton.',
  'onub.narrator.sousChef.sleep': 'Le Sous-Chef, rendormez-vous.',
  'onub.narrator.tourrier.wake': 'Le Tourrier, réveillez-vous… repliez la recette.',
  'onub.narrator.tourrier.sleep': 'Le Tourrier, rendormez-vous.',
  'onub.narrator.plongeur.wake': 'Le Plongeur, réveillez-vous… rangez les casseroles.',
  'onub.narrator.plongeur.sleep': 'Le Plongeur, rendormez-vous.',
  'onub.narrator.gardeManger.wake': 'Le Garde Manger, réveillez-vous… rentrez du bon pied.',
  'onub.narrator.gardeManger.sleep': 'Le Garde Manger, rendormez-vous.',
  'onub.narrator.inspecteur.wake': "L'Inspecteur Sanitaire, réveillez-vous… dernière tournée.",
  'onub.narrator.inspecteur.sleep': "L'Inspecteur Sanitaire, rendormez-vous.",

  // Dawn
  'onub.dawn.title': 'Dawn',
  'onub.dawn.text': 'Grey light under the door. The night shift is over.',
  'onub.dawn.cloche': 'The Iron Cloche lies on {card}.',
  'onub.dawn.noCloche': 'No Iron Cloche was set down.',
} as const;

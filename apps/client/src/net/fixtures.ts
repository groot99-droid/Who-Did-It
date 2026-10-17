import type { LobbyPlayer, RoleRevealPayload } from './protocol';

/**
 * `?mock=1` fixtures. This is the receiving player's own card only, shaped like the
 * `roleReveal` payload of ARCHITECTURE 5.5. Cooldowns are 0 on purpose: balance numbers
 * live in `balance.json`, not here.
 */
export const MOCK_ROLE_REVEAL: RoleRevealPayload = {
  roleId: 'killer',
  team: 'cabal',
  goal: 'Outlast the village without being voted out.',
  abilities: [
    { id: 'kill', name: 'Kill', key: 'Q', cooldown: 0, uses: null },
    { id: 'killerLock', name: 'Lock door', key: 'R', cooldown: 0, uses: null },
    { id: 'dragBody', name: 'Drag body', key: 'F', cooldown: 0, uses: null },
  ],
  inventory: [
    { defId: 'knife', name: 'Knife', qty: 1, tooltip: 'Kill.' },
    { defId: 'bloodyRag', name: 'Bloody Rag', qty: 2, tooltip: 'Erase one clue.' },
  ],
  cardText:
    'Strike when the room is empty, clean one clue, wash at the well, then be the loudest voice asking who did it.',
  beware: 'Your clues match your traits.',
  teammates: [{ id: 'mock-ada', name: 'Ada' }],
  traits: { height: 'tall', scarf: 'green', hat: 'bowler' },
};

export const MOCK_BOTS: LobbyPlayer[] = [
  { id: 'mock-ada', name: 'Ada', ready: false, connected: true },
  { id: 'mock-bo', name: 'Bo', ready: false, connected: true },
  { id: 'mock-cy', name: 'Cy', ready: false, connected: true },
];

/** Names the mock gives the NPC seats the leader adds (the real pool is server-only, A39). */
export const MOCK_NPC_NAMES = ['Edda', 'Finn', 'Gil', 'Hob', 'Ivy', 'Jory', 'Kit', 'Lark'];

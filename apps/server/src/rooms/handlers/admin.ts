import type { PartyRoom } from '../PartyRoom';

/**
 * The `admin.*` handlers (round 6, docs/round6/auto-admin.md 6): each pushes an `AutoCommand` into
 * `autoOf(room).commands`, which `runAuto` applies inside the step; nothing mutates state here. Called from
 * `AdminRoom.onCreate` only, so a `party` room never has them. Pre-seeded by 6Z; Session 6C fills it.
 */
export function registerAdminHandlers(_room: PartyRoom): void {
  // 6C: room.onMessage(ADMIN_C2S.setup | start | reset | clock, ...) -> autoOf(room).commands.push(...)
}

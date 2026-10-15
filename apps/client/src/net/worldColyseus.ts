import mitt, { type Emitter } from 'mitt';
import type { Room } from '@colyseus/sdk';
import type {
  DoorSnap,
  MoveCmd,
  NoisePulse,
  PlayerSnap,
  PresenceSnap,
  SceneEnter,
  WorldFeed,
  WorldFeedEvents,
} from './world';

// Reads the live room. The state is the shared schema of @wdi/shared; the client keeps loose structural
// types here so it does not pull the schema runtime into the bundle.

type PresenceState = PresenceSnap;
interface PlayerState {
  id: string;
  name: string;
  traits: { height: number; scarf: number; hat: number };
  presence?: PresenceState;
}
interface SceneStateLike {
  doors: { forEach(cb: (door: DoorSnap, id: string) => void): void };
}
interface GameStateLike {
  tick: number;
  phase: number;
  phaseEndsTick: number;
  players: { forEach(cb: (p: PlayerState, id: string) => void): void };
  scenes: { forEach(cb: (s: SceneStateLike, id: string) => void): void };
}

export class ColyseusWorldFeed implements WorldFeed {
  readonly bus: Emitter<WorldFeedEvents> = mitt<WorldFeedEvents>();

  constructor(private readonly room: Room) {
    room.onMessage('sceneEnter', (m: SceneEnter) => this.bus.emit('sceneEnter', m));
    room.onMessage('noise', (m: NoisePulse) => this.bus.emit('noise', m));
  }

  /** The room this feed reads; the router compares it to spot a reconnect to a new room. */
  get sessionRoom(): Room {
    return this.room;
  }

  get selfId(): string {
    return this.room.sessionId;
  }

  private get state(): GameStateLike {
    return this.room.state as unknown as GameStateLike;
  }

  snapshot(): PlayerSnap[] {
    const out: PlayerSnap[] = [];
    this.state.players.forEach((p) => {
      const pr = p.presence;
      out.push({
        id: p.id,
        name: p.name,
        traits: { height: p.traits?.height ?? 0, scarf: p.traits?.scarf ?? 0, hat: p.traits?.hat ?? 0 },
        presence: pr
          ? {
              x: pr.x,
              y: pr.y,
              yaw: pr.yaw,
              animId: pr.animId,
              statusBits: pr.statusBits,
              transitUntilTick: pr.transitUntilTick,
            }
          : null,
      });
    });
    return out;
  }

  doors(): DoorSnap[] {
    const out: DoorSnap[] = [];
    // The view holds a single SceneState: the one this client is standing in.
    this.state.scenes.forEach((scene) =>
      scene.doors.forEach((d) => out.push({ id: d.id, state: d.state, swingUntilTick: d.swingUntilTick })),
    );
    return out;
  }

  clock() {
    const s = this.state;
    return { tick: s.tick, phase: s.phase, phaseEndsTick: s.phaseEndsTick };
  }

  sendMove(cmd: MoveCmd): void {
    this.room.send('input.move', cmd);
  }

  enterPortal(portalId: string): void {
    this.room.send('act.enterPortal', { portalId });
  }

  dispose(): void {
    this.bus.all.clear();
  }
}

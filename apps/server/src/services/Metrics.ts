/** Rolling tick-time and patch-size samples published through /health (ARCHITECTURE 5.6). */
export class Metrics {
  private readonly ticks: number[] = [];
  private patchBytes = 0;
  private rooms = 0;

  constructor(private readonly window = 600) {}

  recordTick(ms: number): void {
    this.ticks.push(ms);
    if (this.ticks.length > this.window) this.ticks.shift();
  }

  recordPatchBytes(bytes: number): void {
    this.patchBytes = bytes;
  }

  setRooms(n: number): void {
    this.rooms = n;
  }

  addRoom(delta: number): void {
    this.rooms += delta;
  }

  tickP95(): number {
    if (this.ticks.length === 0) return 0;
    const sorted = [...this.ticks].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] as number;
  }

  snapshot(build: string) {
    return {
      ok: true,
      build,
      rooms: this.rooms,
      tickP95: Number(this.tickP95().toFixed(3)),
      patchBytes: this.patchBytes,
    };
  }
}

export const metrics = new Metrics();

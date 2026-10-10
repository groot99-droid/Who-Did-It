/** Refilling token bucket. `now` is injectable so tests do not wait. */
export class TokenBucket {
  private tokens: number;
  private last: number;

  constructor(
    private readonly capacity: number,
    private readonly refillPerSec: number,
    now = Date.now(),
  ) {
    this.tokens = capacity;
    this.last = now;
  }

  take(now = Date.now()): boolean {
    this.tokens = Math.min(this.capacity, this.tokens + ((now - this.last) / 1000) * this.refillPerSec);
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

/** One bucket per key (a forwarded IP); idle full buckets are swept so the map cannot grow without bound. */
export class KeyedBuckets {
  private readonly buckets = new Map<string, TokenBucket>();

  constructor(
    private readonly capacity: number,
    private readonly refillPerSec: number,
    private readonly maxKeys = 10_000,
  ) {}

  take(key: string, now = Date.now()): boolean {
    let bucket = this.buckets.get(key);
    if (!bucket) {
      if (this.buckets.size >= this.maxKeys) this.buckets.clear();
      bucket = new TokenBucket(this.capacity, this.refillPerSec, now);
      this.buckets.set(key, bucket);
    }
    return bucket.take(now);
  }
}

// The seed words of a match's random streams, as the admin wire carries them (docs/round6/auto-admin.md 6). The
// server's `sim/seeds.ts` is the authority on the stream names; this is the wire's loose mirror, so a replay can
// name any stream without the shared package importing the server.
export type SeedWords = readonly [number, number, number, number];
export type FixedSeeds = Partial<Record<string, SeedWords>>;

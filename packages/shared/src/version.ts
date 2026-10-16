// Injected on both sides (ARCHITECTURE 5.10). Server: BUILD_VERSION env, or the first 8 characters of
// the commit the host built (Railway's RAILWAY_GIT_COMMIT_SHA, Render's RENDER_GIT_COMMIT), so a plain
// GitHub deploy matches the Pages build of the same commit. Client: Vite's VITE_BUILD_VERSION.
const nodeEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
const viteEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
const hostCommit = nodeEnv?.RAILWAY_GIT_COMMIT_SHA || nodeEnv?.RENDER_GIT_COMMIT;

export const BUILD_VERSION: string =
  nodeEnv?.BUILD_VERSION ||
  (hostCommit ? hostCommit.slice(0, 8) : '') ||
  viteEnv?.VITE_BUILD_VERSION ||
  'dev';

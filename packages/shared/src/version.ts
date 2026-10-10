// Injected on both sides (ARCHITECTURE 5.10). Server: BUILD_VERSION env. Client: Vite's VITE_BUILD_VERSION.
const nodeEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
const viteEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;

export const BUILD_VERSION: string = nodeEnv?.BUILD_VERSION || viteEnv?.VITE_BUILD_VERSION || 'dev';

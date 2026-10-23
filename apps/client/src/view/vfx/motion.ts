/**
 * Round 8 (8G, motion.md): whether the player asked for reduced motion. Every creature, node, effect and transport
 * animation reads it: a movement becomes a cut or a single held frame, a flash a static mark.
 */
export function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

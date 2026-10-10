import { z } from 'zod';

export const StyleFile = z.strictObject({
  source: z.literal('docs/ASSETS.md 6.4, 6.9'),
  styleFormula: z.string().min(1),
  styleToken: z.string().min(1).max(120),
});
export type StyleFile = z.infer<typeof StyleFile>;

import { z } from "zod";
import { GddRef, Id, PrefixedId, Seconds, Ships, Tiles, WorldId } from "./common.js";

const Node = z.strictObject({ scene: WorldId, prop: PrefixedId });

export const Task = z.strictObject({
  id: Id,
  name: z.string().min(1),
  kind: z.enum(["fetch", "coop"]),
  /** Item fetched from `source` and delivered to one of `targets` (fetch tasks). */
  tool: Id.optional(),
  toolQty: z.number().int().positive().optional(),
  source: Node.optional(),
  /** Candidate nodes; the server picks one per task instance by seed. */
  targets: z.array(Node).min(1),
  /** Hold E at the target node. */
  holdS: Seconds,
  /** Co-op: every participant within this radius holding E; progress pauses on release. */
  coopPlayers: z.number().int().min(2).optional(),
  coopRadiusTiles: Tiles.optional(),
  nightOnly: z.boolean(),
  effect: z.string().min(1),
  ships: Ships,
  gddRef: GddRef,
});
export type Task = z.infer<typeof Task>;

export const TasksFile = z.strictObject({
  gddRef: GddRef,
  tasks: z.record(Id, Task),
});
export type TasksFile = z.infer<typeof TasksFile>;

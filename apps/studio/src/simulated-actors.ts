/** Principal identifiers used only by the local Studio evaluator. */
export const SimulatedActor = {
  Author: "author",
  Reviewer: "reviewer",
} as const;
export type SimulatedActor = (typeof SimulatedActor)[keyof typeof SimulatedActor];

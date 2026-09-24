import { SimulatedActor } from "../simulated-actors";
import { createGrant, FoldRole, ReviewMode } from "@lorekind/core";
import type { EditorialWorkspace, WorkflowContext } from "@lorekind/core";

export function evaluationContext(app: EditorialWorkspace, principalId: string): WorkflowContext {
  return {
    foldId: app.profile.id,
    principalId,
    grants: [
      createGrant({
        id: "author",
        principalId: SimulatedActor.Author,
        foldId: app.profile.id,
        role: FoldRole.Creator,
      }),
      createGrant({
        id: "curation",
        principalId: SimulatedActor.Reviewer,
        foldId: app.profile.id,
        role: FoldRole.Curator,
      }),
      createGrant({
        id: "reviewer",
        principalId: SimulatedActor.Reviewer,
        foldId: app.profile.id,
        role: FoldRole.Publisher,
      }),
    ],
    delegations: [],
    policy: { mode: ReviewMode.Independent, requiredApprovals: 1 },
    policyRevision: "evaluation-independent-1",
    schemaRevision: app.profile.schemaRevision,
    targetRevision: "loaded-by-application",
    now: new Date(),
  };
}

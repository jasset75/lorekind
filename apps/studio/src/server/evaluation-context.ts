import { createGrant } from "@lorekind/core";
import type { EditorialWorkspace, WorkflowContext } from "@lorekind/core";

export function evaluationContext(app: EditorialWorkspace, principalId: string): WorkflowContext {
  return {
    foldId: app.profile.id,
    principalId,
    grants: [
      createGrant({ id: "author", principalId: "author", foldId: app.profile.id, role: "creator" }),
      createGrant({
        id: "curation",
        principalId: "reviewer",
        foldId: app.profile.id,
        role: "curator",
      }),
      createGrant({
        id: "reviewer",
        principalId: "reviewer",
        foldId: app.profile.id,
        role: "publisher",
      }),
    ],
    delegations: [],
    policy: { mode: "independent", requiredApprovals: 1 },
    policyRevision: "evaluation-independent-1",
    schemaRevision: app.profile.schemaRevision,
    targetRevision: "loaded-by-application",
    now: new Date(),
  };
}

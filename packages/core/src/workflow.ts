import { authorize } from "./authorization";
import type { Capability, Delegation, FoldGrant, ReviewPolicy } from "./authorization";

export type ContributionState =
  "Draft" | "InReview" | "Approved" | "Dismissed" | "Publishing" | "Applied" | "PublicationFailed";

export type CanonicalState = "Unpublished" | "Published" | "Withdrawn";

/** Opaque provider identifiers; only equality has domain meaning. */
export interface ReviewScope {
  readonly contentRevision: string;
  readonly schemaRevision: string;
  readonly policyRevision: string;
  readonly targetRevision: string;
}

export interface EditorialIdentity {
  readonly principalId: string;
  readonly grantId: string;
  readonly delegationId?: string;
  readonly agentId?: string;
}

export interface Approval {
  readonly kind: "review" | "direct";
  readonly scope: ReviewScope;
  readonly identity: EditorialIdentity;
}

export interface Contribution {
  readonly formatVersion: 1;
  readonly id: string;
  readonly foldId: string;
  readonly authorPrincipalId: string;
  readonly intent: "publish" | "withdraw";
  readonly state: ContributionState;
  /** Conditional persistence of this version is required; a reducer alone is not a lock. */
  readonly version: number;
  readonly scope: ReviewScope;
  readonly approvals: readonly Approval[];
  readonly publicationAttemptId?: string;
}

/** All values must be loaded/verified server-side, outside the command payload. */
export interface WorkflowContext {
  readonly foldId: string;
  readonly principalId: string;
  readonly grants: readonly FoldGrant[];
  readonly delegations: readonly Delegation[];
  readonly delegationId?: string;
  readonly policy: ReviewPolicy;
  readonly policyRevision: string;
  readonly schemaRevision: string;
  readonly targetRevision: string;
  readonly now: Date;
}

export type WorkflowCommand = {
  readonly expectedVersion: number;
} & (
  | { readonly action: "submit" | "approve" | "authorize-direct" | "dismiss" | "restore" }
  | { readonly action: "revise"; readonly contentRevision: string }
  | { readonly action: "publish"; readonly attemptId: string }
);

export interface Transition {
  readonly contribution: Contribution;
  readonly audit: {
    readonly action: WorkflowCommand["action"] | "create";
    readonly identity: EditorialIdentity;
    readonly contributionId: string;
    readonly foldId: string;
    readonly version: number;
    readonly scope: ReviewScope;
    readonly at: string;
  };
}

export type WorkflowResult =
  | { readonly ok: true; readonly value: Transition }
  | {
      readonly ok: false;
      readonly error:
        | "forbidden"
        | "conflict"
        | "invalid-transition"
        | "invalid-input"
        | "approval-required"
        | "stale-review";
    };

function sameScope(a: ReviewScope, b: ReviewScope): boolean {
  return (
    a.contentRevision === b.contentRevision &&
    a.schemaRevision === b.schemaRevision &&
    a.policyRevision === b.policyRevision &&
    a.targetRevision === b.targetRevision
  );
}

function scopeFor(contentRevision: string, context: WorkflowContext): ReviewScope {
  return {
    contentRevision,
    schemaRevision: context.schemaRevision,
    policyRevision: context.policyRevision,
    targetRevision: context.targetRevision,
  };
}

function identityFor(
  contribution: Contribution,
  context: WorkflowContext,
  capability: Capability,
): EditorialIdentity | undefined {
  if (context.foldId !== contribution.foldId) return undefined;
  const delegation = context.delegations.find((item) => item.id === context.delegationId);
  if (context.delegationId !== undefined && delegation === undefined) return undefined;
  const decision = authorize(context.grants, {
    principalId: context.principalId,
    foldId: context.foldId,
    capability,
    resourceId: contribution.id,
    contribution,
    policy: context.policy,
    now: context.now,
    ...(delegation === undefined ? {} : { delegation }),
  });
  if (!decision.allowed) return undefined;
  return {
    principalId: context.principalId,
    grantId: decision.grantId,
    ...(delegation === undefined
      ? {}
      : { delegationId: delegation.id, agentId: delegation.agentId }),
  };
}

function approvalIsCurrent(
  approval: Approval,
  contribution: Contribution,
  context: WorkflowContext,
): boolean {
  if (!sameScope(approval.scope, scopeFor(contribution.scope.contentRevision, context)))
    return false;
  if ((context.policy.mode === "direct") !== (approval.kind === "direct")) return false;
  const { delegationId, agentId } = approval.identity;
  if (
    delegationId !== undefined &&
    !context.delegations.some((item) => item.id === delegationId && item.agentId === agentId)
  )
    return false;
  const { delegationId: callerDelegationId, ...trustedContext } = context;
  void callerDelegationId;
  const identity = identityFor(
    contribution,
    {
      ...trustedContext,
      principalId: approval.identity.principalId,
      grants: context.grants.filter((grant) => grant.id === approval.identity.grantId),
      // Explicitly remove the calling actor's delegation when rechecking another actor.
      ...(delegationId === undefined ? {} : { delegationId }),
    },
    approval.kind === "direct" ? "entry:publish" : "entry:review",
  );
  return identity !== undefined;
}

function hasApprovals(approvals: readonly Approval[], policy: ReviewPolicy): boolean {
  return policy.mode === "direct"
    ? approvals.some((item) => item.kind === "direct")
    : new Set(
        approvals.filter((item) => item.kind === "review").map((item) => item.identity.principalId),
      ).size >= policy.requiredApprovals;
}

function success(
  contribution: Contribution,
  action: Transition["audit"]["action"],
  identity: EditorialIdentity,
  now: Date,
): WorkflowResult {
  return {
    ok: true,
    value: {
      contribution,
      audit: {
        action,
        identity,
        contributionId: contribution.id,
        foldId: contribution.foldId,
        version: contribution.version,
        scope: contribution.scope,
        at: now.toISOString(),
      },
    },
  };
}

export function createDraft(
  input: {
    readonly id: string;
    readonly contentRevision: string;
    readonly intent: Contribution["intent"];
  },
  context: WorkflowContext,
): WorkflowResult {
  const scope = scopeFor(input.contentRevision, context);
  if (!input.id || Object.values(scope).some((value) => !value))
    return { ok: false, error: "invalid-input" };
  const contribution: Contribution = {
    formatVersion: 1,
    id: input.id,
    foldId: context.foldId,
    authorPrincipalId: context.principalId,
    intent: input.intent,
    state: "Draft",
    version: 0,
    scope,
    approvals: [],
  };
  const identity = identityFor(contribution, context, "entry:create");
  return identity === undefined
    ? { ok: false, error: "forbidden" }
    : success(contribution, "create", identity, context.now);
}

/** Pure decision. Persist the returned contribution and audit together using compare-and-swap. */
export function transitionContribution(
  contribution: Contribution,
  command: WorkflowCommand,
  context: WorkflowContext,
): WorkflowResult {
  const capability: Capability =
    command.action === "approve"
      ? "entry:review"
      : command.action === "publish" || command.action === "authorize-direct"
        ? "entry:publish"
        : command.action === "submit"
          ? "entry:submit"
          : (command.action === "dismiss" || command.action === "restore") &&
              contribution.authorPrincipalId !== context.principalId
            ? "entry:dismiss"
            : "entry:edit-own";
  const identity = identityFor(contribution, context, capability);
  if (identity === undefined) return { ok: false, error: "forbidden" };
  if (command.expectedVersion !== contribution.version) return { ok: false, error: "conflict" };
  const currentScope = scopeFor(contribution.scope.contentRevision, context);
  const currentApprovals = contribution.approvals.filter((item) =>
    approvalIsCurrent(item, contribution, context),
  );
  let state = contribution.state;
  let scope = contribution.scope;
  let approvals = currentApprovals;
  let publicationAttemptId: string | undefined;
  switch (command.action) {
    case "revise":
      if (!["Draft", "InReview", "Approved", "PublicationFailed"].includes(state))
        return { ok: false, error: "invalid-transition" };
      if (!command.contentRevision) return { ok: false, error: "invalid-input" };
      scope = scopeFor(command.contentRevision, context);
      approvals = [];
      state = "Draft";
      break;
    case "submit":
      if (state !== "Draft" || context.policy.mode !== "independent")
        return { ok: false, error: "invalid-transition" };
      if (!sameScope(scope, currentScope)) return { ok: false, error: "stale-review" };
      state = "InReview";
      break;
    case "approve":
    case "authorize-direct": {
      const direct = command.action === "authorize-direct";
      if (
        direct
          ? state !== "Draft" || context.policy.mode !== "direct"
          : state !== "InReview" || context.policy.mode !== "independent"
      )
        return { ok: false, error: "invalid-transition" };
      if (!sameScope(scope, currentScope)) return { ok: false, error: "stale-review" };
      approvals = [
        ...currentApprovals.filter((item) => item.identity.principalId !== identity.principalId),
        { kind: direct ? "direct" : "review", scope, identity },
      ];
      state = hasApprovals(approvals, context.policy) ? "Approved" : "InReview";
      break;
    }
    case "publish":
      if (state !== "Approved" && state !== "PublicationFailed")
        return { ok: false, error: "invalid-transition" };
      if (!sameScope(scope, currentScope)) return { ok: false, error: "stale-review" };
      if (!hasApprovals(currentApprovals, context.policy))
        return { ok: false, error: "approval-required" };
      if (!command.attemptId || command.attemptId === contribution.publicationAttemptId)
        return { ok: false, error: "invalid-input" };
      publicationAttemptId = command.attemptId;
      state = "Publishing";
      break;
    case "dismiss":
      if (!["Draft", "InReview", "Approved", "PublicationFailed"].includes(state))
        return { ok: false, error: "invalid-transition" };
      state = "Dismissed";
      approvals = [];
      break;
    case "restore":
      if (state !== "Dismissed") return { ok: false, error: "invalid-transition" };
      state = "Draft";
      approvals = [];
      scope = currentScope;
      break;
    default:
      return { ok: false, error: "invalid-input" };
  }
  const { publicationAttemptId: previousAttempt, ...base } = contribution;
  void previousAttempt;
  return success(
    {
      ...base,
      state,
      scope,
      approvals,
      version: contribution.version + 1,
      ...(publicationAttemptId === undefined ? {} : { publicationAttemptId }),
    },
    command.action,
    identity,
    context.now,
  );
}

/** Internal provider reconciliation only; never expose as an editorial client command. */
export function reconcilePublication(
  contribution: Contribution,
  result: {
    readonly expectedVersion: number;
    readonly attemptId: string;
    readonly scope: ReviewScope;
    readonly outcome: "applied" | "failed" | "unknown";
  },
):
  | { readonly ok: true; readonly contribution: Contribution }
  | { readonly ok: false; readonly error: "conflict" } {
  if (
    contribution.state !== "Publishing" ||
    result.expectedVersion !== contribution.version ||
    result.attemptId !== contribution.publicationAttemptId ||
    !sameScope(result.scope, contribution.scope)
  )
    return { ok: false, error: "conflict" };
  return {
    ok: true,
    contribution:
      result.outcome === "unknown"
        ? contribution
        : {
            ...contribution,
            state: result.outcome === "applied" ? "Applied" : "PublicationFailed",
            version: contribution.version + 1,
          },
  };
}

export const capabilities = [
  "entry:create",
  "entry:edit-own",
  "entry:dismiss",
  "entry:submit",
  "entry:review",
  "entry:publish",
  "grant:manage",
] as const;

export type Capability = (typeof capabilities)[number];

export type FoldRole = "creator" | "curator" | "publisher" | "admin";

export interface FoldDefinition {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
}

export interface FoldGrant {
  readonly id: string;
  readonly principalId: string;
  readonly foldId: string;
  readonly capabilities: readonly Capability[];
  readonly expiresAt?: Date;
  readonly revokedAt?: Date;
  readonly resourceIds?: readonly string[];
}

export interface ContributionContext {
  readonly authorPrincipalId: string;
}

export type ReviewPolicy =
  | { readonly mode: "direct" }
  | { readonly mode: "independent"; readonly requiredApprovals: number };

/** Loaded from a trusted identity/policy boundary, never from command JSON. */
export interface Delegation {
  readonly id: string;
  readonly principalId: string;
  readonly agentId: string;
  readonly foldId: string;
  readonly capabilities: readonly Capability[];
  readonly resourceIds?: readonly string[];
  readonly expiresAt: Date;
  readonly revokedAt?: Date;
}

export interface AuthorizationRequest {
  readonly principalId: string;
  readonly foldId: string;
  readonly capability: Capability;
  readonly now?: Date;
  readonly contribution?: ContributionContext;
  readonly resourceId?: string;
  readonly policy?: ReviewPolicy;
  readonly delegation?: Delegation;
}

export type AuthorizationDecision =
  | { readonly allowed: true; readonly grantId: string }
  | {
      readonly allowed: false;
      readonly reason:
        | "grant-missing"
        | "grant-expired"
        | "grant-revoked"
        | "capability-missing"
        | "resource-denied"
        | "self-approval"
        | "delegation-denied"
        | "invalid-context";
    };

export const roleCapabilities: Readonly<Record<FoldRole, readonly Capability[]>> = {
  creator: ["entry:create", "entry:edit-own", "entry:submit"],
  curator: ["entry:create", "entry:edit-own", "entry:submit", "entry:review", "entry:dismiss"],
  publisher: ["entry:review", "entry:publish"],
  admin: capabilities,
};

export function createGrant(input: {
  readonly id: string;
  readonly principalId: string;
  readonly foldId: string;
  readonly role: FoldRole;
  readonly expiresAt?: Date;
}): FoldGrant {
  return {
    id: input.id,
    principalId: input.principalId,
    foldId: input.foldId,
    capabilities: roleCapabilities[input.role],
    ...(input.expiresAt === undefined ? {} : { expiresAt: input.expiresAt }),
  };
}

export function authorize(
  grants: readonly FoldGrant[],
  request: AuthorizationRequest,
): AuthorizationDecision {
  const now = request.now ?? new Date();
  if (!Number.isFinite(now.getTime())) return { allowed: false, reason: "invalid-context" };
  const policy = request.policy ?? { mode: "independent", requiredApprovals: 1 };
  if (
    policy.mode === "independent" &&
    (!Number.isSafeInteger(policy.requiredApprovals) || policy.requiredApprovals < 1)
  )
    return { allowed: false, reason: "invalid-context" };

  const candidates = grants.filter(
    (grant) => grant.principalId === request.principalId && grant.foldId === request.foldId,
  );
  if (candidates.length === 0) return { allowed: false, reason: "grant-missing" };
  const unrevoked = candidates.filter((grant) => grant.revokedAt === undefined);
  if (unrevoked.length === 0) return { allowed: false, reason: "grant-revoked" };
  const active = unrevoked.filter(
    (grant) => grant.expiresAt === undefined || grant.expiresAt.getTime() > now.getTime(),
  );
  if (active.length === 0) return { allowed: false, reason: "grant-expired" };
  const capable = active.filter((grant) => grant.capabilities.includes(request.capability));
  if (capable.length === 0) return { allowed: false, reason: "capability-missing" };
  const grant = capable.find(
    (candidate) =>
      candidate.resourceIds === undefined ||
      (request.resourceId !== undefined && candidate.resourceIds.includes(request.resourceId)),
  );
  if (grant === undefined) return { allowed: false, reason: "resource-denied" };

  if (
    request.capability === "entry:submit" &&
    request.contribution !== undefined &&
    request.contribution.authorPrincipalId !== request.principalId
  ) {
    return { allowed: false, reason: "resource-denied" };
  }
  if (
    request.capability === "entry:edit-own" &&
    request.contribution?.authorPrincipalId !== request.principalId
  ) {
    return { allowed: false, reason: "resource-denied" };
  }
  if (request.capability === "entry:review" || request.capability === "entry:publish") {
    if (request.contribution === undefined) return { allowed: false, reason: "invalid-context" };
    // Publishing is allowed after independent approvals; the publisher need not be a reviewer.
    if (
      request.capability === "entry:review" &&
      policy.mode === "independent" &&
      request.contribution.authorPrincipalId === request.principalId
    ) {
      return { allowed: false, reason: "self-approval" };
    }
  }

  const delegation = request.delegation;
  if (
    delegation !== undefined &&
    (delegation.principalId !== request.principalId ||
      delegation.foldId !== request.foldId ||
      delegation.agentId.length === 0 ||
      delegation.id.length === 0 ||
      delegation.revokedAt !== undefined ||
      !(delegation.expiresAt.getTime() > now.getTime()) ||
      !delegation.capabilities.includes(request.capability) ||
      (delegation.resourceIds !== undefined &&
        (request.resourceId === undefined || !delegation.resourceIds.includes(request.resourceId))))
  )
    return { allowed: false, reason: "delegation-denied" };

  return { allowed: true, grantId: grant.id };
}

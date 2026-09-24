export const Capability = {
  EntryRead: "entry:read",
  EntryCreate: "entry:create",
  EntryEditOwn: "entry:edit-own",
  EntryDismiss: "entry:dismiss",
  EntrySubmit: "entry:submit",
  EntryReview: "entry:review",
  EntryPublish: "entry:publish",
  GrantManage: "grant:manage",
} as const;
export type Capability = (typeof Capability)[keyof typeof Capability];
export const capabilities: readonly Capability[] = Object.values(Capability);

export const FoldRole = {
  Creator: "creator",
  Curator: "curator",
  Publisher: "publisher",
  Admin: "admin",
} as const;
export type FoldRole = (typeof FoldRole)[keyof typeof FoldRole];

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

export const ReviewMode = {
  Direct: "direct",
  Independent: "independent",
} as const;
export type ReviewMode = (typeof ReviewMode)[keyof typeof ReviewMode];

export type ReviewPolicy =
  | { readonly mode: typeof ReviewMode.Direct }
  | { readonly mode: typeof ReviewMode.Independent; readonly requiredApprovals: number };

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

export const AuthorizationDenialReason = {
  GrantMissing: "grant-missing",
  GrantExpired: "grant-expired",
  GrantRevoked: "grant-revoked",
  CapabilityMissing: "capability-missing",
  ResourceDenied: "resource-denied",
  SelfApproval: "self-approval",
  DelegationDenied: "delegation-denied",
  InvalidContext: "invalid-context",
} as const;
export type AuthorizationDenialReason =
  (typeof AuthorizationDenialReason)[keyof typeof AuthorizationDenialReason];

export type AuthorizationDecision =
  | { readonly allowed: true; readonly grantId: string }
  | {
      readonly allowed: false;
      readonly reason: AuthorizationDenialReason;
    };

export const roleCapabilities: Readonly<Record<FoldRole, readonly Capability[]>> = {
  [FoldRole.Creator]: [
    Capability.EntryRead,
    Capability.EntryCreate,
    Capability.EntryEditOwn,
    Capability.EntrySubmit,
  ],
  [FoldRole.Curator]: [
    Capability.EntryRead,
    Capability.EntryCreate,
    Capability.EntryEditOwn,
    Capability.EntrySubmit,
    Capability.EntryReview,
    Capability.EntryDismiss,
  ],
  [FoldRole.Publisher]: [Capability.EntryRead, Capability.EntryReview, Capability.EntryPublish],
  [FoldRole.Admin]: capabilities,
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
  if (!Number.isFinite(now.getTime()))
    return { allowed: false, reason: AuthorizationDenialReason.InvalidContext };
  const policy = request.policy ?? { mode: ReviewMode.Independent, requiredApprovals: 1 };
  if (
    policy.mode === ReviewMode.Independent &&
    (!Number.isSafeInteger(policy.requiredApprovals) || policy.requiredApprovals < 1)
  )
    return { allowed: false, reason: AuthorizationDenialReason.InvalidContext };

  const candidates = grants.filter(
    (grant) => grant.principalId === request.principalId && grant.foldId === request.foldId,
  );
  if (candidates.length === 0)
    return { allowed: false, reason: AuthorizationDenialReason.GrantMissing };
  const unrevoked = candidates.filter((grant) => grant.revokedAt === undefined);
  if (unrevoked.length === 0)
    return { allowed: false, reason: AuthorizationDenialReason.GrantRevoked };
  const active = unrevoked.filter(
    (grant) => grant.expiresAt === undefined || grant.expiresAt.getTime() > now.getTime(),
  );
  if (active.length === 0)
    return { allowed: false, reason: AuthorizationDenialReason.GrantExpired };
  const capable = active.filter((grant) => grant.capabilities.includes(request.capability));
  if (capable.length === 0)
    return { allowed: false, reason: AuthorizationDenialReason.CapabilityMissing };
  const grant = capable.find(
    (candidate) =>
      candidate.resourceIds === undefined ||
      (request.resourceId !== undefined && candidate.resourceIds.includes(request.resourceId)),
  );
  if (grant === undefined)
    return { allowed: false, reason: AuthorizationDenialReason.ResourceDenied };

  if (
    request.capability === Capability.EntrySubmit &&
    request.contribution !== undefined &&
    request.contribution.authorPrincipalId !== request.principalId
  ) {
    return { allowed: false, reason: AuthorizationDenialReason.ResourceDenied };
  }
  if (
    request.capability === Capability.EntryEditOwn &&
    request.contribution?.authorPrincipalId !== request.principalId
  ) {
    return { allowed: false, reason: AuthorizationDenialReason.ResourceDenied };
  }
  if (
    request.capability === Capability.EntryReview ||
    request.capability === Capability.EntryPublish
  ) {
    if (request.contribution === undefined)
      return { allowed: false, reason: AuthorizationDenialReason.InvalidContext };
    // Publishing is allowed after independent approvals; the publisher need not be a reviewer.
    if (
      request.capability === Capability.EntryReview &&
      policy.mode === ReviewMode.Independent &&
      request.contribution.authorPrincipalId === request.principalId
    ) {
      return { allowed: false, reason: AuthorizationDenialReason.SelfApproval };
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
    return { allowed: false, reason: AuthorizationDenialReason.DelegationDenied };

  return { allowed: true, grantId: grant.id };
}

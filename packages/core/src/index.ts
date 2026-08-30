export const capabilities = [
  "entry:create",
  "entry:edit-own",
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
}

export interface ContributionContext {
  readonly authorPrincipalId: string;
}

export interface AuthorizationRequest {
  readonly principalId: string;
  readonly foldId: string;
  readonly capability: Capability;
  readonly now?: Date;
  readonly contribution?: ContributionContext;
}

export type AuthorizationDecision =
  | { readonly allowed: true; readonly grantId: string }
  | {
      readonly allowed: false;
      readonly reason: "grant-missing" | "grant-expired" | "capability-missing" | "self-approval";
    };

export const roleCapabilities: Readonly<Record<FoldRole, readonly Capability[]>> = {
  creator: ["entry:create", "entry:edit-own", "entry:submit"],
  curator: ["entry:create", "entry:edit-own", "entry:submit", "entry:review"],
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
  const grant = grants.find(
    (candidate) =>
      candidate.principalId === request.principalId && candidate.foldId === request.foldId,
  );

  if (grant === undefined) {
    return { allowed: false, reason: "grant-missing" };
  }

  const now = request.now ?? new Date();
  if (grant.expiresAt !== undefined && grant.expiresAt <= now) {
    return { allowed: false, reason: "grant-expired" };
  }

  if (!grant.capabilities.includes(request.capability)) {
    return { allowed: false, reason: "capability-missing" };
  }

  const requiresIndependentPrincipal =
    request.capability === "entry:review" || request.capability === "entry:publish";
  if (
    requiresIndependentPrincipal &&
    request.contribution?.authorPrincipalId === request.principalId
  ) {
    return { allowed: false, reason: "self-approval" };
  }

  return { allowed: true, grantId: grant.id };
}

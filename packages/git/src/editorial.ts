import type { FileChange, RepositoryRef } from "./index";

export const ProviderGuarantee = {
  ConditionalWrite: "conditional-write",
  DurableOperationRecovery: "durable-operation-recovery",
  PayloadBoundIdempotency: "payload-bound-idempotency",
  ReviewedRevisionIntegration: "reviewed-revision-integration",
  ServerOwnedRecords: "server-owned-records",
} as const;
export type ProviderGuarantee = (typeof ProviderGuarantee)[keyof typeof ProviderGuarantee];

/** Experimental v1; remote feasibility and conformance are still pending. */
export const mandatoryGuarantees = [
  ProviderGuarantee.ConditionalWrite,
  ProviderGuarantee.DurableOperationRecovery,
  ProviderGuarantee.PayloadBoundIdempotency,
  ProviderGuarantee.ReviewedRevisionIntegration,
  ProviderGuarantee.ServerOwnedRecords,
] as const;

export const GitOperationAction = {
  Save: "save",
  Submit: "submit",
  Publish: "publish",
} as const;
export type GitOperationAction = (typeof GitOperationAction)[keyof typeof GitOperationAction];

export interface OperationBinding {
  readonly formatVersion: 1;
  readonly key: string;
  readonly principalId: string;
  readonly agentId?: string;
  readonly foldId: string;
  readonly repository: RepositoryRef;
  readonly resourceId: string;
  readonly action: GitOperationAction;
  /** Computed by the trusted application over the complete normalized command. */
  readonly payloadDigest: string;
}

export const ProviderError = {
  Conflict: "conflict",
  IdempotencyConflict: "idempotency-conflict",
  UnsupportedGuarantee: "unsupported-guarantee",
  Forbidden: "forbidden",
  NotFound: "not-found",
  InvalidInput: "invalid-input",
  ProviderFailure: "provider-failure",
} as const;
export type ProviderError = (typeof ProviderError)[keyof typeof ProviderError];

export const OperationStatus = {
  Pending: "pending",
  Completed: "completed",
  Failed: "failed",
} as const;
export type OperationStatus = (typeof OperationStatus)[keyof typeof OperationStatus];

export type OperationResult =
  | { readonly status: typeof OperationStatus.Pending; readonly operationId: string }
  | {
      readonly status: typeof OperationStatus.Completed;
      readonly operationId: string;
      readonly revision: string;
      readonly changeRequestId?: string;
    }
  | {
      readonly status: typeof OperationStatus.Failed;
      readonly operationId: string;
      readonly error: ProviderError;
    };

export interface RemoteSnapshot {
  readonly revision: string;
  readonly files: readonly { readonly path: string; readonly content: string }[];
}

export interface SaveCheckpoint {
  readonly action: typeof GitOperationAction.Save;
  readonly branch: string;
  /** null means create only if absent; it never means unconditional overwrite. */
  readonly expectedRevision: string | null;
  readonly contentChanges: readonly FileChange[];
  /** Validated and constructed by the server, never copied from editable content. */
  readonly recordChanges: readonly FileChange[];
}

export interface SubmitProposal {
  readonly action: typeof GitOperationAction.Submit;
  readonly sourceBranch: string;
  readonly sourceRevision: string;
  readonly targetBranch: string;
  readonly expectedTargetRevision: string;
}

export interface PublishProposal {
  readonly action: typeof GitOperationAction.Publish;
  readonly changeRequestId: string;
  readonly reviewedSourceRevision: string;
  readonly expectedTargetRevision: string;
}

/** The application persists domain transitions with conditional provider writes. */
export interface EditorialGitProvider {
  readonly guarantees: readonly ProviderGuarantee[];
  read(repository: RepositoryRef, ref: string, paths: readonly string[]): Promise<RemoteSnapshot>;
  execute(
    binding: OperationBinding,
    command: SaveCheckpoint | SubmitProposal | PublishProposal,
  ): Promise<OperationResult>;
  /** Reconcile remote evidence after timeout/restart before repeating any side effect. */
  recover(binding: OperationBinding): Promise<OperationResult>;
}

export function missingGuarantees(
  supported: readonly ProviderGuarantee[],
): readonly ProviderGuarantee[] {
  return mandatoryGuarantees.filter((guarantee) => !supported.includes(guarantee));
}

/** Compare the stored binding after an atomic key claim; this helper is not a lock. */
export function matchesOperation(stored: OperationBinding, requested: OperationBinding): boolean {
  return (
    stored.formatVersion === requested.formatVersion &&
    stored.key === requested.key &&
    stored.principalId === requested.principalId &&
    stored.agentId === requested.agentId &&
    stored.foldId === requested.foldId &&
    stored.repository.owner === requested.repository.owner &&
    stored.repository.name === requested.repository.name &&
    stored.resourceId === requested.resourceId &&
    stored.action === requested.action &&
    stored.payloadDigest === requested.payloadDigest
  );
}

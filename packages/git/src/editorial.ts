import type { FileChange, RepositoryRef } from "./index";

/** Experimental v1; remote feasibility and conformance are still pending. */
export const mandatoryGuarantees = [
  "conditional-write",
  "durable-operation-recovery",
  "payload-bound-idempotency",
  "reviewed-revision-integration",
  "server-owned-records",
] as const;
export type ProviderGuarantee = (typeof mandatoryGuarantees)[number];

export interface OperationBinding {
  readonly formatVersion: 1;
  readonly key: string;
  readonly principalId: string;
  readonly agentId?: string;
  readonly foldId: string;
  readonly repository: RepositoryRef;
  readonly resourceId: string;
  readonly action: "save" | "submit" | "publish";
  /** Computed by the trusted application over the complete normalized command. */
  readonly payloadDigest: string;
}

export type ProviderError =
  | "conflict"
  | "idempotency-conflict"
  | "unsupported-guarantee"
  | "forbidden"
  | "not-found"
  | "invalid-input"
  | "provider-failure";

export type OperationResult =
  | { readonly status: "pending"; readonly operationId: string }
  | {
      readonly status: "completed";
      readonly operationId: string;
      readonly revision: string;
      readonly changeRequestId?: string;
    }
  | { readonly status: "failed"; readonly operationId: string; readonly error: ProviderError };

export interface RemoteSnapshot {
  readonly revision: string;
  readonly files: readonly { readonly path: string; readonly content: string }[];
}

export interface SaveCheckpoint {
  readonly action: "save";
  readonly branch: string;
  /** null means create only if absent; it never means unconditional overwrite. */
  readonly expectedRevision: string | null;
  readonly contentChanges: readonly FileChange[];
  /** Validated and constructed by the server, never copied from editable content. */
  readonly recordChanges: readonly FileChange[];
}

export interface SubmitProposal {
  readonly action: "submit";
  readonly sourceBranch: string;
  readonly sourceRevision: string;
  readonly targetBranch: string;
  readonly expectedTargetRevision: string;
}

export interface PublishProposal {
  readonly action: "publish";
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

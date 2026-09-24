import { EditorialErrorCode } from "./errors";
import { EditorialAction, InternalEditorialAction } from "./actions";
import { authorize, Capability } from "./authorization";
import {
  ContributionState,
  createDraft,
  reconcilePublication,
  transitionContribution,
} from "./workflow";
import type { Contribution, Transition, WorkflowContext, WorkflowResult } from "./workflow";

export type Content = Readonly<Record<string, unknown>>;
/** Language-neutral, serializable validation contract. Never include submitted values. */
export interface ValidationIssue {
  readonly code: string;
  readonly path: readonly (string | number)[];
  readonly params: Readonly<Record<string, string | number | boolean>>;
}
/** Compatibility for trusted older profiles; their prose is not a machine-readable contract. */
export function validationIssues(errors: readonly (ValidationIssue | string)[]): ValidationIssue[] {
  return errors.map((error) =>
    typeof error === "string"
      ? { code: EditorialErrorCode.CustomValidation, path: [], params: {} }
      : error,
  );
}
export interface ContentProfile {
  readonly id: string;
  readonly title: string;
  readonly titleKey?: string;
  readonly schemaRevision: string;
  readonly initialContent: Content;
  readonly fields: readonly {
    readonly key: string;
    readonly label: string;
    readonly labelKey?: string;
    readonly multiline?: boolean;
  }[];
  /** Trusted consumer validator. No content/configuration-supplied executable hooks. */
  validate(content: Content): readonly (ValidationIssue | string)[];
}
export interface Receipt {
  readonly key: string;
  readonly revision: number;
  readonly state: string;
  readonly proposalId?: string;
}
export interface SavedProposal {
  readonly id: string;
  readonly content: Content;
  readonly baseContent: Content | null;
  readonly contribution: Contribution;
  readonly audit: WorkspaceSnapshot["audit"];
}
export interface WorkspaceSnapshot {
  readonly formatVersion: 1;
  readonly profileId: string;
  readonly revision: number;
  readonly canonical: Content;
  readonly canonicalRevision: string;
  readonly draft: Content;
  readonly contribution: Contribution | null;
  readonly proposalId?: string;
  readonly baseContent?: Content;
  readonly previousProposals?: readonly SavedProposal[];
  readonly audit: readonly (
    | Transition["audit"]
    | {
        readonly action: typeof InternalEditorialAction.AppliedLocal;
        readonly attemptId: string;
        readonly at: string;
      }
  )[];
  readonly operations: readonly {
    readonly actor: string;
    readonly key: string;
    readonly digest: string;
    readonly receipt: Receipt;
  }[];
}
/** This atomic transaction contract is for local evaluation, not remote Git conformance. */
export interface EvaluationStore {
  read(): Promise<WorkspaceSnapshot | null>;
  transact<T>(
    update: (
      snapshot: WorkspaceSnapshot | null,
    ) => Promise<{ snapshot: WorkspaceSnapshot; result: T }>,
  ): Promise<T>;
}
export type EvaluationCommand = {
  readonly key: string;
  readonly expectedRevision: number;
  readonly proposalId?: string;
  readonly mode?: "create" | "update";
} & (
  | { readonly action: typeof EditorialAction.Save; readonly content: Content }
  | {
      readonly action: Exclude<EditorialAction, typeof EditorialAction.Save>;
    }
);

/** Adapters and content profiles may supply additional error codes. */
export class EditorialError extends Error {
  constructor(
    readonly code: string,
    readonly details: readonly string[] = [],
    readonly issues: readonly ValidationIssue[] = [],
  ) {
    super(code);
  }
}

export function stableJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  throw new EditorialError(EditorialErrorCode.InvalidJson);
}

export async function contentDigest(value: unknown): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(stableJson(value)));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function decision(result: WorkflowResult): Transition {
  if (!result.ok) throw new EditorialError(result.error);
  return result.value;
}

export function contentDiff(
  before: Content,
  after: Content,
): readonly { field: string; before: unknown; after: unknown }[] {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .sort()
    .filter((field) => stableJson(before[field] ?? null) !== stableJson(after[field] ?? null))
    .map((field) => ({ field, before: before[field] ?? null, after: after[field] ?? null }));
}

export function savedProposals(snapshot: WorkspaceSnapshot): readonly SavedProposal[] {
  if (snapshot.contribution === null) return snapshot.previousProposals ?? [];
  const start = snapshot.audit.findLastIndex(
    (event) => event.action === InternalEditorialAction.Create,
  );
  return [
    ...(snapshot.previousProposals ?? []),
    {
      id: snapshot.proposalId ?? `legacy-${snapshot.profileId}`,
      content: snapshot.draft,
      baseContent:
        snapshot.baseContent ??
        (snapshot.contribution.state === ContributionState.Applied ? null : snapshot.canonical),
      contribution: snapshot.contribution,
      audit: snapshot.audit.slice(Math.max(0, start)),
    },
  ];
}

/** Shared operations for the local evaluator. Every context comes from its server adapter. */
export class EditorialWorkspace {
  constructor(
    private readonly store: EvaluationStore,
    readonly profile: ContentProfile,
  ) {}

  private checkRead(context: WorkflowContext): void {
    if (
      !authorize(context.grants, {
        principalId: context.principalId,
        foldId: this.profile.id,
        capability: Capability.EntryRead,
        now: context.now,
        resourceId: this.profile.id,
      }).allowed ||
      context.foldId !== this.profile.id
    )
      throw new EditorialError(EditorialErrorCode.Forbidden);
    // The local evaluator currently supports simulated human actors only.
    if (context.delegationId !== undefined)
      throw new EditorialError(EditorialErrorCode.UnsupportedDelegation);
  }

  private validate(content: Content): void {
    stableJson(content);
    const errors = this.profile.validate(content);
    if (errors.length)
      throw new EditorialError(EditorialErrorCode.Validation, [], validationIssues(errors));
  }

  async read(context: WorkflowContext): Promise<WorkspaceSnapshot> {
    this.checkRead(context);
    const existing = await this.store.read();
    if (existing !== null) {
      if (existing.profileId !== this.profile.id)
        throw new EditorialError(EditorialErrorCode.ProfileMismatch);
      return existing;
    }
    this.validate(this.profile.initialContent);
    return {
      formatVersion: 1,
      profileId: this.profile.id,
      revision: 0,
      canonical: this.profile.initialContent,
      canonicalRevision: await contentDigest(this.profile.initialContent),
      draft: this.profile.initialContent,
      contribution: null,
      audit: [],
      operations: [],
    };
  }

  async execute(command: EvaluationCommand, authority: WorkflowContext): Promise<Receipt> {
    this.checkRead(authority);
    if (
      !command.key ||
      command.key.length > 128 ||
      !Number.isSafeInteger(command.expectedRevision) ||
      command.expectedRevision < 0
    )
      throw new EditorialError(EditorialErrorCode.InvalidInput);
    const digest = await contentDigest(command);
    const initial = await this.read(authority);
    return this.store.transact(async (loaded) => {
      const snapshot = loaded ?? initial;
      if (snapshot.profileId !== this.profile.id)
        throw new EditorialError(EditorialErrorCode.ProfileMismatch);
      const prior = snapshot.operations.find(
        (operation) => operation.actor === authority.principalId && operation.key === command.key,
      );
      if (prior) {
        if (prior.digest !== digest)
          throw new EditorialError(EditorialErrorCode.IdempotencyConflict);
        return { snapshot, result: prior.receipt };
      }
      if (snapshot.revision !== command.expectedRevision)
        throw new EditorialError(EditorialErrorCode.Conflict);
      const context = {
        ...authority,
        schemaRevision: this.profile.schemaRevision,
        targetRevision: snapshot.canonicalRevision,
      };
      const currentId = snapshot.proposalId ?? `legacy-${snapshot.profileId}`;
      if (
        command.proposalId !== undefined &&
        (snapshot.contribution === null || command.proposalId !== currentId)
      )
        throw new EditorialError(EditorialErrorCode.ProposalNotCurrent);
      const creating =
        snapshot.contribution === null || snapshot.contribution.state === ContributionState.Applied;
      if (command.mode === "create" && !creating)
        throw new EditorialError(EditorialErrorCode.ActiveProposalExists);
      if (command.mode === "update" && creating)
        throw new EditorialError(EditorialErrorCode.ProposalNotEditable);
      let proposalId = currentId;
      let baseContent = snapshot.baseContent;
      let previousProposals = snapshot.previousProposals ?? [];
      if (command.action === EditorialAction.Save && creating) {
        previousProposals = savedProposals(snapshot);
        proposalId = crypto.randomUUID();
        baseContent = snapshot.canonical;
      }
      let draft = snapshot.draft;
      let transition: Transition;
      if (command.action === EditorialAction.Save) {
        this.validate(command.content);
        const contentRevision = await contentDigest(command.content);
        transition =
          snapshot.contribution === null ||
          snapshot.contribution.state === ContributionState.Applied
            ? decision(
                createDraft({ id: this.profile.id, contentRevision, intent: "publish" }, context),
              )
            : decision(
                transitionContribution(
                  snapshot.contribution,
                  {
                    action: InternalEditorialAction.Revise,
                    contentRevision,
                    expectedVersion: snapshot.contribution.version,
                  },
                  context,
                ),
              );
        draft = command.content;
      } else {
        if (snapshot.contribution === null)
          throw new EditorialError(EditorialErrorCode.DraftRequired);
        this.validate(snapshot.draft);
        if (snapshot.contribution.scope.contentRevision !== (await contentDigest(snapshot.draft)))
          throw new EditorialError(EditorialErrorCode.CorruptStore);
        transition = decision(
          transitionContribution(
            snapshot.contribution,
            {
              action: command.action,
              expectedVersion: snapshot.contribution.version,
              ...(command.action === EditorialAction.Publish
                ? { attemptId: crypto.randomUUID() }
                : {}),
            } as Parameters<typeof transitionContribution>[1],
            context,
          ),
        );
      }
      let contribution = transition.contribution;
      let canonical = snapshot.canonical;
      let canonicalRevision = snapshot.canonicalRevision;
      const audit = [...snapshot.audit, transition.audit];
      if (command.action === EditorialAction.Publish) {
        const attemptId = contribution.publicationAttemptId!;
        const applied = reconcilePublication(contribution, {
          expectedVersion: contribution.version,
          attemptId,
          scope: contribution.scope,
          outcome: "applied",
        });
        if (!applied.ok) throw new EditorialError(EditorialErrorCode.Conflict);
        contribution = applied.contribution;
        canonical = draft;
        canonicalRevision = await contentDigest(canonical);
        audit.push({
          action: InternalEditorialAction.AppliedLocal,
          attemptId,
          at: context.now.toISOString(),
        });
      }
      const receipt = {
        key: command.key,
        revision: snapshot.revision + 1,
        state: contribution.state,
        proposalId,
      };
      return {
        snapshot: {
          ...snapshot,
          revision: receipt.revision,
          draft,
          canonical,
          canonicalRevision,
          contribution,
          proposalId,
          ...(baseContent === undefined ? {} : { baseContent }),
          previousProposals,
          audit,
          operations: [
            ...snapshot.operations,
            { actor: authority.principalId, key: command.key, digest, receipt },
          ],
        },
        result: receipt,
      };
    });
  }
}

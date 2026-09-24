import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { ContributionState, EditorialErrorCode, EditorialError } from "@lorekind/core";
import type { EvaluationStore, WorkspaceSnapshot } from "@lorekind/core";

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Local trusted storage only. Unsupported/malformed snapshots never become an empty workspace. */
export function decodeSnapshot(text: string): WorkspaceSnapshot {
  const value: unknown = JSON.parse(text);
  if (
    !isObject(value) ||
    value.formatVersion !== 1 ||
    typeof value.profileId !== "string" ||
    !Number.isSafeInteger(value.revision) ||
    Number(value.revision) < 0 ||
    typeof value.canonicalRevision !== "string" ||
    !isObject(value.canonical) ||
    !isObject(value.draft) ||
    !Array.isArray(value.audit) ||
    !Array.isArray(value.operations)
  )
    throw new EditorialError(EditorialErrorCode.CorruptStore);
  if (
    (value.proposalId !== undefined &&
      (typeof value.proposalId !== "string" || !value.proposalId)) ||
    (value.baseContent !== undefined && !isObject(value.baseContent)) ||
    (value.previousProposals !== undefined && !Array.isArray(value.previousProposals))
  )
    throw new EditorialError(EditorialErrorCode.CorruptStore);
  for (const previous of (value.previousProposals ?? []) as unknown[]) {
    if (
      !isObject(previous) ||
      typeof previous.id !== "string" ||
      !previous.id ||
      !isObject(previous.content) ||
      (previous.baseContent !== null && !isObject(previous.baseContent)) ||
      !Array.isArray(previous.audit) ||
      !isObject(previous.contribution)
    )
      throw new EditorialError(EditorialErrorCode.CorruptStore);
    decodeSnapshot(
      JSON.stringify({
        formatVersion: 1,
        profileId: value.profileId,
        revision: 0,
        canonicalRevision: "archive",
        canonical: previous.content,
        draft: previous.content,
        contribution: previous.contribution,
        audit: previous.audit,
        operations: [],
      }),
    );
  }
  if (value.contribution !== null) {
    const item = value.contribution;
    if (
      !isObject(item) ||
      item.formatVersion !== 1 ||
      item.foldId !== value.profileId ||
      item.id !== value.profileId ||
      typeof item.authorPrincipalId !== "string" ||
      !Number.isSafeInteger(item.version) ||
      Number(item.version) < 0 ||
      !Object.values(ContributionState).some((state) => state === String(item.state)) ||
      item.intent !== "publish" ||
      !isObject(item.scope) ||
      !["contentRevision", "schemaRevision", "policyRevision", "targetRevision"].every(
        (key) => typeof (item.scope as Record<string, unknown>)[key] === "string",
      ) ||
      !Array.isArray(item.approvals) ||
      !item.approvals.every(
        (approval) =>
          isObject(approval) &&
          ["direct", "review"].includes(String(approval.kind)) &&
          isObject(approval.scope) &&
          isObject(approval.identity) &&
          typeof approval.identity.principalId === "string" &&
          typeof approval.identity.grantId === "string",
      )
    )
      throw new EditorialError(EditorialErrorCode.CorruptStore);
  }
  if (
    !value.operations.every(
      (operation) =>
        isObject(operation) &&
        typeof operation.actor === "string" &&
        typeof operation.key === "string" &&
        typeof operation.digest === "string" &&
        isObject(operation.receipt) &&
        typeof operation.receipt.state === "string" &&
        operation.receipt.key === operation.key &&
        Number.isSafeInteger(operation.receipt.revision),
    )
  )
    throw new EditorialError(EditorialErrorCode.CorruptStore);
  return value as unknown as WorkspaceSnapshot;
}

/** Single-machine evaluation: exclusive writer + atomic snapshot replacement, no Git guarantee. */
export class FileEvaluationStore implements EvaluationStore {
  constructor(readonly filename: string) {}
  async read(): Promise<WorkspaceSnapshot | null> {
    try {
      return decodeSnapshot(await readFile(this.filename, "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }
  async transact<T>(
    update: (
      snapshot: WorkspaceSnapshot | null,
    ) => Promise<{ snapshot: WorkspaceSnapshot; result: T }>,
  ): Promise<T> {
    await mkdir(dirname(this.filename), { recursive: true });
    const lock = `${this.filename}.lock`;
    try {
      await mkdir(lock);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST")
        throw new EditorialError(EditorialErrorCode.StoreBusy);
      throw error;
    }
    const temporary = `${this.filename}.${crypto.randomUUID()}.tmp`;
    try {
      const { snapshot, result } = await update(await this.read());
      const file = await open(temporary, "wx", 0o600);
      try {
        await file.writeFile(JSON.stringify(snapshot));
        await file.sync();
      } finally {
        await file.close();
      }
      await rename(temporary, this.filename);
      return result;
    } finally {
      await rm(temporary, { force: true });
      await rm(lock, { recursive: true });
    }
  }
}

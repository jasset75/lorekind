import { Locale } from "../i18n";
import { ApiErrorCode } from "../api-errors";
import { EditorialErrorCode, ContributionState, EditorialAction, Capability } from "@lorekind/core";
import type { z } from "zod";
import type { responses } from "../server/api-contract";

export const StudioErrorCode = {
  WorkspaceSelectionRequired: "workspace-selection-required",
  IdentityChanged: "identity-changed",
} as const;
export type StudioErrorCode = (typeof StudioErrorCode)[keyof typeof StudioErrorCode];

type Result<K extends keyof typeof responses> = z.infer<(typeof responses)[K]>;
export type ApiTarget = { foldId: string; proposalId?: string; principalId: string };
export type StudioAction = Exclude<EditorialAction, typeof EditorialAction.AuthorizeDirect>;
const studioActions: readonly StudioAction[] = Object.values(EditorialAction).filter(
  (action) => action !== EditorialAction.AuthorizeDirect,
);
export type StudioCommand = {
  key: string;
  action: StudioAction;
  expectedRevision: number;
  content?: Record<string, unknown>;
  target?: ApiTarget;
};
export class StudioApiError extends Error {
  constructor(
    // Remote services may return codes unknown to this client version.
    readonly code: string,
    readonly issues = [],
    readonly status = 0,
  ) {
    super(code);
  }
}

/** Same-origin browser client; identity and credentials are supplied by the host session. */
export function editorialClient(
  basePath: string,
  send: typeof fetch = fetch,
  language: () => string = () => Locale.English,
) {
  if (!/^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+$/.test(basePath))
    throw new Error("API base path must be an absolute same-origin path without a trailing slash");
  async function request(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    headers.set("Accept-Language", language());
    return send(`${basePath}${path}`, {
      ...init,
      headers,
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
    });
  }
  async function read<K extends keyof typeof responses>(path: string) {
    const response = await request(path);
    if (!response.ok) {
      const body = await response.json();
      throw new StudioApiError(body.error.code, body.error.issues ?? [], response.status);
    }
    return { body: (await response.json()) as Result<K>, etag: response.headers.get("etag") };
  }
  return {
    async load() {
      const { body: identity } = await read<"identity">("/me");
      const { body: folds } = await read<"folds">("/folds");
      // Workspace selection is not implemented; require exactly one accessible Fold.
      if (folds.items.length !== 1)
        throw new StudioApiError(StudioErrorCode.WorkspaceSelectionRequired);
      const fold = folds.items[0]!;
      const scope = identity.folds.find((item) => item.id === fold.id);
      if (!scope) throw new StudioApiError(EditorialErrorCode.Forbidden);
      const root = `/folds/${encodeURIComponent(fold.id)}`;
      const schema = await read<"schemas">(`${root}/schemas`);
      const entry = await read<"entry">(`${root}/entries/${encodeURIComponent(fold.id)}`);
      const list = await read<"proposals">(`${root}/proposals`);
      const latest = list.body.items.at(-1);
      const path = latest ? `${root}/proposals/${encodeURIComponent(latest.id)}` : undefined;
      const proposal = path ? await read<"proposal">(path) : undefined;
      const diff = path ? await read<"diff">(`${path}/diff`) : undefined;
      const history = path ? await read<"history">(`${path}/history`) : undefined;
      const parts = [schema, entry, list, proposal, diff, history].filter((part) => part);
      const etag = entry.etag;
      if (!etag || !/^"v\d+"$/.test(etag) || parts.some((part) => part!.etag !== etag))
        throw new StudioApiError(EditorialErrorCode.Conflict);
      const revision = Number(etag.slice(2, -1));
      if (!Number.isSafeInteger(revision))
        throw new StudioApiError(ApiErrorCode.InvalidPrecondition);
      const fields = schema.body.items.find((item) => item.id === fold.id)?.editableFields;
      if (!fields) throw new StudioApiError(EditorialErrorCode.ProfileMismatch);
      const contribution = proposal?.body.contribution ?? null;
      const own = contribution?.authorPrincipalId === identity.principalId;
      const can = (capability: Capability) => scope.capabilities.includes(capability);
      const fresh = !contribution || contribution.state === ContributionState.Applied;
      return {
        target: {
          foldId: fold.id,
          principalId: identity.principalId,
          ...(latest && !fresh ? { proposalId: latest.id } : {}),
        },
        allowed: {
          [EditorialAction.Save]: fresh
            ? can(Capability.EntryCreate)
            : own && can(Capability.EntryEditOwn),
          [EditorialAction.Submit]: own && can(Capability.EntrySubmit),
          [EditorialAction.Approve]: !own && can(Capability.EntryReview),
          [EditorialAction.Publish]: can(Capability.EntryPublish),
          [EditorialAction.Dismiss]: own
            ? can(Capability.EntryEditOwn)
            : can(Capability.EntryDismiss),
          [EditorialAction.Restore]: own
            ? can(Capability.EntryEditOwn)
            : can(Capability.EntryDismiss),
        } satisfies Record<StudioAction, boolean>,
        profile: { title: fold.title, fields },
        snapshot: {
          revision,
          draft: proposal?.body.content ?? entry.body.content,
          canonical: entry.body.content,
          contribution,
          audit: history?.body.items ?? [],
        },
        diff: diff?.body.changes ?? [],
      };
    },
    async execute(command: StudioCommand) {
      const target = command.target;
      if (!target) throw new StudioApiError(EditorialErrorCode.InvalidInput);
      const { body: identity } = await read<"identity">("/me");
      if (identity.principalId !== target.principalId)
        throw new StudioApiError(StudioErrorCode.IdentityChanged);
      const root = `/folds/${encodeURIComponent(target.foldId)}/proposals`;
      const proposal = target.proposalId
        ? `${root}/${encodeURIComponent(target.proposalId)}`
        : undefined;
      const save = command.action === EditorialAction.Save;
      if (!save && !proposal) throw new StudioApiError(EditorialErrorCode.DraftRequired);
      if (!studioActions.includes(command.action))
        throw new StudioApiError(EditorialErrorCode.InvalidInput);
      return request(save ? (proposal ?? root) : `${proposal}/${command.action}`, {
        method: save && proposal ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          "If-Match": `"v${command.expectedRevision}"`,
          "Idempotency-Key": command.key,
        },
        body: JSON.stringify(
          save
            ? { content: command.content, ...(!proposal ? { entryId: target.foldId } : {}) }
            : {},
        ),
      });
    },
  };
}

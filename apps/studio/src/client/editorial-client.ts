import type { z } from "zod";
import type { responses } from "../server/api-contract";

type Result<K extends keyof typeof responses> = z.infer<(typeof responses)[K]>;
export type ApiTarget = { foldId: string; proposalId?: string; principalId: string };
export type StudioCommand = {
  key: string;
  action: string;
  expectedRevision: number;
  content?: Record<string, unknown>;
  target?: ApiTarget;
};
export class StudioApiError extends Error {
  constructor(
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
  language = () => "en",
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
      if (folds.items.length !== 1) throw new StudioApiError("workspace-selection-required");
      const fold = folds.items[0]!;
      const scope = identity.folds.find((item) => item.id === fold.id);
      if (!scope) throw new StudioApiError("forbidden");
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
        throw new StudioApiError("conflict");
      const revision = Number(etag.slice(2, -1));
      if (!Number.isSafeInteger(revision)) throw new StudioApiError("invalid-precondition");
      const fields = schema.body.items.find((item) => item.id === fold.id)?.editableFields;
      if (!fields) throw new StudioApiError("profile-mismatch");
      const contribution = proposal?.body.contribution ?? null;
      const own = contribution?.authorPrincipalId === identity.principalId;
      const can = (capability: string) => scope.capabilities.includes(capability);
      const fresh = !contribution || contribution.state === "Applied";
      return {
        target: {
          foldId: fold.id,
          principalId: identity.principalId,
          ...(latest && !fresh ? { proposalId: latest.id } : {}),
        },
        allowed: {
          save: fresh ? can("entry:create") : own && can("entry:edit-own"),
          submit: own && can("entry:submit"),
          approve: !own && can("entry:review"),
          publish: can("entry:publish"),
          dismiss: own ? can("entry:edit-own") : can("entry:dismiss"),
          restore: own ? can("entry:edit-own") : can("entry:dismiss"),
        } as Record<string, boolean>,
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
      if (!target) throw new StudioApiError("invalid-input");
      const { body: identity } = await read<"identity">("/me");
      if (identity.principalId !== target.principalId) throw new StudioApiError("identity-changed");
      const root = `/folds/${encodeURIComponent(target.foldId)}/proposals`;
      const proposal = target.proposalId
        ? `${root}/${encodeURIComponent(target.proposalId)}`
        : undefined;
      const save = command.action === "save";
      if (!save && !proposal) throw new StudioApiError("draft-required");
      if (!["save", "submit", "approve", "publish", "dismiss", "restore"].includes(command.action))
        throw new StudioApiError("invalid-input");
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

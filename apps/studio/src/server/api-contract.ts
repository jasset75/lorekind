import { createRoute, z } from "@hono/zod-openapi";

// Set before constructing schemas: Workers/CSP must not probe or use new Function.
z.config({ jitless: true });

export const MAX_API_BODY = 131072;
export const actions = [
  "submit",
  "approve",
  "authorize-direct",
  "publish",
  "dismiss",
  "restore",
] as const;
const revision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const id = z
  .string()
  .min(1)
  .regex(/^[^/\\]+$/);
const content = z.record(z.string(), z.unknown()).openapi("Content");
const state = z.enum([
  "Draft",
  "InReview",
  "Approved",
  "Dismissed",
  "Publishing",
  "Applied",
  "PublicationFailed",
]);
const scope = z
  .strictObject({
    contentRevision: z.string(),
    schemaRevision: z.string(),
    policyRevision: z.string(),
    targetRevision: z.string(),
  })
  .openapi("ReviewScope");
const identity = z
  .strictObject({
    principalId: z.string(),
    grantId: z.string(),
    delegationId: z.string().optional(),
    agentId: z.string().optional(),
  })
  .openapi("EditorialIdentity");
const contribution = z
  .strictObject({
    formatVersion: z.literal(1),
    id: z.string(),
    foldId: z.string(),
    authorPrincipalId: z.string(),
    intent: z.enum(["publish", "withdraw"]),
    state,
    version: revision,
    scope,
    approvals: z.array(z.strictObject({ kind: z.enum(["review", "direct"]), scope, identity })),
    publicationAttemptId: z.string().optional(),
  })
  .openapi("Contribution");
const receipt = z
  .strictObject({
    key: z.string(),
    revision,
    state: z.string(),
    proposalId: z.string().optional(),
  })
  .openapi("Receipt");
const entry = z.strictObject({ id: z.string(), revision: z.string(), content }).openapi("Entry");
const issue = z
  .strictObject({
    code: z.string(),
    path: z.array(z.union([z.string(), z.number().int()])),
    params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
    message: z.string(),
  })
  .openapi("ValidationIssue");
const error = z
  .strictObject({
    error: z.strictObject({
      code: z.string(),
      details: z.array(z.string()),
      message: z.string().optional(),
      issues: z.array(issue).optional(),
    }),
  })
  .openapi("Error");

export const responses = {
  error,
  identity: z
    .strictObject({
      principalId: z.string(),
      folds: z.array(z.strictObject({ id: z.string(), capabilities: z.array(z.string()) })),
    })
    .openapi("Identity"),
  folds: z
    .strictObject({ items: z.array(z.strictObject({ id: z.string(), title: z.string() })) })
    .openapi("Folds"),
  schemas: z
    .strictObject({
      items: z.array(
        z.strictObject({
          id: z.string(),
          revision: z.string(),
          validation: z.literal("server-authoritative"),
          editableFields: z.array(
            z.strictObject({
              key: z.string(),
              label: z.string(),
              labelKey: z.string().optional(),
              multiline: z.boolean().optional(),
            }),
          ),
        }),
      ),
    })
    .openapi("Schemas"),
  entry,
  entries: z.strictObject({ items: z.array(entry) }).openapi("Entries"),
  proposals: z
    .strictObject({
      items: z.array(z.strictObject({ id: z.string(), entryId: z.string(), state })),
    })
    .openapi("Proposals"),
  proposal: z
    .strictObject({ id: z.string(), entryId: z.string(), content, contribution })
    .openapi("Proposal"),
  validation: z
    .strictObject({
      valid: z.boolean(),
      errors: z.array(z.string()),
      issues: z.array(issue),
      schemaRevision: z.string(),
    })
    .openapi("Validation"),
  diff: z
    .strictObject({
      changes: z.array(
        z.strictObject({ field: z.string(), before: z.unknown(), after: z.unknown() }),
      ),
    })
    .openapi("Diff"),
  history: z
    .strictObject({
      items: z.array(
        z.union([
          z.strictObject({
            action: z.enum(["create", "revise", ...actions]),
            identity,
            contributionId: z.string(),
            foldId: z.string(),
            version: revision,
            scope,
            at: z.string(),
          }),
          z.strictObject({
            action: z.literal("applied-local"),
            attemptId: z.string(),
            at: z.string(),
          }),
        ]),
      ),
    })
    .openapi("History"),
  mutation: z
    .strictObject({ operationId: z.string(), status: z.literal("completed"), result: receipt })
    .openapi("Mutation"),
  operation: z
    .strictObject({ id: z.string(), status: z.literal("completed"), result: receipt })
    .openapi("Operation"),
};

export const inputs = {
  create: z.strictObject({ entryId: z.string(), content }).openapi("CreateProposal"),
  update: z.strictObject({ content }).openapi("UpdateProposal"),
  validate: z.strictObject({ content: content.optional() }).openapi("ValidateProposal"),
  action: z.strictObject({}).openapi("WorkflowAction"),
};
export const mutationHeaders = z.object({
  "if-match": z
    .string()
    .regex(/^"v\d+"$/)
    .openapi({
      description: "Current workspace ETag; the numeric revision must be a safe integer.",
    }),
  "idempotency-key": z
    .string()
    .min(1)
    .max(128)
    .openapi({ description: "Bound to the authenticated principal, Fold and complete command." }),
});
const foldParams = z.object({ foldId: id });
const proposalParams = foldParams.extend({ proposalId: id });
const json = <T extends z.ZodType>(schema: T) => ({ "application/json": { schema } });
const etag = {
  ETag: {
    description: "Workspace revision, deliberately shared across this local adapter's resources.",
    schema: { type: "string" as const, pattern: '^"v[0-9]+"$' },
    required: true,
  },
};
const errors = {
  400: { description: "Invalid request, JSON, path or unsupported query", content: json(error) },
  401: {
    description: "Unverified identity",
    content: json(error),
    headers: { "WWW-Authenticate": { schema: { type: "string" as const }, required: true } },
  },
  403: { description: "Current capability denied", content: json(error) },
  404: { description: "Resource missing or inaccessible", content: json(error) },
  405: {
    description: "Method not allowed",
    content: json(error),
    headers: { Allow: { schema: { type: "string" as const }, required: true } },
  },
  409: { description: "Workflow, idempotency or historical diff conflict", content: json(error) },
  412: { description: "Stale revision precondition", content: json(error) },
  413: { description: `Request body exceeds ${MAX_API_BODY} bytes`, content: json(error) },
  415: { description: "application/json is required", content: json(error) },
  422: { description: "Content violates the trusted profile schema", content: json(error) },
  428: { description: "If-Match is required", content: json(error) },
  500: { description: "Internal error", content: json(error) },
  503: { description: "Local storage is busy", content: json(error) },
};
const base = "/api/v1";
const fold = `${base}/folds/{foldId}`;
const proposal = `${fold}/proposals/{proposalId}`;
const security = [{ bearerAuth: [] }];
const languageHeaders = z.object({
  "accept-language": z.string().optional().openapi({
    description:
      "Presentation language: en or es (regional tags accepted), weighted by q. English fallback. Codes, paths, content and revisions are never translated.",
  }),
});
function readRoute<P extends string, S extends z.ZodType, Q extends z.ZodObject>(
  path: P,
  summary: string,
  schema: S,
  params: Q,
  versioned = true,
) {
  return createRoute({
    method: "get",
    path,
    summary,
    security,
    operationId: `get_${path.slice(8).replace(/[{}]/g, "").replace(/[/-]/g, "_")}`,
    request: { params, headers: languageHeaders },
    responses: {
      200: { description: summary, content: json(schema), ...(versioned ? { headers: etag } : {}) },
      ...errors,
    },
  });
}
const mutationResponse = {
  description: "Completed local operation",
  content: json(responses.mutation),
  headers: {
    ...etag,
    Location: {
      description: "Initiator-only operation receipt",
      schema: { type: "string" as const },
      required: true,
    },
  },
};
function writeRoute<
  P extends string,
  M extends "post" | "patch",
  S extends z.ZodType,
  Q extends z.ZodObject,
  R extends Record<number, typeof mutationResponse>,
>(path: P, method: M, summary: string, schema: S, params: Q, success: R) {
  return createRoute({
    method,
    path,
    summary,
    security,
    operationId: `${method}_${path.slice(8).replace(/[{}]/g, "").replace(/[/-]/g, "_")}`,
    request: {
      params,
      headers: mutationHeaders.extend(languageHeaders.shape),
      body: { required: true, content: json(schema) },
    },
    responses: { ...success, ...errors },
  });
}

export const routes = {
  me: readRoute(
    `${base}/me`,
    "Read verified identity and current scoped grant capabilities",
    responses.identity,
    z.object({}),
    false,
  ),
  folds: readRoute(
    `${base}/folds`,
    "List accessible editorial spaces",
    responses.folds,
    z.object({}),
    false,
  ),
  schemas: readRoute(
    `${fold}/schemas`,
    "Discover editable fields and schema revision; validation remains server-authoritative",
    responses.schemas,
    foldParams,
  ),
  entries: readRoute(
    `${fold}/entries`,
    "List canonical entries (one per workspace in this adapter)",
    responses.entries,
    foldParams,
  ),
  entry: readRoute(
    `${fold}/entries/{entryId}`,
    "Read canonical content",
    responses.entry,
    foldParams.extend({ entryId: id }),
  ),
  proposals: readRoute(
    `${fold}/proposals`,
    "List current and retained applied proposals",
    responses.proposals,
    foldParams,
  ),
  proposal: readRoute(proposal, "Read a saved proposal", responses.proposal, proposalParams),
  create: writeRoute(
    `${fold}/proposals`,
    "post",
    "Create a proposal; at most one unapplied proposal per workspace",
    inputs.create,
    foldParams,
    { 201: mutationResponse },
  ),
  update: writeRoute(
    proposal,
    "patch",
    "Replace the full draft content; invalidate prior approvals",
    inputs.update,
    proposalParams,
    { 200: mutationResponse },
  ),
  validate: createRoute({
    method: "post",
    path: `${proposal}/validate`,
    security,
    operationId: "post_folds_foldId_proposals_proposalId_validate",
    summary: "Validate supplied or saved content without mutation",
    request: {
      params: proposalParams,
      headers: languageHeaders,
      body: { required: true, content: json(inputs.validate) },
    },
    responses: {
      200: {
        description: "Validation result; no state change",
        content: json(responses.validation),
        headers: etag,
      },
      ...errors,
    },
  }),
  diff: readRoute(
    `${proposal}/diff`,
    "Read deterministic changes against the proposal base",
    responses.diff,
    proposalParams,
  ),
  history: readRoute(
    `${proposal}/history`,
    "Read proposal-scoped audit records",
    responses.history,
    proposalParams,
  ),
  operation: readRoute(
    `${base}/operations/{operationId}`,
    "Recover a persisted receipt; only its initiating principal can read it",
    responses.operation,
    z.object({ operationId: id }),
    false,
  ),
};
export const actionRoutes = actions.map((action) => ({
  action,
  route: writeRoute(
    `${proposal}/${action}`,
    "post",
    `Execute ${action} under current Fold policy`,
    inputs.action,
    proposalParams,
    { 200: mutationResponse },
  ),
}));
export const allRoutes = [...Object.values(routes), ...actionRoutes.map(({ route }) => route)];
export const openapiConfig = {
  openapi: "3.1.0",
  info: {
    title: "Lorekind editorial API",
    version: "0.1.0-experimental",
    description:
      "Versioned resource API over the local evaluation application. One entry and one active proposal per workspace; prior applied proposals retained. Injected authentication. No GitLab delivery, production identity provider or remote recovery is claimed. Mutations return completed results synchronously; pending/failed remote operations are not implemented. Query parameters and pagination are not supported. PATCH replaces content rather than applying JSON Patch. Version 1 route name does not yet imply stable compatibility.",
  },
};

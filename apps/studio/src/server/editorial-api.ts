import { ApiErrorCode } from "../api-errors";
import { OpenAPIHono } from "@hono/zod-openapi";
import type { Context, MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { routePath } from "hono/route";
import { languageDetector } from "hono/language";
import {
  EditorialErrorCode,
  EditorialAction,
  ProposalWriteMode,
  contentDiff,
  contentDigest,
  EditorialError,
  savedProposals,
  validationIssues,
} from "@lorekind/core";
import type {
  EditorialWorkspace,
  EvaluationCommand,
  SavedProposal,
  WorkflowContext,
  WorkspaceSnapshot,
  ValidationIssue,
} from "@lorekind/core";
import {
  ApiOperationStatus,
  ValidationAuthority,
  actionRoutes,
  allRoutes,
  MAX_API_BODY,
  mutationHeaders,
  responses,
  routes,
} from "./api-contract";
import { openapi } from "./openapi";
import { API_V1_BASE_PATH } from "./api-paths";
import { acceptedLanguages, zodIssues } from "./api-i18n";
import { locale, errorMessage, issueMessage, label } from "../i18n";

export interface ApiPrincipal {
  readonly id: string;
}
export interface ApiServices {
  /** Only the deployment adapter establishes trusted identity. */
  authenticate(request: Request): Promise<ApiPrincipal | null>;
  workspaces(principal: ApiPrincipal): Promise<readonly EditorialWorkspace[]>;
  context(principal: ApiPrincipal, workspace: EditorialWorkspace): Promise<WorkflowContext>;
}
interface Accessible {
  app: EditorialWorkspace;
  context: WorkflowContext;
  snapshot: WorkspaceSnapshot;
}
type ApiEnv = {
  Variables: {
    language: string;
    principal: ApiPrincipal;
    accessible: Accessible[];
    selected: Accessible;
    proposal: SavedProposal;
    conditions: { key: string; expectedRevision: number };
  };
};

function fail(
  status: number,
  code: string,
  details: readonly string[] = [],
  headers: Record<string, string> = {},
  issues: readonly (ValidationIssue & { message?: string })[] = [],
): Response {
  return new Response(JSON.stringify({ error: { code, details, issues } }), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });
}
/** Bounded, fatal UTF-8 decoding preserves the original wire contract before Zod validation. */
async function readJson(request: Request): Promise<unknown> {
  // Reject malformed MIME parameters: Hono's JSON validator otherwise treats an
  // unrecognised content type as {}, which could hide fields on an action body.
  if (
    !/^application\/json(?:;\s*[A-Za-z0-9-]+=[^;]+)*$/.test(
      request.headers.get("content-type") ?? "",
    )
  )
    throw new EditorialError(ApiErrorCode.MediaType);
  const reader = request.body?.getReader();
  if (!reader) throw new EditorialError(EditorialErrorCode.InvalidInput);
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const item = await reader.read();
      if (item.done) break;
      length += item.value.length;
      if (length > MAX_API_BODY) {
        await reader.cancel();
        throw new EditorialError(ApiErrorCode.TooLarge);
      }
      chunks.push(item.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new EditorialError(EditorialErrorCode.InvalidJson);
  }
}
function preconditions(request: Request) {
  const match = request.headers.get("if-match");
  if (!match) throw new EditorialError(ApiErrorCode.PreconditionRequired);
  if (!mutationHeaders.shape["if-match"].safeParse(match).success)
    throw new EditorialError(ApiErrorCode.InvalidPrecondition);
  const expectedRevision = Number(match.slice(2, -1));
  const key = mutationHeaders.shape["idempotency-key"].safeParse(
    request.headers.get("idempotency-key"),
  );
  if (!Number.isSafeInteger(expectedRevision) || !key.success)
    throw new EditorialError(EditorialErrorCode.InvalidInput);
  return { key: key.data, expectedRevision };
}
function version(c: Context<ApiEnv>) {
  c.header("ETag", `"v${c.get("selected").snapshot.revision}"`);
}
export async function operationId(actor: string, foldId: string, key: string): Promise<string> {
  return contentDigest({ actor, foldId, key });
}

/** Portable Fetch handler. The host injects authentication, configuration and storage. */
export function createEditorialApi(services: ApiServices): (request: Request) => Promise<Response> {
  const api = new OpenAPIHono<ApiEnv>({
    strict: true,
    defaultHook: async (result, c) => {
      if (!result.success) {
        const source =
          result.target === "json"
            ? await c.req.json()
            : result.target === "param"
              ? c.req.param()
              : result.target === "header"
                ? c.req.header()
                : undefined;
        return fail(
          400,
          EditorialErrorCode.InvalidInput,
          [],
          {},
          zodIssues(result.error.issues, locale(c.get("language")), source),
        );
      }
    },
  });
  const versioned = api.basePath(API_V1_BASE_PATH);
  api.onError((error) => {
    if (error instanceof URIError) return fail(400, ApiErrorCode.InvalidPath);
    if (error instanceof HTTPException)
      return fail(
        error.status,
        error.status === 415 ? ApiErrorCode.MediaType : EditorialErrorCode.InvalidJson,
      );
    if (error instanceof EditorialError) {
      const statuses: Record<string, number> = {
        [EditorialErrorCode.Forbidden]: 403,
        [ApiErrorCode.PreconditionRequired]: 428,
        [EditorialErrorCode.Conflict]: 412,
        [ApiErrorCode.InvalidPrecondition]: 400,
        [EditorialErrorCode.InvalidInput]: 400,
        [EditorialErrorCode.InvalidJson]: 400,
        [ApiErrorCode.MediaType]: 415,
        [ApiErrorCode.TooLarge]: 413,
        [EditorialErrorCode.Validation]: 422,
        [EditorialErrorCode.StoreBusy]: 503,
        [EditorialErrorCode.CorruptStore]: 500,
        [ApiErrorCode.IdentityMismatch]: 500,
        [EditorialErrorCode.ProfileMismatch]: 500,
      };
      return fail(statuses[error.code] ?? 409, error.code, [], {}, error.issues);
    }
    return fail(500, ApiErrorCode.InternalError);
  });
  api.notFound(() => fail(404, ApiErrorCode.NotFound));
  versioned.use(
    "*",
    languageDetector({
      supportedLanguages: ["en", "es"],
      fallbackLanguage: "en",
      order: ["header"],
      caches: false,
    }),
  );
  versioned.use("*", async (c, next) => {
    await next();
    // The generated document is invariant and remains English, even for Spanish clients.
    if (c.req.path === `${API_V1_BASE_PATH}/openapi.json` && c.res.ok) {
      c.header("Content-Language", "en");
      return;
    }
    const language = locale(c.get("language"));
    c.header("Content-Language", language);
    c.header("Vary", "Accept-Language");
    if (c.res.status >= 400 && c.req.method !== "HEAD") {
      const body = await c.res.json();
      const issues = ((body.error.issues ?? []) as (ValidationIssue & { message?: string })[]).map(
        (issue) => ({ ...issue, message: issue.message ?? issueMessage(language, issue) }),
      );
      c.res = new Response(
        JSON.stringify({
          error: {
            code: body.error.code,
            message: errorMessage(language, body.error.code),
            issues,
            details: issues.map((issue) => issue.message),
          },
        }),
        { status: c.res.status, headers: c.res.headers },
      );
    }
  });
  versioned.use("*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    const url = new URL(c.req.url);
    if (!url.pathname.startsWith(`${API_V1_BASE_PATH}/`)) return fail(404, ApiErrorCode.NotFound);
    if (url.search) return fail(400, ApiErrorCode.UnsupportedQuery);
    const segments = url.pathname
      .slice(API_V1_BASE_PATH.length + 1)
      .split("/")
      .map(decodeURIComponent);
    if (segments.some((segment) => !segment || segment.includes("/") || segment.includes("\\")))
      return fail(404, ApiErrorCode.NotFound);
    await next();
    // Hono dispatches HEAD through GET. Keep access/resource checks, then reject
    // the implicit success because this experimental contract only exposes GET.
    if (c.req.method === "HEAD" && c.res.ok) {
      c.res = fail(405, ApiErrorCode.MethodNotAllowed, [], {
        Allow: (allowed.get(routePath(c).slice(API_V1_BASE_PATH.length)) ?? ["GET"]).join(", "),
      });
    }
  });
  versioned.get("/openapi.json", (c) => c.json(openapi));
  versioned.all("/openapi.json", () =>
    fail(405, ApiErrorCode.MethodNotAllowed, [], { Allow: "GET" }),
  );
  versioned.use("/*", async (c, next) => {
    const principal = await services.authenticate(c.req.raw);
    if (principal === null)
      return fail(401, ApiErrorCode.Unauthenticated, [], { "WWW-Authenticate": "Bearer" });
    c.set("principal", principal);
    const accessible: Accessible[] = [];
    for (const app of await services.workspaces(principal)) {
      const context = await services.context(principal, app);
      if (context.principalId !== principal.id)
        throw new EditorialError(ApiErrorCode.IdentityMismatch);
      try {
        accessible.push({ app, context, snapshot: await app.read(context) });
      } catch (error) {
        if (!(error instanceof EditorialError && error.code === EditorialErrorCode.Forbidden))
          throw error;
      }
    }
    c.set("accessible", accessible);
    await next();
  });
  const selectWorkspace: MiddlewareHandler<ApiEnv> = async (c, next) => {
    const selected = c
      .get("accessible")
      .find(({ app }) => app.profile.id === c.req.param("foldId"));
    if (!selected) return fail(404, ApiErrorCode.NotFound);
    c.set("selected", selected);
    await next();
  };
  const selectProposal: MiddlewareHandler<ApiEnv> = async (c, next) => {
    const proposal = savedProposals(c.get("selected").snapshot).find(
      (item) => item.id === c.req.param("proposalId"),
    );
    if (!proposal) return fail(404, ApiErrorCode.NotFound);
    c.set("proposal", proposal);
    await next();
  };
  const prepareBody: MiddlewareHandler<ApiEnv> = async (c, next) => {
    c.req.bodyCache.json = Promise.resolve(await readJson(c.req.raw));
    await next();
  };
  const prepareMutation: MiddlewareHandler<ApiEnv> = async (c, next) => {
    c.set("conditions", preconditions(c.req.raw));
    return prepareBody(c, next);
  };
  const workspace: MiddlewareHandler<ApiEnv>[] = [selectWorkspace];
  const proposal: MiddlewareHandler<ApiEnv>[] = [selectWorkspace, selectProposal];
  const mutation: MiddlewareHandler<ApiEnv>[] = [selectWorkspace, selectProposal, prepareMutation];
  async function execute(c: Context<ApiEnv>, command: EvaluationCommand) {
    const { app, context } = c.get("selected");
    const receipt = await app.execute(command, context);
    const operation = await operationId(c.get("principal").id, app.profile.id, receipt.key);
    c.header("Location", `${API_V1_BASE_PATH}/operations/${operation}`);
    c.header("ETag", `"v${receipt.revision}"`);
    return responses.mutation.parse({
      operationId: operation,
      status: ApiOperationStatus.Completed,
      result: receipt,
    });
  }
  versioned.openapi(routes.me, (c) =>
    c.json(
      responses.identity.parse({
        principalId: c.get("principal").id,
        folds: c.get("accessible").map(({ app, context }) => ({
          id: app.profile.id,
          capabilities: [
            ...new Set(
              context.grants
                .filter(
                  (grant) =>
                    grant.principalId === c.get("principal").id &&
                    grant.foldId === app.profile.id &&
                    grant.revokedAt === undefined &&
                    (grant.expiresAt === undefined || grant.expiresAt > context.now) &&
                    (grant.resourceIds === undefined || grant.resourceIds.includes(app.profile.id)),
                )
                .flatMap((grant) => grant.capabilities),
            ),
          ],
        })),
      }),
      200,
    ),
  );
  versioned.openapi(routes.folds, (c) =>
    c.json(
      responses.folds.parse({
        items: c.get("accessible").map(({ app }) => ({
          id: app.profile.id,
          title: label(locale(c.get("language")), app.profile.titleKey, app.profile.title),
        })),
      }),
      200,
    ),
  );
  versioned.openapi({ ...routes.schemas, middleware: workspace }, (c) => {
    const { app } = c.get("selected");
    version(c);
    return c.json(
      responses.schemas.parse({
        items: [
          {
            id: app.profile.id,
            revision: app.profile.schemaRevision,
            editableFields: app.profile.fields.map((field) => ({
              ...field,
              label: label(locale(c.get("language")), field.labelKey, field.label),
            })),
            validation: ValidationAuthority.Server,
          },
        ],
      }),
      200,
    );
  });
  versioned.openapi({ ...routes.entries, middleware: workspace }, (c) => {
    const { app, snapshot } = c.get("selected");
    version(c);
    return c.json(
      responses.entries.parse({
        items: [
          { id: app.profile.id, revision: snapshot.canonicalRevision, content: snapshot.canonical },
        ],
      }),
      200,
    );
  });
  versioned.openapi({ ...routes.entry, middleware: workspace }, (c) => {
    const { app, snapshot } = c.get("selected");
    if (c.req.valid("param").entryId !== app.profile.id)
      return c.json({ error: { code: ApiErrorCode.NotFound, details: [] } }, 404);
    version(c);
    return c.json(
      responses.entry.parse({
        id: app.profile.id,
        revision: snapshot.canonicalRevision,
        content: snapshot.canonical,
      }),
      200,
    );
  });
  versioned.openapi({ ...routes.proposals, middleware: workspace }, (c) => {
    const { app, snapshot } = c.get("selected");
    version(c);
    return c.json(
      responses.proposals.parse({
        items: savedProposals(snapshot).map((item) => ({
          id: item.id,
          entryId: app.profile.id,
          state: item.contribution.state,
        })),
      }),
      200,
    );
  });
  versioned.openapi({ ...routes.proposal, middleware: proposal }, (c) => {
    const item = c.get("proposal");
    version(c);
    return c.json(
      responses.proposal.parse({
        id: item.id,
        entryId: c.get("selected").app.profile.id,
        content: item.content,
        contribution: item.contribution,
      }),
      200,
    );
  });
  versioned.openapi(
    { ...routes.create, middleware: [selectWorkspace, prepareMutation] },
    async (c) => {
      const input = c.req.valid("json");
      if (input.entryId !== c.get("selected").app.profile.id)
        throw new EditorialError(EditorialErrorCode.InvalidInput);
      return c.json(
        await execute(c, {
          ...c.get("conditions"),
          action: EditorialAction.Save,
          mode: ProposalWriteMode.Create,
          content: input.content,
        }),
        201,
      );
    },
  );
  versioned.openapi({ ...routes.update, middleware: mutation }, async (c) =>
    c.json(
      await execute(c, {
        ...c.get("conditions"),
        action: EditorialAction.Save,
        mode: ProposalWriteMode.Update,
        proposalId: c.get("proposal").id,
        content: c.req.valid("json").content,
      }),
      200,
    ),
  );
  versioned.openapi({ ...routes.validate, middleware: [...proposal, prepareBody] }, (c) => {
    const { app } = c.get("selected");
    const errors = app.profile.validate(c.req.valid("json").content ?? c.get("proposal").content);
    const issues = validationIssues(errors).map((issue) => ({
      ...issue,
      message: issueMessage(locale(c.get("language")), issue),
    }));
    version(c);
    return c.json(
      responses.validation.parse({
        valid: errors.length === 0,
        errors: issues.map((issue) => issue.message),
        issues,
        schemaRevision: app.profile.schemaRevision,
      }),
      200,
    );
  });
  versioned.openapi({ ...routes.diff, middleware: proposal }, (c) => {
    const item = c.get("proposal");
    if (item.baseContent === null)
      return c.json({ error: { code: ApiErrorCode.DiffUnavailable, details: [] } }, 409);
    version(c);
    return c.json(
      responses.diff.parse({ changes: contentDiff(item.baseContent, item.content) }),
      200,
    );
  });
  versioned.openapi({ ...routes.history, middleware: proposal }, (c) => {
    version(c);
    return c.json(responses.history.parse({ items: c.get("proposal").audit }), 200);
  });
  versioned.openapi(routes.operation, async (c) => {
    for (const { app, snapshot } of c.get("accessible")) {
      for (const operation of snapshot.operations) {
        if (
          operation.actor === c.get("principal").id &&
          (await operationId(operation.actor, app.profile.id, operation.key)) ===
            c.req.valid("param").operationId
        )
          return c.json(
            responses.operation.parse({
              id: c.req.valid("param").operationId,
              status: ApiOperationStatus.Completed,
              result: operation.receipt,
            }),
            200,
          );
      }
    }
    return c.json({ error: { code: ApiErrorCode.NotFound, details: [] } }, 404);
  });
  for (const { action, route } of actionRoutes) {
    versioned.openapi({ ...route, middleware: mutation }, async (c) =>
      c.json(
        await execute(c, {
          ...c.get("conditions"),
          action,
          proposalId: c.get("proposal").id,
        }),
        200,
      ),
    );
  }
  // Hono matches known paths; derive method fallbacks from the same route definitions.
  const allowed = new Map<string, string[]>();
  for (const route of allRoutes) {
    const path = route.getRoutingPath();
    allowed.set(path, [...(allowed.get(path) ?? []), route.method.toUpperCase()]);
  }
  for (const [path, methods] of allowed) {
    const scope = path.includes(":proposalId")
      ? proposal
      : path.includes(":foldId")
        ? workspace
        : [];
    for (const middleware of scope) versioned.use(path, middleware);
    versioned.all(path, () =>
      fail(405, ApiErrorCode.MethodNotAllowed, [], { Allow: methods.join(", ") }),
    );
  }
  return async (request) => {
    const headers = new Headers(request.headers);
    headers.set("Accept-Language", acceptedLanguages(headers.get("Accept-Language") ?? ""));
    return api.fetch(new Request(request, { headers }));
  };
}

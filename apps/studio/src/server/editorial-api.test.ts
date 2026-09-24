import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EditorialWorkspace } from "@lorekind/core";
import { verifyConfiguredBearer } from "./api-auth";
import { createEditorialApi } from "./editorial-api";
import { evaluationContext } from "./evaluation-context";
import { articleProfile } from "./evaluation-profile";
import { FileEvaluationStore } from "./evaluation-store";
import { openapi } from "./openapi";
import { assertContractResponse } from "./testing/contract-assertions";

const credentials = { author: "a".repeat(40), reviewer: "r".repeat(40) };
const root = `/api/v1/folds/${articleProfile.id}`;
const content = { title: "API article", body: "Revision one" };
let directory: string;
let revoked: boolean;
let api: ReturnType<typeof createEditorialApi>;
let app: EditorialWorkspace;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "lorekind-api-"));
  revoked = false;
  app = new EditorialWorkspace(
    new FileEvaluationStore(join(directory, "state.json")),
    articleProfile,
  );
  api = createEditorialApi({
    authenticate: async (request) =>
      verifyConfiguredBearer(request.headers.get("authorization"), credentials),
    workspaces: async () => [app],
    context: async (principal, workspace) => {
      const context = evaluationContext(workspace, principal.id);
      return revoked ? { ...context, grants: [] } : context;
    },
  });
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

async function call(
  path: string,
  options: {
    method?: string;
    actor?: keyof typeof credentials | "none";
    input?: unknown;
    revision?: number;
    key?: string;
    headers?: Record<string, string>;
  } = {},
) {
  const method = options.method ?? "GET";
  const actor = options.actor ?? "author";
  const response = await api(
    new Request(`http://localhost${path}`, {
      method,
      headers: {
        ...(actor === "none" ? {} : { Authorization: `Bearer ${credentials[actor]}` }),
        ...(options.input === undefined ? {} : { "Content-Type": "application/json" }),
        ...(options.revision === undefined ? {} : { "If-Match": `"v${options.revision}"` }),
        ...(options.key === undefined ? {} : { "Idempotency-Key": options.key }),
        ...options.headers,
      },
      ...(options.input === undefined ? {} : { body: JSON.stringify(options.input) }),
    }),
  );
  const data = await response.json();
  assertContractResponse(path, method, response, data);
  return { response, data };
}
async function create() {
  const result = await call(`${root}/proposals`, {
    method: "POST",
    input: { entryId: articleProfile.id, content },
    revision: 0,
    key: "create",
  });
  expect(result.response.status).toBe(201);
  return result.data.result.proposalId as string;
}
async function publish(id: string) {
  for (const [index, action] of ["submit", "approve", "publish"].entries()) {
    const result = await call(`${root}/proposals/${id}/${action}`, {
      method: "POST",
      input: {},
      revision: index + 1,
      key: action,
      actor: index === 0 ? "author" : "reviewer",
    });
    expect(result.response.status).toBe(200);
  }
}

describe("versioned editorial HTTP API", () => {
  it("serves the published OpenAPI contract without requiring an editorial credential", async () => {
    const result = await call("/api/v1/openapi.json", { actor: "none" });
    expect(result.response.status).toBe(200);
    expect(result.data).toEqual(openapi);
  });
  it("verifies bearer credentials and refuses identities supplied by query", async () => {
    expect((await call("/api/v1/me", { actor: "none" })).response.status).toBe(401);
    expect(
      (await call("/api/v1/me", { headers: { Authorization: "Bearer invalid" } })).response.status,
    ).toBe(401);
    expect((await call("/api/v1/me?actor=reviewer")).response.status).toBe(400);
    expect((await call("/api/v1/me")).data.principalId).toBe("author");
    expect((await call("/api/v1/me", { actor: "reviewer" })).data.folds[0].capabilities).toContain(
      "entry:review",
    );
  });
  it("discovers accessible spaces, schema fields and canonical entries", async () => {
    for (const path of [
      "/api/v1/folds",
      `${root}/schemas`,
      `${root}/entries`,
      `${root}/entries/${articleProfile.id}`,
    ]) {
      expect((await call(path)).response.status).toBe(200);
    }
    expect((await call(`${root}/entries`)).response.headers.get("etag")).toBe('"v0"');
    expect((await call("/api/v1/folds/foreign/entries")).response.status).toBe(404);
  });
  it("creates, validates, edits, diffs, reviews and publishes using documented responses", async () => {
    const id = await create();
    expect((await call(`${root}/proposals`)).data.items[0].id).toBe(id);
    expect((await call(`${root}/proposals/${id}`)).data.content).toEqual(content);
    const validation = await call(`${root}/proposals/${id}/validate`, {
      method: "POST",
      input: { content: { title: "", body: "x" } },
    });
    expect(validation.data.valid).toBe(false);
    expect((await call(`${root}/proposals/${id}/diff`)).data.changes).toHaveLength(2);
    await publish(id);
    expect((await call(`${root}/entries/${articleProfile.id}`)).data.content).toEqual(content);
    expect((await call(`${root}/proposals/${id}/history`)).data.items).toHaveLength(5);
    expect((await call(`${root}/proposals/${id}/diff`)).data.changes).toHaveLength(2);
  });
  it("retains old proposal identity, content, diff and history after a new proposal", async () => {
    const id = await create();
    await publish(id);
    const next = await call(`${root}/proposals`, {
      method: "POST",
      input: { entryId: articleProfile.id, content: { ...content, title: "Next" } },
      revision: 4,
      key: "new",
    });
    expect(next.response.status).toBe(201);
    expect(next.data.result.proposalId).not.toBe(id);
    expect((await call(`${root}/proposals`)).data.items).toHaveLength(2);
    expect((await call(`${root}/proposals/${id}`)).data.content).toEqual(content);
    expect((await call(`${root}/proposals/${id}/history`)).data.items).toHaveLength(5);
    expect(
      (
        await call(`${root}/proposals/${id}`, {
          method: "PATCH",
          input: { content },
          revision: 5,
          key: "old",
        })
      ).response.status,
    ).toBe(409);
    const restarted = new EditorialWorkspace(
      new FileEvaluationStore(join(directory, "state.json")),
      articleProfile,
    );
    expect(
      (await restarted.read(evaluationContext(restarted, "author"))).previousProposals,
    ).toHaveLength(1);
  });
  it("binds retries to the complete request and exposes only the initiator's receipt", async () => {
    const id = await create();
    const retry = await call(`${root}/proposals`, {
      method: "POST",
      input: { entryId: articleProfile.id, content },
      revision: 0,
      key: "create",
    });
    expect(retry.response.status).toBe(201);
    expect(retry.data.result.proposalId).toBe(id);
    expect((await call(retry.response.headers.get("location")!)).data.result).toEqual(
      retry.data.result,
    );
    expect(
      (await call(retry.response.headers.get("location")!, { actor: "reviewer" })).response.status,
    ).toBe(404);
    expect(
      (
        await call(`${root}/proposals`, {
          method: "POST",
          input: { entryId: articleProfile.id, content: { ...content, title: "Different" } },
          revision: 0,
          key: "create",
        })
      ).response.status,
    ).toBe(409);
    expect((await call(`${root}/proposals/${id}/history`)).data.items).toHaveLength(1);
  });
  it("requires preconditions and invalidates approval when PATCH changes content", async () => {
    const id = await create();
    expect(
      (
        await call(`${root}/proposals/${id}`, {
          method: "PATCH",
          input: { content },
          key: "missing",
        })
      ).response.status,
    ).toBe(428);
    expect(
      (
        await call(`${root}/proposals/${id}`, {
          method: "PATCH",
          input: { content },
          revision: 0,
          key: "stale",
        })
      ).response.status,
    ).toBe(412);
    await call(`${root}/proposals/${id}/submit`, {
      method: "POST",
      input: {},
      revision: 1,
      key: "submit",
    });
    await call(`${root}/proposals/${id}/approve`, {
      method: "POST",
      input: {},
      revision: 2,
      key: "approve",
      actor: "reviewer",
    });
    const patch = await call(`${root}/proposals/${id}`, {
      method: "PATCH",
      input: { content: { ...content, title: "Revised" } },
      revision: 3,
      key: "patch",
    });
    expect(patch.response.status).toBe(200);
    expect((await call(`${root}/proposals/${id}`)).data.contribution.approvals).toEqual([]);
    expect(
      (
        await call(`${root}/proposals/${id}/publish`, {
          method: "POST",
          input: {},
          revision: 4,
          key: "publish",
          actor: "reviewer",
        })
      ).response.status,
    ).toBe(409);
  });
  it("rejects forged fields, invalid content, oversize input and permission bypass", async () => {
    expect(
      (
        await call(`${root}/proposals`, {
          method: "POST",
          input: { entryId: articleProfile.id, content, principalId: "reviewer" },
          revision: 0,
          key: "forged",
        })
      ).response.status,
    ).toBe(400);
    expect(
      (
        await call(`${root}/proposals`, {
          method: "POST",
          input: { entryId: articleProfile.id, content: { title: "", body: "x" } },
          revision: 0,
          key: "bad",
        })
      ).response.status,
    ).toBe(422);
    expect(
      (
        await call(`${root}/proposals`, {
          method: "POST",
          input: { entryId: articleProfile.id, content: { title: "x".repeat(140000) } },
          revision: 0,
          key: "large",
        })
      ).response.status,
    ).toBe(413);
    const id = await create();
    expect(
      (
        await call(`${root}/proposals/${id}/approve`, {
          method: "POST",
          input: {},
          revision: 1,
          key: "self",
        })
      ).response.status,
    ).toBe(403);
    revoked = true;
    expect((await call(`${root}/proposals/${id}`)).response.status).toBe(404);
    expect((await call("/api/v1/folds")).data.items).toEqual([]);
  });
  it("dismisses and restores proposals without deleting their history", async () => {
    const id = await create();
    for (const [index, action] of ["dismiss", "restore"].entries()) {
      expect(
        (
          await call(`${root}/proposals/${id}/${action}`, {
            method: "POST",
            input: {},
            revision: index + 1,
            key: action,
            actor: "reviewer",
          })
        ).response.status,
      ).toBe(200);
    }
    expect((await call(`${root}/proposals/${id}/history`)).data.items).toHaveLength(3);
  });
  it("refuses weak or ambiguous credential configuration", () => {
    expect(() => verifyConfiguredBearer(null, { author: "short" })).toThrow();
    expect(() =>
      verifyConfiguredBearer(null, { author: credentials.author, reviewer: credentials.author }),
    ).toThrow();
    expect(verifyConfiguredBearer(`Bearer ${credentials.author}`, {})).toBeNull();
  });
});

it("mounts only v1 and preserves versioned method handling and receipt links", async () => {
  for (const path of ["/me", "/api/v2/me", "/api/v10/me", "/openapi.json"]) {
    const response = await api(new Request(`http://localhost${path}`));
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("not-found");
  }
  const denied = await call("/api/v1/me", { method: "POST", input: {} });
  expect(denied.response.status).toBe(405);
  expect(denied.response.headers.get("Allow")).toBe("GET");
  const head = await api(
    new Request(`http://localhost${root}/proposals`, {
      method: "HEAD",
      headers: { Authorization: `Bearer ${credentials.author}` },
    }),
  );
  expect(head.status).toBe(405);
  expect(head.headers.get("Allow")).toBe("GET, POST");
  const created = await call(`${root}/proposals`, {
    method: "POST",
    input: { entryId: articleProfile.id, content },
    revision: 0,
    key: "mount-test",
  });
  const location = created.response.headers.get("Location")!;
  expect(location).toBe(`/api/v1/operations/${created.data.operationId}`);
  expect((await call(location)).response.status).toBe(200);
});

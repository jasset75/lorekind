import { build } from "esbuild";
import { Miniflare } from "miniflare";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assertContractResponse, contract } from "./testing/contract-assertions";
import { createRuntimeFixture } from "./testing/runtime-fixture";
import { openapi } from "./openapi";

const root = "/api/v1/folds/article-example";
const content = { title: "Portable article", body: "The same contract on two runtimes." };
type Options = {
  method?: string;
  actor?: "author" | "reviewer" | "none";
  input?: unknown;
  raw?: string | Uint8Array;
  revision?: number;
  key?: string;
  headers?: Record<string, string>;
};

describe.each(["Node Fetch", "Workers without Node compatibility"])(
  "HTTP contract: %s",
  (runtime) => {
    let send: (request: Request) => Promise<Response>;
    let worker: Miniflare | undefined;
    beforeAll(async () => {
      if (runtime === "Node Fetch") return;
      const compiled = await build({
        entryPoints: [fileURLToPath(new URL("./testing/worker-fixture.ts", import.meta.url))],
        bundle: true,
        write: false,
        platform: "browser",
        format: "esm",
        target: "es2022",
        metafile: true,
      });
      const sources = Object.keys(compiled.metafile!.inputs);
      expect(sources.some((path) => /evaluation-store|api-auth|api-openapi-build/.test(path))).toBe(
        false,
      );
      expect(Object.values(compiled.metafile!.outputs).flatMap((output) => output.imports)).toEqual(
        [],
      );
      worker = new Miniflare({
        modules: true,
        script: compiled.outputFiles[0]!.text,
        compatibilityDate: "2026-07-30",
        compatibilityFlags: ["no_nodejs_compat"],
        host: "127.0.0.1",
        port: 0,
      });
      send = async (request) => {
        const response = await worker!.dispatchFetch(request.url, {
          method: request.method,
          headers: Object.fromEntries(request.headers),
          ...(request.body === null ? {} : { body: await request.arrayBuffer() }),
        });
        return new Response(response.body === null ? null : await response.arrayBuffer(), {
          status: response.status,
          headers: Object.fromEntries(response.headers),
        });
      };
      const probe = await send(new Request("http://localhost/__fixture/runtime"));
      expect(await probe.json()).toEqual({ dynamicCodeBlocked: true, nodeProcessAbsent: true });
    }, 30000);
    beforeEach(async () => {
      if (runtime === "Node Fetch") send = createRuntimeFixture();
      else await send(new Request("http://localhost/__fixture/reset"));
    });
    afterAll(async () => {
      await worker?.dispose();
    });

    async function call(path: string, options: Options = {}) {
      const actor = options.actor ?? "author";
      const method = options.method ?? "GET";
      const body =
        options.raw ?? (options.input === undefined ? undefined : JSON.stringify(options.input));
      const response = await send(
        new Request(`http://localhost${path}`, {
          method,
          headers: {
            ...(actor === "none" ? {} : { Authorization: `Bearer fixture-${actor}` }),
            ...(body === undefined ? {} : { "Content-Type": "application/json" }),
            ...(options.revision === undefined ? {} : { "If-Match": `"v${options.revision}"` }),
            ...(options.key === undefined ? {} : { "Idempotency-Key": options.key }),
            ...options.headers,
          },
          ...(body === undefined ? {} : { body: body as BodyInit }),
        }),
      );
      const data = method === "HEAD" ? null : await response.json();
      if (method !== "HEAD") assertContractResponse(path, method, response, data);
      return { response, data };
    }
    const create = (key = "create", revision = 0) =>
      call(`${root}/proposals`, {
        method: "POST",
        input: { entryId: "article-example", content },
        revision,
        key,
      });

    it("negotiates presentation language without cookies or translated machine codes", async () => {
      for (const [header, language] of [
        ["", "en"],
        ["fr-FR", "en"],
        ["es-ES", "es"],
        ["ES-mx", "es"],
        ["en;q=0.4, es;q=0.9", "es"],
        ["es;q=0, en;q=0.2", "en"],
        ["fr, es;q=0", "en"],
        ["not a language", "en"],
      ]) {
        const result = await call("/api/v1/me", {
          actor: "none",
          headers: { "Accept-Language": header!, Cookie: "language=es" },
        });
        expect(result.response.headers.get("content-language")).toBe(language);
        expect(result.response.headers.get("vary")).toBe("Accept-Language");
        expect(result.response.headers.get("set-cookie")).toBeNull();
        expect(result.response.headers.get("www-authenticate")).toBe("Bearer");
        expect(result.data.error).toEqual({
          code: "unauthenticated",
          details: [],
          issues: [],
          message:
            language === "es"
              ? "Se necesita una identidad verificada."
              : "A verified identity is required.",
        });
      }
      const query = await call("/api/v1/me?lang=es");
      expect(query.data.error.code).toBe("unsupported-query");
      expect(query.response.headers.get("content-language")).toBe("en");
    });
    it("localizes Zod issues concurrently without exposing submitted values", async () => {
      const results = await Promise.all(
        Array.from({ length: 12 }, (_, index) =>
          call(`${root}/proposals`, {
            method: "POST",
            revision: 0,
            key: `locale-${index}`,
            headers: { "Accept-Language": index % 2 ? "es" : "en" },
            input: { entryId: { secret: "private-submitted-value" }, content },
          }),
        ),
      );
      for (const [index, result] of results.entries()) {
        expect(result.response.status).toBe(400);
        expect(result.response.headers.get("content-language")).toBe(index % 2 ? "es" : "en");
        const issue = result.data.error.issues[0];
        expect(issue).toMatchObject({
          code: "zod.invalid_type",
          path: ["entryId"],
          params: { expected: "string" },
        });
        expect(issue.message).toMatch(index % 2 ? /objeto/i : /received object/i);
        expect(result.data.error.details).toEqual([issue.message]);
        expect(JSON.stringify(result.data)).not.toContain("private-submitted-value");
        expect(issue).not.toHaveProperty("input");
      }
      expect(results[0]!.data.error.issues[0].message).not.toBe(
        results[1]!.data.error.issues[0].message,
      );
      expect((await call(`${root}/entries`)).response.headers.get("etag")).toBe('"v0"');
    });
    it("keeps domain issues stable across translated validation and mutation errors", async () => {
      const created = await create();
      const path = `${root}/proposals/${created.data.result.proposalId}`;
      const invalid = { title: "", body: content.body };
      const results = await Promise.all(
        ["en", "es"].map((language) =>
          call(`${path}/validate`, {
            method: "POST",
            input: { content: invalid },
            headers: { "Accept-Language": language },
          }),
        ),
      );
      for (const result of results) {
        expect(result.data.valid).toBe(false);
        expect(result.data.issues[0]).toMatchObject({
          code: "text-length",
          path: ["title"],
          params: { min: 1, max: 200 },
        });
        expect(result.data.errors).toEqual([result.data.issues[0].message]);
        expect(result.response.headers.get("etag")).toBe('"v1"');
      }
      expect(results[0]!.data.issues[0].message).toContain("Title");
      expect(results[1]!.data.issues[0].message).toContain("Título");
      const rejected = await call(path, {
        method: "PATCH",
        revision: 1,
        key: "invalid",
        input: { content: invalid },
        headers: { "Accept-Language": "es" },
      });
      expect(rejected.response.status).toBe(422);
      expect(rejected.data.error.issues).toEqual(results[1]!.data.issues);
      expect((await call(path)).data.content).toEqual(content);
    });
    it("translates profile labels, not content, receipts, revisions or the OpenAPI document", async () => {
      const spanish = { headers: { "Accept-Language": "es" } };
      expect((await call("/api/v1/folds", spanish)).data.items[0].title).toBe(
        "Artículo · ejemplo genérico",
      );
      expect((await call(`${root}/schemas`, spanish)).data.items[0].editableFields[0].label).toBe(
        "Título",
      );
      expect((await call(`${root}/schemas`)).data.items[0].editableFields[0].label).toBe("Title");
      const created = await create();
      const retry = await call(`${root}/proposals`, {
        ...spanish,
        method: "POST",
        input: { entryId: "article-example", content },
        revision: 0,
        key: "create",
      });
      expect(retry.data).toEqual(created.data);
      const path = `${root}/proposals/${created.data.result.proposalId}`;
      expect((await call(path, spanish)).data).toEqual((await call(path)).data);
      const document = await call("/api/v1/openapi.json", spanish);
      expect(document.data).toEqual(openapi);
      expect(document.response.headers.get("content-language")).toBe("en");
    });

    it("serves the generated artifact and supports a client driven by its operation IDs", async () => {
      expect((await call("/api/v1/openapi.json", { actor: "none" })).data).toEqual(openapi);
      const clientCall = (
        operationId: string,
        params: Record<string, string>,
        options: Options = {},
      ) => {
        for (const [template, methods] of Object.entries(contract.paths)) {
          for (const [method, operation] of Object.entries(methods)) {
            if (operation.operationId === operationId) {
              const path = template.replace(/\{([^}]+)\}/g, (_, name: string) => {
                if (!params[name]) throw new Error(`Missing client parameter: ${name}`);
                return encodeURIComponent(params[name]);
              });
              return call(path, { ...options, method: method.toUpperCase() });
            }
          }
        }
        throw new Error(`Missing operation: ${operationId}`);
      };
      const created = await clientCall(
        "post_folds_foldId_proposals",
        { foldId: "article-example" },
        {
          input: { entryId: "article-example", content },
          revision: 0,
          key: "client",
        },
      );
      expect(created.response.status).toBe(201);
      const read = await clientCall("get_folds_foldId_proposals_proposalId", {
        foldId: "article-example",
        proposalId: created.data.result.proposalId,
      });
      expect(read.data.content).toEqual(content);
    });
    it("preserves reads, edits, independent review, publication, recovery and historical proposals", async () => {
      for (const path of [
        "/api/v1/me",
        "/api/v1/folds",
        `${root}/schemas`,
        `${root}/entries`,
        `${root}/entries/article-example`,
      ])
        expect((await call(path)).response.status).toBe(200);
      const created = await create();
      expect(created.response.status).toBe(201);
      const path = `${root}/proposals/${created.data.result.proposalId}`;
      expect((await call(`${root}/proposals`)).data.items).toHaveLength(1);
      expect((await call(`${path}/diff`)).data.changes).toHaveLength(2);
      expect((await call(`${path}/validate`, { method: "POST", input: {} })).data.valid).toBe(true);
      expect(
        (await call(`${path}/validate`, { method: "POST", input: { content: { title: "" } } })).data
          .valid,
      ).toBe(false);
      const edited = { ...content, title: "Edited" };
      expect(
        (
          await call(path, {
            method: "PATCH",
            input: { content: edited },
            revision: 1,
            key: "edit",
          })
        ).response.status,
      ).toBe(200);
      for (const [index, action] of ["submit", "approve", "publish"].entries()) {
        expect(
          (
            await call(`${path}/${action}`, {
              method: "POST",
              input: {},
              revision: index + 2,
              key: action,
              actor: index === 0 ? "author" : "reviewer",
            })
          ).response.status,
        ).toBe(200);
      }
      const retry = await call(`${path}/publish`, {
        method: "POST",
        input: {},
        revision: 4,
        key: "publish",
        actor: "reviewer",
      });
      expect(retry.response.status).toBe(200);
      expect(retry.data.result.revision).toBe(5);
      expect(
        (await call(retry.response.headers.get("location")!, { actor: "reviewer" })).data.result,
      ).toEqual(retry.data.result);
      expect((await call(retry.response.headers.get("location")!)).response.status).toBe(404);
      expect((await call(`${root}/entries/article-example`)).data.content).toEqual(edited);
      expect((await create("next", 5)).response.status).toBe(201);
      expect((await call(`${root}/proposals`)).data.items).toHaveLength(2);
      expect((await call(path)).data.content).toEqual(edited);
      expect((await call(`${path}/history`)).data.items).toHaveLength(6);
      expect(
        (await call(path, { method: "PATCH", input: { content }, revision: 6, key: "past" }))
          .response.status,
      ).toBe(409);
    });
    it("enforces current grants, self-review denial and approval invalidation", async () => {
      expect((await call("/api/v1/me", { actor: "none" })).response.status).toBe(401);
      const created = await create();
      const path = `${root}/proposals/${created.data.result.proposalId}`;
      expect(
        (await call(`${path}/approve`, { method: "POST", input: {}, revision: 1, key: "self" }))
          .response.status,
      ).toBe(403);
      await call(`${path}/submit`, { method: "POST", input: {}, revision: 1, key: "submit" });
      await call(`${path}/approve`, {
        method: "POST",
        input: {},
        revision: 2,
        key: "approve",
        actor: "reviewer",
      });
      await call(path, {
        method: "PATCH",
        input: { content: { ...content, title: "Changed after review" } },
        revision: 3,
        key: "edit",
      });
      expect((await call(path)).data.contribution.approvals).toEqual([]);
      expect(
        (
          await call(`${path}/publish`, {
            method: "POST",
            input: {},
            revision: 4,
            key: "publish",
            actor: "reviewer",
          })
        ).response.status,
      ).toBe(409);
      await send(new Request("http://localhost/__fixture/revoke"));
      expect((await call(path)).response.status).toBe(404);
      expect((await call("/api/v1/folds")).data.items).toEqual([]);
    });
    it("preserves dismissal, restoration and direct authorization as distinct commands", async () => {
      await send(new Request("http://localhost/__fixture/direct"));
      const created = await create();
      const path = `${root}/proposals/${created.data.result.proposalId}`;
      for (const [index, action] of [
        "dismiss",
        "restore",
        "authorize-direct",
        "publish",
      ].entries()) {
        expect(
          (
            await call(`${path}/${action}`, {
              method: "POST",
              input: {},
              revision: index + 1,
              key: action,
              actor: "reviewer",
            })
          ).response.status,
        ).toBe(200);
      }
      expect((await call(path)).data.contribution.state).toBe("Applied");
    });
    it("rejects malformed, forged, non-object and oversized input without changing state", async () => {
      const cases: [Options, number, string][] = [
        [{ raw: "{" }, 400, "invalid-json"],
        [{ raw: new Uint8Array([0x7b, 0x22, 0xff, 0x22, 0x3a, 0x31, 0x7d]) }, 400, "invalid-json"],
        [{ input: [] }, 400, "invalid-input"],
        [{ input: null }, 400, "invalid-input"],
        [
          { input: { entryId: "article-example", content, principalId: "reviewer" } },
          400,
          "invalid-input",
        ],
        [{ input: { entryId: "article-example", content: [] } }, 400, "invalid-input"],
        [
          {
            input: { entryId: "article-example", content },
            headers: { "Content-Type": "text/plain" },
          },
          415,
          "media-type",
        ],
        [
          { input: { entryId: "article-example", content: { title: "", body: "x" } } },
          422,
          "validation",
        ],
        [
          {
            raw: JSON.stringify({
              entryId: "article-example",
              content: { body: "é".repeat(70000) },
            }),
          },
          413,
          "too-large",
        ],
      ];
      for (const [options, status, code] of cases) {
        const result = await call(`${root}/proposals`, {
          method: "POST",
          revision: 0,
          key: "invalid",
          ...options,
        });
        expect(result.response.status).toBe(status);
        expect(result.data.error.code).toBe(code);
      }
      expect((await call(`${root}/entries`)).response.headers.get("etag")).toBe('"v0"');
    });
    it("does not let MIME parsing hide forged action fields or supplied validation content", async () => {
      const created = await create();
      const path = `${root}/proposals/${created.data.result.proposalId}`;
      const forged = await call(`${path}/submit`, {
        method: "POST",
        input: { principalId: "reviewer" },
        revision: 1,
        key: "forged",
        headers: { "Content-Type": "application/json; broken" },
      });
      expect(forged.response.status).toBe(415);
      expect((await call(path)).data.contribution.state).toBe("Draft");
      const strict = await call(`${path}/submit`, {
        method: "POST",
        input: { principalId: "reviewer" },
        revision: 1,
        key: "forged",
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
      expect(strict.response.status).toBe(400);
      const invalid = await call(`${path}/validate`, {
        method: "POST",
        input: { content: { title: "" } },
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
      expect(invalid.data.valid).toBe(false);
    });
    it("preserves precondition error priority and rejects invalid revision/key headers", async () => {
      const input = { entryId: "article-example", content };
      for (const [headers, status, code] of [
        [{}, 428, "precondition-required"],
        [{ "If-Match": "wrong" }, 400, "invalid-precondition"],
        [{ "If-Match": '"v9007199254740992"', "Idempotency-Key": "large" }, 400, "invalid-input"],
        [{ "If-Match": '"v0"' }, 400, "invalid-input"],
        [{ "If-Match": '"v0"', "Idempotency-Key": "x".repeat(129) }, 400, "invalid-input"],
      ] as [Record<string, string>, number, string][]) {
        const result = await call(`${root}/proposals`, { method: "POST", input, headers });
        expect([result.response.status, result.data.error.code]).toEqual([status, code]);
      }
      const missing = await call(`${root}/proposals`, { method: "POST", raw: "{" });
      expect(missing.response.status).toBe(428);
      expect((await create("stale", 1)).response.status).toBe(412);
    });
    it("does not duplicate concurrent retries or overwrite a concurrent revision", async () => {
      const retries = await Promise.all([create(), create()]);
      expect(retries.map(({ response }) => response.status)).toEqual([201, 201]);
      expect(retries[0]!.data).toEqual(retries[1]!.data);
      const path = `${root}/proposals/${retries[0]!.data.result.proposalId}`;
      const competing = await Promise.all(
        ["a", "b"].map((title) =>
          call(path, {
            method: "PATCH",
            input: { content: { ...content, title } },
            revision: 1,
            key: title,
          }),
        ),
      );
      expect(competing.map(({ response }) => response.status).sort()).toEqual([200, 412]);
      const changed = await call(`${root}/proposals`, {
        method: "POST",
        input: { entryId: "article-example", content: { ...content, title: "different" } },
        revision: 0,
        key: "create",
      });
      expect(changed.response.status).toBe(409);
    });
    it("keeps strict paths and method handling, including HEAD", async () => {
      for (const path of ["/api/v1/me/", "/api/v1/folds/a%2Fb/entries", "/api/v1/unknown"])
        expect((await call(path)).response.status).toBe(404);
      expect((await call("/api/v1/folds/%ZZ/entries")).response.status).toBe(400);
      expect((await call("/api/v1/me?actor=reviewer")).response.status).toBe(400);
      const method = await call("/api/v1/me", { method: "POST" });
      expect(method.response.status).toBe(405);
      expect(method.response.headers.get("allow")).toBe("GET");
      expect((await call("/api/v1/me", { method: "HEAD" })).response.status).toBe(405);
      expect((await call(`${root}/entries/foreign`)).response.status).toBe(404);
    });
  },
);

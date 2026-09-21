import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { decodeJwt, exportJWK, generateKeyPair, SignJWT } from "jose";
import { EditorialWorkspace } from "@lorekind/core";
import { createBrowserEditorialApi } from "./browser-api";
import { cloudflareAccessIdentity } from "./cloudflare-access";
import { evaluationContext } from "./evaluation-context";
import { articleProfile } from "./evaluation-profile";
import { FileEvaluationStore } from "./evaluation-store";

const origin = "https://studio.example.test";
const issuer = "https://example.cloudflareaccess.com";
const audience = "test-application";
const root = `/api/v1/folds/${articleProfile.id}`;
const pair = await generateKeyPair("RS256");
const jwk = { ...(await exportJWK(pair.publicKey)), kid: "key-1", alg: "RS256" };
let directory: string;
let revoked: boolean;
let grantRevoked: boolean;
let unavailable: boolean;
let api: ReturnType<typeof createBrowserEditorialApi>;
let fetchKeys: ReturnType<typeof vi.fn>;

async function token(subject = "author", overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    iss: issuer,
    aud: audience,
    sub: subject,
    iat: now,
    exp: now + 300,
    type: "app",
    ...overrides,
  })
    .setProtectedHeader({ alg: "RS256", kid: "key-1" })
    .sign(pair.privateKey);
}
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "lorekind-browser-"));
  revoked = grantRevoked = unavailable = false;
  fetchKeys = vi.fn(async () => Response.json({ keys: [jwk] }));
  vi.stubGlobal("fetch", fetchKeys);
  const identity = cloudflareAccessIdentity({ issuer, audience });
  const app = new EditorialWorkspace(
    new FileEvaluationStore(join(directory, "api.json")),
    articleProfile,
  );
  api = createBrowserEditorialApi({
    origin,
    identity,
    resolvePrincipal: async ({ subject }) => {
      if (unavailable) throw new Error("private provider failure");
      return !revoked && ["author", "reviewer"].includes(subject) ? { id: subject } : null;
    },
    workspaces: async () => [app],
    context: async (principal) => {
      const context = evaluationContext(app, principal.id);
      return grantRevoked ? { ...context, grants: [] } : context;
    },
  });
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await rm(directory, { recursive: true, force: true });
});
async function call(
  path = "/api/v1/me",
  jwt?: string,
  method = "GET",
  body?: unknown,
  headers = {},
) {
  const response = await api(
    new Request(`${origin}${path}`, {
      method,
      headers: { "cf-access-jwt-assertion": jwt ?? (await token()), ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  );
  expect(response.headers.get("cache-control")).toBe("no-store");
  return { status: response.status, data: await response.json() };
}

it("verifies the assertion against the configured issuer keys, not forwarded email or role", async () => {
  const result = await call(
    "/api/v1/me",
    await token("author", { email: "reviewer@example.test" }),
  );
  expect(result.data.principalId).toBe("author");
  expect(fetchKeys.mock.calls[0]?.[0]).toBe(`${issuer}/cdn-cgi/access/certs`);
  expect(
    (
      await call("/api/v1/me", "", "GET", undefined, {
        "cf-access-authenticated-user-email": "reviewer@example.test",
        Authorization: "Bearer reviewer",
      })
    ).status,
  ).toBe(401);
  expect((await call("/api/v1/me?actor=reviewer")).status).toBe(400);
});
it.each([
  { iss: "https://attacker.cloudflareaccess.com" },
  { aud: "other-app" },
  { exp: 1 },
  { exp: undefined },
  { iat: undefined },
  { iat: 9999999999 },
  { nbf: 9999999999 },
  { sub: "" },
  { sub: undefined },
  { type: "org" },
  { type: undefined },
  { sub: "unmapped-person" },
])("rejects invalid claims or unmapped principals: %j", async (claims) => {
  expect((await call("/api/v1/me", await token("author", claims))).status).toBe(401);
});
it("rejects malformed and incorrectly signed tokens", async () => {
  expect((await call("/api/v1/me", "not-a-jwt")).status).toBe(401);
  const other = await generateKeyPair("RS256");
  const forged = await new SignJWT(decodeJwt(await token("reviewer")))
    .setProtectedHeader({ alg: "RS256", kid: "key-1" })
    .sign(other.privateKey);
  expect((await call("/api/v1/me", forged)).status).toBe(401);
  const symmetric = await new SignJWT(decodeJwt(await token("reviewer")))
    .setProtectedHeader({ alg: "HS256", kid: "key-1" })
    .sign(new TextEncoder().encode("untrusted-key".repeat(4)));
  expect((await call("/api/v1/me", symmetric)).status).toBe(401);
});
it.each([undefined, "null", "https://evil.test", "https://sibling.example.test"])(
  "rejects mutations without the exact browser origin: %s",
  async (value) => {
    const result = await call(
      `${root}/proposals`,
      undefined,
      "POST",
      {},
      value === undefined ? {} : { Origin: value },
    );
    expect(result.status).toBe(403);
    expect(fetchKeys).not.toHaveBeenCalled();
  },
);
it("rejects a different request host and cross-site reads", async () => {
  expect((await api(new Request("https://evil.test/api/v1/me"))).status).toBe(403);
  expect(
    (await call("/api/v1/me", undefined, "GET", undefined, { "Sec-Fetch-Site": "cross-site" }))
      .status,
  ).toBe(403);
});
it("rechecks principal mapping and grants even while the JWT remains valid", async () => {
  const jwt = await token();
  expect((await call("/api/v1/me", jwt)).status).toBe(200);
  grantRevoked = true;
  expect((await call(`${root}/entries`, jwt)).status).toBe(404);
  revoked = true;
  expect((await call("/api/v1/me", jwt)).status).toBe(401);
});
it("fails closed without leaking provider failures", async () => {
  unavailable = true;
  const result = await call();
  expect(result.status).toBe(500);
  expect(JSON.stringify(result.data)).not.toContain("private provider failure");
  unavailable = false;
  fetchKeys.mockRejectedValue(new Error("JWKS unavailable"));
  // Use a new adapter so there is no already-verified key cache.
  const identity = cloudflareAccessIdentity({ issuer, audience });
  await expect(
    identity.verify(
      new Request(origin, {
        headers: { "cf-access-jwt-assertion": await token() },
      }),
    ),
  ).rejects.toThrow();
});
it("runs save, submit, independent review and application through the browser boundary", async () => {
  const author = await token();
  const reviewer = await token("reviewer");
  const headers = (revision: number, key: string) => ({
    Origin: origin,
    "Content-Type": "application/json",
    "If-Match": `"v${revision}"`,
    "Idempotency-Key": key,
  });
  const created = await call(
    `${root}/proposals`,
    author,
    "POST",
    { entryId: articleProfile.id, content: { title: "Browser article", body: "Saved content" } },
    headers(0, "create"),
  );
  expect(created.status).toBe(201);
  const proposal = `${root}/proposals/${created.data.result.proposalId}`;
  expect((await call(`${proposal}/submit`, author, "POST", {}, headers(1, "submit"))).status).toBe(
    200,
  );
  expect(
    (await call(`${proposal}/approve`, author, "POST", {}, headers(2, "self-review"))).status,
  ).toBe(403);
  expect(
    (await call(`${proposal}/approve`, reviewer, "POST", {}, headers(2, "review"))).status,
  ).toBe(200);
  const applied = await call(`${proposal}/publish`, reviewer, "POST", {}, headers(3, "apply"));
  expect(applied.status).toBe(200);
  expect(
    (await call(`${proposal}/publish`, reviewer, "POST", {}, headers(3, "apply"))).data,
  ).toEqual(applied.data);
});
it("rejects noncanonical origins and unsafe Access configuration before serving requests", () => {
  for (const origin of ["http://studio.test", "https://studio.test/path", "https://studio.test/"]) {
    expect(() =>
      createBrowserEditorialApi({
        origin,
        identity: { verify: async () => null },
        resolvePrincipal: async () => null,
        workspaces: async () => [],
        context: vi.fn(),
      }),
    ).toThrow();
  }
  expect(() =>
    cloudflareAccessIdentity({ issuer: "http://example.cloudflareaccess.com", audience }),
  ).toThrow();
  expect(() => cloudflareAccessIdentity({ issuer, audience: "" })).toThrow();
});

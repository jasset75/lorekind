import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { EditorialWorkspace } from "@lorekind/core";
import { editorialClient, type StudioCommand } from "../client/editorial-client";
import { createBrowserEditorialApi } from "./browser-api";
import { FileEvaluationStore } from "./evaluation-store";
import { evaluationContext } from "./evaluation-context";
import { articleProfile } from "./evaluation-profile";

let directory: string;
let principal: string | null;
let revoked: boolean;
let mixedRevision: boolean;
let loseResponse: boolean;
let client: ReturnType<typeof editorialClient>;
let sent: { path: string; init: RequestInit }[];
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "lorekind-client-"));
  principal = "author";
  revoked = mixedRevision = loseResponse = false;
  sent = [];
  const app = new EditorialWorkspace(
    new FileEvaluationStore(join(directory, "state.json")),
    articleProfile,
  );
  const api = createBrowserEditorialApi({
    origin: "https://studio.example.test",
    identity: {
      verify: async () =>
        principal
          ? { issuer: "test", subject: principal, issuedAt: 0, expiresAt: 9999999999 }
          : null,
    },
    resolvePrincipal: async ({ subject }) => ({ id: subject }),
    workspaces: async () => [app],
    context: async ({ id }) => ({
      ...evaluationContext(app, id),
      ...(revoked ? { grants: [] } : {}),
    }),
  });
  client = editorialClient(async (input, init = {}) => {
    const path = String(input);
    sent.push({ path, init });
    const headers = new Headers(init.headers);
    // Emulate browser-managed metadata; the client does not supply identity headers.
    headers.set("Origin", "https://studio.example.test");
    const response = await api(
      new Request(`https://studio.example.test${path}`, { ...init, headers }),
    );
    if (mixedRevision && path.endsWith("/schemas")) response.headers.set("ETag", '"v999"');
    if (loseResponse && init.method === "POST") {
      loseResponse = false;
      throw new TypeError("connection lost");
    }
    return response;
  });
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});
async function command(action: string): Promise<StudioCommand> {
  const view = await client.load();
  return {
    action,
    key: crypto.randomUUID(),
    expectedRevision: view.snapshot.revision,
    target: view.target,
    ...(action === "save" ? { content: { title: "New title", body: "New body" } } : {}),
  };
}
it("completes a two-principal workflow through the browser API", async () => {
  expect((await client.load()).allowed.approve).toBe(false);
  const save = await command("save");
  expect((await client.execute(save)).status).toBe(201);
  const own = await client.load();
  expect(own.allowed.approve).toBe(false);
  expect(own.allowed.dismiss).toBe(true);
  expect((await client.execute(await command("submit"))).ok).toBe(true);
  principal = "reviewer";
  expect((await client.load()).allowed.save).toBe(false);
  expect((await client.execute(await command("approve"))).ok).toBe(true);
  expect((await client.execute(await command("publish"))).ok).toBe(true);
  expect((await client.load()).snapshot.canonical.title).toBe("New title");
  principal = "author";
  expect((await client.execute(await command("save"))).status).toBe(201);
  for (const { path, init } of sent) {
    expect(path.startsWith("/api/v1/")).toBe(true);
    expect(path).not.toContain("actor=");
    expect(init).toMatchObject({
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
    });
    expect(new Headers(init.headers).has("authorization")).toBe(false);
    expect(init.body ?? "").not.toContain("principalId");
  }
});
it("retains operation identity after a lost response, and rejects stale writes", async () => {
  const first = await command("save");
  loseResponse = true;
  await expect(client.execute(first)).rejects.toThrow("connection lost");
  expect((await client.execute(first)).ok).toBe(true);
  const stale = await command("save");
  expect((await client.execute(await command("save"))).ok).toBe(true);
  expect((await client.execute(stale)).status).toBe(412);
});
it("fails closed on logout, revocation and changed identity before a retry", async () => {
  const pending = await command("save");
  principal = "reviewer";
  await expect(client.execute(pending)).rejects.toMatchObject({ code: "identity-changed" });
  expect(sent.filter(({ init }) => init.method)).toHaveLength(0);
  principal = null;
  await expect(client.load()).rejects.toMatchObject({ code: "unauthenticated" });
  principal = "author";
  revoked = true;
  expect((await client.execute(pending)).status).toBe(404);
});
it("does not assemble a writable view from different revisions", async () => {
  mixedRevision = true;
  await expect(client.load()).rejects.toMatchObject({ code: "conflict" });
});

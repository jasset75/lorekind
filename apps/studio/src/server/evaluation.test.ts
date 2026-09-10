import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileEvaluationStore } from "./evaluation-store";
import { articleProfile } from "./evaluation-profile";
import { createGrant, EditorialWorkspace, contentDiff } from "@lorekind/core";
import type { EvaluationCommand, WorkflowContext } from "@lorekind/core";

let directory: string;
let filename: string;
const context: WorkflowContext = {
  foldId: articleProfile.id,
  principalId: "author",
  grants: [
    createGrant({
      id: "author",
      principalId: "author",
      foldId: articleProfile.id,
      role: "creator",
    }),
    createGrant({
      id: "reviewer",
      principalId: "reviewer",
      foldId: articleProfile.id,
      role: "publisher",
    }),
  ],
  delegations: [],
  policy: { mode: "independent", requiredApprovals: 1 },
  policyRevision: "policy-1",
  schemaRevision: articleProfile.schemaRevision,
  targetRevision: "application-loaded",
  now: new Date("2026-09-08T12:00:00Z"),
};
const reviewer = { ...context, principalId: "reviewer" };
const content = { title: "Título revisado", body: "Texto nuevo" };
function app() {
  return new EditorialWorkspace(new FileEvaluationStore(filename), articleProfile);
}
function save(expectedRevision = 0, key = "save"): Extract<EvaluationCommand, { action: "save" }> {
  return { key, expectedRevision, action: "save", content };
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "lorekind-evaluation-"));
  filename = join(directory, "state.json");
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe("durable local editorial evaluation", () => {
  it("saves, reloads, validates, diffs, reviews and applies across new application instances", async () => {
    await app().execute(save(), context);
    const reloaded = await app().read(context);
    expect(reloaded.draft).toEqual(content);
    expect(reloaded.canonical).toEqual(articleProfile.initialContent);
    expect(contentDiff(reloaded.canonical, reloaded.draft).map((item) => item.field)).toEqual([
      "body",
      "title",
    ]);
    await app().execute({ key: "submit", expectedRevision: 1, action: "submit" }, context);
    await app().execute({ key: "approve", expectedRevision: 2, action: "approve" }, reviewer);
    await app().execute({ key: "publish", expectedRevision: 3, action: "publish" }, reviewer);
    const published = await app().read(context);
    expect(published.canonical).toEqual(content);
    expect(published.contribution?.state).toBe("Applied");
    expect(published.audit.map((item) => item.action)).toEqual([
      "create",
      "submit",
      "approve",
      "publish",
      "applied-local",
    ]);
    expect(contentDiff(published.canonical, published.draft)).toEqual([]);
  });
  it("recovers a completed operation after a lost response without duplicating application", async () => {
    const command = save();
    const receipt = await app().execute(command, context);
    expect(await app().execute(command, context)).toEqual(receipt);
    expect((await app().read(context)).audit).toHaveLength(1);
    await expect(
      app().execute({ ...command, content: { ...content, title: "Otro payload" } }, context),
    ).rejects.toMatchObject({ code: "idempotency-conflict" });
  });
  it("rejects invalid schema data and client-owned editorial metadata without saving", async () => {
    await expect(
      app().execute({ ...save(), content: { title: "", body: "text" } }, context),
    ).rejects.toMatchObject({ code: "validation" });
    await expect(
      app().execute({ ...save(), content: { ...content, approvals: ["forged"] } }, context),
    ).rejects.toMatchObject({ code: "validation" });
    expect(await new FileEvaluationStore(filename).read()).toBeNull();
  });
  it("rejects self-review, foreign edits, publication without approval and revoked reads", async () => {
    await app().execute(save(), context);
    await expect(
      app().execute({ action: "publish", key: "bad", expectedRevision: 1 }, reviewer),
    ).rejects.toMatchObject({ code: "invalid-transition" });
    await expect(app().execute(save(1, "edit"), reviewer)).rejects.toMatchObject({
      code: "forbidden",
    });
    await app().execute({ action: "submit", key: "submit", expectedRevision: 1 }, context);
    await expect(
      app().execute({ action: "approve", key: "self", expectedRevision: 2 }, context),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(app().read({ ...context, grants: [] })).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(app().read({ ...context, foldId: "elsewhere" })).rejects.toMatchObject({
      code: "forbidden",
    });
  });
  it("invalidates an approval when the author saves again", async () => {
    await app().execute(save(), context);
    await app().execute({ action: "submit", key: "submit", expectedRevision: 1 }, context);
    await app().execute({ action: "approve", key: "approve", expectedRevision: 2 }, reviewer);
    await app().execute(save(3, "revise"), context);
    expect((await app().read(context)).contribution?.approvals).toEqual([]);
    await expect(
      app().execute({ action: "publish", key: "stale", expectedRevision: 4 }, reviewer),
    ).rejects.toMatchObject({ code: "invalid-transition" });
  });
  it("allows only one concurrent writer and preserves its complete payload", async () => {
    const results = await Promise.allSettled([
      app().execute(save(), context),
      app().execute({ ...save(0, "second"), content: { ...content, title: "Second" } }, context),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const stored = await app().read(context);
    expect(stored.revision).toBe(1);
    expect(stored.audit).toHaveLength(1);
    await expect(app().execute(save(0, "stale"), context)).rejects.toMatchObject({
      code: "conflict",
    });
  });
  it("does not replace durable work when a transaction fails", async () => {
    await app().execute(save(), context);
    const before = await readFile(filename, "utf8");
    await expect(
      new FileEvaluationStore(filename).transact(async () => {
        throw new Error("interrupted");
      }),
    ).rejects.toThrow("interrupted");
    expect(await readFile(filename, "utf8")).toBe(before);
    await app().execute({ action: "submit", key: "submit", expectedRevision: 1 }, context);
  });
  it("fails closed on unsupported storage versions instead of resetting saved work", async () => {
    await app().execute(save(), context);
    const stored = JSON.parse(await readFile(filename, "utf8"));
    await writeFile(filename, JSON.stringify({ ...stored, formatVersion: 2 }));
    await expect(app().read(context)).rejects.toMatchObject({ code: "corrupt-store" });
  });
});

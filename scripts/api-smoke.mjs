import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, URL } from "node:url";
const { fetch } = globalThis;

const cwd = fileURLToPath(new URL("../", import.meta.url));
const directory = await mkdtemp(join(tmpdir(), "lorekind-http-smoke-"));
const port = 4323;
const base = `http://127.0.0.1:${port}`;
const author = randomBytes(32).toString("hex");
const reviewer = randomBytes(32).toString("hex");
let child;
let logs = "";
async function stop() {
  if (!child) return;
  const running = child;
  child = undefined;
  const exited = new Promise((resolve) => running.once("exit", resolve));
  try {
    process.kill(-running.pid, "SIGTERM");
  } catch {
    return;
  }
  await Promise.race([exited, delay(3000)]);
  try {
    process.kill(-running.pid, "SIGKILL");
  } catch {
    /* Already stopped. */
  }
}
async function start() {
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(port, "127.0.0.1", resolve);
  });
  await new Promise((resolve) => probe.close(resolve));
  child = spawn(
    "pnpm",
    [
      "--filter",
      "@lorekind/studio",
      "dev",
      "--ignore-lock",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      cwd,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        ASTRO_DEV_BACKGROUND: "1",
        // Never inherit a user's persistent Studio store/profile during a test.
        LOREKIND_STUDIO_PROFILE: "",
        LOREKIND_STUDIO_DATA: directory,
        LOREKIND_API_AUTHOR_TOKEN: author,
        LOREKIND_API_REVIEWER_TOKEN: reviewer,
      },
    },
  );
  child.stdout.on("data", (chunk) => {
    logs += chunk;
  });
  child.stderr.on("data", (chunk) => {
    logs += chunk;
  });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error(`Server exited: ${logs}`);
    try {
      if ((await fetch(`${base}/api/v1/me`)).status === 401) return;
    } catch {
      /* Starting. */
    }
    await delay(150);
  }
  throw new Error(`Server did not start: ${logs}`);
}
async function call(path, token = author, method = "GET", input, revision, key) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(input === undefined ? {} : { "Content-Type": "application/json" }),
      ...(revision === undefined ? {} : { "If-Match": `"v${revision}"`, "Idempotency-Key": key }),
    },
    ...(input === undefined ? {} : { body: JSON.stringify(input) }),
  });
  return { response, data: await response.json() };
}
try {
  await start();
  const home = await fetch(`${base}/`);
  assert.equal(home.status, 200);
  const html = await home.text();
  assert.match(html, /Lorekind Studio/);
  assert.match(html, /StudioWorkspace/);
  assert.match(html, /Modo local/);
  assert.doesNotMatch(
    html,
    /Welcome to your Fold|Open submissions|Alex submitted|Foundation scaffold|dev-toolbar-root/,
  );
  for (const path of ["/evaluate", "/evaluate/", "/__lorekind_evaluation?actor=author"]) {
    const removed = await fetch(`${base}${path}`, { redirect: "manual" });
    assert.equal(removed.status, 404);
    assert.equal(removed.headers.get("location"), null);
  }
  const removedWrite = await fetch(`${base}/__lorekind_evaluation?actor=author`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base },
    body: "{}",
    redirect: "manual",
  });
  assert.equal(removedWrite.status, 404);
  assert.equal(removedWrite.headers.get("location"), null);

  async function studioRead() {
    const response = await fetch(`${base}/__lorekind_studio?actor=author`);
    assert.equal(response.status, 200);
    return response.json();
  }
  async function studioWrite(action, revision, actor, key, content) {
    const response = await fetch(`${base}/__lorekind_studio?actor=${actor}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: base },
      body: JSON.stringify({
        action,
        expectedRevision: revision,
        key,
        ...(content ? { content } : {}),
      }),
    });
    return { status: response.status, body: await response.json() };
  }
  const localContent = {
    title: "MVP Studio",
    body: "A persisted editorial change, not dashboard sample activity.",
  };
  assert.equal((await studioRead()).snapshot.revision, 0);
  assert.equal((await studioWrite("save", 0, "author", "studio-save", localContent)).status, 200);
  assert.equal((await studioWrite("submit", 1, "author", "studio-submit")).status, 200);
  assert.equal((await studioWrite("approve", 2, "author", "studio-self-review")).status, 403);
  assert.equal((await studioWrite("approve", 2, "reviewer", "studio-approve")).status, 200);
  const crossOrigin = await fetch(`${base}/__lorekind_studio?actor=author`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://example.invalid" },
    body: "{}",
  });
  assert.equal(crossOrigin.status, 403);
  assert.equal((await call("/api/v1/me")).data.principalId, "author");
  const root = "/api/v1/folds/article-example";
  const input = {
    entryId: "article-example",
    content: { title: "HTTP smoke", body: "Persistent proposal" },
  };
  const created = await call(`${root}/proposals`, author, "POST", input, 0, "create");
  assert.equal(created.response.status, 201);
  const id = created.data.result.proposalId;
  for (const [index, action] of ["submit", "approve"].entries()) {
    assert.equal(
      (
        await call(
          `${root}/proposals/${id}/${action}`,
          index === 0 ? author : reviewer,
          "POST",
          {},
          index + 1,
          action,
        )
      ).response.status,
      200,
    );
  }
  await stop();
  await start();
  // Restart recovers the same saved workspace without migration or data reset.
  assert.equal((await studioRead()).snapshot.contribution.state, "Approved");
  const localApplied = await studioWrite("publish", 3, "reviewer", "studio-publish");
  assert.equal(localApplied.status, 200);
  assert.deepEqual(await studioWrite("publish", 3, "reviewer", "studio-publish"), localApplied);
  assert.deepEqual((await studioRead()).snapshot.canonical, localContent);
  assert.equal((await call(`${root}/proposals/${id}`)).data.contribution.state, "Approved");
  const applied = await call(`${root}/proposals/${id}/publish`, reviewer, "POST", {}, 3, "publish");
  assert.equal(applied.response.status, 200);
  assert.deepEqual(
    (await call(`${root}/proposals/${id}/publish`, reviewer, "POST", {}, 3, "publish")).data,
    applied.data,
  );
  const location = applied.response.headers.get("location");
  assert.equal((await call(location, reviewer)).data.status, "completed");
  assert.equal((await call(location, author)).response.status, 404);
  assert.deepEqual((await call(`${root}/entries/article-example`)).data.content, input.content);
  assert.equal((await studioRead()).snapshot.revision, 4);
  assert.deepEqual((await studioRead()).snapshot.canonical, localContent);
  assert.equal((await call(`${root}/proposals/${id}/history`)).data.items.length, 5);
  process.stdout.write(
    "HTTP smoke passed: Studio at /, removed routes return 404 without redirects, complete local workflow, authenticated API writes, restart recovery, idempotency, operation ownership and store isolation.\n",
  );
} finally {
  await stop();
  await rm(directory, { recursive: true, force: true });
}

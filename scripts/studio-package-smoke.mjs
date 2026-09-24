import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile, mkdir, access, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { log } from "node:console";
import { URL, fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), "lorekind-package-smoke-"));
const run = (args, cwd) => execFileSync("pnpm", args, { cwd, encoding: "utf8", stdio: "pipe" });
try {
  const packages = ["core", "theme", "studio"];
  const overrides = {};
  for (const name of packages) {
    const folder = resolve(root, name === "studio" ? "apps/studio" : `packages/${name}`);
    run(["pack", "--pack-destination", temporary], folder);
    const { version } = JSON.parse(await readFile(join(folder, "package.json"), "utf8"));
    const archive = join(temporary, `lorekind-${name}-${version}.tgz`);
    const files = execFileSync("tar", ["-tzf", archive], { encoding: "utf8" });
    assert.ok(files.includes("package/LICENSE"));
    assert.ok(!/\.test\.|\.env|evaluation-store|local-studio-plugin/.test(files));
    const manifest = JSON.parse(
      execFileSync("tar", ["-xOf", archive, "package/package.json"], { encoding: "utf8" }),
    );
    assert.ok(!JSON.stringify(manifest.dependencies ?? {}).includes("workspace:"));
    overrides[`@lorekind/${name}`] = `file:${archive}`;
  }
  const consumer = join(temporary, "consumer");
  await mkdir(consumer);
  await writeFile(
    join(consumer, "package.json"),
    JSON.stringify({
      private: true,
      type: "module",
      dependencies: { "@lorekind/studio": overrides["@lorekind/studio"] },
      pnpm: { overrides },
    }),
  );
  run(["install", "--ignore-scripts", "--config.confirmModulesPurge=false"], consumer);
  for (const base of ["/", "/workspace/studio/"]) {
    const output = join(consumer, base === "/" ? "root-dist" : "nested-dist");
    run(
      [
        "exec",
        "lorekind-studio-build",
        "--base",
        base,
        "--api-base",
        "/workspace/api/v1",
        "--out",
        output,
      ],
      consumer,
    );
    const html = await readFile(join(output, "index.html"), "utf8");
    assert.ok(html.includes("/workspace/api/v1"));
    assert.ok(html.includes("apiMode&quot;:[0,true]"));
    const assets = [
      ...html.matchAll(/(?:src|href|component-url|renderer-url)="([^"]*_astro\/[^"]+)"/g),
    ];
    assert.ok(assets.length > 0);
    for (const [, url] of assets) {
      assert.ok(url.startsWith(base), url);
      await access(join(output, url.slice(base.length)));
    }
    const marker = join(output, "keep.txt");
    await writeFile(marker, "preserve");
    assert.throws(() =>
      run(
        ["exec", "lorekind-studio-build", "--base", base, "--api-base", "/api/v1", "--out", output],
        consumer,
      ),
    );
    assert.equal(await readFile(marker, "utf8"), "preserve");
  }
  for (const args of [
    ["--base", "//foreign.test/", "--api-base", "/api/v1"],
    ["--base", "/studio/", "--api-base", "https://foreign.test/api"],
  ]) {
    assert.throws(() =>
      run(["exec", "lorekind-studio-build", ...args, "--out", join(consumer, "invalid")], consumer),
    );
  }
  log(
    "Packed Studio installed and built outside the workspace: root/nested assets, API mode, paths and output preservation passed.",
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}

#!/usr/bin/env node
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import process from "node:process";
import { URL, fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { build } from "astro";
import svelte from "@astrojs/svelte";

const { values } = parseArgs({
  options: {
    base: { type: "string" },
    "api-base": { type: "string" },
    out: { type: "string" },
    help: { type: "boolean" },
  },
});
if (values.help) {
  process.stdout.write(
    "lorekind-studio-build --base /studio/ --api-base /api/v1 --out ./studio-dist\n",
  );
} else {
  const pathPattern = /^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+$/;
  if (!values.base || !(values.base === "/" || pathPattern.test(values.base.replace(/\/$/, ""))))
    throw new Error("--base must be an absolute URL path without query or fragment");
  if (!values["api-base"] || !pathPattern.test(values["api-base"]))
    throw new Error("--api-base must be an absolute URL path without a trailing slash");
  if (!values.out) throw new Error("--out is required and must name an empty output directory");
  const output = resolve(values.out);
  const contents = await readdir(output).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  if (contents.length)
    throw new Error("Output directory must be empty; existing files are not removed");
  const temporary = await mkdtemp(resolve(tmpdir(), "lorekind-studio-"));
  const packageRoot = new URL("../", import.meta.url);
  process.chdir(fileURLToPath(packageRoot));
  try {
    await build({
      root: fileURLToPath(packageRoot),
      configFile: false,
      srcDir: fileURLToPath(new URL("src/", packageRoot)),
      publicDir: resolve(temporary, "public"),
      outDir: output,
      cacheDir: resolve(temporary, "cache"),
      base: values.base,
      output: "static",
      devToolbar: { enabled: false },
      integrations: [svelte()],
      vite: {
        define: {
          "import.meta.env.LOREKIND_STUDIO_MODE": JSON.stringify("api"),
          "import.meta.env.LOREKIND_STUDIO_API_BASE_PATH": JSON.stringify(values["api-base"]),
        },
      },
    });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

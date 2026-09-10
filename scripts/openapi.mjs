import { build } from "esbuild";
import { format, resolveConfig } from "prettier";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const directory = await mkdtemp(join(tmpdir(), "lorekind-openapi-"));
try {
  const compiled = join(directory, "generate.cjs");
  await build({
    absWorkingDir: root,
    entryPoints: ["apps/studio/src/server/api-openapi-build.ts"],
    outfile: compiled,
    bundle: true,
    platform: "node",
    format: "cjs",
    logLevel: "silent",
  });
  const { generateOpenApi } = createRequire(import.meta.url)(compiled);
  const output = join(root, "docs/api/openapi.json");
  const generated = await format(JSON.stringify(generateOpenApi()), {
    ...(await resolveConfig(output)),
    filepath: output,
  });
  if (process.argv.includes("--check")) {
    if ((await readFile(output, "utf8")) !== generated)
      throw new Error("OpenAPI drift: run pnpm openapi:generate and review the contract diff.");
    process.stdout.write("Generated OpenAPI matches the committed contract.\n");
  } else {
    await writeFile(output, generated);
    process.stdout.write("Generated docs/api/openapi.json from Hono/Zod route definitions.\n");
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}

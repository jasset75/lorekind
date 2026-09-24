# Lorekind Studio package

Studio provides a static frontend for a same-origin Lorekind API. The package
includes a build command and its frontend sources; consumers do not need their
own Astro or Svelte integration. It does not ship an API server, identity
configuration or a persistence adapter.

## Build for a host

After installing a released version with `pnpm add -D @lorekind/studio`, run:

```sh
pnpm exec lorekind-studio-build \
  --base /workspace/studio/ \
  --api-base /workspace/api/v1 \
  --out ./studio-dist
```

Serve the contents of `studio-dist` at `/workspace/studio/`. The host build can
place those generated assets in its static output at that prefix. The output
contains `index.html` and `_astro/`; it does not contain another nested copy of
the URL path. Build into a dedicated empty directory: the command refuses to
remove existing files. Both paths must be same-origin absolute URL paths.

The packaged build always uses API mode and ignores the local evaluation mode.
The host must provide the configured API, trusted identity, per-request grants,
protected route access and durable storage before enabling editorial work.
Serving these assets alone does not enable authenticated editing. No credentials
belong in the build arguments or static output.

Node.js 24.13 or newer is required. Astro and Svelte dependencies are pinned by
the package. The command uses Astro's experimental programmatic build API; its
compatibility is checked against the pinned version before dependency upgrades.
Astro writes generated `.astro` metadata under the installed package, which must
be writable during the build. Temporary build caches are removed on completion.
Only the generated static files are deployed; build dependencies stay outside
the serving runtime.

## Local distribution validation

This repository has not published the initial package release yet. `pnpm pack`
produces standard package tarballs for local verification, not a separate release
mechanism. Core and Theme are companion packages; release them at the versions
referenced by the packed Studio manifest before publishing Studio.

From the repository root, run `pnpm test:studio:package`. It packs all three
packages, installs Studio in an isolated consumer with local dependency overrides,
and checks root and nested builds, API configuration, asset paths and output
preservation. No sibling workspace paths or development server plugin are used.
Core and Theme currently expose TypeScript source for bundler consumers; this
increment does not establish a compiled Node backend package contract.

Registry publication and host deployment are separate release steps. For repeatable
host builds, select a released version and commit the consumer's pnpm lockfile.

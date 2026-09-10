# Lorekind

**Community-owned content, versioned in Git.**

Lorekind is an open-source, framework-agnostic, Git-native CMS for communities
that want friendly editorial workflows without giving every editor unrestricted
repository access.

> Status: evolving MVP, with a working local editorial workflow and versioned
> resource API. Real Studio sign-in, remote providers and hosted deployment remain
> pending. The local identity selector is explicitly simulated, not authentication.

Core now includes experimental, unit-tested editorial transitions for direct and
independent publication policies, scoped grants and delegated actors. Remote persistence,
safe remote record loading and hosted deployment remain unimplemented. See
[ADR 0005](docs/architecture/0005-experimental-editorial-domain.md) for the exact
trust boundary and remaining provider proof.

Studio opens at `/`: edit, validate, save, inspect a
diff, submit, independently review and apply to an isolated local copy. Saved
work survives process restart. The bundled article can be replaced with a trusted
consumer profile. See [running Studio](docs/studio/README.md) for commands and
limitations. The unpublished `/evaluate` route has been removed without a redirect. There is no
separate demo dashboard or evaluation product to replace later.

An experimental resource API is available under `/api/v1`, with injected
authentication, a development bearer adapter and an [OpenAPI contract](docs/api/openapi.json).
See the [API guide](docs/api/README.md). Its local data is isolated from the
local Studio identity mode. Both use the same Core application, but Studio is not
yet an authenticated client of `/api/v1`. Run `mise exec -- pnpm test:api` for a
complete isolated HTTP check of both workflows with ephemeral credentials,
restart recovery and checks that removed routes return 404.

The HTTP boundary uses Hono and Zod, with OpenAPI generated from shared route and
schema definitions. Contract tests also run in a Workers harness without Node
compatibility. See [ADR 0008](docs/architecture/0008-portable-http-stack.md) for
the verified scope; remote persistence and hosted deployment remain pending.

## Core idea

A **Fold** is an independently governed editorial space. It groups content,
schemas, members, grants, and workflow policy. A Fold can represent a site,
publication, community, collection, or creator channel without putting those
application-specific concepts into Lorekind Core.

Lorekind separates three identities:

- product contributors use the public GitHub workflow;
- editorial users authenticate with the deploying application;
- a restricted service identity performs bounded Git operations after
  server-side authorization.

## Workspace

```text
apps/studio       Astro shell and Svelte editorial islands
packages/core     Fold and authorization domain
packages/git      Provider-neutral Git workflow contracts
packages/theme    Semantic theme contract and default tokens
docs/architecture Architectural decisions and system boundaries
```

GitHub is the public upstream. GitHub and GitLab content adapters will implement
the same provider-neutral contracts, allowing deployments to keep their existing
repository host and access model.

## Development

Requirements are pinned in `.mise.toml`:

- Node.js 24.13.0
- pnpm 10.25.0

```bash
mise install
mise run install
mise run dev
```

Run the complete quality gate with:

```bash
mise run check
```

## Roadmap

See [ROADMAP.md](./ROADMAP.md). The planned increments validate shared editorial
contracts locally, deliver a portable API with remote GitLab persistence, add AI
clients, and prove provider portability with GitHub. The basic workflow must
require neither an additional CMS database nor a backend Git checkout. These are
planned capabilities; the current local MVP is the first increment of the same
product, not a disposable scaffold. Each increment must deliver an integrated
workflow, preserve saved work, and pass its acceptance checks.

[ADR 0010](docs/architecture/0010-evolving-product-mvp.md) records this delivery
model and the distinction between a working local MVP and a hosted release.

[ADR 0004](docs/architecture/0004-portable-editorial-backend.md) records the
runtime, persistence, and client boundaries.

## Contributing and security

Read [CONTRIBUTING.md](./CONTRIBUTING.md), [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md),
and [SECURITY.md](./SECURITY.md) before contributing. Do not report security
vulnerabilities in public issues.

## License

Apache License 2.0. See [LICENSE](./LICENSE).

# Lorekind

**Community-owned content, versioned in Git.**

Lorekind is an open-source, framework-agnostic, Git-native CMS for communities
that want friendly editorial workflows without giving every editor unrestricted
repository access.

> Status: foundation scaffold. The Studio is a visual prototype and the APIs are
> not ready for production use.

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
planned capabilities; the current implementation remains a foundation scaffold.

[ADR 0004](docs/architecture/0004-portable-editorial-backend.md) records the
runtime, persistence, and client boundaries.

## Contributing and security

Read [CONTRIBUTING.md](./CONTRIBUTING.md), [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md),
and [SECURITY.md](./SECURITY.md) before contributing. Do not report security
vulnerabilities in public issues.

## License

Apache License 2.0. See [LICENSE](./LICENSE).

# 0001: Initial product architecture

- **Date:** 2026-08-31
- **Status:** Accepted foundation

## Context

Lorekind must provide a modern editorial interface while remaining useful to
projects that do not use Astro, Svelte, GitHub, GitLab, or any particular
application content model. It must also let editorial users contribute without
receiving repository membership or provider credentials.

## Decision

Lorekind begins as a pnpm monorepo with four boundaries:

```text
apps/studio       Astro application with selective Svelte hydration
packages/core     Framework-neutral Fold and authorization semantics
packages/git      Provider-neutral contribution workflow
packages/theme    Semantic tokens and bounded appearance configuration
```

Astro owns the Studio shell, routing, static HTML, and future server adapter.
Svelte is used for stateful editorial islands. Publication frontends consume
content and optional theme contracts without depending on Studio or Svelte.

Git providers implement the contract in `packages/git`. Provider credentials
stay on the server. The first production adapters will target GitHub and GitLab,
but neither provider is represented inside Core.

Authorization is capability- and Fold-scoped. Reviewing or publishing one's own
contribution is denied even when a role otherwise carries that capability.
Application-specific channel ownership verification remains outside Core.

Theme customization uses semantic CSS tokens. A Fold administrator can choose
bounded appearance values. Executable themes are reviewed extensions, not
ordinary content or curator configuration.

## Consequences

- Public packages can be tested without a browser or provider account.
- Studio can become richly interactive without adding JavaScript to publication
  frontends.
- The repository starts with a static Studio prototype; authentication, writes,
  adapters, and persistence remain visibly unimplemented.
- Provider conformance and authorization tests are release gates.

## Alternatives not selected

- **A single SvelteKit application:** not selected because it would blur the
  framework-neutral core and publication boundary.
- **Pure Astro with no client framework:** not selected because a schema editor,
  diff viewer, and rich editor need substantial local state.
- **Direct browser-to-Git provider access:** rejected because repository tokens
  and provider membership are not the editorial authorization model.
- **Application catalogue types in Core:** rejected because a deployment is a
  consumer, not Lorekind's domain definition.

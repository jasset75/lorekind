# Architecture decisions

Use this directory for decisions that define Lorekind's public technical
boundaries. Records are immutable in intent: supersede an accepted decision
with a new record instead of silently rewriting its conclusion.

Each decision includes context, decision, consequences, rejected alternatives,
and an explicit status.

## Decisions

- [0001: Initial product architecture](./0001-initial-product-architecture.md)
- [0002: Public upstream and provider neutrality](./0002-public-upstream-and-provider-neutrality.md)
- [0003: Editorial workflow and publication boundary](./0003-editorial-workflow-and-publication.md)
- [0004: Portable editorial backend with remote Git persistence](./0004-portable-editorial-backend.md):
  planned shared API/client operations, database-free baseline, and updated
  provider implementation order.
- [0005: Experimental editorial transitions and revision-bound authorization](./0005-experimental-editorial-domain.md):
  first executable domain increment, experimental persistence contracts and remaining proof.
- [0006: Executable local editorial evaluation](./0006-local-editorial-evaluation.md):
  shared local application operations, persistent snapshots and the Studio evaluation route.
- [0007: Versioned editorial HTTP boundary](./0007-versioned-editorial-api.md):
  authenticated resource routes, OpenAPI and retained proposals over the local adapter.
- [0008: Portable HTTP stack with Hono, Zod and OpenAPI](./0008-portable-http-stack.md):
  implemented Fetch-first stack and generated contracts, verified in Node and a
  restrictive Workers harness; remote persistence and hosted deployment pending.
- [0009: Language-neutral errors and localized presentation](./0009-localization-boundary.md):
  request-scoped Hono/Zod error localization and bilingual evaluator catalogs;
  content, authorization and durable state remain language-independent.
- [0010: One evolving product MVP](./0010-evolving-product-mvp.md):
  functional Studio at `/`, explicit local-mode limits, preservation of saved
  work, and an acceptance-driven backlog instead of a separate evaluation product.
- [0011: No speculative compatibility for unpublished interfaces](./0011-no-speculative-compatibility.md):
  remove unused routes and aliases without redirects; preserve saved data and
  update known local setup instructions directly.

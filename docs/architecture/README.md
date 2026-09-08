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

# 0004: Portable editorial backend with remote Git persistence

- **Date:** 2026-09-08
- **Status:** Accepted design direction; implementation pending
- **Relationship:** Extends ADR 0001 and supersedes only the GitHub-first adapter
  sequence in ADR 0002. Public upstream, provider neutrality, and ADR 0003's
  configurable editorial/publication policies remain unchanged.

## Context

Editorial users and AI clients need to prepare and submit content without local
repository access or personal Git-provider accounts. Adding an HTTP API requires
trusted execution, but does not require a separate CMS database. Runtime and
provider convenience must not define Lorekind's public editorial semantics.

The current `packages/git` contract covers submission and change-request lookup;
drafts, content reads, conditional writes, and recovery are still unimplemented.
The roadmap must make these gaps explicit before integrating a consumer.

## Decision

Use one application layer for Studio, HTTP, CLI, and MCP operations. Keep three
boundaries, without requiring separate services or fixing new package names:

1. Editorial semantics: Fold, entry, schema, proposal, revision, permissions,
   validation, and configurable review/publication policy.
2. Persistence and collaboration contracts: read revisions, save bounded changes,
   submit change requests, and recover operations through a remote provider.
3. Execution adapters: HTTP handling, trusted identity, secrets, and runtime
   configuration. Cloudflare Workers is an initial deployment option.

The baseline must operate with the remote Git provider as the CMS's only durable
store and without a backend checkout or shell Git. In-memory/filesystem providers
remain useful test harnesses. Optional indexes or other stores may be added by a
deployment without becoming requirements of the basic workflow.

Save explicit draft checkpoints in proposal branches. Keep essential schemas,
review decisions, and attribution in versioned, exportable records. Native
change requests support delivery and diagnostics; their comments and metadata
must not be the sole record of editorial meaning. Unsaved client edits are not
represented as remotely durable work.

Read current grants from protected configuration or an identity-policy adapter.
Contributor-controlled branches cannot define their own effective permissions.
Authentication infrastructure and deployment secrets stay outside content Git.
Record verified human and delegated-agent identities at the server boundary;
provider bot authorship alone cannot establish editorial attribution. Bind an
approval or direct-publication authorization to the exact reviewed revision and
invalidate it after content changes. Independent review is a Fold policy, not a
universal restriction; preserve the direct-publication option from ADR 0003.

Use opaque revisions and explicit conditional writes, recoverable operation IDs,
and errors. Multi-step provider operations are not one transaction: recovering
from partial success and concurrent retries is a mandatory adapter guarantee,
not a promise of exactly-once network delivery. Test these guarantees before
claiming provider support; expose unsupported optional capabilities explicitly.

Describe the HTTP API with OpenAPI. CLI and MCP are clients/adapters of the same
commands, with no provider credentials or independent authorization rules. Skills
guide agents but cannot grant permissions or define the server's policy. Reserve
hooks for trusted extensions and lifecycle events; content writes use validated
commands. Schema and API versioning, migrations, and deprecation are public
contract work, not post-release cleanup.

Build the first remote workflow with GitLab, then prove portability with GitHub
and the same conformance suite. GitHub remains the product's public upstream.
Use a generic article example independent of any private consumer's domain.

## Consequences

- A single serverless backend can host the first workflow. Runtime bindings,
  identity providers, and application catalogue types stay outside generic code.
- API, Studio, and AI clients share saved proposals and server-enforced rules.
- Durable saves depend on provider availability, request limits, and latency.
  The first workflow promises explicit saves and conflict recovery, not live
  collaborative editing or a remote commit for each keystroke.
- CI and publication integration remain deployment responsibilities. Integrating
  approved content and confirming that it is deployed are distinct outcomes.
- Portability requires tests of real guarantees, not just identical TypeScript
  interfaces. At least one non-consumer example remains a release gate.
- This record authorizes a design direction, not package publication, credential
  provisioning, editor invitations, or a production deployment.

## Alternatives not selected

- Mandatory database for drafts and operations: adds another required source of
  state before the basic Git-backed workflow demonstrates a need for it.
- Direct client writes to GitLab/GitHub: makes repository credentials and provider
  membership part of editorial access.
- Runtime-specific business logic or a vendor-specific AI workflow: makes
  deployment or client replacement alter editorial guarantees.
- Arbitrary local hooks as the write contract: cannot provide a shared,
  discoverable authorization and recovery boundary for UI and remote clients.

# Lorekind roadmap

This roadmap records product outcomes rather than calendar promises. Each phase
must preserve the security boundary: the browser is a client, never the final
authorization authority.

The 2026-09-08 increments below are planned work, not implemented capabilities.
[ADR 0004](docs/architecture/0004-portable-editorial-backend.md) defines their
architecture and supersedes the GitHub-first adapter sequence in ADR 0002.
GitHub remains the public product upstream; GitLab becomes the first remote
content implementation, followed by GitHub against the same contracts.

## Design constraints across milestones

- Keep editorial semantics, provider operations, and runtime integration separate.
  Studio, HTTP API, CLI, and AI tools use the same application operations.
- Complete the basic workflow with a remote Git provider as the CMS's only
  durable store; require neither an additional database nor a local Git checkout
  in the hosted backend. Optional stores must not become baseline dependencies.
- Keep schemas, essential review decisions, and attribution exportable in Git.
  Provider change requests support integration; they are not the only record of
  editorial meaning.
- Authenticate humans and delegated agents independently of repository membership.
  Enforce current scoped grants and the Fold's configured review policy on the server.
- Keep deployment domains, content models, identity providers, and hosting choices
  outside generic packages. Validate the design with an unrelated article example.
- Specify versioning, errors, recovery, and conformance before claiming support.
  No milestone authorizes a consumer's production rollout.

## Phase 0 — Foundation

- [x] Establish the Lorekind name and product boundary.
- [x] Select GitHub as the public upstream.
- [x] Create the Astro + Svelte workspace scaffold.
- [x] Define initial Fold, authorization, Git, and theme contracts.
- [x] Add contribution, security, conduct, and CI foundations.
- [ ] Complete trademark, domain, package-scope, and organization-name checks.
- [ ] Decide long-term contributor governance with legal review.

Exit: the repository builds from a clean checkout and its contracts describe
what is real versus planned.

## Phase 1 — Local editorial vertical slice

### 1A — Editorial and provider contracts

- [ ] Define draft, proposal, review, approval, and publication states, with
      explicit transitions and authorization tied to an exact content revision,
      preserving ADR 0003's direct-publication and independent-review policies.
- [ ] Extend the current submit/read-change-request contract with content reads,
      draft persistence, opaque revisions, conditional writes, and operation
      recovery. Distinguish editable draft data from server-owned review records.
- [ ] Define structured commands and errors, idempotency-key ownership and payload
      checks, conflict outcomes, and pending/completed/failed operation results.
- [ ] Define principal, delegated-agent, Fold, and resource authorization at each
      boundary, including revocation and policy-dependent self-approval checks.
- [ ] Specify mandatory provider guarantees and optional capabilities. An adapter
      must reject an unsupported guarantee rather than silently weaken it.
- [ ] Define versioned schemas, migration rules, API compatibility, and deprecation
      policy before publishing external contracts.

Exit: reviewed contracts and threat model describe a complete save-to-review
workflow without referring to a specific runtime or Git host.

### 1B — Executable local contract example

- [ ] Persist a test Fold definition and content schema with an in-memory or
      filesystem provider; use this as a test harness, not hosted Git storage.
- [ ] Create, edit, validate, and submit an article draft through Studio.
- [ ] Generate a deterministic change set, readable diff, and attribution record
      without remote credentials; exercise direct publication and independent review.
- [ ] Add a reusable provider conformance suite covering conditional writes,
      concurrent requests, retries, partial failure, and review invalidation.
- [ ] Test keyboard navigation, zoom, reduced motion, and light, dark, system,
      and high-contrast theme modes.

Exit: a contributor can complete the workflow locally using an in-memory or
filesystem test provider. The example has no consumer-specific catalogue types.

## Phase 2 — Hosted editorial workflow with GitLab

### 2A — Portable backend and HTTP API

- [ ] Expose schema discovery, content reads, draft saves, validation, diffs,
      submission, policy-controlled review/publication, and operation status through a documented
      HTTP API and shared application layer.
- [ ] Provide an OpenAPI description and request/response contract tests. Keep
      framework and runtime bindings outside editorial and provider packages.
- [ ] Add a Cloudflare Workers deployment adapter as one execution option;
      exercise the application layer outside that runtime as well.
- [ ] Integrate trusted identity and protected server configuration through
      replaceable boundaries, including authenticated non-browser clients.

### 2B — Remote persistence and reviewed integration

- [ ] Implement GitLab reads and bounded branch, commit, and merge-request
      operations using HTTP and a restricted service identity.
- [ ] Save explicit draft checkpoints on proposal branches. Persist essential
      decisions and attribution as versioned records; read policy from protected
      configuration, never from contributor-controlled proposal changes.
- [ ] Recover interrupted multi-step operations from remote records, including a
      successful commit followed by failed merge-request creation. Prove that
      concurrent retries cannot overwrite another payload or duplicate delivery.
- [ ] Bind approvals and integration to reviewed revisions; recheck permissions,
      protected-branch requirements, and current provider state before delivery.
- [ ] Pass the shared conformance suite and integration tests on a disposable
      remote project, including revocation, conflicts, and attribution with a bot.

Exit: two distinct editorial principals can save, submit, review, and integrate a
bounded change without provider accounts, a backend checkout, or an additional
CMS database. Also exercise direct publication under an explicitly configured
Fold policy. A deployment can restart between steps without losing saved work.

### 2C — AI and automation clients

- [ ] Provide CLI and MCP adapters for the same editorial operations and expose
      schemas, validation errors, diffs, and recoverable operation identifiers.
- [ ] Attribute delegated actions to the authenticated person and agent with
      bounded permissions; clients cannot supply trusted identities or approvals.
- [ ] Demonstrate that Studio and an AI client can continue the same saved
      proposal. A skill describes usage; server rules do not depend on its text.
- [ ] Keep local preparation and validation available; hosted submission always
      repeats authoritative permission, schema, and revision checks.

Exit: an agent can prepare and submit a proposal for a human's independent review
through the API without repository credentials or a required AI vendor.

## Phase 3 — GitHub adapter and portability proof

- [ ] Implement installation-based authentication for a bounded repository.
- [ ] Implement the same draft, revision, change-request, and recovery contracts
      using GitHub HTTP APIs; pass the shared provider conformance suite.
- [ ] Run the generic article workflow on both remote providers and verify that
      essential editorial records can migrate without relying on MR/PR comments.
- [ ] Publish preview builds through a deployment integration without granting
      editors repository membership.
- [ ] Document provider capability differences and portable self-hosting setup.

Exit: provider selection changes deployment configuration and adapters, not
editorial rules, content schemas, or client commands.

## Phase 4 — Extensible Studio

- Schema-driven field registry and validation.
- Accessible rich-text editor behind a replaceable adapter.
- Asset policy and provider abstractions.
- Review comments, presence-safe drafts, and conflict handling.
- Versioned, installable themes and extensions.
- Stable extension API with compatibility policy.
- Typed lifecycle events for integrations after durable state transitions;
  define delivery, retry, and deduplication behavior before adding webhooks.
- Trusted server-side validators as extensions; ordinary content and Fold
  configuration cannot introduce executable hooks.

Exit: external projects can extend Lorekind without forking Studio or Core.

## Phase 5 — Community release

- Publish versioned packages and migration guidance.
- Document self-hosting and threat models.
- Establish maintainer roles and a public decision process.
- Provide starter deployments and framework examples.
- Run accessibility, security, and provider-conformance audits.

Exit: Lorekind is supportable as an independent open-source project with its own
maintainers, users, and release lifecycle.

# Lorekind roadmap

This roadmap records product outcomes rather than calendar promises. Each phase
must preserve the security boundary: the browser is a client, never the final
authorization authority.

The phases below mix delivered increments and open work, indicated explicitly.
[ADR 0004](docs/architecture/0004-portable-editorial-backend.md) defines their
architecture and supersedes the GitHub-first adapter sequence in ADR 0002.
GitHub remains the public product upstream; GitLab becomes the first remote
content implementation, followed by GitHub against the same contracts.

Implementation update: the first local domain increment now provides pure
editorial transitions, revision-bound approvals, scoped authorization and
experimental persistence contracts. [ADR 0005](docs/architecture/0005-experimental-editorial-domain.md)
records its limits. Phase 1A remains open until remote feasibility, trusted record
loading and the remaining compatibility/recovery contracts are resolved.

The local MVP now connects Studio at `/`, shared application operations and
isolated file snapshots, including validation, diff, independent review and local
application. [ADR 0010](docs/architecture/0010-evolving-product-mvp.md) makes this
the product entry point and supersedes the separate evaluation UI framing in
ADR 0006. This advances 1B without closing remote feasibility
or claiming the shared remote provider conformance suite is complete.

API increment: `/api/v1` now exposes authenticated resource routes and an OpenAPI
contract over the local application layer, with durable proposal IDs, history and
operation receipts. [ADR 0007](docs/architecture/0007-versioned-editorial-api.md)
records the experimental scope. Hosted identity/runtime integration and remote
GitLab guarantees remain open; Phase 2A/2B are not marked complete.

HTTP stack implementation: [ADR 0008](docs/architecture/0008-portable-http-stack.md)
now uses Hono, Zod and generated OpenAPI. Shared contract scenarios pass on Node
and a Workers harness without Node compatibility or dynamic function compilation.
The development server retains local persistence; hosted identity and remote Git
guarantees remain pending.

An optional browser API boundary now verifies Cloudflare Access assertions behind
a replaceable identity interface, checks request origins, and resolves principal
mapping and grants per request. Synthetic signed-token workflow tests cover this
increment. Studio now has an opt-in same-origin API client with server-derived
identity and permissions; local simulation remains the default. Real login and
hosted runtime binding remain open; the P0 outcome below is not closed.

## Delivery model: one evolving MVP

The local release is Lorekind, not a pilot to be replaced by a second product.
Iterate through integrated user outcomes on the same Core, Studio and HTTP
boundaries. The current release includes create/save, validation, diff, submit,
independent review, local application, history, restart recovery and EN/ES
presentation. It does not include real browser identity, remote Git persistence,
a hosted backend or multiple entries per workspace. Local identities and local
application are labelled in the product, not hidden behind an evaluation URL.

### Ordered backlog

| Priority               | Increment                                                                                                | Dependencies                                                                           | Verifiable acceptance                                                                                                                            | Main risk                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| P0 — delivered locally | Make `/` the working Studio, remove fake dashboard activity, remove unpublished routes without redirects | Existing shared application and file store                                             | Save → submit → approve → apply from Studio; saved work survives restart; removed routes return 404; no invented metrics                         | Mistaking local mode for a hosted deployment                               |
| P0 — next              | Connect Studio to `/api/v1` with verified browser identity                                               | Choose trusted identity/session integration and protected Fold configuration           | Two real principals complete the same workflow; no browser-selected authority; no bundled bearer secrets; revocation and CSRF/session tests pass | Privilege escalation or unsafe merging of simulated and authenticated data |
| P1                     | Deliver the same workflow using GitLab persistence                                                       | P0 identity, safe record loading, conditional-write and provider conformance contracts | Recover interrupted remote operations; concurrent retries cannot overwrite other work; approvals bind to the delivered revision                  | Remote race conditions and partial failure                                 |
| P1                     | Add multiple entries and durable Fold/resource navigation                                                | Defined IDs, schema/listing contracts and the shared API client                        | Create, reopen, review and navigate distinct entries without losing unsaved work or crossing authorization scopes                                | URL changes and data migration                                             |
| P2                     | Enable CLI/MCP clients on the same saved proposals                                                       | Trusted identity, delegated grants and shared API                                      | An agent submits, a human reviews, and both see the same durable proposal                                                                        | Agent attribution and excessive permissions                                |
| P2                     | Prove GitHub provider portability                                                                        | GitLab conformance suite and exportable records                                        | Same acceptance workflow and recovery suite on both providers                                                                                    | Provider-specific assumptions leaking into Core                            |
| P3                     | Rich editing, assets and extension ecosystem                                                             | Stable client/provider contracts and accessibility baseline                            | Features ship end-to-end with migration and security guidance                                                                                    | Expanding features before workflow reliability                             |

### Operational telemetry — pending

[Provider-neutral telemetry hooks (#6)](https://github.com/jasset75/lorekind/issues/6)
will define a minimal injectable contract for authentication outcomes and API
errors, with a no-op default, sensitive-data exclusions and failure isolation.
The contract is not implemented; backend selection and dashboards are separate work.

### Definition of done for each increment

- A user-facing outcome is reachable from Studio, not a disconnected demo route.
- Displayed content, state and activity come from real persisted records; test
  fixtures are isolated and never presented as product activity.
- Server-side authority, validation, conflicts and retry behavior are verified.
- Existing data and configuration keep working, or an explicit, tested migration
  is provided. Never silently combine simulated and authenticated stores.
- EN/ES copy and accessible keyboard/focus behavior cover the new surface.
- `pnpm check` and relevant real HTTP/browser acceptance checks pass; documentation
  states what is delivered, limited and pending. Local completion is not deployment.

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

## Phase 1 — Local editorial MVP

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

### 1B — Working Studio increment

- [x] Load a trusted profile and persist local content, proposals, approvals and
      history in the file adapter; this does not claim hosted Git storage.
- [x] Create, edit, validate, and submit an article draft through Studio at `/`.
- [x] Show the saved diff and complete independent review and local application,
      retaining saved work across restarts.
- [x] Expose bilingual product UI with explicit local-mode limitations and no
      fabricated dashboard metrics or activity.
- [ ] Expose direct-policy controls in Studio (Core/API support is already tested).
- [ ] Add a reusable provider conformance suite covering conditional writes,
      concurrent requests, retries, partial failure, and review invalidation.
- [ ] Test keyboard navigation, zoom, reduced motion, and light, dark, system,
      and high-contrast theme modes.

Exit: a user can complete the workflow from the product entry point using the
local adapter, with the remaining policy/accessibility criteria above verified.
Core has no consumer-specific catalogue types. Remote persistence is a later adapter.

## Phase 2 — Hosted editorial workflow with GitLab

### 2A — Portable backend and HTTP API

- [ ] Expose schema discovery, content reads, draft saves, validation, diffs,
      submission, policy-controlled review/publication, and operation status through a documented
      HTTP API and shared application layer.
- [ ] Provide an OpenAPI description and request/response contract tests. Keep
      framework and runtime bindings outside editorial and provider packages.
- [x] Migrate the manual HTTP boundary to Hono and Zod with generated OpenAPI
      per ADR 0008; verify equivalent contracts on Node and a restrictive Workers
      runtime configuration, including transitive dependencies and schema execution.
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

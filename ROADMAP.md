# Lorefold roadmap

This roadmap records product outcomes rather than calendar promises. Each phase
must preserve the security boundary: the browser is a client, never the final
authorization authority.

## Phase 0 — Foundation

- [x] Establish the Lorefold name and product boundary.
- [x] Select GitHub as the public upstream.
- [x] Create the Astro + Svelte workspace scaffold.
- [x] Define initial Fold, authorization, Git, and theme contracts.
- [x] Add contribution, security, conduct, and CI foundations.
- [ ] Complete trademark, domain, package-scope, and organization-name checks.
- [ ] Decide long-term contributor governance with legal review.

Exit: the repository builds from a clean checkout and its contracts describe
what is real versus planned.

## Phase 1 — Local editorial vertical slice

- Persist a local Fold definition and content schema.
- Create, edit, validate, and submit a draft through Studio.
- Generate a deterministic change set without remote credentials.
- Display a human-readable diff and audit event.
- Enforce separation between contribution and approval.
- Test light, dark, system, and high-contrast theme modes.

Exit: a contributor can complete the workflow locally using an in-memory or
filesystem test provider.

## Phase 2 — GitHub reference adapter

- Implement installation-based authentication for a bounded repository.
- Create contribution branches and pull requests.
- Make retries idempotent and expose provider-neutral errors.
- Add conformance tests shared with future providers.
- Publish preview builds without granting editors repository membership.

Exit: a deployed test Fold can submit a reviewed GitHub pull request without
placing provider credentials in the browser.

## Phase 3 — GitLab production adapter

- Implement the GitLab adapter against the same conformance suite.
- Integrate an external identity provider at a test deployment boundary.
- Map application resources to scoped Fold grants outside Lorefold Core.
- Submit structured content changes as GitLab merge requests.
- Prove grant revocation, protected-branch enforcement, and audit attribution.

Exit: a deployment can invite a creator to curate an assigned resource without
making that creator a GitLab project member.

## Phase 4 — Extensible Studio

- Schema-driven field registry and validation.
- Accessible rich-text editor behind a replaceable adapter.
- Asset policy and provider abstractions.
- Review comments, presence-safe drafts, and conflict handling.
- Versioned, installable themes and extensions.
- Stable extension API with compatibility policy.

Exit: external projects can extend Lorefold without forking Studio or Core.

## Phase 5 — Community release

- Publish versioned packages and migration guidance.
- Document self-hosting and threat models.
- Establish maintainer roles and a public decision process.
- Provide starter deployments and framework examples.
- Run accessibility, security, and provider-conformance audits.

Exit: Lorefold is supportable as an independent open-source project with its own
maintainers, users, and release lifecycle.

# 0012: Hosted browser composition

- **Date:** 2026-10-08
- **Status:** Proposed; hosted integration and remote persistence are not complete
- **Relationship:** Extends ADRs 0004 and 0008; preserves ADR 0003's configurable
  review policy and ADR 0006's distinction between local and hosted operation.

## Context

A host application needs to compose Studio and the editorial API with its own
browser authentication, membership policy and remote Git persistence. Passing an
identity-provider challenge does not grant editorial capabilities or supply a
durable backend.

On the current main branch, `createBrowserEditorialApi` and the optional
`cloudflareAccessIdentity` adapter exist under `apps/studio/src/server`. The
browser boundary requires a canonical HTTPS origin, rejects foreign origins and
marks responses `no-store`. The Access adapter verifies signatures, issuer,
audience, token type and lifetime. These are implementation building blocks,
not evidence of deployed protection or a supported backend distribution.

Studio remains a private workspace package on main. The separate Studio
distribution proposal is not a completed backend extraction. The local
`EvaluationStore` and its publication behavior do not establish remote Git
persistence. This record describes the additional host contract without fixing
consumer-specific routes, identities, catalogue models or infrastructure.

## Proposed decision

### Identity and authorization

Expose a provider-neutral browser boundary and retain Access as an optional
adapter. Verify credentials cryptographically before resolving the stable
`(issuer, subject)` pair to an editorial principal. Email addresses, forwarded
identity fields and client-supplied actors cannot establish authority.

The host owns protected identity bindings, enabled principals, Fold grants and
review policy. Re-evaluate effective grants for each request and again at the
authorization point of a state-changing operation. Missing configuration,
unknown subjects and disabled principals fail closed. State the revocation
latency of any policy cache and test it before enabling writes.

Provider admission and Fold authorization remain separate. A principal admitted
to the host may still have no access to a Fold. Apply the configured direct
publication or independent-review policy from ADR 0003; this proposal does not
make independent review universal or claim direct publication is implemented.
Bind approval and publication authority to the exact content revision.

Require the configured canonical HTTPS origin and the existing browser request
checks. Do not weaken origin checks to make a proxy work: the host must supply
the canonical request URL through a trusted adapter. Private responses,
including errors, must remain non-cacheable. Keep credentials, assertions and
private identity mappings out of the client, public artifacts and diagnostics.
Record the verified principal separately from the Git service identity.

CLI, MCP and machine callbacks require their own authenticated adapters. Do not
reuse a browser cookie or bypass the browser boundary for those clients. Token
expiry must deny further writes while preserving unsaved client edits for
explicit recovery after authentication; it must not imply that edits were saved.

### Distribution and routing

Extract reusable browser/backend interfaces into an explicit package with a
documented Fetch entry point and injected identity, policy and persistence
services. Its deployed dependency graph must exclude local filesystem stores,
development plugins and ambient Node configuration. Keep tooling and local
adapters separate and verify the actual artifact in a restrictive runtime.

Consume a reproducible artifact pinned to an immutable upstream revision or
release integrity value. Define CI artifact creation, installation and supported
exports before host integration. Copying source from a sibling checkout is not
the distribution contract. Studio assets and backend packaging are separate
deliverables that must declare compatible API contracts.

The host selects Studio and API prefixes and protects both route trees. Configure
the asset base and API base explicitly. The current server contract uses
`/api/v1`; a different external prefix requires a generic mount capability or a
tested host adapter. Test request paths, asset URLs, redirects, OpenAPI server
paths and response `Location` headers together. Client configuration alone does
not change the server route contract. Private fallback routes and direct-origin
access must not bypass authentication.

### Incremental delivery and persistence

Start with a bounded identity/capability probe that uses the shared verifier and
private principal resolver without requiring an editorial snapshot store. It
must return only capabilities needed by the current principal and Fold. Treat
the probe as integration evidence, not as a durable Studio workflow.

Enable hosted editing only after the remote provider can persist drafts,
decisions, review records and recoverable operations under ADR 0004. Start with
GitLab and prove portability with the same GitHub conformance contract. An empty
or in-memory workspace cannot back a production save action. No new database,
queue or runtime-specific state service is a baseline prerequisite.

Prove conditional writes, revision conflicts, idempotent retries, concurrent
requests and restart recovery. An unknown provider outcome remains unresolved
until reconciliation; do not return success or create a second publication.
Persist editorial attribution and revision-bound authorization independently of
provider comments. Declare unsupported operations rather than silently
substituting the local adapter. Existing publication and deployment gates remain
host responsibilities; provider integration does not prove served freshness.

## Acceptance and rollout

1. Reject absent, malformed, expired, wrong-issuer and wrong-audience credentials,
   unknown or disabled principals, and foreign-origin requests. Exercise key
   rotation and identity-provider failure without granting fallback access.
2. Verify two distinct principals and two Folds cannot gain each other's grants.
   Test changed permissions, revocation, client actor injection and private cache
   behavior. Use synthetic identities and protected deployment configuration.
3. Install the generated artifact in an independent host fixture. Test the real
   Fetch bundle, chosen route prefixes, assets, redirects and response locations
   without a sibling source checkout or development server.
4. Verify deployed identity-provider coverage, issuer and audience before a real
   login test. Test both protected routes and attempted origin bypass. Repository
   settings alone are not evidence of deployed protection.
5. Before writes, demonstrate remote restart recovery and partial-failure
   reconciliation, stale-revision rejection, review invalidation and attribution.
   Exercise every review policy advertised by the adapter; keep unsupported
   policies disabled.
6. Roll out only after explicit host authorization. Measure runtime and provider
   limits and sanitized failures separately from successful saves. Disabling the
   integration or revoking membership must preserve saved records and the host's
   existing editorial workflow. A rollback must not silently downgrade persisted
   state or discard pending operations.

## Consequences

Lorekind owns portable identity interfaces, editorial semantics and provider
contracts; the host owns deployment, membership and product-specific policy.
Packaging, the identity probe and remote persistence can be reviewed in separate
increments. Hosted readiness requires their combined acceptance evidence, not
just a successful static build or a verified login.

## Alternatives not selected

- **Copy Studio server files into each host:** hides the dependency contract and
  makes security fixes and reproducible upgrades harder to verify.
- **Use identity-provider admission as editorial authorization:** cannot express
  current per-Fold grants, revocation or revision-bound publication policy.
- **Expose the local development adapter as the hosted backend:** confuses
  simulated identity and local persistence with authenticated remote operation.
- **Require a new CMS database for the first integration:** changes ADR 0004's
  Git-backed baseline before remote provider guarantees have been demonstrated.

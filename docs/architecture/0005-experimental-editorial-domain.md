# 0005: Experimental editorial transitions and revision-bound authorization

- **Date:** 2026-09-08
- **Status:** Local experimental implementation; remote guarantees pending
- **Relationship:** Implements the first domain increment of ADR 0003 and ADR 0004.
  This does not declare Phase 1A complete or approve external API stability.

## Context

The scaffold only checked a single Fold grant and unconditionally denied
self-publication. Before persistence or HTTP adapters can safely use Core, we need
executable transitions and an explicit description of their trust boundary.

## Decision

### Authorization and policy

Separate the capability check (`authorize`) from complete workflow decisions
(`createDraft`, `transitionContribution`). A successful capability check alone
never authorizes publication. All entry mutations must use the workflow and the
application's schema, path and persistence checks.

Consider all matching grants; any current grant with the requested capability
and resource scope can authorize the action. A revocation marker immediately
invalidates that grant; scheduled revocation is not supported. Caducity includes
the exact expiry instant. Invalid timestamps fail closed. Record the selected
grant ID; future publication checks require that recorded grant to remain valid.
Replacing it with another grant does not silently resurrect an approval.

`entry:edit-own` and submission require the contribution's author. An author may
discard or restore their own work with edit permission. `entry:dismiss` lets a
curator dismiss or restore another contribution. There is no generic edit-any or
purge capability in this increment. Resource-scoped grants refer to contribution
IDs; broader canonical-entry scopes remain future contract work.

Independent policy requires a positive integer number of approvals by distinct
human principals other than the author. A principal with publish capability can
execute publication after those approvals, including the author. Direct policy
requires a recorded direct authorization by a principal with publish capability;
it does not require review capability. These records are distinguishable.

Delegation is the intersection of the authenticated human's current grants and
the current delegation's Fold, resources, capabilities and lifetime. Audit records
include human, grant, agent and delegation IDs. Multiple agents of one person
cannot count as different reviewers. An author's agent cannot independently
approve that author's contribution. Delegated approvals require the original
delegation to remain current at publication.

### Revisions and transitions

A contribution has a format version, optimistic state version and review scope:
opaque content, schema, policy and target revisions. The application must obtain
these values from trusted loaded state, not accept identity or policy assertions
from a browser or agent. Policy revisions must change whenever policy changes.

| Command          | Source                                       | Result               | Capability / additional condition                               |
| ---------------- | -------------------------------------------- | -------------------- | --------------------------------------------------------------- |
| create           | Absent                                       | Draft                | create; storage must enforce absence                            |
| revise           | Draft, InReview, Approved, PublicationFailed | Draft                | edit-own; removes all approvals                                 |
| submit           | Draft                                        | InReview             | submit; author; independent policy                              |
| approve          | InReview                                     | InReview or Approved | review; independent principal; threshold counts distinct people |
| authorize-direct | Draft                                        | Approved             | publish; direct policy                                          |
| publish          | Approved, PublicationFailed                  | Publishing           | publish; current recorded approvals; fresh attempt ID           |
| dismiss          | Draft, InReview, Approved, PublicationFailed | Dismissed            | edit-own or dismiss; removes approvals                          |
| restore          | Dismissed                                    | Draft                | edit-own or dismiss; removes approvals                          |

Every command checks the expected state version. Editing clears approvals even
if the content revision is unchanged, allowing explicit refresh after schema,
policy or target changes. Such changes block approval/publication until refreshed.
If an approval loses authority after reaching Approved, publication is denied;
the current recovery path is revise and resubmit. A dedicated re-review command
is deferred.

`Publishing` blocks editorial edits and dismissal. Only internal provider
reconciliation can advance it, matching state version, attempt ID and review
scope. An unknown network result stays pending. A confirmed failure permits a
new attempt; a confirmed application becomes Applied. Receipt reconciliation is
not a client command and requires independently verified provider evidence.

Contribution intent distinguishes publication and withdrawal. Dismissal never
deletes a record. The canonical lifecycle is typed separately; canonical storage,
withdrawal application and receipt audit persistence are not implemented here.

### Experimental persistence contract

The separate `EditorialGitProvider` contract describes read, execute and recovery
without replacing the legacy scaffold interface yet. Mandatory guarantees include
conditional writes, durable recovery, payload-bound idempotency, exact reviewed
revision integration and server-owned records. `missingGuarantees` detects absent
declarations; declarations and unit tests are not evidence of provider support.

An operation binding includes authenticated person/agent, Fold, repository,
resource, action, key and normalized command digest. The application must compute
the digest, including all revisions, paths, data and server-generated records;
never trust a digest supplied by a client. `matchesOperation` only compares stored
bindings. Atomic claims, durable lookup, bounded path enforcement and concurrent
recovery remain adapter work. No helper promises exactly-once network delivery.

`expectedRevision: null` means create-if-absent, never unconditional replacement.
An adapter must fail if it cannot enforce mandatory preconditions. A conditional
save must persist the contribution and its audit record together. A numeric domain
version is not a database lock: persistence must compare the loaded opaque provider
revision before accepting the next version.

### Versioning

Persisted contribution and operation bindings start with `formatVersion: 1`.
The future loader must reject unsupported versions and validate loaded records
before passing them to Core. This increment operates on trusted typed values; it
does not implement a JSON parser, schema migrations, HTTP or OpenAPI.

Packages remain private/experimental at 0.0.0. No compatibility guarantee is
made for these new contracts before the remote feasibility test. Future format
changes require a version and an explicit migration with fixtures preserving
identities, review scopes and operation bindings. Readers must not silently
reinterpret unknown versions. Public API deprecation and upgrade windows remain
a Phase 1A deliverable before external publication.

## Threat model and remaining proof

| Threat                                  | Current domain protection                                  | Remaining boundary / test                                                                   |
| --------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Forged identity, grants or approvals    | Trusted context is distinct from commands                  | HTTP authentication, trusted loaders and protected record paths                             |
| Cross-Fold or foreign-resource write    | Fold, capability, ownership and resource checks            | Bind loaded resources to protected repository/path mapping                                  |
| Author uses agents to bypass review     | Count human principals, enforce delegation intersection    | Identity adapter must establish the actual human/agent relationship                         |
| Stale approval or revoked authority     | Bind four revisions; recheck recorded grant and delegation | Reload current configuration immediately before provider integration                        |
| Concurrent approval/save                | Expected domain version rejects stale commands             | Provider compare-and-swap must prevent two accepted writes                                  |
| Crash after commit before MR            | Recoverable operation contract, unknown remains pending    | Remote durable records, atomic key claim and reconciliation proof                           |
| Client tampers with policy via proposal | Commands contain no effective grants or policy             | Protect server records and obtain policy outside editable branches                          |
| Revocation races with provider delivery | Domain rechecks before entering Publishing                 | E2 must specify linearization and retry-time checks; no cross-system transaction is claimed |
| Malformed content or executable hooks   | No executable content in the domain command model          | Schema validation, path/size limits, safe rendering and runtime input validation            |

The next experiment must demonstrate two conditional writers and an interrupted
commit/MR operation using GitLab HTTP on a disposable project. Record the actual
guarantees and failure evidence before finalizing the provider contract. No remote
support, durable storage, end-to-end workflow or production readiness is claimed.

## Consequences and alternatives

Pure transitions can be tested independently of Studio, Git hosts and runtime.
Their returned audit is an instruction to persist, not proof that work is saved.
The application must reject unsafe writes even if the domain transition succeeds.

Rejected alternatives: authorizing publication from a capability alone; counting
agent IDs as reviewers; allowing an unconditional overwrite on missing revision;
and turning an unknown transport outcome into a definitive editorial failure.

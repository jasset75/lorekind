# 0007: Versioned editorial HTTP boundary

- **Date:** 2026-09-09
- **Status:** Implemented experimental API with local storage adapter
- **Extends:** ADR 0004 and ADR 0006

## Decision

Expose the existing application operations through a Fetch `Request`/`Response`
handler. Authentication, workspace discovery and trusted context resolution are
injected. HTTP routing does not grant permissions or implement another editorial
state machine. The Node development bridge is separate from the Fetch handler.

The [OpenAPI contract](../api/openapi.json) describes `/api/v1` identity, Folds,
schema discovery, canonical entries, proposals, validation, diffs, workflow actions,
history and operation receipts. The contract version is experimental, not a stable
compatibility promise. Schema discovery currently exposes editable fields and a
schema revision; validation remains authoritative on the server.

Every mutation requires `If-Match` and `Idempotency-Key`. The ETag is a workspace
revision, deliberately conservative across resources in this single-entry adapter.
Creation and update are distinct application commands, so a reused key cannot
silently switch between them. `PATCH` replaces the complete content object; it is
not JSON Patch. Validation is a non-mutating POST and does not consume a key.

Proposals have stable public IDs. Starting another proposal retains the previous
applied proposal's content, base, diff and proposal-scoped history. At most one
unapplied proposal exists per workspace in the current local adapter. An applied
proposal is immutable. A dismissed proposal remains identifiable and restorable.

Operation IDs bind the authenticated principal, Fold and idempotency key. Receipts
are persisted with the state change and readable only by their initiating principal
while current read access remains valid. A retry can return its historical receipt
even after the workspace advances, without executing the old command again.
Current operations complete synchronously against the local store. Pending/failed
remote operation execution is not yet implemented.

## Authentication and isolation

Neither query parameters nor command fields can supply trusted identity. Missing
credentials return 401. Inaccessible resources return 404; capability denials
within an accessible resource return 403. Grants are resolved for every request.

The development bearer adapter accepts operator-provided author/reviewer tokens
from server environment variables, requires distinct values of at least 32
characters and compares credential bytes in constant time when lengths match.
It has no built-in passwords or default credentials. It is not an OIDC provider,
user-management service or production deployment recipe.

The unauthenticated role-switching evaluator remains a local simulator. Its files
are isolated from the authenticated API (`api-` filename prefix), so the simulator
cannot plant approval records in API state. Studio migration to authenticated API
sessions remains separate work; the two surfaces share application operations,
not these development storage files.

## Compatibility and remaining work

### Optional browser authentication boundary

`createBrowserEditorialApi` composes the existing API with an injected
`BrowserIdentityProvider` and a protected `resolvePrincipal` callback. Identity
mapping and Fold grants are evaluated on every request; neither a token's email
nor a browser-selected role grants editorial authority. Mapping can reject a
principal or an issuance time after an operator revokes access. Provider failures
fail closed with a generic server error; invalid credentials return 401.

`cloudflareAccessIdentity` is the first optional adapter. It verifies the
`Cf-Access-Jwt-Assertion` signature with `jose`, RS256 and keys fetched only from
the configured Access team's HTTPS certificate endpoint. It checks issuer,
application audience, expiry, issued-at time, subject and application token type.
Its bounded remote-key cache supports refresh; it does not cache user grants.
See [Access JWT validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/).

The wrapper requires a configured canonical HTTPS origin. Mutations require its
exact Origin header; foreign origins, foreign request hosts and cross-site/sibling
browser requests are rejected before accessing editorial state. Responses are
non-cacheable. This is a browser boundary, not the future machine-client flow.

A host must protect both Studio and API through Access, configure subject-to-ID
mapping and current grants, and keep any direct origin protected. JWT validation
alone does not observe immediate upstream session revocation; operators must
enforce that through the mapping/grant boundary or the Access ingress. API state
must remain separate from the role-switching simulator's files.

This increment provides a tested composition boundary, not a deployed host or
Studio session integration. The two-principal workflow test uses synthetic signed
assertions and local persistence; real login, sign-out, runtime binding and the
Studio API client remain open. No Access tenant or production settings are included.

### Existing records and hosted milestones

Existing v1 local snapshots remain readable. Additive proposal IDs and retained
proposal data are written on subsequent saves. Legacy contributions use a stable
`legacy-<profileId>` public ID. A previously applied legacy snapshot lacks its
original base; its diff returns `diff-unavailable` instead of inventing one.

This does not close the hosted MVP milestone. Still required: production identity
verification, runtime deployment binding, safe remote record loading, GitLab
conditional persistence/recovery and reviewed integration into the consumer.
No database or backend checkout has become a hosted requirement.

## Verification

Handler tests exercise documented response shapes, credential rejection, current
grants, resource isolation, preconditions, immutable historical proposals, revision
invalidation and receipt ownership. `pnpm test:api` starts an isolated loopback
server, uses ephemeral credentials, restarts after approval and verifies exact
recovery and idempotent publication. It also verifies simulator/API separation.

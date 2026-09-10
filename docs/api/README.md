# Editorial API v1 — experimental local implementation

The contract is [openapi.json](./openapi.json), also served at
`GET /api/v1/openapi.json` by the development server. It contains no private
consumer data or credentials.

The HTTP boundary uses Hono and Zod, with OpenAPI 3.1 generated from the route and
schema definitions. Its Fetch contract is tested in Node and a restrictive
Workers runtime harness. [ADR 0008](../architecture/0008-portable-http-stack.md)
records the implementation and portability evidence. The development server still
uses the local storage adapter; hosted identity and remote Git persistence remain
pending.

Studio is now the product UI at `/`; `/evaluate` has been removed without a redirect. Its current
local identity mode still uses the shared application through a development-only
adapter, not browser authentication to this API. See [Studio setup](../studio/README.md)
and [ADR 0010](../architecture/0010-evolving-product-mvp.md). The two local stores
remain separate until an explicit, trusted migration is designed.

## Language and errors

Send `Accept-Language: es-ES, en;q=0.8` for Spanish presentation, or `en` for
English. Without a supported preference, English is used. Language cookies and
`?lang=` are not supported; the latter remains an unsupported query. The portable
handler returns `Content-Language` and `Vary: Accept-Language`, while the generated
OpenAPI document itself stays in English.

Errors retain their HTTP status and `error.code`, and add localized presentation:

```json
{
  "error": {
    "code": "validation",
    "message": "Revisa el contenido no válido.",
    "details": ["Título debe tener entre 1 y 200 caracteres y no puede estar en blanco."],
    "issues": [
      {
        "code": "text-length",
        "path": ["title"],
        "params": { "min": 1, "max": 200 },
        "message": "Título debe tener entre 1 y 200 caracteres y no puede estar en blanco."
      }
    ]
  }
}
```

Use `code`, `path` and `params` for client logic, never messages. Zod transport
issues have codes such as `zod.invalid_type`. The validation endpoint similarly
adds `issues` alongside its existing `errors` array. Early host-adapter failures
may omit localized messages, issues and headers; clients must handle the minimal
`code`/`details` response. The editor simulator consumes structured issues and
translates them in its own selected language.

Content, state names, audit records, ETags and operation identities never change
with language. Legacy trusted profiles that return string errors receive generic
`custom-validation` issues; migrate them to structured issues for detailed
feedback. See [ADR 0009](../architecture/0009-localization-boundary.md).

| Routes                                                                                    | Use                                                          |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `GET /api/v1/me`, `GET /api/v1/folds`                                                     | Verified identity, scoped capabilities and accessible spaces |
| `GET /api/v1/folds/{foldId}/schemas`                                                      | Editable fields and current schema revision                  |
| `GET …/entries`, `GET …/entries/{entryId}`                                                | Canonical content                                            |
| `GET/POST …/proposals`                                                                    | List or create proposals                                     |
| `GET/PATCH …/proposals/{proposalId}`                                                      | Read or replace draft content                                |
| `POST …/proposals/{proposalId}/validate`                                                  | Validate supplied or saved content without saving            |
| `GET …/proposals/{proposalId}/diff`                                                       | Changes against the saved proposal base                      |
| `POST …/proposals/{proposalId}/{submit,approve,authorize-direct,publish,dismiss,restore}` | Policy-controlled actions                                    |
| `GET …/proposals/{proposalId}/history`                                                    | Proposal-scoped audit                                        |
| `GET /api/v1/operations/{operationId}`                                                    | Initiator-only persisted result                              |

Here `…` means `/api/v1/folds/{foldId}`. No query parameters, pagination or arbitrary
file paths are accepted in this increment. The adapter exposes one entry per Fold
and retains past applied proposals while allowing one active proposal.

## Local configuration

Configure `LOREKIND_API_AUTHOR_TOKEN` and/or `LOREKIND_API_REVIEWER_TOKEN` in the
server environment using distinct randomly generated values of at least 32
characters. Do not put credentials in Git, URLs or browser source. Missing tokens
leave protected API routes unauthenticated. Requests send
`Authorization: Bearer <configured-token>`; `?actor=` is rejected.

Start the existing development server on loopback. The consumer profile is still
selected through `LOREKIND_STUDIO_PROFILE`. The API stores its isolated copy in
`.evaluation/api-<profileId>.json` by default, or beneath
`LOREKIND_STUDIO_DATA`. It does not share
local Studio's simulated identities, approvals or data.

For a self-contained check without configuring persistent credentials, run:

```sh
mise exec -- pnpm test:api
```

This uses port 4323, refuses an occupied port, generates ephemeral tokens and a
temporary store, verifies a server restart and cleans up its own server/data.
The existing evaluation server is left running.

## Contract maintenance and portability

Edit `apps/studio/src/server/api-contract.ts` when changing a route or schema,
then run:

```sh
mise exec -- pnpm openapi:generate
mise exec -- pnpm openapi:check
mise exec -- pnpm test:api:portability
```

Review the generated `docs/api/openapi.json` diff rather than editing that file
directly. `pnpm check` detects drift and runs the portability tests in CI. The
runtime serves the generated artifact; it does not generate OpenAPI per request.
Boundary inputs are strict and success responses are validated with Zod. Tests
also validate actual payloads and required response headers against the generated
JSON Schemas with an independent validator in the test host.

Use `Content-Type: application/json`, optionally with valid parameters such as
`; charset=utf-8`. Unsupported media types and malformed MIME parameters return
415; malformed parameter strings must never make a supplied action body appear
empty to the framework validator. Method errors consistently include `Allow`.

The same scenarios run against Node Fetch and Miniflare 4.20260730.0 with workerd
1.20260730.1, compatibility date `2026-07-30` and `no_nodejs_compat`. A runtime
probe verifies that Node's `process` is absent and dynamic function compilation
is blocked. Zod is configured with `jitless: true` before schema construction.
The bundled Worker has no unresolved imports and does not include the Node
credential adapter, local file store or OpenAPI build entry.

The harness uses an isolated memory store and test-only credentials. Its files
under `apps/studio/src/server/testing` are fixtures, not deployment entry points.
Restart durability is checked separately through `pnpm test:api` against the
Node development server and file store. These checks do not establish production
identity integration, remote Git durability or a hosted Workers deployment.

## Request sequence

1. Read `entries` and retain the response's `ETag`, for example `"v0"`.
2. POST `proposals` with `{"entryId":"…","content":{…}}`, `Content-Type:
application/json`, `If-Match: "v0"` and a fresh `Idempotency-Key`.
3. Read `result.proposalId` and the new ETag. Use the proposal route for subsequent
   edits and actions. PATCH accepts `{"content":{…}}`; actions accept `{}`.
4. Submit as the author, approve as an independent authorized reviewer, then
   publish as a principal with publication capability. A directly configured
   Fold may use `authorize-direct` instead of independent approval.
5. Use the returned `Location` to read the operation. After an uncertain response,
   resend the identical request with its original key and original If-Match.
   Do not change the revision or payload under an existing key.

Missing preconditions return 428, stale revisions 412, schema failures 422 and
workflow/key conflicts 409. A validation request returns 200 with `valid`, `errors`,
`issues` and `schemaRevision`; it never substitutes for validation during mutation.

`publish` currently applies only to the local API copy. The portable handler is
implemented, but GitLab persistence, production authentication and deployment
remain pending. See [ADR 0007](../architecture/0007-versioned-editorial-api.md).

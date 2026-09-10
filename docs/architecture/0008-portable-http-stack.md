# 0008: Portable HTTP stack with Hono, Zod and OpenAPI

- **Date:** 2026-09-09
- **Status:** Implemented HTTP boundary; Node and restrictive Workers harness verified;
  remote persistence and hosted deployment pending
- **Relationship:** Extends ADR 0004 and replaces the hand-written HTTP routing
  and separately maintained contract approach of ADR 0007. Preserves its Fetch
  boundary and editorial guarantees. ADR 0007 describes the preceding prototype.

## Context

Lorekind needs one editorial API for Studio, external integrations, CLI and AI
clients. The backend must remain deployable on platforms with a narrower runtime
surface than a full Node.js process, while retaining Node as a supported target.
ADR 0004 already selects Cloudflare Workers as an initial deployment option and
remote Git HTTP APIs as the baseline persistence mechanism.

At decision time, the local API demonstrated the workflow with a Fetch handler, manual routing and
validation, and a separately authored OpenAPI document. That is a useful prototype,
but each new endpoint adds several representations of the same contract. Avoiding
dependencies shifts routing, validation and documentation maintenance into
Lorekind; it does not by itself improve portability or long-term simplicity.

We accept a moderate initial dependency and integration cost to make the contract
explicit and reduce duplicated infrastructure before external clients rely on it.

## Decision

Adopt **Hono + Zod + OpenAPI** for the editorial HTTP boundary:

- Hono owns HTTP routing and middleware around a standard Fetch entry point.
- Zod defines executable boundary schemas and inferred TypeScript transport types.
- OpenAPI describes the public, language-independent HTTP contract, generated from
  the same route and schema definitions used by the implementation.
- Use `@hono/zod-openapi` as the initial integration. Pin mutually compatible
  versions during implementation and verify the resulting runtime bundle.

Hono's documented integration connects route definitions, Zod validation and
OpenAPI generation. This is the basis for choosing one maintained integration
instead of building a separate contract-generation layer in Lorekind.
[Hono Zod/OpenAPI integration](https://hono.dev/examples/zod-openapi).

The framework remains an adapter dependency. Editorial state transitions,
authorization, revision-bound approvals, idempotency and provider contracts stay
in the shared application/domain layers. They do not consume Hono context objects
or deployment bindings. Studio keeps its Astro shell and Svelte islands; the API
can be composed into a Studio server adapter or hosted independently.

Framework-agnostic means that consumers and the editorial domain are independent
of the selected HTTP framework. It does not require hand-writing the server.

## Why this supports restrictive runtimes

### Start from web standards, then adapt to Node

Hono uses web-standard request/response primitives and provides a Node adapter.
That fits a shared HTTP implementation based on `Request`, `Response`, `Headers`,
`URL` and `fetch`, with runtime-specific entry points outside it.
[Hono web standards](https://hono.dev/docs/concepts/web-standard).

Lorekind's portable request path must not require a Node HTTP server, local
filesystem persistence, subprocesses, native addons, shell Git or ambient
`process.env`. Inject configuration, identity verification and persistence through
explicit services. Prefer standard Web Crypto and streams where needed. Node
development tools and the local file store remain valid in their own adapters;
they must not become transitive requirements of the deployed Fetch bundle.

This matters because Node compatibility is not equivalent to a full Node host.
Workers exposes a subset of Node APIs, including partial implementations and
importable stubs whose methods can fail. Compatibility support also evolves with
runtime configuration. A successful import or Node test is therefore insufficient
evidence that the application works in Workers.
[Workers Node compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/).

The portability baseline must also work without runtime code generation through
`eval` or `new Function`. Workers documents restrictions on both. Validate the
selected Zod configuration and all middleware under those restrictions; use a
supported non-JIT path where necessary. Generate OpenAPI during development/build,
so deployed requests can serve an artifact without requiring generation tooling.
Node remains acceptable for builds even when the deployment runtime is not Node.
[Workers JavaScript restrictions](https://developers.cloudflare.com/workers/runtime-apis/web-standards/).

### Portability includes clients and contracts

OpenAPI gives clients an HTTP description independent of Hono, Zod, TypeScript,
Astro and Svelte. A consumer should be able to use ordinary HTTP or a generated
client without importing Lorekind server code. Target OpenAPI 3.1 and verify tool
compatibility; its schema model aligns with JSON Schema Draft 2020-12.
[OpenAPI 3.1 specification](https://spec.openapis.org/oas/v3.1.0).

Use JSON-representable transport schemas. Zod transformations and custom checks
are not all expressible in JSON Schema: generation must fail on unsupported
contract constructs rather than silently weakening them. Domain rules such as
independent approval still require server-side evaluation against trusted state.
[Zod JSON Schema conversion](https://zod.dev/json-schema).

Zod boundary schemas do not require content authors to ship executable Zod code
in Fold configuration. Exportable content schemas and trusted content validators
remain a separate concern under ADR 0004.

## Contract and implementation obligations

- Define routes, parameters, request bodies, response schemas, status codes and
  relevant headers together. Commit the generated OpenAPI artifact and detect
  drift in CI. Type inference and documentation generation do not replace runtime
  validation; verify actual responses against their declared schemas in tests.
- Preserve strict input handling, body limits, current authorization checks,
  revision preconditions, idempotency ownership and error semantics during the
  migration. Review any changed validation/coercion behavior explicitly.
- Keep an injectable Fetch interface for contract tests. Bind credentials,
  persistence and runtime lifecycle facilities in deployment adapters.
- Treat this as an HTTP implementation decision. Resource naming, REST semantics
  and workflow endpoint redesign require their own contract review; selecting
  Hono does not change the existing routes or establish REST conformance.

## Consequences and trade-offs

The initial work includes schema extraction, route migration, generated contract
checks and dependency updates. In exchange, future endpoints reuse a common
routing and validation system, and contract changes become reviewable alongside
the implementation. This improves maintainability as API surface and clients grow.

It does not prove higher throughput or make persistence horizontally scalable.
Current full-workspace reads, a single active proposal per workspace, coarse
revisions and synchronous local operation receipts remain prototype limitations.
Remote conditional writes, recoverable execution, bounded listings and provider
limits still need the work planned in ADR 0004. A runtime's CPU, memory and request
lifetime limits remain relevant even when every import is compatible.

The baseline still requires neither a CMS database nor a backend Git checkout.
Portability is a tested property of the complete dependency and adapter graph,
not a guarantee obtained by choosing three technologies.

## Alternatives not selected

- **Manual Fetch routing, with or without Zod:** preserves a small dependency
  surface but leaves routing conventions and contract synchronization to Lorekind.
  It remains useful for tiny adapters, not the growing editorial API boundary.
- **Fastify with schema-based validation:** a credible choice for a Node-focused
  backend. Hono better matches the selected Fetch-first baseline and avoids making
  full Node server semantics the starting assumption. This is an architectural
  preference, not a claim that Fastify cannot run in any serverless environment.
- **ts-rest or oRPC as an additional contract layer:** useful alternatives for
  shared client/server contracts, but not required to achieve this decision's
  generated OpenAPI and Fetch boundary. Reconsider if a concrete client need
  outweighs the extra integration and abstraction cost.
- **OpenAPI authored first, with generated implementation scaffolding:** offers
  strong language neutrality, but introduces a separate generation workflow.
  For the existing TypeScript implementation, executable route/schema definitions
  with a generated standard contract provide a more direct maintenance path.

## Verification and rollout status

Before claiming the migration and portability are implemented:

1. Run equivalent HTTP contract tests through the Node adapter and a Workers
   runtime harness, including malformed input, access denial, preconditions,
   retries and response schemas. Exercise a restrictive configuration without
   relying on Node compatibility or dynamic code generation in the shared path.
2. Check the deployed bundle's transitive dependencies and record the tested
   runtime settings, dependency versions and required platform capabilities.
3. Generate OpenAPI reproducibly and run a client smoke test against it. Keep
   privileged configuration and executable validators out of public schemas.
4. Prove remote Git persistence and recovery separately before marking the hosted
   workflow ready. Local file-store tests establish only local behavior.

### Implementation evidence — 2026-09-09

The HTTP boundary now uses Hono 4.13.7, Zod 4.5.4 and `@hono/zod-openapi` 1.6.3.
`api-contract.ts` owns routes and executable schemas; `editorial-api.ts` binds
them to the existing application services. Runtime Zod validation covers inputs
and success responses. `api-openapi-build.ts` and `scripts/openapi.mjs` generate
the OpenAPI 3.1 artifact, including structured review and audit records. The
quality gate detects generated-contract drift, and tests validate actual payloads
and headers independently with Ajv in the test host.

Shared scenarios exercise Node Fetch and Miniflare 4.20260730.0 / workerd
1.20260730.1 with compatibility date `2026-07-30` and `no_nodejs_compat`.
The Worker probe confirms that `process` is absent and `new Function` is blocked.
Zod's `jitless: true` setting is applied before creating schemas. The browser-target
bundle has no unresolved imports and excludes the local filesystem store, Node
credential adapter and OpenAPI build entry. Contract-driven client calls, input
rejection, preconditions, concurrent retries, approval invalidation, publication,
history and current-grant checks pass through the same Fetch boundary.

The Node development server also passes the separate HTTP smoke test with
ephemeral credentials, file-store restart recovery and simulator isolation.
The Worker fixture uses in-memory state and test-only authentication; it is not
a production deployment adapter. Remote Git persistence and recovery remain open
under ADR 0004. Studio still uses its existing local evaluator. The route names,
operation IDs and editorial semantics are preserved; method errors now consistently
include `Allow`, and Hono's implicit successful `HEAD` handling is rejected to
retain the existing method contract.

Malformed MIME parameters now return 415 instead of being tolerated by the old
media-type prefix check. This prevents the framework's JSON parser from treating
an unrecognised Content-Type as an empty action body. Valid JSON MIME parameters
and strict rejection of extra command fields are covered in both runtimes.

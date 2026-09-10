# 0010: One evolving product MVP

- Date: 2026-09-10
- Status: accepted; product entry-point increment implemented locally
- Compatibility provisions superseded by [ADR 0011](./0011-no-speculative-compatibility.md):
  unpublished routes and aliases are removed; stored data remains unchanged.
- Supersedes: the separate evaluation-UI framing of ADR 0006 and the separate
  home/evaluator scope in ADR 0009. Their security and persistence limits remain.

## Context

The root route presented a visual scaffold with invented metrics and activity,
while the working editorial workflow lived at `/evaluate`. That arrangement
described a development exercise rather than the product users would grow with.
The delivery model is now explicitly an evolving agile MVP: the first usable
increment of Lorekind, not a disposable pilot awaiting a separate implementation.

## Decision

Studio at `/` is the functional editorial workspace. Remove the disconnected
dashboard from the entry route. Preserve `/evaluate` as a compatibility redirect,
not as a second workspace. Astro still owns the shell and routing, Svelte the
interactive workspace, and Core the shared editorial application. Hono/Zod/OpenAPI
remain the portable HTTP boundary; this decision does not replace that stack.

Use product-facing names (`StudioWorkspace`, `localStudioPlugin`, Studio settings)
and bilingual copy. Explain limitations through an explicit local-mode notice:
local file persistence, simulated identities and local-only application. Do not
label an unimplemented capability as delivered just because the UI is now the MVP.
Disable the injected Astro development toolbar in the product development view;
developers still have normal browser and build diagnostics.

Preserve data and integration compatibility. Existing `.evaluation/` snapshots,
profile IDs, schema revisions, Core type exports and authenticated `api-` stores
do not change. Legacy environment variables and the old local adapter endpoint
remain aliases; they are not a parallel implementation. The default starter
article is editable content, not fabricated history.

Ship subsequent increments on this same foundation using an ordered backlog,
dependencies, acceptance criteria and explicit risks. Definition of done includes
integrated UI, authoritative server checks, persistence/recovery, accessibility,
localization and current documentation. A local increment does not imply a hosted
release, commit, push, publication or production rollout.

## Consequences and alternatives

The product is usable locally now, but the first next P0 remains trusted browser
identity and connecting Studio to `/api/v1`. The current same-origin local adapter
uses the same application operations, not real sign-in. Do not put development
bearer tokens in client code or silently promote simulated records to trusted
authenticated state. Remote persistence follows as an adapter increment.

Keeping the showcase beside a separate evaluation page was rejected because it
fragments the user journey and presents unimplemented activity as the main UI.
A wholesale rewrite was rejected because the existing domain, persistence and
contract tests are reusable product foundations. Merely removing local-mode
warnings was rejected because it would misrepresent security and delivery scope.

## Verification

Check `/`, the `/evaluate` redirect, and the full save → submit → independent
approve → local apply workflow using isolated data. Restart between approval and
application, including switching from legacy to new configuration names. Verify
idempotent retries, cross-origin rejection, self-review denial, and API/Studio
store isolation. Run the quality gate, browser checks and existing restrictive
Workers contract suite. The roadmap tracks remaining checks and capabilities.

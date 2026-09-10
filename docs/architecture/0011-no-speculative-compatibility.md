# 0011: No speculative compatibility for unpublished interfaces

- Date: 2026-09-10
- Status: accepted; implemented locally
- Supersedes: redirect and integration-alias provisions in ADR 0010

## Context and decision

The previous increment preserved `/evaluate` and several development aliases
without evidence of a deployed consumer requiring them. This is an unpublished
MVP: compatibility must address a demonstrated dependency, not hypothetical use.

Keep `/` as the only Studio page. Remove `/evaluate` without a redirect, the
`/__lorekind_evaluation` endpoint, the `evaluationPlugin` re-export and the
`LOREKIND_EVALUATION_*` configuration aliases. Current integrations use
`/__lorekind_studio`, `localStudioPlugin` and `LOREKIND_STUDIO_*` instead. Update
the known Coracha local setup instructions to use the current names and URL.

Preserving saved data is a separate responsibility: do not move or reset
`.evaluation/`, change snapshot formats or profile IDs, or merge authenticated
API data with simulated-identity workspaces. A custom directory must retain the
same value when its environment variable is renamed in local launch commands.

## Consequences and verification

Old development URLs now return 404, not a redirect. Local commands using removed
variable names must be updated. No production rollout or data migration is involved.
Future compatibility or deprecation machinery requires evidence of actual consumers.
Existing safeguards and compatibility needed by real stored records or trusted
consumer profiles are not removed merely because the product is pre-release.

Verify removed GET/POST routes return 404 without Location headers, the build
contains no evaluate page, and Studio's full workflow and restart recovery still
pass. Run the normal quality gate and isolated real HTTP smoke test.

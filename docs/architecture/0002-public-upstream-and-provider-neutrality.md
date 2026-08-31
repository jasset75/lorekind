# 0002: Public upstream and provider neutrality

- **Date:** 2026-08-31
- **Status:** Accepted foundation

## Context

Lorekind is intended for a broad open-source community whose deployments may
already keep private platforms and content workflows on different Git hosts.

## Decision

Lorekind's public source, issues, releases, and community pull requests live on
GitHub. GitHub hosting does not make GitHub the only content provider.

The GitHub adapter is the first planned adapter. The GitLab adapter is also an
early requirement so existing GitLab deployments do not need a repository
migration. Both must pass a shared conformance suite.

Editorial users authenticate with the Lorekind deployment. They do not need a
GitHub or GitLab account. A restricted service identity performs bounded branch,
commit, and pull- or merge-request operations only after server authorization.

## Consequences

- Public contribution and private consumer storage remain separate concerns.
- Provider terminology is normalized as a change request in generic code.
- GitHub pull requests and GitLab merge requests retain their native names in
  adapter-specific UI and diagnostics.

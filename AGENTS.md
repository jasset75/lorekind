# Lorekind contributor instructions

## Contribution workflow

Use the [pull-request-contributions skill](.agents/skills/pull-request-contributions/SKILL.md)
when implementing, preparing, reviewing, or merging changes. Work on feature
branches, keep PRs small, inspect English public-facing prose and outgoing history
before publication, and integrate authorized changes through squash PRs to `main`.
The skill includes a size checker; it does not install Git hooks or GitHub rules.

## Product boundary

- Lorekind is a framework-agnostic, Git-native CMS.
- A Fold is a governed editorial space; do not encode deployment-specific
  channel concepts in generic packages.
- Editorial users do not need GitHub or GitLab accounts. Authorization is
  evaluated server-side before a provider performs bounded Git operations.
- GitHub and GitLab adapters must conform to the same contracts in
  `packages/git`.

## UI boundary

- Astro owns the Studio shell, routing, static surfaces, and server adapters.
- Svelte owns interactive editorial workspaces only where client state is
  justified.
- Publication frontends must not depend on Svelte or Lorekind Studio.
- Components consume semantic tokens from `packages/theme`; avoid hard-coded
  brand colors in reusable UI.
- Ordinary Fold configuration cannot inject executable CSS or JavaScript.

## Quality

- Run `pnpm check` before proposing a change.
- Add tests for authorization rules and provider-contract behavior.
- Preserve accessibility: keyboard operation, visible focus, reduced motion,
  zoom, and contrast are requirements.

# Lorefold contributor instructions

## Product boundary

- Lorefold is a framework-agnostic, Git-native CMS.
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
- Publication frontends must not depend on Svelte or Lorefold Studio.
- Components consume semantic tokens from `packages/theme`; avoid hard-coded
  brand colors in reusable UI.
- Ordinary Fold configuration cannot inject executable CSS or JavaScript.

## Quality

- Run `pnpm check` before proposing a change.
- Add tests for authorization rules and provider-contract behavior.
- Preserve accessibility: keyboard operation, visible focus, reduced motion,
  zoom, and contrast are requirements.

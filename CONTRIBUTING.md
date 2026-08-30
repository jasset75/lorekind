# Contributing to Lorefold

Lorefold welcomes design, documentation, testing, and code contributions. The
project is in its foundation stage, so proposals that clarify boundaries are as
valuable as implementation work.

## Before opening a pull request

1. Search existing issues and discussions.
2. Open an issue before making a large architectural or public-API change.
3. Keep deployment-specific behavior outside generic Lorefold packages.
4. Add tests for authorization and provider behavior.
5. Run `mise run check` from the repository root.

## Pull requests

- Keep each pull request focused on one outcome.
- Explain user impact, security implications, and alternatives considered.
- Update architectural documentation when changing a public boundary.
- Do not commit credentials, personal information, production content, or
  provider tokens.
- Do not claim compatibility with a Git provider until the shared conformance
  suite passes.

## Decisions

Changes to the Fold model, authorization semantics, provider contract, extension
system, theme security boundary, or governance require an ADR in
`docs/architecture`.

## Development certificate of origin

By contributing, you certify that you have the right to submit the work under
the project's license. A formal DCO or contributor agreement may be introduced
before the first stable release after community consultation.

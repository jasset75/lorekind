# Security policy

Lorefold is not production-ready. No release is currently covered by a stable
security-support promise.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Use GitHub's private
vulnerability reporting for this repository. If that feature is temporarily
unavailable, wait for a private maintainer contact to be published rather than
including exploit details in a public channel.

Include:

- affected commit or version;
- reproduction steps;
- expected impact;
- whether credentials or personal data may be exposed; and
- any proposed mitigation.

## Security boundary

The browser and Studio controls are not an authorization boundary. Every
mutation must be validated server-side against a principal, Fold, capability,
resource scope, and current grant. Provider credentials must never be exposed to
editorial clients.

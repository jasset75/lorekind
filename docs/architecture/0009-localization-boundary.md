# 0009: Language-neutral errors and localized presentation

Status: accepted; implemented locally.

## Context

The evaluator originally embedded Spanish interface and profile-validation text.
Those profile messages crossed the generic application boundary into HTTP errors.
Changing the HTTP framework did not separate editorial meaning from presentation.
Lorekind must support consumers and clients in different languages without adding
a runtime-specific dependency to Core or changing the meaning of stored content.

## Decision

- Core defines `ValidationIssue` as `code`, `path` and scalar `params`. It has no
  locale, translation catalog, Hono or Zod dependency. Submitted values must not
  be copied into issue parameters.
- The built-in article profile emits language-neutral validation issues. Its
  trusted metadata can provide optional `titleKey` and field `labelKey` values;
  literal labels remain fallbacks for profiles owned by other consumers.
- Hono detects `en` and `es` from `Accept-Language` only, with English fallback,
  regional matching and quality ordering. No language cookies, query parameters
  or additional identity inputs are introduced. Since Hono 4's detector retains
  zero-quality preferences, the boundary removes `q=0` and malformed ranges
  before detection. If no supported acceptable range remains, use the fallback
  rather than returning 406.
- Zod's English/Spanish locale maps format validation issues at the request
  boundary. Never call `z.config()` to change language during a request. The
  existing constant `jitless: true` setting remains intact. Locale modules are
  imported explicitly; there are no filesystem lookups or dynamic locale loads.
- The API preserves status codes and language-independent error codes. Error
  responses add presentation `message` and structured `issues`; the existing
  `details` and validation `errors` arrays contain localized compatibility text.
  Clients branch on codes, paths and params, never on translated messages.
- Responses from the portable handler declare `Content-Language` and
  `Vary: Accept-Language`. The OpenAPI artifact remains invariant in English.
  Early host-adapter rejections retain the minimal code/details envelope; clients
  must tolerate absent messages, issues and localization headers there.
- The evaluator uses typed English/Spanish catalogs for interface, accessibility,
  status and domain-error text. It initially retains Spanish and offers a language
  selector. Switching language is presentation-only: no reload, mutation or loss
  of an unsaved draft. The selection is not persisted in this increment.
- Profile content, revisions, review scopes, operation keys, receipts and audit
  records are never translated. Existing Spanish example content is intentional
  content, not interface copy; changing it here would alter the example baseline.

## Compatibility and scope

Older trusted profiles returning string errors are still accepted, but their
prose is converted to a generic `custom-validation` issue rather than propagated
as an untranslated or potentially sensitive message. Consumers should migrate to
structured issues to retain field-specific feedback. Unknown issue codes retain
their identity and receive a generic localized message until their presentation
catalog is integrated. Consumer catalogs are trusted source code, not executable
Fold configuration. This increment does not translate the unrelated Studio home
page or automatically translate consumer-owned profiles and content.

OpenAPI describes the additive response fields and optional request header. The
experimental API is not yet a stable compatibility guarantee. Persisted snapshot
format and validation acceptance rules remain unchanged.

## Consequences and alternatives

Using the capabilities already bundled in Hono and Zod avoids another dependency
or a Node-only translation service. The small typed catalogs cover the evaluator;
they are not an ICU/pluralization framework. A richer translator can replace this
presentation layer when that requirement appears, without changing Core issues.

Global locale mutation was rejected because concurrent requests can cross-talk.
Translating only on the server was rejected because interface labels and changing
the language of already displayed errors belong to the client. Keeping only
localized strings in the contract was rejected because clients need stable codes.

## Verification

The contract suite exercises language fallback and negotiation, concurrent
English/Spanish Zod errors, structured profile validation, preserved content and
idempotent retries in Node Fetch and the restrictive Workers harness. Catalog
tests verify key/placeholder parity, fallback and legacy profile normalization.
The standard build and actual HTTP restart smoke remain required checks.

References: [Hono language middleware](https://hono.dev/docs/middleware/builtin/language),
[Zod error customization and locales](https://zod.dev/error-customization).

# Lorekind Studio — current MVP

Studio is the product UI at `/`, backed by the shared editorial application.
It is not a separate evaluation product. `/evaluate` has been removed, without a redirect; there is
no fake dashboard or simulated activity feed on the home page.

## Run locally

```sh
mise exec -- pnpm dev --host 127.0.0.1 --port 4322
```

Open `http://127.0.0.1:4322/`. In environments that otherwise background Astro,
set `ASTRO_DEV_BACKGROUND=1` for a managed foreground process.

The default profile supplies a generic editable article. This is starter content,
not a claim of prior editorial activity. A trusted consumer module can supply a
different profile and baseline without introducing consumer types into Core.

1. Edit the content as the simulated Author and save the draft.
2. Inspect the persisted diff and submit for review.
3. Switch to the simulated Reviewer, approve, then apply to the local copy.
4. Reopen Studio or restart the server to continue the saved workflow.

State, revision and history are read from the workspace. Language changes do not
reload or discard a draft. The theme selector supports system, light, dark and
high contrast. Unknown operation results retain the original command for retry.

## Configuration and saved work

- `LOREKIND_STUDIO_PROFILE`: absolute path to a trusted module exporting a default
  `ContentProfile`. Omit for the bundled article.
- `LOREKIND_STUDIO_DATA`: local snapshot directory.
- Only the `LOREKIND_STUDIO_*` settings are supported. If a local shell or launch
  command still uses `LOREKIND_EVALUATION_PROFILE` or `LOREKIND_EVALUATION_DATA`,
  rename those variables and keep their existing values, especially a custom
  data directory. There is no automatic fallback to the old names.
- The default directory remains `.evaluation/`, with the same `<profileId>.json`
  file and snapshot format. Renaming the product UI does **not** move, reset or
  migrate saved drafts. Retaining this internal legacy directory is intentional.
- Authenticated `/api/v1` data keeps the `api-` filename prefix and is never
  silently merged with locally simulated identities' data.

The local browser adapter is `/__lorekind_studio`; the unpublished
`/__lorekind_evaluation` endpoint has been removed. The current endpoint is a
development-only adapter route, not an additional public REST contract.
The portable client contract remains [the versioned API](../api/README.md).

## Current limitations

The Studio identity selector is simulated and **not authentication**. The adapter
exists only in the development server, requires a loopback Host, and rejects
cross-origin writes. Never expose it through a reverse proxy or public host.
Applying changes affects the local canonical copy only, not Coracha or remote Git.

The static build contains the UI shell, not an operational backend. Opening it
without the development backend shows a connection error and cannot save. The
next P0 increment connects this same UI to the shared API using trusted browser
identity; it is not a second Studio implementation.

There is one entry and one active proposal per workspace. Remote GitLab/GitHub,
real browser sign-in, multi-entry navigation and a hosted runtime are pending.
File locks, corrupt-state rejection and manual stale-lock recovery retain the
limits documented in [ADR 0006](../architecture/0006-local-editorial-evaluation.md).

## Acceptance checks

```sh
mise exec -- pnpm check
mise exec -- pnpm test:api
```

The HTTP smoke uses its own temporary data and ephemeral API tokens on port 4323.
It checks the real home route, 404 responses for removed routes without redirects, the complete local
Studio workflow, permission denials, restart recovery, retries and isolation from
authenticated API data. Browser checks must additionally verify the interactive
workflow, language changes, keyboard use and responsive layout.

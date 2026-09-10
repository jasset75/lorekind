# 0006: Executable local editorial evaluation

- **Date:** 2026-09-08
- **Status:** Implemented local evaluation; hosted adoption remains pending
- **Extends:** ADR 0005 without claiming remote provider conformance

## Decision

Add a runtime-neutral application operation layer over the existing domain and
a separate development-only file store and HTTP adapter in Studio. This provides
an executable local slice while remote Git feasibility remains open. The local
store does not implement or claim the experimental `EditorialGitProvider`
guarantees: a single-machine transaction is deliberately a separate contract.

The evaluator loads one record per trusted profile. It saves the payload,
contribution, approvals, audit and operation receipts in one atomically replaced
snapshot. An exclusive directory lock rejects concurrent writers. The application
checks the loaded revision, computes content hashes, validates through the trusted
profile and uses the Core transitions. Publication applies only to the snapshot's
canonical copy. New proposals after application retain the accumulated audit.

`entry:read` is now explicit in the standard role presets. Reads check current
Fold/resource grants. The evaluator accepts simulated human actors only; delegated
identities remain tested at the domain layer but are not exposed by this adapter.
Every mutation is checked on the server even if a client enables a hidden button.

Operation keys are bound to the actor and complete command digest, including the
expected revision. Retrying a completed request returns its saved receipt without
reapplying it. A different payload with the same key fails. The browser retains
the original command after an uncertain request so it can retry the same operation.

Profiles are trusted server modules selected by the local operator, never uploaded
or selected by the browser. The bundled article is independent of consumers.
Consumers may supply a validator and baseline outside Lorekind; their catalogue
types and data do not enter public Core. Profiles do not grant authority.

## Evaluation boundary

The endpoint exists only in the development server. It requires a loopback Host
and same-origin JSON writes, imposes a body limit and rejects identity/approval
fields in command bodies. It is a local simulator, not an authentication service.
Do not expose it through a reverse proxy or public deployment. The static build
has no working mutation API and contains no externally loaded profile data.

Snapshots are local server-owned files. Unsupported/malformed formats fail closed.
The adapter is not a loader for contributor-controlled Git records. Saved process
restarts are supported; a process killed during a write can leave a lock directory.
It then fails closed with `store-busy`. After confirming no writer is running,
the local operator can remove that lock and retry the original operation. No
cross-machine lock, power-loss guarantee or automatic stale-lock eviction is claimed.

## Run and assess

Run `mise exec -- pnpm dev --host 127.0.0.1 --port 4322` and open `/evaluate`.
In an agent environment that starts Astro in the background automatically,
`ASTRO_DEV_BACKGROUND=1` keeps the managed process in the foreground.

Optional server environment variables:

- `LOREKIND_EVALUATION_PROFILE`: absolute path to a trusted consumer module with
  a default `ContentProfile` export. Omit for the generic article.
- `LOREKIND_EVALUATION_DATA`: local snapshot directory. Defaults to the ignored
  `.evaluation` directory at the Lorekind root, with one file per profile ID.

Save as Author, inspect the diff, submit, switch to Reviewer, approve and apply to
the local copy. Reload or restart before applying to verify saved continuity.
Test schema errors, an edit after approval and stale requests from another tab.
The author can discard; a curator can also dismiss/restore another proposal.

## Remaining adoption gates

This increment enables workflow evaluation, not a hosted MVP verdict. Still needed:
remote GitLab conditional-write/recovery proof, service credentials and protected
branches, verified application identity/current grants, safe Git record loading,
API compatibility and end-to-end consumer integration. Coracha delivery and
production confirmation remain separate from a local application result.

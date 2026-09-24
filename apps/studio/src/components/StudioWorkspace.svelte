<script lang="ts">
  import { SimulatedActor } from "../simulated-actors";
  import { editorialClient, StudioApiError } from "../client/editorial-client";
  import type { ApiTarget, StudioCommand, StudioAction } from "../client/editorial-client";
  import { onMount } from "svelte";
  import ThemeSwitcher from "./ThemeSwitcher.svelte";
  import { ContributionState, EditorialAction } from "@lorekind/core";
  import type { Contribution, ValidationIssue } from "@lorekind/core";
  import { translate, label, errorMessage, issueMessage } from "../i18n";
  import type { Locale } from "../i18n";
  import type { MessageKey } from "../i18n/catalogs";
  let {
    initialLocale = "es",
    apiMode = false,
    apiBasePath,
  }: { initialLocale?: Locale; apiMode?: boolean; apiBasePath: string } = $props();
  const api = $derived(editorialClient(apiBasePath, fetch, () => language));
  let language = $state<Locale>(initialLocale);
  const t = (key: MessageKey, params: ValidationIssue["params"] = {}) =>
    translate(language, key, params);
  type Field = { key: string; label: string; labelKey?: string; multiline?: boolean };
  const dismissibleStates: readonly ContributionState[] = [
    ContributionState.Draft,
    ContributionState.InReview,
    ContributionState.Approved,
  ];
  type View = {
    target?: ApiTarget;
    allowed?: Record<StudioAction, boolean>;
    profile: { title: string; titleKey?: string; fields: Field[] };
    snapshot: {
      revision: number;
      draft: Record<string, unknown>;
      canonical: Record<string, unknown>;
      contribution: Pick<Contribution, "state"> | null;
      audit: unknown[];
    };
    diff: { field: string; before: unknown; after: unknown }[];
  };
  let view = $state<View | null>(null);
  let actor = $state<SimulatedActor>(SimulatedActor.Author);
  let draft = $state<Record<string, unknown>>({});
  let messageKey = $state<MessageKey | null>(null);
  let failure = $state<{ code: string; issues: ValidationIssue[] } | null>(null);
  const message = $derived(
    failure
      ? failure.issues.length
        ? failure.issues.map((issue) => issueMessage(language, issue)).join(" · ")
        : errorMessage(language, failure.code)
      : messageKey
        ? t(messageKey)
        : "",
  );
  let busy = $state(false);
  let dirty = $state(false);
  let retry = $state<{ actor: SimulatedActor; command: StudioCommand } | null>(null);
  const fieldLabel = (field: Field) => label(language, field.labelKey, field.label);
  // Presentation-only changes: do not reload or overwrite an unsaved draft on language switch.
  $effect(() => {
    document.documentElement.lang = language;
    document.title = t("page.title");
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute("content", t("page.description"));
    const skipLink = document.querySelector(".skip-link");
    if (skipLink) skipLink.textContent = t("ui.skip");
  });
  const allowed = (action: StudioAction, local: boolean) =>
    apiMode ? view?.allowed?.[action] === true : local;
  async function load() {
    if (apiMode) {
      const loaded = await api.load();
      view = loaded;
      draft = $state.snapshot(loaded.snapshot.draft);
      dirty = false;
      return;
    }
    const response = await fetch(`/__lorekind_studio?actor=${actor}`);
    if (!response.ok) throw new Error("studio-unavailable");
    view = await response.json();
    draft = $state.snapshot(view!.snapshot.draft);
    dirty = false;
  }
  async function refresh() {
    busy = true;
    failure = null;
    try {
      await load();
      messageKey = "status.loaded";
    } catch (error) {
      failure = {
        code:
          error instanceof StudioApiError
            ? error.code
            : apiMode
              ? "api-unavailable"
              : "studio-unavailable",
        issues: [],
      };
    } finally {
      busy = false;
    }
  }
  async function execute(action: StudioAction, repeat = false) {
    if (!view) return;
    busy = true;
    failure = null;
    const pending =
      repeat && retry
        ? retry
        : {
            actor,
            command: {
              key: crypto.randomUUID(),
              action,
              expectedRevision: view.snapshot.revision,
              ...(apiMode ? { target: view.target } : {}),
              ...(action === EditorialAction.Save ? { content: $state.snapshot(draft) } : {}),
            },
          };
    retry = pending;
    try {
      const response = apiMode
        ? await api.execute(pending.command)
        : await fetch(`/__lorekind_studio?actor=${pending.actor}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(pending.command),
          });
      const result = await response.json();
      if (!response.ok) {
        if (response.status < 500) retry = null;
        failure = apiMode
          ? { code: result.error.code, issues: result.error.issues ?? [] }
          : { code: result.error, issues: result.issues ?? [] };
        return;
      }
      await load();
      retry = null;
      messageKey = action === EditorialAction.Publish ? "status.applied" : "status.saved";
    } catch (error) {
      if (error instanceof StudioApiError) {
        retry = null;
        failure = { code: error.code, issues: error.issues };
      } else messageKey = "status.uncertain";
    } finally {
      busy = false;
    }
  }
  onMount(() => {
    void refresh();
  });
</script>

<main id="workspace" class="studio">
  <header class="studio-header">
    <p class="eyebrow">{t("ui.eyebrow")}</p>
    <ThemeSwitcher {language} />
  </header>
  <h1>{view ? label(language, view.profile.titleKey, view.profile.title) : t("ui.heading")}</h1>
  <aside class="runtime-notice" aria-label={t("ui.limits")}>
    <strong>{t(apiMode ? "ui.apiMode" : "ui.localMode")}</strong>
    <p>{t(apiMode ? "ui.apiIntro" : "ui.intro")}</p>
  </aside>
  <div class="toolbar">
    <label
      >{t("ui.language")}
      <select bind:value={language}>
        <option value="es" lang="es">Español</option>
        <option value="en" lang="en">English</option>
      </select>
    </label>
    {#if !apiMode}
      <label
        >{t("ui.actor")}
        <select
          bind:value={actor}
          disabled={busy || dirty || retry !== null}
          onchange={() => void refresh()}
        >
          <option value={SimulatedActor.Author}>{t("ui.author")}</option>
          <option value={SimulatedActor.Reviewer}>{t("ui.reviewer")}</option>
        </select>
      </label>
    {:else if view?.target}<p>{t("ui.identity")}: {view.target.principalId}</p>{/if}
    <button disabled={busy || dirty || retry !== null} onclick={() => void refresh()}
      >{t("ui.reload")}</button
    >
    {#if dirty}<span>{t("ui.dirty")}</span><button disabled={busy} onclick={() => void refresh()}
        >{t("ui.discardChanges")}</button
      >{/if}
  </div>
  <p role="status" aria-live="polite">{message}</p>
  {#if !view && !busy}
    <button onclick={() => void refresh()}>{t("ui.reconnect")}</button>
  {/if}
  {#if retry}<button
      disabled={busy}
      onclick={() => retry && void execute(retry.command.action, true)}>{t("ui.retry")}</button
    >{/if}
  {#if view}
    <p>
      <strong
        >{label(language, `state.${view.snapshot.contribution?.state}`, t("ui.noProposal"))}</strong
      >
      ·
      {t("ui.revision", { revision: view.snapshot.revision })}
    </p>
    <div class="columns">
      <section aria-label={t("ui.content")}>
        <h2>{t("ui.edit")}</h2>
        {#each view.profile.fields as field (field.key)}
          <label
            >{fieldLabel(field)}
            {#if field.multiline}
              <textarea
                rows="7"
                value={String(draft[field.key] ?? "")}
                disabled={busy ||
                  retry !== null ||
                  !allowed(EditorialAction.Save, actor === SimulatedActor.Author)}
                oninput={(event) => {
                  draft[field.key] = event.currentTarget.value;
                  dirty = true;
                }}
              ></textarea>
            {:else}
              <input
                value={String(draft[field.key] ?? "")}
                disabled={busy ||
                  retry !== null ||
                  !allowed(EditorialAction.Save, actor === SimulatedActor.Author)}
                oninput={(event) => {
                  draft[field.key] = event.currentTarget.value;
                  dirty = true;
                }}
              />
            {/if}
          </label>
        {/each}
        <div class="actions">
          <button
            disabled={busy ||
              retry !== null ||
              !allowed(EditorialAction.Save, actor === SimulatedActor.Author)}
            onclick={() => void execute(EditorialAction.Save)}>{t("ui.save")}</button
          >
          <button
            disabled={busy ||
              dirty ||
              retry !== null ||
              !allowed(EditorialAction.Submit, actor === SimulatedActor.Author) ||
              view.snapshot.contribution?.state !== ContributionState.Draft}
            onclick={() => void execute(EditorialAction.Submit)}>{t("ui.submit")}</button
          >
        </div>
      </section>
      <section aria-label={t("ui.review")}>
        <h2>{t("ui.reviewSaved")}</h2>
        {#if !view.diff.length}<p>{t("ui.noDiff")}</p>{/if}
        {#each view.diff as change (change.field)}
          {@const field = view.profile.fields.find((field) => field.key === change.field)}
          <article>
            <h3>
              {field ? fieldLabel(field) : change.field}
            </h3>
            <p>{t("ui.before")}</p>
            <pre>{JSON.stringify(change.before, null, 2)}</pre>
            <p>{t("ui.after")}</p>
            <pre>{JSON.stringify(change.after, null, 2)}</pre>
          </article>
        {/each}
        <div class="actions">
          <button
            disabled={busy ||
              dirty ||
              retry !== null ||
              !allowed(EditorialAction.Approve, actor === SimulatedActor.Reviewer) ||
              view.snapshot.contribution?.state !== ContributionState.InReview}
            onclick={() => void execute(EditorialAction.Approve)}>{t("ui.approve")}</button
          >
          <button
            disabled={busy ||
              dirty ||
              retry !== null ||
              !allowed(EditorialAction.Publish, actor === SimulatedActor.Reviewer) ||
              view.snapshot.contribution?.state !== ContributionState.Approved}
            onclick={() => void execute(EditorialAction.Publish)}>{t("ui.publish")}</button
          >
          <button
            disabled={busy ||
              dirty ||
              retry !== null ||
              !allowed(EditorialAction.Dismiss, true) ||
              !view.snapshot.contribution ||
              !dismissibleStates.includes(view.snapshot.contribution.state)}
            onclick={() => void execute(EditorialAction.Dismiss)}>{t("ui.dismiss")}</button
          >
          <button
            disabled={busy ||
              dirty ||
              retry !== null ||
              !allowed(EditorialAction.Restore, true) ||
              view.snapshot.contribution?.state !== ContributionState.Dismissed}
            onclick={() => void execute(EditorialAction.Restore)}>{t("ui.restore")}</button
          >
        </div>
      </section>
    </div>
    <details>
      <summary>{t("ui.history", { count: view.snapshot.audit.length })}</summary>
      <pre>{JSON.stringify(view.snapshot.audit, null, 2)}</pre>
    </details>
    <details>
      <summary>{t("ui.canonical")}</summary>
      <pre>{JSON.stringify(view.snapshot.canonical, null, 2)}</pre>
    </details>
  {/if}
</main>

<style>
  .studio {
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem;
  }
  .eyebrow {
    color: var(--lk-color-text-muted);
  }
  h1 {
    font-size: clamp(1.5rem, 4vw, 2.5rem);
  }
  .studio-header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  .runtime-notice {
    padding: 1rem;
    border: 1px solid var(--lk-color-border);
    border-radius: var(--lk-radius-sm);
    background: var(--lk-color-surface);
  }
  .runtime-notice p {
    margin-bottom: 0;
  }
  .toolbar,
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    align-items: end;
    margin: 1rem 0;
  }
  .columns {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 2rem;
  }
  label {
    display: grid;
    gap: 0.5rem;
    margin: 1rem 0;
  }
  input,
  textarea,
  select,
  button {
    font: inherit;
    color: var(--lk-color-text);
    background: var(--lk-color-surface);
    border: 1px solid var(--lk-color-text-muted);
    border-radius: 0.5rem;
    padding: 0.7rem;
  }
  textarea,
  input {
    width: 100%;
    box-sizing: border-box;
  }
  button {
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.55;
    cursor: default;
  }
  :is(input, textarea, select, button, summary):focus-visible {
    outline: 3px solid var(--lk-color-accent);
    outline-offset: 3px;
  }
  pre {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    padding: 1rem;
    background: var(--lk-color-surface);
  }
  details {
    margin: 1.5rem 0;
  }
  @media (max-width: 700px) {
    .columns {
      grid-template-columns: 1fr;
    }
    .studio {
      padding: 1rem;
    }
  }
</style>

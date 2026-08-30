<script lang="ts">
  const folds = [
    { id: "open-media", name: "Open Media Guild", role: "Demo Fold" },
    { id: "field-notes", name: "Field Notes", role: "Demo Fold" },
  ] as const;

  let selectedId = "open-media";
</script>

<label class="fold-switcher">
  <span class="fold-mark" aria-hidden="true">L</span>
  <span class="fold-copy">
    <span class="eyebrow">Current Fold</span>
    <select bind:value={selectedId} aria-label="Current Fold">
      {#each folds as fold (fold.id)}
        <option value={fold.id}>{fold.name} · {fold.role}</option>
      {/each}
    </select>
  </span>
</label>

<style>
  .fold-switcher {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 0.75rem;
  }

  .fold-mark {
    display: grid;
    width: 2.25rem;
    height: 2.25rem;
    flex: 0 0 auto;
    place-items: center;
    border-radius: 0.75rem 0.75rem 0.75rem 0.2rem;
    color: white;
    background: var(--lf-color-accent);
    font-weight: 820;
  }

  .fold-copy {
    display: grid;
    min-width: 0;
    gap: 0.05rem;
  }

  .eyebrow {
    color: var(--lf-color-text-muted);
    font-size: 0.67rem;
    font-weight: 750;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  select {
    width: min(19rem, 55vw);
    border: 0;
    padding: 0;
    overflow: hidden;
    color: var(--lf-color-text);
    background: transparent;
    font: inherit;
    font-weight: 720;
    text-overflow: ellipsis;
  }

  select:focus-visible {
    outline: 2px solid var(--lf-color-accent);
    outline-offset: 0.25rem;
  }
</style>

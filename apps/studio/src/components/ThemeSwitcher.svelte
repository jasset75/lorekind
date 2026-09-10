<script lang="ts">
  import { onMount } from "svelte";
  import { translate } from "../i18n";
  import type { Locale } from "../i18n";
  import type { MessageKey } from "../i18n/catalogs";
  let { language = "en" }: { language?: Locale } = $props();
  const t = (key: MessageKey) => translate(language, key);

  type ThemeMode = "light" | "dark" | "system" | "high-contrast";

  let mode = $state<ThemeMode>("system");

  function resolvedTheme(value: ThemeMode): Exclude<ThemeMode, "system"> {
    if (value !== "system") return value;
    return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function applyTheme(value: ThemeMode): void {
    mode = value;
    localStorage.setItem("lorekind-theme", value);
    document.documentElement.dataset.theme = resolvedTheme(value);
  }

  onMount(() => {
    const stored = localStorage.getItem("lorekind-theme");
    if (stored === "light" || stored === "dark" || stored === "high-contrast") {
      mode = stored;
    }

    const media = matchMedia("(prefers-color-scheme: dark)");
    const syncSystemTheme = () => {
      if (mode === "system") document.documentElement.dataset.theme = resolvedTheme(mode);
    };
    media.addEventListener("change", syncSystemTheme);
    return () => media.removeEventListener("change", syncSystemTheme);
  });
</script>

<label class="theme-control">
  <span>{t("ui.theme")}</span>
  <select value={mode} onchange={(event) => applyTheme(event.currentTarget.value as ThemeMode)}>
    <option value="system">{t("theme.system")}</option>
    <option value="light">{t("theme.light")}</option>
    <option value="dark">{t("theme.dark")}</option>
    <option value="high-contrast">{t("theme.high-contrast")}</option>
  </select>
</label>

<style>
  .theme-control {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--lk-color-text-muted);
    font-size: 0.78rem;
    font-weight: 650;
  }

  select {
    min-height: 2.2rem;
    border: 1px solid var(--lk-color-border);
    border-radius: var(--lk-radius-sm);
    padding: 0 2rem 0 0.7rem;
    color: var(--lk-color-text);
    background: var(--lk-color-surface-raised);
    font: inherit;
  }

  select:focus-visible {
    outline: none;
    box-shadow: var(--lk-focus-ring);
  }

  @media (max-width: 680px) {
    .theme-control span {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
    }
  }
</style>

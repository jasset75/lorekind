<script lang="ts">
  import { ThemeMode, themeStorageKey, resolveTheme } from "@lorekind/theme";
  import { onMount } from "svelte";
  import { translate } from "../i18n";
  import { Locale } from "../i18n";
  import type { MessageKey } from "../i18n/catalogs";
  let { language = Locale.English }: { language?: Locale } = $props();
  const t = (key: MessageKey) => translate(language, key);

  let mode = $state<ThemeMode>(ThemeMode.System);

  function resolvedTheme(value: ThemeMode): Exclude<ThemeMode, typeof ThemeMode.System> {
    return resolveTheme(value, matchMedia("(prefers-color-scheme: dark)").matches);
  }

  function applyTheme(value: ThemeMode): void {
    mode = value;
    localStorage.setItem(themeStorageKey, value);
    document.documentElement.dataset.theme = resolvedTheme(value);
  }

  onMount(() => {
    const stored = localStorage.getItem(themeStorageKey);
    if (
      stored === ThemeMode.Light ||
      stored === ThemeMode.Dark ||
      stored === ThemeMode.HighContrast
    ) {
      mode = stored;
    }

    const media = matchMedia("(prefers-color-scheme: dark)");
    const syncSystemTheme = () => {
      if (mode === ThemeMode.System) document.documentElement.dataset.theme = resolvedTheme(mode);
    };
    media.addEventListener("change", syncSystemTheme);
    return () => media.removeEventListener("change", syncSystemTheme);
  });
</script>

<label class="theme-control">
  <span>{t("ui.theme")}</span>
  <select value={mode} onchange={(event) => applyTheme(event.currentTarget.value as ThemeMode)}>
    <option value={ThemeMode.System}>{t("theme.system")}</option>
    <option value={ThemeMode.Light}>{t("theme.light")}</option>
    <option value={ThemeMode.Dark}>{t("theme.dark")}</option>
    <option value={ThemeMode.HighContrast}>{t("theme.high-contrast")}</option>
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

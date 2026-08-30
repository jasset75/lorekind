export type ThemeMode = "light" | "dark" | "system" | "high-contrast";

export interface FoldAppearance {
  readonly mode: ThemeMode;
  readonly brandName?: string;
  readonly logoUrl?: URL;
  readonly accent?: string;
  readonly density?: "comfortable" | "compact";
}

export const themeStorageKey = "lorefold-theme";

export function resolveTheme(mode: ThemeMode, prefersDark: boolean): Exclude<ThemeMode, "system"> {
  return mode === "system" ? (prefersDark ? "dark" : "light") : mode;
}

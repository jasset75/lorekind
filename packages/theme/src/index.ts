export const ThemeMode = {
  Light: "light",
  Dark: "dark",
  System: "system",
  HighContrast: "high-contrast",
} as const;
export type ThemeMode = (typeof ThemeMode)[keyof typeof ThemeMode];

export const ThemeDensity = { Comfortable: "comfortable", Compact: "compact" } as const;
export type ThemeDensity = (typeof ThemeDensity)[keyof typeof ThemeDensity];

export interface FoldAppearance {
  readonly mode: ThemeMode;
  readonly brandName?: string;
  readonly logoUrl?: URL;
  readonly accent?: string;
  readonly density?: ThemeDensity;
}

export const themeStorageKey = "lorekind-theme";

export function resolveTheme(
  mode: ThemeMode,
  prefersDark: boolean,
): Exclude<ThemeMode, typeof ThemeMode.System> {
  return mode === ThemeMode.System ? (prefersDark ? ThemeMode.Dark : ThemeMode.Light) : mode;
}

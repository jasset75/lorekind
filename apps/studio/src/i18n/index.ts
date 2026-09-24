import type { ValidationIssue } from "@lorekind/core";
import { en, es } from "./catalogs";
import type { MessageKey } from "./catalogs";

export const Locale = { English: "en", Spanish: "es" } as const;
export type Locale = (typeof Locale)[keyof typeof Locale];
export const catalogs = { [Locale.English]: en, [Locale.Spanish]: es };
export function locale(value: string): Locale {
  return value === Locale.Spanish ? Locale.Spanish : Locale.English;
}
export function translate(
  language: Locale,
  key: MessageKey,
  params: ValidationIssue["params"] = {},
): string {
  return catalogs[language][key].replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : placeholder,
  );
}
export function label(language: Locale, key: string | undefined, fallback: string): string {
  return key && Object.hasOwn(en, key) ? translate(language, key as MessageKey) : fallback;
}
export function errorMessage(language: Locale, code: string): string {
  return label(language, `error.${code}`, translate(language, "error.generic"));
}
export function issueMessage(language: Locale, issue: ValidationIssue): string {
  const key = `issue.${issue.code}`;
  return translate(
    language,
    Object.hasOwn(en, key) ? (key as MessageKey) : "issue.custom-validation",
    {
      ...issue.params,
      field: label(language, `field.${issue.path[0]}`, String(issue.path[0] ?? "")),
    },
  );
}

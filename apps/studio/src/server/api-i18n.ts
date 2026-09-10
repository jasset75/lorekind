import type { z } from "@hono/zod-openapi";
import en from "zod/v4/locales/en.js";
import es from "zod/v4/locales/es.js";
import type { ValidationIssue } from "@lorekind/core";
import type { Locale } from "../i18n";
import { errorMessage } from "../i18n";

const errorMaps = { en: en().localeError, es: es().localeError };
/** Format at the request boundary. Never mutate Zod's global locale or expose input. */
export function zodIssues(issues: readonly z.core.$ZodIssue[], language: Locale, source: unknown) {
  return issues.map((issue) => {
    const params: Record<string, string | number | boolean> = {};
    for (const [key, value] of Object.entries(issue)) {
      if (
        ["expected", "origin", "minimum", "maximum", "inclusive", "format"].includes(key) &&
        ["string", "number", "boolean"].includes(typeof value)
      )
        params[key] = value as string | number | boolean;
    }
    // Zod omits input from public issues. Recover the value only for its native
    // type description; never copy it into the serializable response.
    let input = source;
    for (const part of issue.path) {
      input =
        input !== null && typeof input === "object" && Object.hasOwn(input, part)
          ? (input as Record<PropertyKey, unknown>)[part]
          : undefined;
    }
    const translated = errorMaps[language](
      issue.code === "invalid_type" ? { ...issue, input } : { ...issue, input: undefined },
    );
    return {
      code: `zod.${issue.code}`,
      path: issue.path.map((part) => (typeof part === "symbol" ? String(part) : part)),
      params,
      message:
        (typeof translated === "string" ? translated : translated?.message) ??
        errorMessage(language, "invalid-input"),
    } satisfies ValidationIssue & { message: string };
  });
}

/** Hono 4's detector retains q=0 ranges; remove unacceptable/malformed ranges first. */
export function acceptedLanguages(header: string): string {
  return header
    .split(",")
    .filter((range) => {
      const match =
        /^\s*(?:[a-z]{1,8}(?:-[a-z0-9]{1,8})*|\*)(?:\s*;\s*q=(0(?:\.\d{0,3})?|1(?:\.0{0,3})?))?\s*$/i.exec(
          range,
        );
      return match !== null && (match[1] === undefined || Number(match[1]) > 0);
    })
    .join(",");
}

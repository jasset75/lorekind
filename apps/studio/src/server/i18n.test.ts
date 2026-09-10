import { describe, expect, it } from "vitest";
import { validationIssues } from "@lorekind/core";
import { en, es } from "../i18n/catalogs";
import type { MessageKey } from "../i18n/catalogs";
import { errorMessage, issueMessage, label, translate } from "../i18n";
import { articleProfile } from "./evaluation-profile";
import { acceptedLanguages } from "./api-i18n";

describe("editorial presentation catalogs", () => {
  it("keeps keys and interpolation parameters aligned in both languages", () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
    for (const key of Object.keys(en) as MessageKey[]) {
      const placeholders = (text: string) =>
        [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
      expect(placeholders(es[key])).toEqual(placeholders(en[key]));
    }
    expect(translate("es", "ui.history", { count: 3 })).toBe("Historial de decisiones (3)");
  });
  it("uses safe fallbacks for unknown consumer labels and error codes", () => {
    expect(label("es", "consumer.unknown", "Consumer title")).toBe("Consumer title");
    expect(label("es", "__proto__", "Consumer title")).toBe("Consumer title");
    expect(errorMessage("es", "future-error")).toBe(es["error.generic"]);
    expect(issueMessage("en", { code: "consumer.unknown", path: [], params: {} })).toBe(
      en["issue.custom-validation"],
    );
  });
  it("keeps custom validation structured and legacy profile prose out of transport messages", () => {
    const issues = validationIssues(articleProfile.validate({ title: "", body: " " }));
    expect(issues).toEqual([
      { code: "text-length", path: ["title"], params: { min: 1, max: 200 } },
      { code: "text-length", path: ["body"], params: { min: 1, max: 10000 } },
    ]);
    expect(issues[0]).not.toHaveProperty("message");
    expect(validationIssues(["Legacy message with potentially private content"])).toEqual([
      { code: "custom-validation", path: [], params: {} },
    ]);
    expect(articleProfile.initialContent.title).toBe("Notas de campo");
  });
  it("excludes q=0 and malformed preferences before Hono detection", () => {
    expect(acceptedLanguages("es;q=0, en;q=0.8")).toBe(" en;q=0.8");
    expect(acceptedLanguages("es;q=no, en;q=1.1, es;q=-1, en;q=1")).toBe(" en;q=1");
  });
});

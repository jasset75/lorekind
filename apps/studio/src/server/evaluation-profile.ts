import type { ContentProfile, ValidationIssue } from "@lorekind/core";

export const articleProfile: ContentProfile = {
  id: "article-example",
  title: "Article · generic example",
  titleKey: "profile.article",
  schemaRevision: "article-1",
  initialContent: {
    title: "Notas de campo",
    body: "Un artículo independiente para evaluar el flujo editorial.",
  },
  fields: [
    { key: "title", label: "Title", labelKey: "field.title" },
    { key: "body", label: "Body", labelKey: "field.body", multiline: true },
  ],
  validate(content) {
    const errors: ValidationIssue[] = [];
    if (Object.keys(content).some((key) => !["title", "body"].includes(key)))
      errors.push({ code: "unknown-fields", path: [], params: {} });
    if (typeof content.title !== "string" || !content.title.trim() || content.title.length > 200)
      errors.push({ code: "text-length", path: ["title"], params: { min: 1, max: 200 } });
    if (typeof content.body !== "string" || !content.body.trim() || content.body.length > 10000)
      errors.push({ code: "text-length", path: ["body"], params: { min: 1, max: 10000 } });
    return errors;
  },
};

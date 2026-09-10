import eslint from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import astro from "eslint-plugin-astro";
import svelte from "eslint-plugin-svelte";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/.astro/**", "**/node_modules/**", "**/coverage/**"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...astro.configs.recommended,
  ...svelte.configs.recommended,
  {
    files: ["**/*.svelte"],
    languageOptions: {
      globals: {
        document: "readonly",
        fetch: "readonly",
        structuredClone: "readonly",
        crypto: "readonly",
        localStorage: "readonly",
        matchMedia: "readonly",
      },
      parserOptions: {
        parser: tseslint.parser,
      },
    },
  },
  eslintConfigPrettier,
);

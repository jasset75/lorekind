import { describe, expect, it } from "vitest";

import { resolveTheme } from "./index";

describe("resolveTheme", () => {
  it("follows the system preference in system mode", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });

  it("preserves an explicit mode", () => {
    expect(resolveTheme("high-contrast", false)).toBe("high-contrast");
  });
});

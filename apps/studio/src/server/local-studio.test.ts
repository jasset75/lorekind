import { describe, expect, it } from "vitest";
import { localStudioConfig } from "./local-studio-config";
import { en, es } from "../i18n/catalogs";

describe("MVP Studio configuration", () => {
  it("keeps the default storage decision with the existing file adapter", () => {
    expect(localStudioConfig({})).toEqual({ profilePath: undefined, dataRoot: undefined });
  });
  it("reads the current trusted profile and storage settings", () => {
    expect(
      localStudioConfig({
        LOREKIND_STUDIO_PROFILE: "/consumer/profile.ts",
        LOREKIND_STUDIO_DATA: "/existing/work",
      }),
    ).toEqual({ profilePath: "/consumer/profile.ts", dataRoot: "/existing/work" });
  });
  it("does not keep aliases for unpublished configuration names", () => {
    expect(
      localStudioConfig({
        LOREKIND_EVALUATION_PROFILE: "/old/profile.ts",
        LOREKIND_EVALUATION_DATA: "/old/work",
      }),
    ).toEqual({ profilePath: undefined, dataRoot: undefined });
  });
  it("presents one product with explicit local-only limitations in both languages", () => {
    for (const catalog of [en, es]) expect(catalog["page.title"]).toBe("Lorekind Studio");
    expect(en["ui.intro"]).toContain("Identities are simulated");
    expect(es["ui.intro"]).toContain("identidades son simuladas");
    expect(en["error.studio-unavailable"]).toContain("static build");
    expect(es["error.studio-unavailable"]).toContain("compilación estática");
  });
});

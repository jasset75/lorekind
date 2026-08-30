import { describe, expect, it } from "vitest";

import { authorize, createGrant } from "./index";

describe("authorize", () => {
  it("allows a creator to submit inside the granted Fold", () => {
    const grant = createGrant({
      id: "grant-1",
      principalId: "creator-1",
      foldId: "fold-1",
      role: "creator",
    });

    expect(
      authorize([grant], {
        principalId: "creator-1",
        foldId: "fold-1",
        capability: "entry:submit",
      }),
    ).toEqual({ allowed: true, grantId: "grant-1" });
  });

  it("denies access outside the granted Fold", () => {
    const grant = createGrant({
      id: "grant-1",
      principalId: "creator-1",
      foldId: "fold-1",
      role: "creator",
    });

    expect(
      authorize([grant], {
        principalId: "creator-1",
        foldId: "fold-2",
        capability: "entry:submit",
      }),
    ).toEqual({ allowed: false, reason: "grant-missing" });
  });

  it("prevents a curator from reviewing their own contribution", () => {
    const grant = createGrant({
      id: "grant-2",
      principalId: "curator-1",
      foldId: "fold-1",
      role: "curator",
    });

    expect(
      authorize([grant], {
        principalId: "curator-1",
        foldId: "fold-1",
        capability: "entry:review",
        contribution: { authorPrincipalId: "curator-1" },
      }),
    ).toEqual({ allowed: false, reason: "self-approval" });
  });

  it("denies an expired grant", () => {
    const grant = createGrant({
      id: "grant-3",
      principalId: "creator-1",
      foldId: "fold-1",
      role: "creator",
      expiresAt: new Date("2026-01-01T00:00:00Z"),
    });

    expect(
      authorize([grant], {
        principalId: "creator-1",
        foldId: "fold-1",
        capability: "entry:submit",
        now: new Date("2026-01-02T00:00:00Z"),
      }),
    ).toEqual({ allowed: false, reason: "grant-expired" });
  });
});

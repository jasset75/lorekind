import { describe, expect, it } from "vitest";
import { authorize, createGrant } from "./index";
import type { AuthorizationRequest, Delegation } from "./index";

const now = new Date("2026-09-08T12:00:00Z");
const grant = createGrant({ id: "grant", principalId: "person", foldId: "fold", role: "admin" });
const request: AuthorizationRequest = {
  principalId: "person",
  foldId: "fold",
  capability: "entry:edit-own",
  resourceId: "article",
  contribution: { authorPrincipalId: "person" },
  now,
};
const delegation: Delegation = {
  id: "delegation",
  principalId: "person",
  agentId: "agent",
  foldId: "fold",
  capabilities: ["entry:edit-own"],
  resourceIds: ["article"],
  expiresAt: new Date("2026-09-09"),
};

describe("scoped authorization", () => {
  it("uses any active capable grant instead of the first matching grant", () => {
    expect(
      authorize(
        [
          { ...grant, id: "expired", expiresAt: now },
          { ...grant, id: "empty", capabilities: [] },
          grant,
        ],
        request,
      ),
    ).toEqual({ allowed: true, grantId: "grant" });
  });
  it("rejects revoked grants and enforces resource scopes", () => {
    expect(authorize([{ ...grant, revokedAt: now }], request).allowed).toBe(false);
    expect(authorize([{ ...grant, resourceIds: ["other"] }], request).allowed).toBe(false);
    expect(authorize([{ ...grant, resourceIds: ["article"] }], request).allowed).toBe(true);
  });
  it("requires resource ownership and review context", () => {
    const { contribution, ...withoutContribution } = request;
    void contribution;
    expect(authorize([grant], withoutContribution).allowed).toBe(false);
    expect(
      authorize([grant], { ...request, contribution: { authorPrincipalId: "other" } }).allowed,
    ).toBe(false);
    expect(authorize([grant], { ...withoutContribution, capability: "entry:review" }).allowed).toBe(
      false,
    );
  });
  it("intersects delegation and human permissions", () => {
    expect(authorize([grant], { ...request, delegation }).allowed).toBe(true);
    expect(authorize([{ ...grant, capabilities: [] }], { ...request, delegation }).allowed).toBe(
      false,
    );
    expect(
      authorize([grant], { ...request, delegation: { ...delegation, capabilities: [] } }).allowed,
    ).toBe(false);
  });
  it.each([
    { principalId: "other" },
    { foldId: "other" },
    { expiresAt: now },
    { expiresAt: new Date("invalid") },
    { revokedAt: now },
    { resourceIds: ["other"] },
  ])("rejects invalid delegation scope or lifetime: %o", (change) => {
    expect(
      authorize([grant], { ...request, delegation: { ...delegation, ...change } }).allowed,
    ).toBe(false);
  });
  it("rejects invalid clocks and approval thresholds", () => {
    expect(authorize([grant], { ...request, now: new Date("invalid") }).allowed).toBe(false);
    for (const requiredApprovals of [0, -1, 1.5, NaN]) {
      expect(
        authorize([grant], { ...request, policy: { mode: "independent", requiredApprovals } })
          .allowed,
      ).toBe(false);
    }
  });
});

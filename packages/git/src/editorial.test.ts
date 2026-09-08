import { describe, expect, it } from "vitest";
import { mandatoryGuarantees, matchesOperation, missingGuarantees } from "./editorial";
import type { OperationBinding } from "./editorial";

const binding: OperationBinding = {
  formatVersion: 1,
  key: "key",
  principalId: "person",
  foldId: "fold",
  repository: { owner: "owner", name: "repo" },
  resourceId: "article",
  action: "save",
  payloadDigest: "digest",
};

describe("experimental provider contracts", () => {
  it("requires every mandatory guarantee explicitly", () => {
    expect(missingGuarantees(mandatoryGuarantees)).toEqual([]);
    expect(missingGuarantees(["conditional-write"])).toContain("durable-operation-recovery");
  });
  it("matches identical retries regardless of object identity", () => {
    expect(matchesOperation(binding, { ...binding, repository: { ...binding.repository } })).toBe(
      true,
    );
  });
  it.each([
    { key: "other" },
    { principalId: "other" },
    { agentId: "agent" },
    { foldId: "other" },
    { repository: { owner: "owner", name: "other" } },
    { resourceId: "other" },
    { action: "publish" as const },
    { payloadDigest: "different-command" },
  ])("never recovers a result for another binding: %o", (change) => {
    expect(matchesOperation(binding, { ...binding, ...change })).toBe(false);
  });
});

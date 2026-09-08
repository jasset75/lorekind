import { describe, expect, it } from "vitest";
import { createDraft, createGrant, reconcilePublication, transitionContribution } from "./index";
import type {
  Contribution,
  Delegation,
  WorkflowCommand,
  WorkflowContext,
  WorkflowResult,
} from "./index";

const grants = ["author", "reviewer", "second"].map((principalId) =>
  createGrant({
    id: principalId,
    principalId,
    foldId: "fold",
    role: "admin",
  }),
);
const context: WorkflowContext = {
  foldId: "fold",
  principalId: "author",
  grants,
  delegations: [],
  policy: { mode: "independent", requiredApprovals: 1 },
  policyRevision: "policy-1",
  schemaRevision: "schema-1",
  targetRevision: "target-1",
  now: new Date("2026-09-08T12:00:00Z"),
};

function unwrap(result: WorkflowResult): Contribution {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error);
  return result.value.contribution;
}
function draft(ctx = context): Contribution {
  return unwrap(
    createDraft({ id: "article", contentRevision: "content-1", intent: "publish" }, ctx),
  );
}
function run(
  item: Contribution,
  action: WorkflowCommand["action"],
  ctx = context,
  extra: { contentRevision?: string; attemptId?: string } = {},
): WorkflowResult {
  const command = { action, expectedVersion: item.version, ...extra } as WorkflowCommand;
  return transitionContribution(item, command, ctx);
}
function approved(ctx = context): Contribution {
  const pending = unwrap(run(draft(ctx), "submit", ctx));
  return unwrap(run(pending, "approve", { ...ctx, principalId: "reviewer" }));
}

describe("editorial workflow", () => {
  it("allows direct publication without review capability and denies it without publish capability", () => {
    const direct: WorkflowContext = {
      ...context,
      policy: { mode: "direct" },
      grants: grants.map((grant) => ({
        ...grant,
        capabilities: grant.capabilities.filter((capability) => capability !== "entry:review"),
      })),
    };
    const item = unwrap(run(draft(direct), "authorize-direct", direct));
    expect(unwrap(run(item, "publish", direct, { attemptId: "attempt" })).state).toBe("Publishing");
    const noPublish = {
      ...direct,
      grants: direct.grants.map((grant) => ({
        ...grant,
        capabilities: grant.capabilities.filter((capability) => capability !== "entry:publish"),
      })),
    };
    expect(run(draft(noPublish), "authorize-direct", noPublish)).toEqual({
      ok: false,
      error: "forbidden",
    });
  });

  it("does not turn review permission into publication permission", () => {
    const reviewer: WorkflowContext = {
      ...context,
      principalId: "reviewer",
      grants: grants.map((grant) =>
        grant.id !== "reviewer"
          ? grant
          : {
              ...grant,
              capabilities: ["entry:review"],
            },
      ),
    };
    const pending = unwrap(run(draft(), "submit"));
    const item = unwrap(run(pending, "approve", reviewer));
    expect(run(item, "publish", reviewer, { attemptId: "attempt" })).toEqual({
      ok: false,
      error: "forbidden",
    });
  });

  it("rechecks human approvals independently of the publishing agent's delegation", () => {
    const delegation: Delegation = {
      id: "publisher-agent",
      principalId: "author",
      agentId: "agent",
      foldId: "fold",
      capabilities: ["entry:publish"],
      expiresAt: new Date("2026-09-09"),
    };
    expect(
      unwrap(
        run(
          approved(),
          "publish",
          {
            ...context,
            delegationId: delegation.id,
            delegations: [delegation],
          },
          { attemptId: "attempt" },
        ),
      ).state,
    ).toBe("Publishing");
    expect(
      run(
        approved(),
        "publish",
        {
          ...context,
          delegationId: "missing",
          delegations: [],
        },
        { attemptId: "attempt" },
      ),
    ).toEqual({ ok: false, error: "forbidden" });
  });

  it("publishes the exact independently reviewed revision, including an author with publish capability", () => {
    const item = approved();
    const publishing = unwrap(run(item, "publish", context, { attemptId: "attempt-1" }));
    expect(publishing.state).toBe("Publishing");
    const result = reconcilePublication(publishing, {
      expectedVersion: publishing.version,
      attemptId: "attempt-1",
      scope: publishing.scope,
      outcome: "applied",
    });
    expect(result.ok && result.contribution.state).toBe("Applied");
  });

  it("permits direct authorization by an author only under direct policy", () => {
    const direct: WorkflowContext = { ...context, policy: { mode: "direct" } };
    const item = unwrap(run(draft(direct), "authorize-direct", direct));
    expect(item.approvals[0]?.kind).toBe("direct");
    expect(unwrap(run(item, "publish", direct, { attemptId: "attempt" })).state).toBe("Publishing");
    expect(run(draft(), "authorize-direct")).toEqual({ ok: false, error: "invalid-transition" });
  });

  it("rejects self-review and publishing a draft", () => {
    const pending = unwrap(run(draft(), "submit"));
    expect(run(pending, "approve")).toEqual({ ok: false, error: "forbidden" });
    expect(run(draft(), "publish", context, { attemptId: "attempt" })).toEqual({
      ok: false,
      error: "invalid-transition",
    });
  });

  it("counts distinct human principals, not repeated approvals", () => {
    const ctx: WorkflowContext = {
      ...context,
      policy: { mode: "independent", requiredApprovals: 2 },
    };
    const one = approved(ctx);
    expect(one.state).toBe("InReview");
    const repeated = unwrap(run(one, "approve", { ...ctx, principalId: "reviewer" }));
    expect(repeated.approvals).toHaveLength(1);
    expect(repeated.state).toBe("InReview");
    expect(unwrap(run(repeated, "approve", { ...ctx, principalId: "second" })).state).toBe(
      "Approved",
    );
  });

  it("invalidates all approvals after editing and rejects stale concurrent commands", () => {
    const item = approved();
    const revised = unwrap(run(item, "revise", context, { contentRevision: "content-2" }));
    expect(revised.state).toBe("Draft");
    expect(revised.approvals).toEqual([]);
    expect(
      transitionContribution(
        revised,
        { action: "publish", expectedVersion: item.version, attemptId: "attempt" },
        context,
      ),
    ).toEqual({ ok: false, error: "conflict" });
  });

  it.each(["schemaRevision", "policyRevision", "targetRevision"] as const)(
    "rejects a changed %s until refreshed and reviewed again",
    (key) => {
      const item = approved();
      const changed = { ...context, [key]: "new-revision" };
      expect(run(item, "publish", changed, { attemptId: "attempt" })).toEqual({
        ok: false,
        error: "stale-review",
      });
      const revised = unwrap(
        run(item, "revise", changed, { contentRevision: item.scope.contentRevision }),
      );
      expect(revised.scope[key]).toBe("new-revision");
      expect(revised.approvals).toEqual([]);
    },
  );

  it.each(["revoked", "expired", "removed"])(
    "rechecks an approval whose grant was %s",
    (change) => {
      const item = approved();
      const changed = {
        ...context,
        grants: grants
          .filter((grant) => change !== "removed" || grant.id !== "reviewer")
          .map((grant) =>
            grant.id !== "reviewer"
              ? grant
              : {
                  ...grant,
                  ...(change === "revoked"
                    ? { revokedAt: context.now }
                    : { expiresAt: context.now }),
                },
          ),
      };
      expect(run(item, "publish", changed, { attemptId: "attempt" })).toEqual({
        ok: false,
        error: "approval-required",
      });
    },
  );

  it("rechecks the publisher's current permissions independently of approvals", () => {
    expect(
      run(
        approved(),
        "publish",
        { ...context, grants: grants.filter((grant) => grant.id !== "author") },
        { attemptId: "attempt" },
      ),
    ).toEqual({ ok: false, error: "forbidden" });
  });

  it("prevents cross-Fold access and editing or submitting someone else's draft", () => {
    expect(run(draft(), "submit", { ...context, foldId: "other" })).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(run(draft(), "submit", { ...context, principalId: "reviewer" })).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(
      run(draft(), "revise", { ...context, principalId: "reviewer" }, { contentRevision: "evil" }),
    ).toEqual({ ok: false, error: "forbidden" });
  });

  it("preserves dismissed contributions and restores them without approvals", () => {
    const item = approved();
    const curator = { ...context, principalId: "reviewer" };
    const dismissed = unwrap(run(item, "dismiss", curator));
    expect(dismissed.id).toBe(item.id);
    expect(dismissed.state).toBe("Dismissed");
    const restored = unwrap(run(dismissed, "restore", curator));
    expect(restored.state).toBe("Draft");
    expect(restored.approvals).toEqual([]);
  });

  it("keeps unknown provider outcomes pending and rejects unrelated receipts", () => {
    const item = unwrap(run(approved(), "publish", context, { attemptId: "attempt" }));
    const receipt = {
      expectedVersion: item.version,
      attemptId: "attempt",
      scope: item.scope,
      outcome: "unknown" as const,
    };
    expect(reconcilePublication(item, receipt)).toEqual({ ok: true, contribution: item });
    expect(reconcilePublication(item, { ...receipt, attemptId: "other" }).ok).toBe(false);
    expect(
      reconcilePublication(item, { ...receipt, scope: { ...item.scope, contentRevision: "other" } })
        .ok,
    ).toBe(false);
    expect(run(item, "revise", context, { contentRevision: "other" }).ok).toBe(false);
    const failed = reconcilePublication(item, { ...receipt, outcome: "failed" });
    if (!failed.ok) throw new Error("expected failure receipt");
    expect(run(failed.contribution, "publish", context, { attemptId: "attempt" }).ok).toBe(false);
    expect(unwrap(run(failed.contribution, "publish", context, { attemptId: "retry" })).state).toBe(
      "Publishing",
    );
  });

  it("records withdraw as a versioned intent, never a deletion", () => {
    const item = unwrap(
      createDraft({ id: "withdrawal", intent: "withdraw", contentRevision: "withdraw-1" }, context),
    );
    expect(item.intent).toBe("withdraw");
    expect(item.state).toBe("Draft");
  });

  it("attributes delegated actions and rechecks the recorded delegation at publication", () => {
    const delegation: Delegation = {
      id: "delegation",
      principalId: "reviewer",
      agentId: "agent",
      foldId: "fold",
      capabilities: ["entry:review"],
      resourceIds: ["article"],
      expiresAt: new Date("2026-09-09"),
    };
    const pending = unwrap(run(draft(), "submit"));
    const review = run(pending, "approve", {
      ...context,
      principalId: "reviewer",
      delegationId: delegation.id,
      delegations: [delegation],
    });
    const item = unwrap(review);
    expect(item.approvals[0]?.identity).toEqual({
      principalId: "reviewer",
      grantId: "reviewer",
      delegationId: "delegation",
      agentId: "agent",
    });
    expect(run(item, "publish", context, { attemptId: "attempt" })).toEqual({
      ok: false,
      error: "approval-required",
    });
    expect(
      unwrap(
        run(item, "publish", { ...context, delegations: [delegation] }, { attemptId: "attempt" }),
      ).state,
    ).toBe("Publishing");
    expect(
      run(
        item,
        "publish",
        { ...context, delegations: [{ ...delegation, revokedAt: context.now }] },
        { attemptId: "attempt" },
      ).ok,
    ).toBe(false);
    if (!review.ok) throw new Error("expected audit");
    expect(review.value.audit.identity.agentId).toBe("agent");
  });

  it("prevents an author's agent from supplying an independent approval", () => {
    const delegation: Delegation = {
      id: "delegation",
      principalId: "author",
      agentId: "agent",
      foldId: "fold",
      capabilities: ["entry:review"],
      expiresAt: new Date("2026-09-09"),
    };
    expect(
      run(unwrap(run(draft(), "submit")), "approve", {
        ...context,
        delegationId: delegation.id,
        delegations: [delegation],
      }),
    ).toEqual({ ok: false, error: "forbidden" });
  });
});

import { EditorialWorkspace } from "@lorekind/core";
import type { EvaluationStore, WorkspaceSnapshot } from "@lorekind/core";
import { createEditorialApi } from "../editorial-api";
import { evaluationContext } from "../evaluation-context";
import { articleProfile } from "../evaluation-profile";

/** Test-only fixture. Never use its credentials, controls or memory store in a deployment. */
class MemoryStore implements EvaluationStore {
  snapshot: WorkspaceSnapshot | null = null;
  pending: Promise<unknown> = Promise.resolve();
  async read() {
    return structuredClone(this.snapshot);
  }
  transact<T>(
    update: (
      snapshot: WorkspaceSnapshot | null,
    ) => Promise<{ snapshot: WorkspaceSnapshot; result: T }>,
  ): Promise<T> {
    const operation = this.pending.then(async () => {
      const { snapshot, result } = await update(await this.read());
      this.snapshot = structuredClone(snapshot);
      return result;
    });
    this.pending = operation.catch(() => {});
    return operation;
  }
}
export function createRuntimeFixture() {
  const app = new EditorialWorkspace(new MemoryStore(), articleProfile);
  let revoked = false;
  let direct = false;
  const api = createEditorialApi({
    authenticate: async (request) => {
      const token = request.headers.get("authorization");
      return token === "Bearer fixture-author"
        ? { id: "author" }
        : token === "Bearer fixture-reviewer"
          ? { id: "reviewer" }
          : null;
    },
    workspaces: async () => [app],
    context: async (principal, workspace) => {
      const context = evaluationContext(workspace, principal.id);
      return {
        ...context,
        ...(revoked ? { grants: [] } : {}),
        ...(direct
          ? { policy: { mode: "direct" as const }, policyRevision: "fixture-direct" }
          : {}),
      };
    },
  });
  return async (request: Request) => {
    const path = new URL(request.url).pathname;
    if (path === "/__fixture/revoke") {
      revoked = true;
      return new Response("ok");
    }
    if (path === "/__fixture/direct") {
      direct = true;
      return new Response("ok");
    }
    return api(request);
  };
}

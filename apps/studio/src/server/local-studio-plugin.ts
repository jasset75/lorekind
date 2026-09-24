import { ApiErrorCode } from "../api-errors";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ViteUserConfig } from "astro";
type Plugin = Extract<NonNullable<ViteUserConfig["plugins"]>[number], { name: string }>;
import {
  EditorialErrorCode,
  EditorialError,
  EditorialWorkspace,
  contentDiff,
} from "@lorekind/core";
import type { ContentProfile, EvaluationCommand } from "@lorekind/core";
import { FileEvaluationStore } from "./evaluation-store";
import { articleProfile } from "./evaluation-profile";
import { evaluationContext } from "./evaluation-context";
import { createEditorialApi } from "./editorial-api";
import { API_V1_BASE_PATH } from "./api-paths";
import { verifyConfiguredBearer } from "./api-auth";
import { localStudioConfig } from "./local-studio-config";

const LocalStudioErrorCode = {
  LocalOnly: "local-only",
  UnknownActor: "unknown-actor",
  JsonRequired: "json-required",
  StudioUnavailable: "studio-unavailable",
} as const;

/** Deliberately development-only; this is not an authentication implementation. */
export function localStudioPlugin(): Plugin {
  return {
    name: "lorekind-local-studio",
    apply: "serve",
    configureServer(server) {
      const config = localStudioConfig(process.env);
      const workspaces: Partial<Record<"studio" | "api", Promise<EditorialWorkspace>>> = {};
      const loadWorkspace = (mode: "studio" | "api" = "studio") =>
        (workspaces[mode] ??= (async () => {
          const modulePath = config.profilePath;
          const profile: ContentProfile = modulePath
            ? (await server.ssrLoadModule(resolve(modulePath))).default
            : articleProfile;
          if (!/^[a-z0-9-]+$/.test(profile.id)) throw new Error("Invalid profile id");
          const dataRoot =
            config.dataRoot ?? fileURLToPath(new URL("../../../../.evaluation/", import.meta.url));
          return new EditorialWorkspace(
            new FileEvaluationStore(
              resolve(dataRoot, `${mode === "api" ? "api-" : ""}${profile.id}.json`),
            ),
            profile,
          );
        })());
      const api = createEditorialApi({
        authenticate: async (request) =>
          verifyConfiguredBearer(request.headers.get("authorization"), {
            ...(process.env.LOREKIND_API_AUTHOR_TOKEN
              ? { author: process.env.LOREKIND_API_AUTHOR_TOKEN }
              : {}),
            ...(process.env.LOREKIND_API_REVIEWER_TOKEN
              ? { reviewer: process.env.LOREKIND_API_REVIEWER_TOKEN }
              : {}),
          }),
        workspaces: async () => [await loadWorkspace("api")],
        context: async (principal, app) => evaluationContext(app, principal.id),
      });
      server.middlewares.use(async (request, response, next) => {
        if (!request.url?.startsWith(`${API_V1_BASE_PATH}/`)) return next();
        const host = request.headers.host ?? "";
        if (
          !/^(localhost|127\.0\.0\.1):\d+$/.test(host) ||
          (request.headers.origin !== undefined && request.headers.origin !== `http://${host}`)
        ) {
          response.writeHead(403, {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          });
          response.end(
            JSON.stringify({ error: { code: LocalStudioErrorCode.LocalOnly, details: [] } }),
          );
          return;
        }
        try {
          const headers = new Headers();
          for (const [key, value] of Object.entries(request.headers))
            if (typeof value === "string") headers.set(key, value);
          const chunks: Uint8Array[] = [];
          let length = 0;
          for await (const chunk of request) {
            length += chunk.length;
            if (length > 131072) {
              response.writeHead(413, { "Content-Type": "application/json" });
              response.end(JSON.stringify({ error: { code: ApiErrorCode.TooLarge, details: [] } }));
              return;
            }
            chunks.push(chunk);
          }
          const result = await api(
            new Request(`http://${host}${request.url}`, {
              method: request.method,
              headers,
              ...(request.method === "GET" || request.method === "HEAD"
                ? {}
                : { body: new Uint8Array(Buffer.concat(chunks)).buffer }),
            }),
          );
          response.writeHead(result.status, Object.fromEntries(result.headers.entries()));
          response.end(await result.text());
        } catch {
          response.writeHead(500, { "Content-Type": "application/json" });
          response.end(
            JSON.stringify({ error: { code: ApiErrorCode.InternalError, details: [] } }),
          );
        }
      });
      server.middlewares.use(async (request, response, next) => {
        if (request.url?.split("?")[0] !== "/__lorekind_studio") return next();
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.setHeader("Cache-Control", "no-store");
        const send = (status: number, body: unknown) => {
          response.statusCode = status;
          response.end(JSON.stringify(body));
        };
        const host = request.headers.host ?? "";
        if (
          !/^(localhost|127\.0\.0\.1):\d+$/.test(host) ||
          (request.headers.origin !== undefined && request.headers.origin !== `http://${host}`) ||
          (request.method !== "GET" && request.headers.origin !== `http://${host}`)
        )
          return send(403, { error: LocalStudioErrorCode.LocalOnly });
        try {
          const app = await loadWorkspace();
          const url = new URL(request.url!, `http://${host}`);
          const actor = url.searchParams.get("actor");
          if (actor !== "author" && actor !== "reviewer")
            return send(403, { error: LocalStudioErrorCode.UnknownActor });
          const context = evaluationContext(app, actor);
          if (request.method === "POST") {
            if (!request.headers["content-type"]?.startsWith("application/json"))
              return send(415, { error: LocalStudioErrorCode.JsonRequired });
            const chunks: Buffer[] = [];
            let size = 0;
            for await (const chunk of request) {
              const bytes = Buffer.from(chunk);
              size += bytes.length;
              if (size > 131072) return send(413, { error: ApiErrorCode.TooLarge });
              chunks.push(bytes);
            }
            const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            if (
              !body ||
              typeof body !== "object" ||
              Array.isArray(body) ||
              Object.keys(body).some(
                (key) => !["key", "action", "expectedRevision", "content"].includes(key),
              ) ||
              typeof body.key !== "string" ||
              !Number.isSafeInteger(body.expectedRevision) ||
              !["save", "submit", "approve", "publish", "dismiss", "restore"].includes(
                body.action,
              ) ||
              (body.action === "save" &&
                (!body.content || typeof body.content !== "object" || Array.isArray(body.content)))
            )
              return send(400, { error: EditorialErrorCode.InvalidInput });
            const receipt = await app.execute(body as EvaluationCommand, context);
            return send(200, { receipt });
          }
          if (request.method !== "GET") return send(405, { error: ApiErrorCode.MethodNotAllowed });
          const snapshot = await app.read(context);
          const { operations, ...view } = snapshot;
          void operations;
          return send(200, {
            profile: {
              id: app.profile.id,
              title: app.profile.title,
              titleKey: app.profile.titleKey,
              fields: app.profile.fields,
            },
            snapshot: view,
            diff: contentDiff(snapshot.canonical, snapshot.draft),
          });
        } catch (error) {
          if (error instanceof EditorialError)
            return send(error.code === EditorialErrorCode.Forbidden ? 403 : 409, {
              error: error.code,
              details: error.details,
              issues: error.issues,
            });
          if (error instanceof SyntaxError)
            return send(400, { error: EditorialErrorCode.InvalidJson });
          server.config.logger.error(String(error));
          return send(500, { error: LocalStudioErrorCode.StudioUnavailable });
        }
      });
    },
  };
}

import { ApiErrorCode } from "../api-errors";
import { createEditorialApi } from "./editorial-api";
import type { ApiPrincipal, ApiServices } from "./editorial-api";

export interface BrowserIdentity {
  readonly issuer: string;
  readonly subject: string;
  readonly issuedAt: number;
  readonly expiresAt: number;
}

export interface BrowserIdentityProvider {
  /** Verify credentials cryptographically; never trust forwarded identity fields alone. */
  verify(request: Request): Promise<BrowserIdentity | null>;
}

/** Deployment configuration and identity mappings must never come from proposal content. */
export function createBrowserEditorialApi(
  services: Omit<ApiServices, "authenticate"> & {
    origin: string;
    identity: BrowserIdentityProvider;
    /** Re-evaluate mapping/revocation on every request; null denies entry. */
    resolvePrincipal(identity: BrowserIdentity): Promise<ApiPrincipal | null>;
  },
) {
  const origin = new URL(services.origin);
  if (origin.protocol !== "https:" || origin.origin !== services.origin)
    throw new Error("Browser API requires a canonical HTTPS origin");
  const api = createEditorialApi({
    ...services,
    authenticate: async (request) => {
      const identity = await services.identity.verify(request);
      return identity === null ? null : services.resolvePrincipal(identity);
    },
  });
  return async (request: Request): Promise<Response> => {
    const reject = (status: number, code: ApiErrorCode) =>
      Response.json({ error: { code, details: [] } }, { status });
    const suppliedOrigin = request.headers.get("origin");
    const mutation = !["GET", "HEAD", "OPTIONS"].includes(request.method);
    let response: Response;
    if (
      new URL(request.url).origin !== origin.origin ||
      (suppliedOrigin !== null && suppliedOrigin !== origin.origin) ||
      (mutation && suppliedOrigin !== origin.origin) ||
      ["cross-site", "same-site"].includes(request.headers.get("sec-fetch-site") ?? "")
    ) {
      response = reject(403, ApiErrorCode.RequestOriginDenied);
    } else {
      try {
        response = await api(request);
      } catch {
        response = reject(500, ApiErrorCode.InternalError);
      }
    }
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("X-Content-Type-Options", "nosniff");
    return response;
  };
}

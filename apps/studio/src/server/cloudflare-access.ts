import { createRemoteJWKSet, errors, jwtVerify } from "jose";
import type { BrowserIdentityProvider } from "./browser-api";

// Application guard before JWT parsing; not a Cloudflare-specified token limit.
const MAX_ACCESS_TOKEN_LENGTH = 16 * 1024;

/** Optional deployment adapter; Core and the browser boundary have no Access dependency. */
export function cloudflareAccessIdentity(config: {
  issuer: string;
  audience: string;
}): BrowserIdentityProvider {
  if (
    !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(config.issuer) ||
    !config.audience.trim()
  )
    throw new Error("Invalid Access issuer or audience");
  const keys = createRemoteJWKSet(new URL(`${config.issuer}/cdn-cgi/access/certs`), {
    timeoutDuration: 5000,
  });
  return {
    async verify(request) {
      const token = request.headers.get("cf-access-jwt-assertion");
      // TODO: report oversized-token rejection through telemetry (https://github.com/jasset75/lorekind/issues/6).
      if (!token || token.length > MAX_ACCESS_TOKEN_LENGTH) return null;
      try {
        const { payload } = await jwtVerify(token, keys, {
          issuer: config.issuer,
          audience: config.audience,
          algorithms: ["RS256"],
          requiredClaims: ["sub", "iat", "exp", "type"],
        });
        const now = Math.floor(Date.now() / 1000);
        if (
          payload.type !== "app" ||
          !payload.sub?.trim() ||
          !Number.isSafeInteger(payload.iat) ||
          !Number.isSafeInteger(payload.exp) ||
          payload.iat! > now ||
          payload.exp! <= payload.iat!
        )
          return null;
        return {
          issuer: config.issuer,
          subject: payload.sub,
          issuedAt: payload.iat!,
          expiresAt: payload.exp!,
        };
      } catch (error) {
        if (
          error instanceof errors.JOSEError &&
          (/^ERR_(JWT|JWS|JOSE_ALG)/.test(error.code) || error.code === "ERR_JWKS_NO_MATCHING_KEY")
        )
          return null;
        // Provider/key infrastructure failure must fail closed, without exposing credentials.
        throw error;
      }
    },
  };
}

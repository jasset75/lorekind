import type { SimulatedActor } from "../simulated-actors";
import { timingSafeEqual } from "node:crypto";
import type { ApiPrincipal } from "./editorial-api";

/** Development credential adapter. Production may inject an OIDC/session verifier instead. */
export function verifyConfiguredBearer(
  authorization: string | null,
  credentials: Partial<Record<SimulatedActor, string>>,
): ApiPrincipal | null {
  const configured = Object.entries(credentials).filter(
    (item): item is [string, string] => item[1] !== undefined,
  );
  if (
    configured.some(([, token]) => token.length < 32) ||
    new Set(configured.map(([, token]) => token)).size !== configured.length
  )
    throw new Error("Invalid API credential configuration");
  if (!authorization?.startsWith("Bearer ")) return null;
  const supplied = Buffer.from(authorization.slice(7));
  let principal: ApiPrincipal | null = null;
  for (const [id, token] of configured) {
    const expected = Buffer.from(token);
    if (supplied.length === expected.length && timingSafeEqual(supplied, expected))
      principal = { id };
  }
  return principal;
}

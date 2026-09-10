// Build-time entry only. Requests serve the checked-in artifact via openapi.ts.
import { OpenAPIHono, z } from "@hono/zod-openapi";
import { allRoutes, openapiConfig } from "./api-contract";

export function generateOpenApi() {
  const document = new OpenAPIHono();
  document.openAPIRegistry.registerComponent("securitySchemes", "bearerAuth", {
    type: "http",
    scheme: "bearer",
    description: "Verified by the deployment adapter. No identity in query/body.",
  });
  for (const route of allRoutes) {
    // Fail closed on transport constructs without a JSON Schema representation.
    const schemas: z.ZodType[] = [route.request.params];
    if ("headers" in route.request) schemas.push(route.request.headers);
    if ("body" in route.request)
      schemas.push(route.request.body.content["application/json"].schema);
    for (const response of Object.values(route.responses)) {
      schemas.push(response.content["application/json"].schema);
    }
    for (const schema of schemas) z.toJSONSchema(schema, { unrepresentable: "throw" });
    document.openAPIRegistry.registerPath(route);
  }
  const generated = document.getOpenAPI31Document(openapiConfig);
  // Header metadata is shared by the presentation middleware, not individual handlers.
  for (const path of Object.values(generated.paths ?? {})) {
    for (const method of ["get", "post", "patch"] as const) {
      for (const response of Object.values(path?.[method]?.responses ?? {})) {
        if ("$ref" in response) continue;
        response.headers = {
          ...response.headers,
          "Content-Language": {
            description:
              "Resolved presentation locale. Host-level rejections may omit localization headers.",
            schema: { type: "string", enum: ["en", "es"] },
          },
          Vary: {
            description: "Responses from the portable handler vary by Accept-Language.",
            schema: { type: "string" },
          },
        };
      }
    }
  }
  return generated;
}

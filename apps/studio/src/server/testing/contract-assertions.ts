import Ajv2020 from "ajv/dist/2020.js";
import type { AnySchema, ValidateFunction } from "ajv";
import { openapi } from "../openapi";

type ResponseSpec = {
  content: Record<string, { schema: AnySchema }>;
  headers?: Record<string, { required?: boolean; schema: AnySchema }>;
};
type OperationSpec = { operationId: string; responses: Record<string, ResponseSpec> };
export const contract = openapi as unknown as {
  paths: Record<string, Record<string, OperationSpec>>;
  components: { schemas: Record<string, AnySchema> };
};
// Run independently from Zod, in the test host only (Ajv's compiler is not in the Worker).
const ajv = new Ajv2020({ strict: false, allErrors: true });
const validators = new Map<string, ValidateFunction>();
function validate(key: string, schema: AnySchema, data: unknown) {
  let validator = validators.get(key);
  if (!validator) {
    validator = ajv.compile({ ...(schema as object), components: contract.components });
    validators.set(key, validator);
  }
  if (!validator(data)) throw new Error(`${key}: ${ajv.errorsText(validator.errors)}`);
}
export function assertContractResponse(
  path: string,
  method: string,
  response: Pick<Response, "status" | "headers">,
  data: unknown,
) {
  const pathname = new URL(path, "http://localhost").pathname;
  const template = Object.keys(contract.paths).find((candidate) =>
    new RegExp(`^${candidate.replace(/\{[^}]+\}/g, "[^/]+")}$`).test(pathname),
  );
  const operation = template && contract.paths[template]?.[method.toLowerCase()];
  if (!operation) return; // Unknown path/method and the document endpoint are tested explicitly.
  const spec = operation.responses[String(response.status)];
  if (!spec) throw new Error(`Undocumented response: ${method} ${template} ${response.status}`);
  const key = `${method} ${template} ${response.status}`;
  validate(key, spec.content["application/json"]!.schema, data);
  if (!response.headers.get("content-type")?.startsWith("application/json"))
    throw new Error(`${key}: missing JSON content type`);
  if (response.headers.get("cache-control") !== "no-store")
    throw new Error(`${key}: missing no-store`);
  for (const [name, header] of Object.entries(spec.headers ?? {})) {
    const value = response.headers.get(name);
    if (header.required && value === null) throw new Error(`${key}: missing ${name}`);
    if (value !== null) validate(`${key} header ${name}`, header.schema, value);
  }
}

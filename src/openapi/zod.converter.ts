import type {
  ConditionalSchemaConverter,
  SchemaConvertOptions,
} from "@orpc/openapi";

export const zodToJsonSchemaConverter: ConditionalSchemaConverter = {
  condition(schema): boolean {
    // SAFETY: oRPC passes schema-like objects to converter conditions.
    const candidate = schema as
      | {
          toJSONSchema?: (options?: {
            unrepresentable?: "throw" | "any";
          }) => object;
        }
      | undefined;
    return candidate?.toJSONSchema !== undefined;
  },
  convert(schema, _options: SchemaConvertOptions) {
    // SAFETY: convert is called only after condition accepted this schema.
    const candidate = schema as {
      toJSONSchema?: (options?: {
        unrepresentable?: "throw" | "any";
      }) => object;
    };
    if (candidate.toJSONSchema === undefined) {
      throw new Error("Schema does not support JSON Schema conversion");
    }
    // SAFETY: Zod JSON Schema output is an object with an optional required array.
    const jsonSchema = candidate.toJSONSchema({ unrepresentable: "any" }) as {
      required?: string[];
    };
    return [
      Array.isArray(jsonSchema.required) && jsonSchema.required.length > 0,
      jsonSchema,
    ];
  },
};

import z from "zod";

export function createPaginationInputSchema<
  TSearchByKeys extends z.ZodEnum<any>,
  TOrderByKeys extends z.ZodEnum<any>,
  TAdditional extends z.ZodRawShape = {}
>(filter: {
  searchByKeys: TSearchByKeys;
  orderByKeys: TOrderByKeys;
  defaultSearchBy: z.infer<TSearchByKeys>;
  defaultOrderBy: z.infer<TOrderByKeys>;
  additional?: TAdditional;
}) {
  return z.object({
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(-1).max(100).default(10),
    search: z.string().default(""),
    searchBy: filter.searchByKeys.default(filter.defaultSearchBy),
    orderBy: filter.orderByKeys.default(filter.defaultOrderBy),
    order: z.enum(["asc", "desc"]).default("asc"),
    ...filter.additional
  });
}

const paginatedMetadataSchema = z.object({
  items: z.coerce.number(),
  pages: z.coerce.number(),
  page: z.coerce.number(),
  limit: z.coerce.number(),
  from: z.coerce.number(),
  to: z.coerce.number(),
  hasNextPage: z.boolean(),
  hasPreviousPage: z.boolean(),
  search: z.string(),
  searchBy: z.string(),
  order: z.string(),
  orderBy: z.string(),
});

export function createPaginatedOutputSchema<T extends z.ZodTypeAny>(
  itemSchema: T,
) {
  return z.object({
    data: z.array(itemSchema),
    meta: paginatedMetadataSchema,
  });
}

export type PaginationInput<T extends z.ZodEnum> = z.infer<
  ReturnType<typeof createPaginationInputSchema<T, T>>
>;

export type PaginatedOutput<T extends z.ZodTypeAny> = z.infer<
  ReturnType<typeof createPaginatedOutputSchema<T>>
>;

export async function paginate<T>(
  func: () => Promise<T[]>,
  page: number,
  limit: number,
  total: number,
) {
  const pages = Math.ceil(total / limit);
  const from = (page - 1) * limit + 1;
  const to = page * limit;
  const data = await func();

  return {
    data,
    meta: {
      items: total,
      pages: pages,
      page: page,
      limit: limit,
      from: from,
      to: to,
      hasNextPage: page < pages,
      hasPreviousPage: page > 1,
    },
  };
}

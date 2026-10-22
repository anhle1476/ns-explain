import { PAGE_SIZE, pageOfOrders, type Order } from "./filter.ts";

export function handleListOrders(all: Order[], page: number) {
  const rows = pageOfOrders(all, page);
  return { rows, hasMore: (page + 1) * PAGE_SIZE < all.length };
}

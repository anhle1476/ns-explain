export interface Order {
  id: string;
  placedAt: string;
}

// Page size shown on the orders page. Was 10 before this change.
export const PAGE_SIZE = 50;

export function pageOfOrders(all: Order[], page: number): Order[] {
  const start = page * PAGE_SIZE;
  return all.slice(start, start + PAGE_SIZE);
}

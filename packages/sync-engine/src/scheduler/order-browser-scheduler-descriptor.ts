export const WOO_REST_MAX_PER_PAGE = 100;
export const ORDER_BROWSER_SCHEDULER_DESCRIPTOR_MAX_RECORDS = WOO_REST_MAX_PER_PAGE * 2;
export const ORDER_BROWSER_SCHEDULER_UNSUPPORTED_DESCRIPTOR_REASON = 'descriptor is not supported';

export type OrderBrowserSchedulerDescriptor = {
  queryKey: string;
  status: string;
  search: string;
  limit: number;
  wooStatus: string;
};

export type OrderBrowserSchedulerDescriptorDecision =
  | { descriptor: OrderBrowserSchedulerDescriptor; skipReason?: never }
  | { descriptor?: never; skipReason: string };

export function browserOrderSchedulerDescriptorLimit(limitText: string): number | null {
  const limit = Number(limitText);
  if (!Number.isSafeInteger(limit) || limit <= 0 || limit > ORDER_BROWSER_SCHEDULER_DESCRIPTOR_MAX_RECORDS) return null;
  return limit;
}

export function browserOrderSchedulerDescriptorLimitError(): string {
  return `Browser order scheduler descriptors cannot exceed ${ORDER_BROWSER_SCHEDULER_DESCRIPTOR_MAX_RECORDS} records`;
}

export function parseOrderBrowserSchedulerDescriptor(queryKey: string): OrderBrowserSchedulerDescriptorDecision | null {
  if (!queryKey.startsWith('orders:browser:')) return null;

  const match = /^orders:browser:status=([^:]*):search=(.*):limit=(\d+)$/.exec(queryKey);
  if (!match) return { skipReason: ORDER_BROWSER_SCHEDULER_UNSUPPORTED_DESCRIPTOR_REASON };

  const [, status, search, limitText] = match;
  if (status === '') return { skipReason: ORDER_BROWSER_SCHEDULER_UNSUPPORTED_DESCRIPTOR_REASON };
  const limit = browserOrderSchedulerDescriptorLimit(limitText);
  if (limit === null) return { skipReason: browserOrderSchedulerDescriptorLimitError() };

  return {
    descriptor: {
      queryKey,
      status,
      search,
      limit,
      wooStatus: status === 'all' ? '' : status,
    },
  };
}

export const WOO_REST_MAX_PER_PAGE = 100;
export const ORDER_BROWSER_SCHEDULER_DESCRIPTOR_MAX_RECORDS = WOO_REST_MAX_PER_PAGE * 2;
export const ORDER_BROWSER_SCHEDULER_UNSUPPORTED_DESCRIPTOR_REASON = 'descriptor is not supported';

export type OrderBrowserSchedulerDescriptor = {
	queryKey: string;
	status: string;
	search: string;
	limit: number;
	customerId?: number;
	afterSeconds?: number;
	beforeSeconds?: number;
	complete: boolean;
	wooStatus: string;
};

export type OrderBrowserSchedulerDescriptorDecision =
	| { descriptor: OrderBrowserSchedulerDescriptor; skipReason?: never }
	| { descriptor?: never; skipReason: string };

export function browserOrderSchedulerDescriptorLimit(limitText: string): number | null {
	const limit = Number(limitText);
	if (
		!Number.isSafeInteger(limit) ||
		limit <= 0 ||
		limit > ORDER_BROWSER_SCHEDULER_DESCRIPTOR_MAX_RECORDS
	)
		return null;
	return limit;
}

export function browserOrderSchedulerDescriptorLimitError(): string {
	return `Browser order scheduler descriptors cannot exceed ${ORDER_BROWSER_SCHEDULER_DESCRIPTOR_MAX_RECORDS} records`;
}

export function parseOrderBrowserSchedulerDescriptor(
	queryKey: string
): OrderBrowserSchedulerDescriptorDecision | null {
	if (!queryKey.startsWith('orders:browser:')) return null;

	const match = /^orders:browser:status=([^:]*):search=(.*):limit=(\d+|all)$/.exec(queryKey);
	if (!match) return { skipReason: ORDER_BROWSER_SCHEDULER_UNSUPPORTED_DESCRIPTOR_REASON };

	const [, status, searchAndDimensions, limitText] = match;
	if (status === '') return { skipReason: ORDER_BROWSER_SCHEDULER_UNSUPPORTED_DESCRIPTOR_REASON };
	const dimensionsMatch = /^(.*?)(?::customer=(\d+))?(?::after=(\d+))?(?::before=(\d+))?$/.exec(
		searchAndDimensions
	)!;
	const [, search, customerText, afterText, beforeText] = dimensionsMatch;
	if (search.includes(':customer=') || search.includes(':after=') || search.includes(':before=')) {
		return { skipReason: ORDER_BROWSER_SCHEDULER_UNSUPPORTED_DESCRIPTOR_REASON };
	}
	const customerId = customerText === undefined ? undefined : Number(customerText);
	const afterSeconds = afterText === undefined ? undefined : Number(afterText);
	const beforeSeconds = beforeText === undefined ? undefined : Number(beforeText);
	if (
		(customerId !== undefined && !Number.isSafeInteger(customerId)) ||
		(afterSeconds !== undefined && !Number.isSafeInteger(afterSeconds)) ||
		(beforeSeconds !== undefined && !Number.isSafeInteger(beforeSeconds))
	) {
		return { skipReason: ORDER_BROWSER_SCHEDULER_UNSUPPORTED_DESCRIPTOR_REASON };
	}
	const complete = limitText === 'all';
	if (complete && afterSeconds === undefined && beforeSeconds === undefined) {
		return { skipReason: ORDER_BROWSER_SCHEDULER_UNSUPPORTED_DESCRIPTOR_REASON };
	}
	const limit = complete
		? ORDER_BROWSER_SCHEDULER_DESCRIPTOR_MAX_RECORDS
		: browserOrderSchedulerDescriptorLimit(limitText);
	if (limit === null) return { skipReason: browserOrderSchedulerDescriptorLimitError() };

	return {
		descriptor: {
			queryKey,
			status,
			search,
			limit,
			...(customerId !== undefined ? { customerId } : {}),
			...(afterSeconds !== undefined ? { afterSeconds } : {}),
			...(beforeSeconds !== undefined ? { beforeSeconds } : {}),
			complete,
			wooStatus: status === 'all' ? '' : status,
		},
	};
}

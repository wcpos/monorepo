import type { OrderBrowseDimensions } from '../require-plane';

export const WOO_REST_MAX_PER_PAGE = 100;
export const ORDER_BROWSER_SCHEDULER_DESCRIPTOR_MAX_RECORDS = WOO_REST_MAX_PER_PAGE * 2;
export const ORDER_BROWSER_SCHEDULER_UNSUPPORTED_DESCRIPTOR_REASON = 'descriptor is not supported';

export type OrderBrowserSchedulerDescriptor = {
	queryKey: string;
	status: string;
	search: string;
	limit: number;
	customerId?: number;
	cashierId?: number;
	store?: string;
	afterSeconds?: number;
	beforeSeconds?: number;
	orderby?: 'date' | 'modified' | 'id';
	order?: 'asc' | 'desc';
	complete: boolean;
	wooStatus: string;
};

export type OrderBrowserSchedulerDescriptorDecision =
	| { descriptor: OrderBrowserSchedulerDescriptor; skipReason?: never }
	| { descriptor?: never; skipReason: string };

/** Build the canonical persisted lane identity for an orders browse window. */
export function orderBrowserQueryKey(dims: OrderBrowseDimensions): string {
	const status = (dims.status ?? 'all').trim();
	const search = (dims.search ?? '').trim();
	const safeNonNegativeInteger = (value: number | undefined): number | undefined =>
		value !== undefined && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
	const afterSeconds = safeNonNegativeInteger(dims.afterSeconds);
	const beforeSeconds = safeNonNegativeInteger(dims.beforeSeconds);
	if (status === '') throw new TypeError('orders browse status must not be empty');
	if ((dims.orderby === undefined) !== (dims.order === undefined)) {
		throw new TypeError('orders browse orderby and order must be provided together');
	}
	if (dims.limit === 'all' && afterSeconds === undefined && beforeSeconds === undefined) {
		throw new TypeError("orders browse limit 'all' requires a date range bound");
	}

	const dimension = (name: string, value: number | string | undefined): string =>
		value === undefined ? '' : `:${name}=${value}`;
	const store = dims.store && /^(?:\d+|[a-z0-9_-]+)$/.test(dims.store) ? dims.store : undefined;
	const sortPart =
		dims.orderby === undefined || (dims.orderby === 'id' && dims.order === 'desc')
			? ''
			: `:orderby=${dims.orderby}:order=${dims.order}`;
	const limit =
		dims.limit === 'all'
			? 'all'
			: Number.isFinite(dims.limit)
				? Math.min(
						Math.max(1, Math.trunc(dims.limit as number)),
						ORDER_BROWSER_SCHEDULER_DESCRIPTOR_MAX_RECORDS
					)
				: 10;

	return `orders:browser:status=${status}${dimension('customer', safeNonNegativeInteger(dims.customerId))}${dimension('cashier', safeNonNegativeInteger(dims.cashierId))}${dimension('store', store)}${dimension('after', afterSeconds)}${dimension('before', beforeSeconds)}${sortPart}:search=${search}:limit=${limit}`;
}

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

	// `search` carries arbitrary cashier text, so it must stay the LAST free-text field:
	// it is delimited only by the literal `:limit=` suffix (greedy `.*` + anchored end),
	// which is how this grammar has always terminated it. Every structured dimension
	// (customer, cashier, store, the range bounds, then the sort pair) therefore sits
	// BETWEEN the colon-free `status` and `:search=` — appending them after `search`
	// would let a literal search term like `invoice:after=1` be read as a date bound.
	const match =
		/^orders:browser:status=([^:]*)(?::customer=(\d+))?(?::cashier=(\d+))?(?::store=([a-z0-9_-]+))?(?::after=(\d+))?(?::before=(\d+))?(?::orderby=(date|modified|id))?(?::order=(asc|desc))?:search=(.*):limit=(\d+|all)$/.exec(
			queryKey
		);
	if (!match) return { skipReason: ORDER_BROWSER_SCHEDULER_UNSUPPORTED_DESCRIPTOR_REASON };

	const [
		,
		status,
		customerText,
		cashierText,
		store,
		afterText,
		beforeText,
		orderby,
		order,
		search,
		limitText,
	] = match;
	if (status === '') return { skipReason: ORDER_BROWSER_SCHEDULER_UNSUPPORTED_DESCRIPTOR_REASON };
	const customerId = customerText === undefined ? undefined : Number(customerText);
	const cashierId = cashierText === undefined ? undefined : Number(cashierText);
	const afterSeconds = afterText === undefined ? undefined : Number(afterText);
	const beforeSeconds = beforeText === undefined ? undefined : Number(beforeText);
	if (
		(customerId !== undefined && !Number.isSafeInteger(customerId)) ||
		(cashierId !== undefined && !Number.isSafeInteger(cashierId)) ||
		(afterSeconds !== undefined && !Number.isSafeInteger(afterSeconds)) ||
		(beforeSeconds !== undefined && !Number.isSafeInteger(beforeSeconds)) ||
		(orderby === undefined) !== (order === undefined)
	) {
		return {
			skipReason: ORDER_BROWSER_SCHEDULER_UNSUPPORTED_DESCRIPTOR_REASON,
		};
	}
	const complete = limitText === 'all';
	if (complete && afterSeconds === undefined && beforeSeconds === undefined) {
		return {
			skipReason: ORDER_BROWSER_SCHEDULER_UNSUPPORTED_DESCRIPTOR_REASON,
		};
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
			...(cashierId !== undefined ? { cashierId } : {}),
			...(store !== undefined ? { store } : {}),
			...(afterSeconds !== undefined ? { afterSeconds } : {}),
			...(beforeSeconds !== undefined ? { beforeSeconds } : {}),
			...(orderby !== undefined
				? { orderby: orderby as OrderBrowserSchedulerDescriptor['orderby'] }
				: {}),
			...(order !== undefined ? { order: order as OrderBrowserSchedulerDescriptor['order'] } : {}),
			complete,
			wooStatus: status === 'all' ? '' : status,
		},
	};
}

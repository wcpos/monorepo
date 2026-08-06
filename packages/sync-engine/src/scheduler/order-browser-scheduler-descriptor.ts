import {
	BROWSE_WINDOW_ABSOLUTE_MAX_LIMIT,
	clampToBrowseWindowBackstop,
	isBrowseWindowLimit,
} from './browse-window-continuation';

import type { OrderBrowseDimensions } from '../require-plane';

export const WOO_REST_MAX_PER_PAGE = 100;
export const ORDER_BROWSER_SCHEDULER_UNSUPPORTED_DESCRIPTOR_REASON = 'descriptor is not supported';

/**
 * Window growth quantum past the first page (#948/#957 — mirrors
 * PRODUCT_BROWSE_WINDOW_STEP). The orders grid extends its limit 10 rows at a time; below
 * one Woo page the limit travels verbatim (a cold grid must not pull 100 orders to show
 * 10), and above it the window rounds up to this step so scrolling to row 5,000 mints ~50
 * coverage lanes rather than 500.
 */
export const ORDER_BROWSE_WINDOW_STEP = WOO_REST_MAX_PER_PAGE;

/**
 * Record ceiling for a RANGED FETCH-TO-COMPLETION browse (`limit=all`, Reports only).
 * Distinct from a scroll window: nothing here is scroll-driven, the caller asked for the
 * whole date range, and this is the sanity bound on that.
 */
export const ORDER_BROWSE_RANGED_COMPLETE_MAX_RECORDS = 10_000;

/**
 * Quantize a requested orders browse window (#948/#957).
 *
 * Replaces the old `Math.min(…, ORDER_BROWSER_SCHEDULER_DESCRIPTOR_MAX_RECORDS = 200)`
 * clamp. That clamp was not merely a small ceiling — because the limit travels IN the lane
 * key, clamping made every `extendLimit` past 200 produce the identical key, which the
 * scheduler deduped as already-done work, so no further window was ever requested and the
 * grid dead-ended in silence. Quantizing (rather than clamping) keeps the key space small
 * while keeping successive windows DISTINCT.
 */
export function normalizeOrderBrowseWindowLimit(limit: number): number {
	if (!Number.isFinite(limit)) return 10;
	const requested = Math.max(1, Math.trunc(clampToBrowseWindowBackstop(limit)));
	if (requested <= ORDER_BROWSE_WINDOW_STEP) return requested;
	return clampToBrowseWindowBackstop(
		Math.ceil(requested / ORDER_BROWSE_WINDOW_STEP) * ORDER_BROWSE_WINDOW_STEP
	);
}

/**
 * The lane identity of the orders window ONE GROWTH STEP smaller — the prefix a growing
 * window resumes from (#957; see browse-window-continuation.ts). The limit is the LAST
 * field of this grammar, so the predecessor is the same key with a smaller `:limit=`
 * suffix; every other dimension is preserved verbatim, which is what keeps a
 * customer/cashier/store/date-scoped browse continuing from its own prefix.
 */
export function orderBrowserPredecessorWindow(
	queryKey: string,
	limit: number
): { queryKey: string; limit: number } | null {
	// Below the quantum the grid still extends 10 rows at a time, so the predecessor is
	// one UI page back; above it, one full step.
	const previous = limit > ORDER_BROWSE_WINDOW_STEP ? limit - ORDER_BROWSE_WINDOW_STEP : limit - 10;
	if (previous <= 0) return null;
	const suffix = `:limit=${limit}`;
	if (!queryKey.endsWith(suffix)) return null;
	return { queryKey: `${queryKey.slice(0, -suffix.length)}:limit=${previous}`, limit: previous };
}

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
	orderby?: 'date' | 'modified' | 'id' | 'status' | 'customer_id' | 'payment_method' | 'total';
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
	if (status.includes(':')) throw new TypeError('orders browse status must not contain ":"');
	if ((dims.orderby === undefined) !== (dims.order === undefined)) {
		throw new TypeError('orders browse orderby and order must be provided together');
	}
	if (
		dims.orderby !== undefined &&
		dims.orderby !== 'date' &&
		dims.orderby !== 'modified' &&
		dims.orderby !== 'id' &&
		dims.orderby !== 'status' &&
		dims.orderby !== 'customer_id' &&
		dims.orderby !== 'payment_method' &&
		dims.orderby !== 'total'
	) {
		throw new TypeError(`unsupported orders browse orderby "${dims.orderby}"`);
	}
	if (dims.order !== undefined && dims.order !== 'asc' && dims.order !== 'desc') {
		throw new TypeError(`unsupported orders browse order "${dims.order}"`);
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
		dims.limit === 'all' ? 'all' : normalizeOrderBrowseWindowLimit(dims.limit as number);

	return `orders:browser:status=${status}${dimension('customer', safeNonNegativeInteger(dims.customerId))}${dimension('cashier', safeNonNegativeInteger(dims.cashierId))}${dimension('store', store)}${dimension('after', afterSeconds)}${dimension('before', beforeSeconds)}${sortPart}:search=${search}:limit=${limit}`;
}

export function browserOrderSchedulerDescriptorLimit(limitText: string): number | null {
	const limit = Number(limitText);
	// Only the runaway backstop refuses now (#957). The old 200-record refusal is gone:
	// a window is however many orders the cashier has scrolled to.
	return isBrowseWindowLimit(limit) ? limit : null;
}

export function browserOrderSchedulerDescriptorLimitError(): string {
	return `Browser order scheduler descriptors cannot exceed ${BROWSE_WINDOW_ABSOLUTE_MAX_LIMIT} records`;
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
		/^orders:browser:status=([^:]*)(?::customer=(\d+))?(?::cashier=(\d+))?(?::store=([a-z0-9_-]+))?(?::after=(\d+))?(?::before=(\d+))?(?::orderby=(date|modified|id|status|customer_id|payment_method|total))?(?::order=(asc|desc))?:search=(.*):limit=(\d+|all)$/.exec(
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
		? ORDER_BROWSE_RANGED_COMPLETE_MAX_RECORDS
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

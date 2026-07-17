import { BehaviorSubject } from 'rxjs';

export interface StockRejectionItem {
	product_id: number;
	variation_id: number;
	name?: string;
	requested?: number;
	available: number | null;
	reason?: string;
	backorders?: string;
}

export interface StockRejectionState {
	orderUuid: string;
	items: StockRejectionItem[];
}

interface StockRejectionLineItem {
	product_id?: number | null;
	variation_id?: number | null;
	quantity?: number | null;
}

interface FindActiveStockRejectionArgs {
	stockRejection: StockRejectionState | null;
	orderUuid: string;
	lineItem: StockRejectionLineItem;
	lineItems: StockRejectionLineItem[];
}

const DECIMAL_PRECISION = 12;

function normalizeDecimal(value: number): number {
	return Number(value.toFixed(DECIMAL_PRECISION));
}

/**
 * The last server-side wcpos_insufficient_stock rejection, shared between the
 * checkout modal (which sets it) and the cart line cells (which highlight the
 * offending lines until their quantity no longer exceeds `available`). Only one
 * rejection is live at a time; it is replaced on the next checkout attempt and
 * cleared on checkout success.
 */
export const stockRejection$ = new BehaviorSubject<StockRejectionState | null>(null);

export function setStockRejection(state: StockRejectionState) {
	stockRejection$.next(state);
}

export function clearStockRejection() {
	stockRejection$.next(null);
}

/** Return a line's rejection while its rejected stock group still exceeds availability. */
export function findActiveStockRejection({
	stockRejection,
	orderUuid,
	lineItem,
	lineItems,
}: FindActiveStockRejectionArgs): StockRejectionItem | null {
	if (!stockRejection || stockRejection.orderUuid !== orderUuid) return null;
	const match = stockRejection.items.find(
		(item) =>
			item.product_id === (lineItem.product_id ?? 0) &&
			item.variation_id === (lineItem.variation_id ?? 0)
	);
	if (!match || match.available === null) return match ?? null;

	const siblingRejections = stockRejection.items.filter(
		(item) => item.product_id === match.product_id && item.available === match.available
	);
	const sharesStockOwner = siblingRejections.some(
		(item) =>
			Number.isFinite(item.requested) &&
			normalizeDecimal(item.requested as number) <= normalizeDecimal(match.available as number)
	);
	const rejectedIdentities = sharesStockOwner ? siblingRejections : [match];
	const aggregateQuantity = lineItems.reduce((total, item) => {
		const rejected = rejectedIdentities.some(
			(identity) =>
				identity.product_id === (item.product_id ?? 0) &&
				identity.variation_id === (item.variation_id ?? 0)
		);
		return rejected && Number.isFinite(item.quantity)
			? normalizeDecimal(total + (item.quantity as number))
			: total;
	}, 0);
	return aggregateQuantity > normalizeDecimal(match.available) ? match : null;
}

/**
 * Extract the structured items from a wcpos_insufficient_stock REST error
 * response, or null when the error is anything else.
 */
export function parseInsufficientStockError(error: unknown): StockRejectionItem[] | null {
	const body = (error as { response?: { data?: unknown } } | null)?.response?.data ?? error;
	if (body === null || typeof body !== 'object') {
		return null;
	}
	const candidate = body as { code?: unknown; data?: { items?: unknown } };
	if (candidate.code !== 'wcpos_insufficient_stock' || !Array.isArray(candidate.data?.items)) {
		return null;
	}
	return candidate.data.items.filter(
		(item): item is StockRejectionItem =>
			item !== null &&
			typeof item === 'object' &&
			typeof (item as { product_id?: unknown }).product_id === 'number'
	);
}

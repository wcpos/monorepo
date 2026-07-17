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

interface StockRejectionLine {
	product_id?: number;
	variation_id?: number;
	quantity?: number;
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

export function findActiveStockRejection(
	state: StockRejectionState | null,
	orderUuid: string,
	item: StockRejectionLine,
	lineItems: StockRejectionLine[]
): StockRejectionItem | null {
	if (!state || state.orderUuid !== orderUuid) return null;
	const match = state.items.find(
		(rejected) =>
			rejected.product_id === (item.product_id ?? 0) &&
			rejected.variation_id === (item.variation_id ?? 0)
	);
	if (!match) return null;

	const relatedItems = state.items.filter(
		(rejected) => rejected.product_id === match.product_id && rejected.available === match.available
	);
	const aggregatesParentStock = relatedItems.some(
		(rejected) =>
			rejected.available !== null &&
			rejected.requested !== undefined &&
			rejected.requested <= rejected.available
	);
	const stockOwnerItems = aggregatesParentStock
		? relatedItems
		: relatedItems.filter((rejected) => rejected.variation_id === match.variation_id);
	const quantity = lineItems.reduce(
		(total, lineItem) =>
			stockOwnerItems.some(
				(rejected) =>
					rejected.product_id === (lineItem.product_id ?? 0) &&
					rejected.variation_id === (lineItem.variation_id ?? 0)
			)
				? total + (lineItem.quantity ?? 0)
				: total,
		0
	);
	if (match.available !== null && quantity <= match.available) return null;
	return match;
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

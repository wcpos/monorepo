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

interface CartLineStockIdentity {
	product_id?: number | null;
	variation_id?: number | null;
	quantity?: number | null;
}

interface FindActiveStockRejectionArgs {
	stockRejection: StockRejectionState | null;
	orderUuid: string;
	item: CartLineStockIdentity;
	lineItems: CartLineStockIdentity[];
}

export function findActiveStockRejection({
	stockRejection,
	orderUuid,
	item,
	lineItems,
}: FindActiveStockRejectionArgs): StockRejectionItem | null {
	if (!stockRejection || stockRejection.orderUuid !== orderUuid) return null;
	const match = stockRejection.items.find(
		(rejected) =>
			rejected.product_id === (item.product_id ?? 0) &&
			rejected.variation_id === (item.variation_id ?? 0)
	);
	if (!match || match.available === null) return match ?? null;

	const cohortVariationIds = new Set(
		stockRejection.items
			.filter(
				(rejected) =>
					rejected.product_id === match.product_id &&
					rejected.available === match.available &&
					rejected.reason === match.reason &&
					rejected.backorders === match.backorders
			)
			.map((rejected) => rejected.variation_id)
	);
	const quantity = lineItems.reduce((total, lineItem) => {
		if (
			lineItem.product_id !== match.product_id ||
			!cohortVariationIds.has(lineItem.variation_id ?? 0)
		) {
			return total;
		}
		return total + (Number.isFinite(lineItem.quantity) ? (lineItem.quantity as number) : 0);
	}, 0);
	return quantity <= match.available ? null : match;
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

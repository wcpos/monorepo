import { BehaviorSubject } from 'rxjs';

export interface StockRejectionItem {
	product_id: number;
	variation_id: number;
	name?: string;
	requested?: number;
	available: number | null;
	reason?: string;
	backorders?: string;
	stock_owner_key?: string;
}

export interface StockRejectionState {
	orderUuid: string;
	items: StockRejectionItem[];
}

interface StockRejectionLine {
	product_id?: number | null;
	variation_id?: number | null;
	quantity?: number | null;
}

interface GetStockRejectionForLineArgs {
	stockRejection: StockRejectionState | null;
	orderUuid: string;
	lineItems: StockRejectionLine[];
	lineItem: StockRejectionLine;
}

type ReadStockFields = (
	collection: 'products' | 'variations',
	wooId: number
) => Promise<{ manage_stock?: boolean | 'parent' } | null>;

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
 * Returns the active rejection for a cart line until its rejected stock-owner
 * group is back within the server-reported availability.
 */
export function getStockRejectionForLine({
	stockRejection,
	orderUuid,
	lineItems,
	lineItem,
}: GetStockRejectionForLineArgs): StockRejectionItem | null {
	if (!stockRejection || stockRejection.orderUuid !== orderUuid) return null;
	const productId = lineItem.product_id ?? 0;
	const variationId = lineItem.variation_id ?? 0;
	const match = stockRejection.items.find(
		(item) => item.product_id === productId && item.variation_id === variationId
	);
	if (!match || match.available === null) return match ?? null;

	const stockOwnerItems = stockRejection.items.filter(
		(item) => item.stock_owner_key !== undefined && item.stock_owner_key === match.stock_owner_key
	);
	const rejectedLines = stockOwnerItems.length > 0 ? stockOwnerItems : [match];
	const rejectedLineKeys = new Set(
		rejectedLines.map((item) => `${item.product_id}:${item.variation_id}`)
	);
	const aggregateQuantity = lineItems.reduce(
		(total, item) =>
			rejectedLineKeys.has(`${item.product_id ?? 0}:${item.variation_id ?? 0}`)
				? total + (item.quantity ?? 0)
				: total,
		0
	);
	return aggregateQuantity > match.available ? match : null;
}

/** Annotate rejected lines with the local product or variation that owns their stock. */
export async function attachStockOwnerKeys(
	items: StockRejectionItem[],
	readStockFields: ReadStockFields
): Promise<StockRejectionItem[]> {
	const products = new Map<number, Awaited<ReturnType<ReadStockFields>>>();
	const variations = new Map<number, Awaited<ReturnType<ReadStockFields>>>();
	await Promise.all([
		...[...new Set(items.map((item) => item.product_id))].map(async (productId) => {
			products.set(productId, await readStockFields('products', productId));
		}),
		...[...new Set(items.map((item) => item.variation_id).filter(Boolean))].map(
			async (variationId) => {
				variations.set(variationId, await readStockFields('variations', variationId));
			}
		),
	]);

	return items.map((item) => {
		const variationOwnsStock = variations.get(item.variation_id)?.manage_stock === true;
		const parentOwnsStock = products.get(item.product_id)?.manage_stock === true;
		const stockOwnerKey = variationOwnsStock
			? `variation:${item.variation_id}`
			: parentOwnsStock
				? `product:${item.product_id}`
				: `line:${item.product_id}:${item.variation_id}`;
		return { ...item, stock_owner_key: stockOwnerKey };
	});
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

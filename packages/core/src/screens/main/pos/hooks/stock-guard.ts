export interface StockFields {
	manage_stock?: boolean | 'parent';
	stock_quantity?: number | null;
	stock_status?: string;
	backorders?: string;
}

export interface StockGuardResult {
	allowed: boolean;
	warning: 'backorder' | null;
	available: number | null;
}

export interface EvaluateStockForCartChangeArgs {
	product: StockFields;
	variation?: StockFields | null;
	existingCartQuantity: number;
	requestedQuantity: number;
}

interface CartLineStockIdentity {
	product_id?: number | null;
	variation_id?: number | null;
	quantity?: number | null;
	meta_data?: { key?: string; value?: unknown }[];
}

interface AggregateExistingCartQuantityArgs {
	lineItems: CartLineStockIdentity[];
	productId: number;
	variationId?: number;
	product: StockFields;
	variation?: StockFields | null;
	excludedLineItemUuid?: string;
}

const DECIMAL_PRECISION = 12;
const cartMutationChains = new Map<string, Promise<void>>();

export function serializeCartMutation<T>(
	orderUuid: string,
	mutation: () => Promise<T>
): Promise<T> {
	const previous = cartMutationChains.get(orderUuid) ?? Promise.resolve();
	const result = previous.then(mutation);
	const tail = result.then(
		() => undefined,
		() => undefined
	);
	cartMutationChains.set(orderUuid, tail);
	void tail.then(() => {
		if (cartMutationChains.get(orderUuid) === tail) {
			cartMutationChains.delete(orderUuid);
		}
	});
	return result;
}

function normalizeDecimal(value: number): number {
	return Number(value.toFixed(DECIMAL_PRECISION));
}

function isExcludedLine(lineItem: CartLineStockIdentity, excludedLineItemUuid?: string): boolean {
	return Boolean(
		excludedLineItemUuid &&
		lineItem.meta_data?.some(
			(meta) => meta.key === '_woocommerce_pos_uuid' && meta.value === excludedLineItemUuid
		)
	);
}

/**
 * Totals the other cart lines that consume the same stock owner as the requested product.
 */
export function aggregateExistingCartQuantity({
	lineItems,
	productId,
	variationId = 0,
	product,
	variation,
	excludedLineItemUuid,
}: AggregateExistingCartQuantityArgs): number {
	const variationOwnsStock = variation?.manage_stock === true;
	const parentOwnsStock = !variationOwnsStock && product.manage_stock === true;

	return lineItems.reduce((total, lineItem) => {
		if (isExcludedLine(lineItem, excludedLineItemUuid) || lineItem.product_id !== productId) {
			return total;
		}
		if (variationOwnsStock && (lineItem.variation_id ?? 0) !== variationId) {
			return total;
		}
		if (!parentOwnsStock && !variationOwnsStock && (lineItem.variation_id ?? 0) !== variationId) {
			return total;
		}

		const quantity = Number.isFinite(lineItem.quantity) ? (lineItem.quantity as number) : 0;
		return normalizeDecimal(total + quantity);
	}, 0);
}

/**
 * Evaluates an enabled stock guard. Callers are responsible for bypassing this function when the
 * store's prevent_overselling setting is disabled.
 */
export function evaluateStockForCartChange({
	product,
	variation,
	existingCartQuantity,
	requestedQuantity,
}: EvaluateStockForCartChangeArgs): StockGuardResult {
	const owner = variation?.manage_stock === true ? variation : product;
	const managesStock = owner.manage_stock === true;
	const stockQuantity = owner.stock_quantity;

	if (managesStock && Number.isFinite(stockQuantity)) {
		const available = stockQuantity as number;
		const totalRequested = normalizeDecimal(existingCartQuantity + requestedQuantity);
		const exceedsAvailable = totalRequested > normalizeDecimal(available);

		if (!exceedsAvailable) {
			return { allowed: true, warning: null, available };
		}
		if (owner.backorders === 'no') {
			return { allowed: false, warning: null, available };
		}
		if (owner.backorders === 'notify') {
			return { allowed: true, warning: 'backorder', available };
		}
		return { allowed: true, warning: null, available };
	}

	const stockStatus = managesStock
		? owner.stock_status
		: (variation?.stock_status ?? product.stock_status);
	return {
		allowed: stockStatus !== 'outofstock',
		warning: null,
		available: null,
	};
}

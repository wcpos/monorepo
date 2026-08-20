export interface ResolvedStock {
	status: 'instock' | 'onbackorder' | 'outofstock';
	/** Quantity is only known when the record manages its own stock */
	quantity: number | null;
	sellable: boolean;
}

export interface ResolveStockInput {
	manage_stock?: boolean | 'parent';
	stock_quantity?: number | null;
	stock_status?: string;
	backorders?: string;
}

/**
 * WooCommerce's backorder rule, pinned in ONE place: `backorders_allowed()` is
 * an explicit 'yes'/'notify' allow-list and the field defaults to 'no'
 * (abstract-wc-product.php:86, :1897) — a payload missing the field sells out
 * at zero exactly like the online store would (owner ruling 2026-08-20).
 * Shared by the resolver below and the cart oversell guard so the badge, the
 * scan gate, and Add to Cart can never disagree about it.
 */
export function backordersAllowed(backorders: string | undefined): boolean {
	return backorders === 'yes' || backorders === 'notify';
}

/**
 * Pure stock resolver shared by the products grid badge, variation lists,
 * selectors, and barcode scans.
 *
 * When the record manages its own stock, quantity + backorders decide and
 * stock_status is ignored (WooCommerce derives it server-side). Otherwise
 * (including parent-managed stock) the stock_status flag governs.
 */
export function resolveStock({
	manage_stock: manageStock,
	stock_quantity: stockQuantity,
	stock_status: stockStatus,
	backorders,
}: ResolveStockInput): ResolvedStock {
	if (manageStock === true && Number.isFinite(stockQuantity)) {
		if ((stockQuantity as number) > 0) {
			return { status: 'instock', quantity: stockQuantity as number, sellable: true };
		}
		if (backordersAllowed(backorders)) {
			return { status: 'onbackorder', quantity: null, sellable: true };
		}
		return { status: 'outofstock', quantity: null, sellable: false };
	}

	if (stockStatus === 'outofstock') {
		return { status: 'outofstock', quantity: null, sellable: false };
	}
	if (stockStatus === 'onbackorder') {
		return { status: 'onbackorder', quantity: null, sellable: true };
	}
	return { status: 'instock', quantity: null, sellable: true };
}

/** The statuses WooCommerce itself computes for self-managed stock — the only
 * vocabulary a quantity derivation may speak for. */
const BUILT_IN_STOCK_STATUSES: ReadonlySet<string> = new Set([
	'instock',
	'outofstock',
	'onbackorder',
]);

/**
 * The status a stock BADGE should display, tracking a quantity edit the moment
 * it lands locally instead of waiting for the server's ack to rewrite
 * `stock_status` (the ack is what makes the payload flag current again).
 *
 * Derivation applies ONLY when the record self-manages stock — there the
 * quantity is the truth and the flag is a server-computed echo — and ONLY over
 * the built-in statuses that echo can hold. A status outside that vocabulary
 * (e.g. a plugin's 'lowstock') is server-owned even on a self-managed record:
 * deriving over it would clobber it on every read, and the ack — which follows
 * this same branch — could never put it back. Parent-managed records likewise
 * keep the server's word verbatim.
 */
export function displayStockStatus(input: ResolveStockInput): string | undefined {
	if (
		input.manage_stock === true &&
		Number.isFinite(input.stock_quantity) &&
		(input.stock_status === undefined || BUILT_IN_STOCK_STATUSES.has(input.stock_status))
	) {
		return resolveStock(input).status;
	}
	return input.stock_status;
}

import { WOO_REST_MAX_PER_PAGE } from './order-browser-scheduler-descriptor';

/**
 * The products BROWSE-WINDOW descriptor (ADR 0027 §2) — the products mirror of the
 * orders open-recent window (orderBrowserSchedulerDescriptor.ts), deliberately thinner:
 * one bounded result window by the POS default catalog sort, with no filters. It exists
 * so a cold grid shows products without a search; it is a seed, not a query engine.
 *
 * The POS default catalog sort is the `pos-products` UI setting (sortBy 'menu_order'
 * asc — the merchant's curated catalog order, restored per #810), sent to Woo REST as
 * `orderby=menu_order&order=asc` (in WC core's products orderby enum). Because Woo REST
 * cannot add the UI's `id ASC` tiebreak, the fetcher walks the boundary pages and applies
 * the complete sort before truncating.
 */
export const PRODUCT_BROWSE_WINDOW_ORDERBY = 'menu_order';
export const PRODUCT_BROWSE_WINDOW_ORDER = 'asc';
/** Result-window and remote-page ceiling. */
export const PRODUCT_BROWSE_WINDOW_LIMIT = WOO_REST_MAX_PER_PAGE;
export const PRODUCT_BROWSE_WINDOW_DEFAULT_LIMIT = PRODUCT_BROWSE_WINDOW_LIMIT;
export const PRODUCT_BROWSE_WINDOW_QUERY_KEY_PREFIX = 'products:browse-window:';

export function productBrowseWindowQueryKey(limit: number): string {
	return `${PRODUCT_BROWSE_WINDOW_QUERY_KEY_PREFIX}limit=${limit}`;
}

/**
 * The window's limit is a positive integer within the Woo per-page ceiling. Returns the
 * parsed limit, or null when the queryKey is not a supported browse-window descriptor.
 */
export function parseProductBrowseWindowLimit(queryKey: string): number | null {
	const match = /^products:browse-window:limit=(\d+)$/.exec(queryKey);
	if (!match) return null;
	const limit = Number(match[1]);
	if (!Number.isSafeInteger(limit) || limit <= 0 || limit > WOO_REST_MAX_PER_PAGE) return null;
	return limit;
}

import { WOO_REST_MAX_PER_PAGE } from './order-browser-scheduler-descriptor';

/**
 * The products BROWSE-WINDOW descriptor (ADR 0027 §2) — the products mirror of the
 * orders open-recent window (orderBrowserSchedulerDescriptor.ts), deliberately thinner:
 * ONE bounded first page by the POS default catalog sort, no filters, no remote
 * pagination. It exists so a cold grid shows products without a search; it is a seed,
 * not a query engine.
 *
 * The POS default catalog sort is the `pos-products` UI setting (sortBy 'name' asc),
 * which the product query hook maps to Woo REST `orderby=title&order=asc`. The window
 * reuses the existing product fetch/materialization path — no new server params beyond
 * the `per_page`/`page`/`orderby`/`order` the product search path already requests.
 */
export const PRODUCT_BROWSE_WINDOW_ORDERBY = 'title';
export const PRODUCT_BROWSE_WINDOW_ORDER = 'asc';
/** One first page, capped at the Woo per-page ceiling — there is no remote pagination. */
export const PRODUCT_BROWSE_WINDOW_DEFAULT_LIMIT = WOO_REST_MAX_PER_PAGE;
export const PRODUCT_BROWSE_WINDOW_QUERY_KEY_PREFIX = 'products:browse-window:';

export function productBrowseWindowQueryKey(limit: number): string {
	return `${PRODUCT_BROWSE_WINDOW_QUERY_KEY_PREFIX}limit=${limit}`;
}

/**
 * The window's limit is a positive integer within the Woo per-page ceiling (no
 * pagination). Returns the parsed limit, or null when the queryKey is not a supported
 * browse-window descriptor.
 */
export function parseProductBrowseWindowLimit(queryKey: string): number | null {
	const match = /^products:browse-window:limit=(\d+)$/.exec(queryKey);
	if (!match) return null;
	const limit = Number(match[1]);
	if (!Number.isSafeInteger(limit) || limit <= 0 || limit > WOO_REST_MAX_PER_PAGE) return null;
	return limit;
}

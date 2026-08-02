import { WOO_REST_MAX_PER_PAGE } from './order-browser-scheduler-descriptor';

/**
 * The products BROWSE-WINDOW descriptor (ADR 0027 §2) — the products mirror of the
 * orders open-recent window (orderBrowserSchedulerDescriptor.ts), deliberately thinner:
 * one bounded result window over the servable set, with no filters. It exists so a cold
 * grid shows products without a search; it is a seed, not a query engine.
 *
 * §2, revised (#909): the window is no longer single-sort and no longer single-page.
 *
 *  - **Sort.** The seed used to serve exactly one sort (menu_order asc) and the UI locally
 *    re-sorted that slice for every other column — which is the WRONG slice of the catalog
 *    for the new sort (the local rows are the first N by menu_order, not by the chosen
 *    sort): plausible-looking, silently wrong data. The window now carries `orderby`/
 *    `order`, so a non-default sort RE-SEEDS a server-sorted window. Only sorts inside WC
 *    core's products `orderby` enum are expressible; the rest fall back to the default
 *    window (the caller maps them — see requirementsForQuery). The line ADR 0027 §2 draws
 *    is unchanged in kind: still no filters, still one bounded window, still no arbitrary
 *    predicate — the window simply travels with the sort the grid is actually showing.
 *  - **Size.** The window grows with the grid's limit (infinite scroll) in
 *    {@link PRODUCT_BROWSE_WINDOW_STEP} steps up to {@link PRODUCT_BROWSE_WINDOW_MAX_LIMIT},
 *    quantized so a 10-row scroll tick does not mint a new coverage lane every time.
 *
 * WINDOW SIZE IS NOT WIRE PAGE SIZE (#908). The limit here is a coverage total — how many
 * rows the grid seeds, a UX choice. How many records travel per HTTP request is the
 * Performance dial (`pullBatchSize`), applied by the fetcher: a 100-row window at
 * pullBatchSize=25 is four polite requests, not one heavy one.
 *
 * The POS default catalog sort is the `pos-products` UI setting (sortBy 'menu_order'
 * asc — the merchant's curated catalog order, restored per #810), sent to Woo REST as
 * `orderby=menu_order&order=asc`. Because Woo REST cannot add the UI's `id ASC` tiebreak,
 * the fetcher walks the boundary pages and applies the complete sort before truncating.
 */
export const PRODUCT_BROWSE_WINDOW_ORDERBY = 'menu_order';
export const PRODUCT_BROWSE_WINDOW_ORDER = 'asc';

/** WC core's products `orderby` enum, minus `include` (meaningless for a browse window). */
export const PRODUCT_BROWSE_WINDOW_ORDERBY_VALUES = [
	'date',
	'modified',
	'id',
	'title',
	'slug',
	'price',
	'popularity',
	'rating',
	'menu_order',
] as const;

export type ProductBrowseWindowOrderby = (typeof PRODUCT_BROWSE_WINDOW_ORDERBY_VALUES)[number];
export type ProductBrowseWindowOrder = 'asc' | 'desc';

export type ProductBrowseWindowDescriptor = {
	limit: number;
	orderby: ProductBrowseWindowOrderby;
	order: ProductBrowseWindowOrder;
};

/** Default result-window size — one Woo page's worth of rows, NOT a per-request size. */
export const PRODUCT_BROWSE_WINDOW_LIMIT = WOO_REST_MAX_PER_PAGE;
export const PRODUCT_BROWSE_WINDOW_DEFAULT_LIMIT = PRODUCT_BROWSE_WINDOW_LIMIT;
/**
 * Window growth quantum. The grid extends its limit one UI page (10 rows) at a time;
 * rounding up to this step keeps the coverage-lane/queryKey space small (limit=100, 200,
 * 300 …) instead of minting a lane per scroll tick.
 */
export const PRODUCT_BROWSE_WINDOW_STEP = 100;
/**
 * Hard ceiling on the seeded window. Browse is a seed, not a query engine — past this,
 * the answer is search or a filter, not more scrolling.
 */
export const PRODUCT_BROWSE_WINDOW_MAX_LIMIT = 1_000;
export const PRODUCT_BROWSE_WINDOW_QUERY_KEY_PREFIX = 'products:browse-window:';

function isDefaultSort(orderby: string, order: string): boolean {
	return orderby === PRODUCT_BROWSE_WINDOW_ORDERBY && order === PRODUCT_BROWSE_WINDOW_ORDER;
}

export function isProductBrowseWindowOrderby(value: unknown): value is ProductBrowseWindowOrderby {
	return (
		typeof value === 'string' &&
		(PRODUCT_BROWSE_WINDOW_ORDERBY_VALUES as readonly string[]).includes(value)
	);
}

/**
 * Round a requested grid limit up to the next window step, clamped to the ceiling.
 * A grid asking for 10 rows still seeds the standard 100-row window.
 */
export function normalizeProductBrowseWindowLimit(limit: number | undefined): number {
	if (limit === undefined || !Number.isFinite(limit) || limit <= 0) {
		return PRODUCT_BROWSE_WINDOW_DEFAULT_LIMIT;
	}
	const stepped = Math.ceil(limit / PRODUCT_BROWSE_WINDOW_STEP) * PRODUCT_BROWSE_WINDOW_STEP;
	return Math.min(Math.max(stepped, PRODUCT_BROWSE_WINDOW_STEP), PRODUCT_BROWSE_WINDOW_MAX_LIMIT);
}

/**
 * Build the window's queryKey. The default sort keeps the bare `limit=N` form so the
 * cold-start seed's lane identity is unchanged; any other sort appends the wire sort.
 */
export function productBrowseWindowQueryKey(
	limit: number,
	sort?: { orderby: string; order: string }
): string {
	const orderby = sort?.orderby ?? PRODUCT_BROWSE_WINDOW_ORDERBY;
	const order = sort?.order ?? PRODUCT_BROWSE_WINDOW_ORDER;
	const base = `${PRODUCT_BROWSE_WINDOW_QUERY_KEY_PREFIX}limit=${limit}`;
	return isDefaultSort(orderby, order) ? base : `${base}:orderby=${orderby}:order=${order}`;
}

const QUERY_KEY_PATTERN =
	/^products:browse-window:limit=(\d+)(?::orderby=([a-z_]+):order=(asc|desc))?$/;

/**
 * Parse a browse-window queryKey. The limit is a positive integer within
 * {@link PRODUCT_BROWSE_WINDOW_MAX_LIMIT}; the sort, when present, must be inside WC
 * core's products orderby enum and must not restate the default (one key per window).
 * Returns null when the queryKey is not a supported browse-window descriptor.
 */
export function parseProductBrowseWindowDescriptor(
	queryKey: string
): ProductBrowseWindowDescriptor | null {
	const match = QUERY_KEY_PATTERN.exec(queryKey);
	if (!match) return null;
	const limit = Number(match[1]);
	if (!Number.isSafeInteger(limit) || limit <= 0 || limit > PRODUCT_BROWSE_WINDOW_MAX_LIMIT) {
		return null;
	}
	if (match[2] === undefined) {
		return {
			limit,
			orderby: PRODUCT_BROWSE_WINDOW_ORDERBY,
			order: PRODUCT_BROWSE_WINDOW_ORDER,
		};
	}
	const orderby = match[2];
	const order = match[3] as ProductBrowseWindowOrder;
	if (!isProductBrowseWindowOrderby(orderby)) return null;
	// The default sort has exactly one spelling — the bare `limit=N` key.
	if (isDefaultSort(orderby, order)) return null;
	return { limit, orderby, order };
}

/** The window's limit, or null when the queryKey is not a browse-window descriptor. */
export function parseProductBrowseWindowLimit(queryKey: string): number | null {
	return parseProductBrowseWindowDescriptor(queryKey)?.limit ?? null;
}

export { WOO_REST_MAX_PER_PAGE };

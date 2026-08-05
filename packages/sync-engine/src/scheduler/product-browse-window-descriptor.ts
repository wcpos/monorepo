import { WOO_REST_MAX_PER_PAGE } from './order-browser-scheduler-descriptor';

import type { ProductBrowseDimensions } from '../require-plane';

/**
 * The products BROWSE-WINDOW descriptor (ADR 0027 §2) — the products mirror of the
 * orders open-recent window (orderBrowserSchedulerDescriptor.ts): one bounded result
 * window over the servable set. It exists so a cold grid shows products without a search;
 * it is a seed, not a query engine.
 *
 * §2, revised (#909): the window is no longer single-sort and no longer single-page.
 *
 *  - **Sort.** The seed used to serve exactly one sort (menu_order asc) and the UI locally
 *    re-sorted that slice for every other column — which is the WRONG slice of the catalog
 *    for the new sort (the local rows are the first N by menu_order, not by the chosen
 *    sort): plausible-looking, silently wrong data. The window now carries `orderby`/
 *    `order`, so a non-default sort RE-SEEDS a server-sorted window. Only sorts inside the
 *    supported products `orderby` enum are expressible; the rest fall back to the default
 *    window (the caller maps them — see requirementsForQuery). The window remains bounded
 *    and travels with the sort the grid is actually showing.
 *  - **Size.** The window grows with the grid's limit (infinite scroll) in
 *    {@link PRODUCT_BROWSE_WINDOW_STEP} steps up to {@link PRODUCT_BROWSE_WINDOW_MAX_LIMIT},
 *    quantized so a 10-row scroll tick does not mint a new coverage lane every time.
 *  - **Filters.** The old “filtered browse = local residents only” ruling was overturned
 *    by Paul on 2026-08-04 (wayfinder: reports-date-range-demand-wayfinder). Representable
 *    cashier-applied filters now create wired, WINDOWED demand. The window remains bounded
 *    (G3); fetch-to-completion remains an orders/reports concept.
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

/** Supported products `orderby` values, including the WCPOS plugin extensions. */
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
	'sku',
	'barcode',
	'stock_quantity',
	'stock_status',
] as const;

export type ProductBrowseWindowOrderby = (typeof PRODUCT_BROWSE_WINDOW_ORDERBY_VALUES)[number];
export type ProductBrowseWindowOrder = 'asc' | 'desc';
export type ProductBrowseWindowStockStatus = 'instock' | 'outofstock' | 'onbackorder';

export type ProductBrowseWindowDescriptor = {
	limit: number;
	orderby: ProductBrowseWindowOrderby;
	order: ProductBrowseWindowOrder;
	category?: number[];
	tag?: number[];
	brand?: number[];
	featured?: boolean;
	on_sale?: boolean;
	stock_status?: ProductBrowseWindowStockStatus;
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
 * narrow with search or filters rather than keep scrolling.
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

/** The filter dimensions, in the one order the grammar admits. */
export type ProductBrowseWindowFilters = Pick<
	ProductBrowseWindowDescriptor,
	'category' | 'tag' | 'brand' | 'featured' | 'on_sale' | 'stock_status'
>;

/**
 * Build the window's queryKey — the ENCODER half of this grammar, and the exact inverse of
 * {@link parseProductBrowseWindowDescriptor}. The default sort and an empty filter set keep
 * the bare `limit=N` form so the cold-start seed's lane identity is unchanged; anything else
 * appends the wire sort, then the filter dimensions in grammar order.
 *
 * Encoder and parser must stay in lockstep: a dimension one side can express and the other
 * drops would either mint a second coverage lane for one filter set or silently widen the
 * lane relative to the demand that asked for it.
 */
export function productBrowseWindowQueryKey(
	limit: number,
	sort?: { orderby: string; order: string },
	filters?: ProductBrowseWindowFilters
): string {
	const orderby = sort?.orderby ?? PRODUCT_BROWSE_WINDOW_ORDERBY;
	const order = sort?.order ?? PRODUCT_BROWSE_WINDOW_ORDER;
	const base = `${PRODUCT_BROWSE_WINDOW_QUERY_KEY_PREFIX}limit=${limit}`;
	const sortPart = isDefaultSort(orderby, order) ? '' : `:orderby=${orderby}:order=${order}`;
	return `${base}${sortPart}${productBrowseWindowFilterPart(filters)}`;
}

/** Adapt public typed browse dimensions to the canonical product window key. */
export function productBrowseWindowQueryKeyFromDimensions(dims: ProductBrowseDimensions): string {
	if ((dims.orderby === undefined) !== (dims.order === undefined)) {
		throw new TypeError('product browse orderby and order must be provided together');
	}
	if (dims.orderby !== undefined && !isProductBrowseWindowOrderby(dims.orderby)) {
		throw new TypeError(`unsupported product browse orderby "${dims.orderby}"`);
	}
	if (dims.order !== undefined && dims.order !== 'asc' && dims.order !== 'desc') {
		throw new TypeError(`unsupported product browse order "${dims.order}"`);
	}
	if (
		dims.stock_status !== undefined &&
		dims.stock_status !== 'instock' &&
		dims.stock_status !== 'outofstock' &&
		dims.stock_status !== 'onbackorder'
	) {
		throw new TypeError(`unsupported product browse stock_status "${dims.stock_status}"`);
	}
	return productBrowseWindowQueryKey(
		normalizeProductBrowseWindowLimit(dims.limit),
		dims.orderby === undefined ? undefined : { orderby: dims.orderby, order: dims.order! },
		dims
	);
}

/** The `:category=…:tag=…:…` tail of the key; `''` when no dimension is set. */
export function productBrowseWindowFilterPart(filters?: ProductBrowseWindowFilters): string {
	if (!filters) return '';
	const idPart = (field: 'category' | 'tag' | 'brand') => {
		const ids = filters[field];
		if (!ids || ids.length === 0) return '';
		// Canonical spelling — strictly ascending and unique — so one filter set can never
		// mint two coverage lanes. The parser rejects any other spelling.
		const canonical = [...new Set(ids.filter((id) => Number.isSafeInteger(id) && id > 0))].sort(
			(a, b) => a - b
		);
		return canonical.length === 0 ? '' : `:${field}=${canonical.join(',')}`;
	};
	const flagPart = (field: 'featured' | 'on_sale') =>
		filters[field] === undefined ? '' : `:${field}=${filters[field] ? '1' : '0'}`;
	return [
		idPart('category'),
		idPart('tag'),
		idPart('brand'),
		flagPart('featured'),
		flagPart('on_sale'),
		filters.stock_status ? `:stock_status=${filters.stock_status}` : '',
	].join('');
}

const QUERY_KEY_PATTERN =
	/^products:browse-window:limit=(\d+)(?::orderby=([a-z_]+):order=(asc|desc))?(?::category=(\d+(?:,\d+)*))?(?::tag=(\d+(?:,\d+)*))?(?::brand=(\d+(?:,\d+)*))?(?::featured=(0|1))?(?::on_sale=(0|1))?(?::stock_status=(instock|outofstock|onbackorder))?$/;

function parseCanonicalIds(value: string | undefined): number[] | null | undefined {
	if (value === undefined) return undefined;
	const ids = value.split(',').map(Number);
	return ids.every(
		(id, index) => Number.isSafeInteger(id) && id > 0 && (index === 0 || id > ids[index - 1]!)
	)
		? ids
		: null;
}

/**
 * Parse a browse-window queryKey. The limit is a positive integer within
 * {@link PRODUCT_BROWSE_WINDOW_MAX_LIMIT}; the sort, when present, must be inside the
 * supported products orderby enum and must not restate the default (one key per window).
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
	const orderby = match[2] ?? PRODUCT_BROWSE_WINDOW_ORDERBY;
	const order = (match[3] ?? PRODUCT_BROWSE_WINDOW_ORDER) as ProductBrowseWindowOrder;
	if (!isProductBrowseWindowOrderby(orderby)) return null;
	// The default sort has exactly one spelling — the bare `limit=N` key.
	if (match[2] !== undefined && isDefaultSort(orderby, order)) return null;
	const [category, tag, brand] = [match[4], match[5], match[6]].map(parseCanonicalIds);
	if (category === null || tag === null || brand === null) return null;
	return {
		limit,
		orderby,
		order,
		...(category ? { category } : {}),
		...(tag ? { tag } : {}),
		...(brand ? { brand } : {}),
		...(match[7] ? { featured: match[7] === '1' } : {}),
		...(match[8] ? { on_sale: match[8] === '1' } : {}),
		...(match[9] ? { stock_status: match[9] as ProductBrowseWindowStockStatus } : {}),
	};
}

/** The window's limit, or null when the queryKey is not a browse-window descriptor. */
export function parseProductBrowseWindowLimit(queryKey: string): number | null {
	return parseProductBrowseWindowDescriptor(queryKey)?.limit ?? null;
}

export { WOO_REST_MAX_PER_PAGE };

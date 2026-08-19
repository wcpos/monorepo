import {
	BROWSE_WINDOW_ABSOLUTE_MAX_LIMIT,
	clampToBrowseWindowBackstop,
	isBrowseWindowLimit,
} from './browse-window-continuation';
import { type BrowseWindowGrammar, browseWindowKeyPart } from './browse-window-grammar';
import { WOO_REST_MAX_PER_PAGE } from './order-browser-scheduler-descriptor';

import type { ProductBrowseDimensions } from '../require-plane';

/**
 * The products BROWSE-WINDOW descriptor (ADR 0027 §2) — the products mirror of the
 * orders open-recent window (orderBrowserSchedulerDescriptor.ts): the result window the
 * grid is currently showing, expressed as a lane identity.
 *
 * §2, revised (#909, then #948): the window is no longer single-sort, no longer
 * single-page, and no longer capped.
 *
 *  - **Sort.** The seed used to serve exactly one sort (menu_order asc) and the UI locally
 *    re-sorted that slice for every other column — which is the WRONG slice of the catalog
 *    for the new sort (the local rows are the first N by menu_order, not by the chosen
 *    sort): plausible-looking, silently wrong data. The window now carries `orderby`/
 *    `order`, so a non-default sort RE-SEEDS a server-sorted window. Only sorts inside the
 *    supported products `orderby` enum are expressible; the rest fall back to the default
 *    window (the compiled query demand face maps them).
 *  - **Size.** The window grows with the grid's limit (infinite scroll) in
 *    {@link PRODUCT_BROWSE_WINDOW_STEP} steps, quantized so a 10-row scroll tick does not
 *    mint a new coverage lane every time. It does NOT stop. The old
 *    `PRODUCT_BROWSE_WINDOW_MAX_LIMIT = 1_000` — and the “browse is a seed, not a query
 *    engine; past this, narrow with search or filters” philosophy behind it — was
 *    OVERTURNED by Paul on 2026-08-06 (#948): a cashier who scrolls past row 1,000 gets
 *    row 1,001, as 1.9 did. Growth stays cheap because the fetcher resumes each step from
 *    the covered prefix instead of re-walking the window (browse-window-continuation.ts);
 *    the only ceiling left is the runaway backstop
 *    {@link BROWSE_WINDOW_ABSOLUTE_MAX_LIMIT}.
 *  - **Filters.** The old “filtered browse = local residents only” ruling was overturned
 *    by Paul on 2026-08-04 (wayfinder: reports-date-range-demand-wayfinder). Representable
 *    cashier-applied filters now create wired, WINDOWED demand.
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
 * Round a requested grid limit up to the next window step. A grid asking for 10 rows
 * still seeds the standard 100-row window; a grid asking for 4,250 gets 4,300.
 *
 * There is no product ceiling here any more (#948) — only the runaway backstop, which a
 * cashier cannot reach by scrolling. Quantizing is what keeps the coverage-lane and
 * queryKey space small as the window grows: one lane per 100 rows scrolled, not one per
 * 10-row tick.
 */
export function normalizeProductBrowseWindowLimit(limit: number | undefined): number {
	if (limit === undefined || !Number.isFinite(limit) || limit <= 0) {
		return PRODUCT_BROWSE_WINDOW_DEFAULT_LIMIT;
	}
	const stepped =
		Math.ceil(Math.min(limit, BROWSE_WINDOW_ABSOLUTE_MAX_LIMIT) / PRODUCT_BROWSE_WINDOW_STEP) *
		PRODUCT_BROWSE_WINDOW_STEP;
	return clampToBrowseWindowBackstop(Math.max(stepped, PRODUCT_BROWSE_WINDOW_STEP));
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
	return encodeProductBrowseWindowKey(String(limit), orderby, order, filters);
}

/**
 * Assemble the key from parts already decided. The ONE place this grammar's bytes are
 * written, so the view identity below (which spells the limit as the empty string) cannot
 * drift from the lane keys it has to group.
 */
function encodeProductBrowseWindowKey(
	limitText: string,
	orderby: string,
	order: string,
	filters?: ProductBrowseWindowFilters
): string {
	const sortPart = isDefaultSort(orderby, order)
		? ''
		: `${browseWindowKeyPart('orderby', orderby)}${browseWindowKeyPart('order', order)}`;
	return `${PRODUCT_BROWSE_WINDOW_QUERY_KEY_PREFIX}limit=${limitText}${sortPart}${productBrowseWindowFilterPart(filters)}`;
}

/** The persisted requirement identity for a products browse window. */
export function productBrowseWindowRequirementId(
	descriptor: ProductBrowseWindowDescriptor
): string {
	const sortSuffix = isDefaultSort(descriptor.orderby, descriptor.order)
		? ''
		: `.${descriptor.orderby}.${descriptor.order}`;
	const filterPart = productBrowseWindowFilterPart(descriptor).replaceAll(':', '.');
	return `products.browse-window.limit.${descriptor.limit}${sortSuffix}${filterPart}`;
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

/**
 * The wire query the window's identity means — `status=publish`, the sort, and whichever
 * representable filter dimensions it carries. The ONE place a product browse window is
 * translated into Woo REST params, so the drain fetcher (rx-scheduler-product-fetcher.ts)
 * and the idle catalog backfill (maintenance/product-trickle.ts) cannot express the same
 * window as two different requests.
 *
 * `omitFilters` keeps the SORT and drops the restrictive dimensions — the backfill's second
 * stage. Paul's ruling (2026-08-19): filters PRIORITISE, they do not exclude. The active
 * window (say in-stock, alphabetical) comes down first; then the same sort continues over
 * the whole catalogue, so an out-of-stock product still lands and the till stays fully
 * sellable offline.
 *
 * Callers add `per_page`/`page` themselves: the window is a row count, the page size is the
 * Performance dial (#908), and the backfill paginates on its own cursor.
 */
export function productBrowseWindowQueryParams(
	descriptor: ProductBrowseWindowDescriptor,
	options?: { omitFilters?: boolean }
): URLSearchParams {
	const query = new URLSearchParams();
	query.set('orderby', descriptor.orderby);
	query.set('order', descriptor.order);
	query.set('status', 'publish');
	if (options?.omitFilters) return query;
	for (const field of ['category', 'tag', 'brand'] as const) {
		if (descriptor[field]) query.set(field, descriptor[field].join(','));
	}
	for (const field of ['featured', 'on_sale'] as const) {
		if (descriptor[field] !== undefined) query.set(field, String(descriptor[field]));
	}
	if (descriptor.stock_status) query.set('stock_status', descriptor.stock_status);
	return query;
}

/** Whether the window carries any restrictive filter dimension at all. */
export function hasProductBrowseWindowFilters(descriptor: ProductBrowseWindowDescriptor): boolean {
	return productBrowseWindowFilterPart(descriptor) !== '';
}

/**
 * The window's VIEW identity — every dimension except the limit, which is what "the same
 * slice of the catalogue" means. Lane eviction groups by it, and the idle catalog backfill
 * keys its durable cursor by it (so a scroll tick does not restart the walk but a sort or
 * filter change does). Always a string for products, unlike the nullable grammar slot.
 */
export function productBrowseWindowViewKey(descriptor: ProductBrowseWindowDescriptor): string {
	return encodeProductBrowseWindowKey('', descriptor.orderby, descriptor.order, descriptor);
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
 * Parse a browse-window queryKey. The limit is any positive integer up to the runaway
 * backstop {@link BROWSE_WINDOW_ABSOLUTE_MAX_LIMIT} — a scrolled-to window of 4,300 rows
 * is as valid a descriptor as the 100-row seed (#948). The sort, when present, must be
 * inside the supported products orderby enum and must not restate the default (one key
 * per window). Returns null when the queryKey is not a supported browse-window descriptor.
 */
export function parseProductBrowseWindowDescriptor(
	queryKey: string
): ProductBrowseWindowDescriptor | null {
	const match = QUERY_KEY_PATTERN.exec(queryKey);
	if (!match) return null;
	const limit = Number(match[1]);
	if (!isBrowseWindowLimit(limit)) {
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

/**
 * The lane identity of the window ONE GROWTH STEP smaller than this one — the lane the
 * previous scroll tick wrote, and therefore the prefix a growing window resumes from
 * (#948; see browse-window-continuation.ts). Null for the first window, which has no
 * predecessor to continue.
 *
 * Every dimension except the limit is preserved verbatim by re-encoding through
 * {@link productBrowseWindowQueryKey}, so a filtered or non-default-sorted window
 * continues from ITS OWN predecessor and never from the unfiltered one.
 */
export function productBrowseWindowPredecessorQueryKey(
	descriptor: ProductBrowseWindowDescriptor
): string | null {
	const previous = descriptor.limit - PRODUCT_BROWSE_WINDOW_STEP;
	if (previous < PRODUCT_BROWSE_WINDOW_STEP) return null;
	return productBrowseWindowQueryKey(
		previous,
		{ orderby: descriptor.orderby, order: descriptor.order },
		descriptor
	);
}

/**
 * The products lane, as a value the shared browse-window engine consumes
 * (browse-window-grammar.ts). The limit is the FIRST field of this grammar, so the view
 * identity re-encodes with an empty limit rather than stripping a suffix.
 */
export const PRODUCT_BROWSE_WINDOW_GRAMMAR: BrowseWindowGrammar<ProductBrowseWindowDescriptor> = {
	collection: 'products',
	encode: (descriptor) =>
		productBrowseWindowQueryKey(
			descriptor.limit,
			{ orderby: descriptor.orderby, order: descriptor.order },
			descriptor
		),
	parse: parseProductBrowseWindowDescriptor,
	limitOf: (descriptor) => descriptor.limit,
	requirementId: productBrowseWindowRequirementId,
	viewKey: productBrowseWindowViewKey,
	schemaCeilingLabel: 'Product browse-window scheduler',
	measureTaskIdAgainstCeiling: true,
};

export { WOO_REST_MAX_PER_PAGE };

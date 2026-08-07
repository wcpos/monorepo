import { type BrowseWindowGrammar, browseWindowKeyPart } from './browse-window-grammar';
import { WOO_REST_MAX_PER_PAGE } from './order-browser-scheduler-descriptor';

import type { CustomerBrowseDimensions } from '../require-plane';

/**
 * The customers BROWSE-WINDOW descriptor (#951) — the customers sibling of the products
 * browse window (product-browse-window-descriptor.ts): one result window over the servable
 * customer set, carrying the sort the grid is actually showing.
 *
 * WHY IT EXISTS. Customers are an ON-DEMAND collection: a cold unbounded browse deliberately
 * creates no remote demand (search + the idle trickle instead, #865 — that ruling stands and
 * this window does not overturn it). But the customers screen has SORT UI, and a sort applied
 * to local residents alone re-orders the wrong slice of the customer base: mid-trickle (id
 * asc) a cashier sorting by registration date sees a plausible-looking but incomplete list —
 * the exact failure mode #909 fixed for products. Paul's ruling (2026-08-06): "You're a
 * cashier — you go to the customers page and you change the sorting or you add a filter. You
 * expect to see those customers." So a SORTED browse goes to the server in that sort.
 *
 * DEMAND-DRIVEN, NOT EAGER. Nothing here seeds at boot or on idle. The window exists only
 * while a grid is mounted over it and declares it (requirementsForQuery), which is what keeps
 * #865's no-eager-seed ruling for customers intact.
 *
 * NO RECORD CAP (R8, 2026-08-06). The window grows with the grid's limit for as long as the
 * cashier keeps scrolling — there is deliberately no ceiling constant here, and the sibling
 * work removing the products/orders caps (fix/948-957-unbounded-browse) is the same ruling
 * applied to those lanes. What IS bounded is the work per request: the fetcher walks the
 * window in Performance-dial-sized pages (`pullBatchSize`, #908), so a 500-row window is a
 * sequence of polite requests, never one heavy one.
 *
 * The window is quantized onto the {@link CUSTOMER_BROWSE_WINDOW_GROWTH_FACTOR} curve so a
 * 10-row scroll tick does not mint a new coverage lane every time — quantization, not a cap.
 * Each growth IS a distinct queryKey, which is what makes scroll extension advance the window
 * instead of collapsing onto the previous request (the #957 dedupe-collapse bug).
 */

/**
 * Default wire sort — deliberately the SAME ordering the idle customer trickle walks
 * (`orderby=id&order=asc`, customer-trickle.ts). The default window and the trickle therefore
 * cover the customer base in one order, so a browse-fetched page is a page the trickle would
 * otherwise have had to fetch, and the two lanes converge on the same set instead of racing
 * over two different orderings.
 */
export const CUSTOMER_BROWSE_WINDOW_ORDERBY = 'id';
export const CUSTOMER_BROWSE_WINDOW_ORDER = 'asc';

/**
 * The `orderby` values the customers read surface accepts.
 *
 * `syncBaseUrl` is the `wcpos/v2` namespace, whose `/customers` route is
 * `Catalog_Proxy_Controller`. Two families reach the wire:
 *
 *  - **wc/v3-native** — `id`, `name`, `registered_date`. The proxy forwards these verbatim to
 *    `wc/v3/customers`, whose own enum accepts them. (`include` is an id-order echo, not a
 *    browse sort, so it is not offered.)
 *  - **WCPOS plugin sorts** — `first_name`, `last_name`, `email`, `username`, `role`. wc/v3
 *    rejects these with `rest_invalid_param`, so the proxy strips each off the inner request
 *    and re-applies it through `V1_Customers_Controller::wcpos_customer_query` — the same seam
 *    it already uses for multi-term customer search (plugin #1488). `role` sorts by STAFF
 *    HIERARCHY, not alphabetically (administrator > shop_manager > cashier > editor/author/
 *    contributor > customer > subscriber; a multi-role user ranks by highest privilege, plugin
 *    #1500). The client passes `orderby=role&order=asc|desc` and does NO local rank mapping —
 *    the ordering is entirely server-side.
 *
 * This closes the #951/#1028 gap where the five plugin sorts were withheld because the v2
 * proxy did not yet re-apply them; 1.9 could sort the list server-side because it talked to
 * `wcpos/v1` directly, and parity is now restored through the proxy.
 *
 * OLDER PLUGINS. A store still running a plugin build without the #1488 proxy answers one of
 * the five with a 400. The fetcher degrades that to a labelled `customer.browse-window.sort-
 * rejected` event and a failed drain (the grid keeps its local results) rather than crashing —
 * see rx-scheduler-customer-fetcher.ts. Correctness on current stores; graceful degradation on
 * stale ones.
 */
export const CUSTOMER_BROWSE_WINDOW_ORDERBY_VALUES = [
	'id',
	'name',
	'registered_date',
	'first_name',
	'last_name',
	'email',
	'username',
	'role',
] as const;

export type CustomerBrowseWindowOrderby = (typeof CUSTOMER_BROWSE_WINDOW_ORDERBY_VALUES)[number];
export type CustomerBrowseWindowOrder = 'asc' | 'desc';

export type CustomerBrowseWindowDescriptor = {
	limit: number;
	orderby: CustomerBrowseWindowOrderby;
	order: CustomerBrowseWindowOrder;
};

/** Default window size — one Woo page's worth of rows. NOT a per-request size (#908). */
export const CUSTOMER_BROWSE_WINDOW_DEFAULT_LIMIT = WOO_REST_MAX_PER_PAGE;

/**
 * Window growth is GEOMETRIC — 100, 200, 400, 800, 1 600 … — not a fixed 100-row step.
 *
 * Each window is a fresh walk from page 1: a task keyed `limit=200` re-reads the rows the
 * `limit=100` task already fetched, because the fetcher holds no cross-window cursor. With a
 * fixed step that re-read is quadratic — reaching N rows transfers ~N²/(2·step) rows, so an
 * UNCAPPED window (R8) would make scrolling progressively more expensive without bound
 * (reaching 5 000 rows in 100-row steps costs 127 500 row-reads). Doubling makes the series
 * geometric instead: reaching N costs under 4N row-reads forever, a constant amplification
 * rather than a growing one, and it mints log₂(N/100) coverage lanes instead of N/100.
 *
 * The products window can use a fixed step only because it stops at 1 000 rows; removing that
 * cap (the sibling fix/948-957-unbounded-browse work) exposes the same quadratic there.
 *
 * A cheap cross-window cursor would beat both, but resuming a walk safely needs the
 * coverage-lane cursor-resume + ancestry guard from #1023, which is not on `next` yet — see
 * the PR body. Doubling is the self-contained bound until then.
 */
export const CUSTOMER_BROWSE_WINDOW_GROWTH_FACTOR = 2;

export const CUSTOMER_BROWSE_WINDOW_QUERY_KEY_PREFIX = 'customers:browse-window:';

function isDefaultSort(orderby: string, order: string): boolean {
	return orderby === CUSTOMER_BROWSE_WINDOW_ORDERBY && order === CUSTOMER_BROWSE_WINDOW_ORDER;
}

export function isCustomerBrowseWindowOrderby(
	value: unknown
): value is CustomerBrowseWindowOrderby {
	return (
		typeof value === 'string' &&
		(CUSTOMER_BROWSE_WINDOW_ORDERBY_VALUES as readonly string[]).includes(value)
	);
}

/**
 * Round a requested grid limit up to the next window size — the smallest
 * `100 · 2^k` that covers it. A grid asking for 10 rows still seeds the standard 100-row
 * window; a grid scrolled to 1,340 rows gets 1,600. No ceiling (R8); only the
 * non-finite/non-positive degenerate cases fall back to the default.
 */
export function normalizeCustomerBrowseWindowLimit(limit: number | undefined): number {
	if (limit === undefined || !Number.isFinite(limit) || limit <= 0) {
		return CUSTOMER_BROWSE_WINDOW_DEFAULT_LIMIT;
	}
	let window = CUSTOMER_BROWSE_WINDOW_DEFAULT_LIMIT;
	// A limit near MAX_SAFE_INTEGER (the reports "all results" sentinel shape) must not double
	// past the safe-integer range, or the key would stop round-tripping through the parser.
	// Customers grids never pass that sentinel, but the grammar stays total for any input.
	while (window < limit && Number.isSafeInteger(window * CUSTOMER_BROWSE_WINDOW_GROWTH_FACTOR)) {
		window *= CUSTOMER_BROWSE_WINDOW_GROWTH_FACTOR;
	}
	return window;
}

/**
 * Build the window's queryKey — the ENCODER half of this grammar and the exact inverse of
 * {@link parseCustomerBrowseWindowDescriptor}. The default sort keeps the bare `limit=N` form
 * so one window has exactly one lane identity; any other sort appends the wire sort.
 *
 * The encoder REFUSES anything the parser would reject, so the two halves cannot disagree.
 * A key one side can express and the other drops is not a cosmetic mismatch here: the seeder
 * persists what this builds and the fetcher re-parses the persisted key to build the wire
 * request, so a one-sided key would seed a task the drain then permanently refuses — and, for
 * an out-of-enum `orderby`, would be the one way an unsupported sort could reach the wire.
 */
export function customerBrowseWindowQueryKey(
	limit: number,
	sort?: { orderby: string; order: string }
): string {
	if (!Number.isSafeInteger(limit) || limit <= 0) {
		throw new TypeError(`customer browse limit must be a positive safe integer, got "${limit}"`);
	}
	const orderby = sort?.orderby ?? CUSTOMER_BROWSE_WINDOW_ORDERBY;
	const order = sort?.order ?? CUSTOMER_BROWSE_WINDOW_ORDER;
	if (!isCustomerBrowseWindowOrderby(orderby)) {
		throw new TypeError(`unsupported customer browse orderby "${orderby}"`);
	}
	if (order !== 'asc' && order !== 'desc') {
		throw new TypeError(`unsupported customer browse order "${order}"`);
	}
	return encodeCustomerBrowseWindowKey(String(limit), orderby, order);
}

/**
 * Assemble the key from parts already decided. The ONE place this grammar's bytes are
 * written, so the view identity below (which spells the limit as the empty string) cannot
 * drift from the lane keys it has to group.
 */
function encodeCustomerBrowseWindowKey(limitText: string, orderby: string, order: string): string {
	const sortPart = isDefaultSort(orderby, order)
		? ''
		: `${browseWindowKeyPart('orderby', orderby)}${browseWindowKeyPart('order', order)}`;
	return `${CUSTOMER_BROWSE_WINDOW_QUERY_KEY_PREFIX}limit=${limitText}${sortPart}`;
}

/** The persisted requirement identity for a customers browse window. */
export function customerBrowseWindowRequirementId(
	descriptor: CustomerBrowseWindowDescriptor
): string {
	const sortSuffix = isDefaultSort(descriptor.orderby, descriptor.order)
		? ''
		: `.${descriptor.orderby}.${descriptor.order}`;
	return `customers.browse-window.limit.${descriptor.limit}${sortSuffix}`;
}

/** Adapt public typed browse dimensions to the canonical customer window key. */
export function customerBrowseWindowQueryKeyFromDimensions(dims: CustomerBrowseDimensions): string {
	if ((dims.orderby === undefined) !== (dims.order === undefined)) {
		throw new TypeError('customer browse orderby and order must be provided together');
	}
	if (dims.orderby !== undefined && !isCustomerBrowseWindowOrderby(dims.orderby)) {
		throw new TypeError(`unsupported customer browse orderby "${dims.orderby}"`);
	}
	if (dims.order !== undefined && dims.order !== 'asc' && dims.order !== 'desc') {
		throw new TypeError(`unsupported customer browse order "${dims.order}"`);
	}
	return customerBrowseWindowQueryKey(
		normalizeCustomerBrowseWindowLimit(dims.limit),
		dims.orderby === undefined ? undefined : { orderby: dims.orderby, order: dims.order! }
	);
}

const QUERY_KEY_PATTERN =
	/^customers:browse-window:limit=(\d+)(?::orderby=([a-z_]+):order=(asc|desc))?$/;

/**
 * Parse a browse-window queryKey. The limit is a positive safe integer; the sort, when
 * present, must be inside the supported customers orderby enum and must not restate the
 * default (one key per window). Returns null when the queryKey is not a customers
 * browse-window descriptor — which is how the fetcher and the drain tell this lane apart from
 * the targeted and search lanes that share the `customers:` namespace.
 */
export function parseCustomerBrowseWindowDescriptor(
	queryKey: string
): CustomerBrowseWindowDescriptor | null {
	const match = QUERY_KEY_PATTERN.exec(queryKey);
	if (!match) return null;
	const limit = Number(match[1]);
	if (!Number.isSafeInteger(limit) || limit <= 0) return null;
	const orderby = match[2] ?? CUSTOMER_BROWSE_WINDOW_ORDERBY;
	const order = (match[3] ?? CUSTOMER_BROWSE_WINDOW_ORDER) as CustomerBrowseWindowOrder;
	if (!isCustomerBrowseWindowOrderby(orderby)) return null;
	// The default sort has exactly one spelling — the bare `limit=N` key.
	if (match[2] !== undefined && isDefaultSort(orderby, order)) return null;
	return { limit, orderby, order };
}

/** True when the queryKey names the customers browse window (any window size or sort). */
export function isCustomerBrowseWindowQueryKey(queryKey: string): boolean {
	return parseCustomerBrowseWindowDescriptor(queryKey) !== null;
}

/**
 * The customers lane, as a value the shared browse-window engine consumes
 * (browse-window-grammar.ts).
 *
 * This lane grows GEOMETRICALLY, so the window one step back is half the size and its
 * coverage is not a page-aligned prefix of this one. The customers fetcher therefore carries
 * no continuation and no eviction — see rx-scheduler-customer-fetcher.ts, which walks each
 * window from page 1.
 */
export const CUSTOMER_BROWSE_WINDOW_GRAMMAR: BrowseWindowGrammar<CustomerBrowseWindowDescriptor> = {
	collection: 'customers',
	encode: (descriptor) =>
		customerBrowseWindowQueryKey(descriptor.limit, {
			orderby: descriptor.orderby,
			order: descriptor.order,
		}),
	parse: parseCustomerBrowseWindowDescriptor,
	limitOf: (descriptor) => descriptor.limit,
	requirementId: customerBrowseWindowRequirementId,
	viewKey: (descriptor) => encodeCustomerBrowseWindowKey('', descriptor.orderby, descriptor.order),
	schemaCeilingLabel: 'Customer browse-window scheduler',
	measureTaskIdAgainstCeiling: true,
};

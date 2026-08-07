/**
 * The browse-window grammar contract, held against ALL THREE lanes at once.
 *
 * Two things are pinned here, and they are different things:
 *
 *  1. **The bytes.** Lane keys and requirementIds are PERSISTED IDENTITIES — they live in
 *     `schedulerTaskStates` and `coverageLanes` and are re-read on the next launch. A change
 *     in what the encoder emits is not a refactor, it is a silent migration that strands
 *     every persisted lane and forks live windows into two identities. The literal tables
 *     below spell out the current bytes for a matrix of inputs (statuses, customer/cashier/
 *     store scopes, date ranges, sorts, filters, growth steps, and search text containing a
 *     literal `invoice:after=1`), and the legacy-encoder fixtures at the bottom re-derive
 *     them from the per-collection encoder bodies as they stood BEFORE the grammar was
 *     consolidated.
 *
 *  2. **The mutual-inverse property**, ported from the customers descriptor test — the only
 *     lane that had it — so it now runs over the orders and products grammars too.
 */

import {
	CUSTOMER_BROWSE_WINDOW_GRAMMAR,
	CUSTOMER_BROWSE_WINDOW_ORDERBY_VALUES,
	CUSTOMER_BROWSE_WINDOW_QUERY_KEY_PREFIX,
	type CustomerBrowseWindowDescriptor,
	normalizeCustomerBrowseWindowLimit,
} from './customer-browse-window-descriptor';
import {
	normalizeOrderBrowseWindowLimit,
	ORDER_BROWSE_WINDOW_GRAMMAR,
	orderBrowserQueryKey,
	type OrderBrowseWindowFields,
} from './order-browser-scheduler-descriptor';
import {
	normalizeProductBrowseWindowLimit,
	PRODUCT_BROWSE_WINDOW_GRAMMAR,
	PRODUCT_BROWSE_WINDOW_ORDERBY_VALUES,
	PRODUCT_BROWSE_WINDOW_QUERY_KEY_PREFIX,
	type ProductBrowseWindowDescriptor,
} from './product-browse-window-descriptor';
import {
	assertBrowseWindowKeyLengths,
	type BrowseWindowGrammar,
	browseWindowLaneIdentity,
} from './browse-window-grammar';

// ---------------------------------------------------------------------------
// 1. The bytes — literal pins
// ---------------------------------------------------------------------------

type Pin<TWindow> = { window: TWindow; queryKey: string; requirementId: string };

const ORDER_PINS: Pin<OrderBrowseWindowFields>[] = [
	{
		window: { status: 'processing', search: '', limit: 50 },
		queryKey: 'orders:browser:status=processing:search=:limit=50',
		requirementId: 'orders.browser.status.processing.limit.50',
	},
	{
		window: { status: 'all', search: '', limit: 150 },
		queryKey: 'orders:browser:status=all:search=:limit=150',
		requirementId: 'orders.browser.status.all.limit.150',
	},
	// The DEFAULT `id desc` sort has exactly one spelling — the bare key — and does not count
	// as a dimension for the requirementId either.
	{
		window: { status: 'processing', search: '', limit: 50, orderby: 'id', order: 'desc' },
		queryKey: 'orders:browser:status=processing:search=:limit=50',
		requirementId: 'orders.browser.status.processing.limit.50',
	},
	{
		window: { status: 'processing', search: 'hat', limit: 50, customerId: 42 },
		queryKey: 'orders:browser:status=processing:customer=42:search=hat:limit=50',
		requirementId: 'orders.browser.status=processing.customer=42.search=hat.limit=50',
	},
	{
		window: {
			status: 'processing',
			search: 'hat',
			limit: 50,
			customerId: 42,
			cashierId: 7,
			store: '12',
			orderby: 'date',
			order: 'asc',
		},
		queryKey:
			'orders:browser:status=processing:customer=42:cashier=7:store=12:orderby=date:order=asc:search=hat:limit=50',
		requirementId:
			'orders.browser.status=processing.customer=42.cashier=7.store=12.orderby=date.order=asc.search=hat.limit=50',
	},
	{
		window: { status: 'all', search: '', limit: 100, store: 'woocommerce-pos' },
		queryKey: 'orders:browser:status=all:store=woocommerce-pos:search=:limit=100',
		requirementId: 'orders.browser.status=all.store=woocommerce-pos.search=.limit=100',
	},
	// A RANGED fetch-to-completion lane: sort-agnostic, and its limit is the literal `all`.
	{
		window: {
			status: 'completed',
			search: '',
			limit: 'all',
			afterSeconds: 1_782_864_000,
			beforeSeconds: 1_784_073_599,
			orderby: 'date',
			order: 'asc',
		},
		queryKey:
			'orders:browser:status=completed:after=1782864000:before=1784073599:search=:limit=all',
		requirementId:
			'orders.browser.status=completed.after=1782864000.before=1784073599.search=.limit=all',
	},
	// Free-text search stays the LAST field, so a term that looks like a date bound is read
	// back as text and never as a filter. This is the case the grammar's field order exists for.
	{
		window: { status: 'all', search: 'invoice:after=1', limit: 100 },
		queryKey: 'orders:browser:status=all:search=invoice:after=1:limit=100',
		requirementId: 'orders.browser.status.all.search.invoice:after=1.limit.100',
	},
];

const PRODUCT_PINS: Pin<ProductBrowseWindowDescriptor>[] = [
	{
		window: { limit: 100, orderby: 'menu_order', order: 'asc' },
		queryKey: 'products:browse-window:limit=100',
		requirementId: 'products.browse-window.limit.100',
	},
	{
		window: { limit: 200, orderby: 'price', order: 'desc' },
		queryKey: 'products:browse-window:limit=200:orderby=price:order=desc',
		requirementId: 'products.browse-window.limit.200.price.desc',
	},
	{
		// Ids are canonicalized (ascending, unique) so one filter set cannot mint two lanes.
		window: {
			limit: 100,
			orderby: 'menu_order',
			order: 'asc',
			category: [5, 3, 3],
			tag: [9],
			featured: true,
			on_sale: false,
			stock_status: 'instock',
		},
		queryKey:
			'products:browse-window:limit=100:category=3,5:tag=9:featured=1:on_sale=0:stock_status=instock',
		requirementId:
			'products.browse-window.limit.100.category=3,5.tag=9.featured=1.on_sale=0.stock_status=instock',
	},
	{
		window: { limit: 4_300, orderby: 'sku', order: 'asc', brand: [7] },
		queryKey: 'products:browse-window:limit=4300:orderby=sku:order=asc:brand=7',
		requirementId: 'products.browse-window.limit.4300.sku.asc.brand=7',
	},
];

const CUSTOMER_PINS: Pin<CustomerBrowseWindowDescriptor>[] = [
	{
		window: { limit: 100, orderby: 'id', order: 'asc' },
		queryKey: 'customers:browse-window:limit=100',
		requirementId: 'customers.browse-window.limit.100',
	},
	{
		window: { limit: 1_600, orderby: 'registered_date', order: 'desc' },
		queryKey: 'customers:browse-window:limit=1600:orderby=registered_date:order=desc',
		requirementId: 'customers.browse-window.limit.1600.registered_date.desc',
	},
	{
		window: { limit: 25_600, orderby: 'role', order: 'asc' },
		queryKey: 'customers:browse-window:limit=25600:orderby=role:order=asc',
		requirementId: 'customers.browse-window.limit.25600.role.asc',
	},
];

describe('browse-window lane identities are persisted bytes', () => {
	it.each([
		['orders', ORDER_BROWSE_WINDOW_GRAMMAR, ORDER_PINS],
		['products', PRODUCT_BROWSE_WINDOW_GRAMMAR, PRODUCT_PINS],
		['customers', CUSTOMER_BROWSE_WINDOW_GRAMMAR, CUSTOMER_PINS],
	] as [string, BrowseWindowGrammar<unknown>, Pin<unknown>[]][])(
		'%s keys and requirementIds are unchanged',
		(_name, grammar, pins) => {
			for (const pin of pins) {
				expect(grammar.encode(pin.window)).toBe(pin.queryKey);
				expect(grammar.requirementId(pin.window)).toBe(pin.requirementId);
			}
		}
	);

	it('pins every growth step of each lane', () => {
		// Orders/products quantize onto a fixed 100-row step; customers double (a fresh walk
		// per window would otherwise make scroll depth quadratic).
		expect(
			[1, 10, 100, 101, 150, 200, 4_250, 100_001].map(normalizeOrderBrowseWindowLimit)
		).toEqual([1, 10, 100, 200, 200, 200, 4_300, 100_000]);
		expect(
			[undefined, 1, 10, 100, 101, 1_000, 4_250].map(normalizeProductBrowseWindowLimit)
		).toEqual([100, 100, 100, 100, 200, 1_000, 4_300]);
		expect(
			[undefined, 10, 100, 110, 801, 1_340, 5_000].map(normalizeCustomerBrowseWindowLimit)
		).toEqual([100, 100, 100, 200, 1_600, 1_600, 6_400]);

		// Every growth step is a DISTINCT key: the #957 dedupe-collapse bug was a growth that
		// re-minted the previous key, which the scheduler deduped away into silence.
		const requested = [10, 110, 250, 1_010, 4_250];
		for (const [grammar, normalize] of [
			[PRODUCT_BROWSE_WINDOW_GRAMMAR, normalizeProductBrowseWindowLimit],
			[CUSTOMER_BROWSE_WINDOW_GRAMMAR, normalizeCustomerBrowseWindowLimit],
		] as unknown as [BrowseWindowGrammar<never>, (limit: number) => number][]) {
			const keys = requested.map((rows) => grammar.encode({ limit: normalize(rows) } as never));
			expect(new Set(keys).size).toBe(new Set(requested.map(normalize)).size);
		}
	});

	// The demand plane's door quantizes; the seeder's door takes the caller's limit verbatim.
	// Both must emit the same bytes for the same window — the divergence the orders seeder
	// used to assert against at runtime, having built the key a second time.
	it('reaches identical orders bytes through the demand-plane door', () => {
		expect(orderBrowserQueryKey({ status: 'processing', search: '', limit: 50 })).toBe(
			'orders:browser:status=processing:search=:limit=50'
		);
		expect(orderBrowserQueryKey({ status: 'all', search: '', limit: 101 })).toBe(
			'orders:browser:status=all:search=:limit=200'
		);
		expect(
			orderBrowserQueryKey({
				status: 'processing',
				search: 'hat',
				limit: 50,
				customerId: 42,
				cashierId: 7,
				store: '12',
				orderby: 'date',
				order: 'asc',
			})
		).toBe(
			'orders:browser:status=processing:customer=42:cashier=7:store=12:orderby=date:order=asc:search=hat:limit=50'
		);
		// Dimensions this grammar cannot express are DROPPED at this door rather than encoded.
		expect(
			orderBrowserQueryKey({
				status: 'all',
				search: '',
				limit: 100,
				customerId: -1,
				store: 'Bad Store',
			})
		).toBe('orders:browser:status=all:search=:limit=100');
	});
});

describe('the persisted schema ceiling', () => {
	const longKey = `orders:browser:status=${'x'.repeat(240)}:search=:limit=50`;

	it('refuses a queryKey the schema cannot hold, in each lane s own words', () => {
		expect(() =>
			assertBrowseWindowKeyLengths(ORDER_BROWSE_WINDOW_GRAMMAR, {
				queryKey: longKey,
				taskId: `${longKey}:windowed`,
				requirementId: 'orders.browser.status.x.limit.50',
			})
		).toThrow(
			`Browser order scheduler descriptor queryKey exceeds schema limit: ${longKey.length} > 256`
		);
		expect(() =>
			assertBrowseWindowKeyLengths(PRODUCT_BROWSE_WINDOW_GRAMMAR, {
				queryKey: longKey,
				taskId: `${longKey}:windowed`,
				requirementId: 'products.browse-window.limit.100',
			})
		).toThrow('Product browse-window scheduler queryKey exceeds schema limit');
		expect(() =>
			assertBrowseWindowKeyLengths(CUSTOMER_BROWSE_WINDOW_GRAMMAR, {
				queryKey: 'customers:browse-window:limit=100',
				taskId: 'customers:browse-window:limit=100:windowed',
				requirementId: `customers.browse-window.limit.${'9'.repeat(250)}`,
			})
		).toThrow('Customer browse-window scheduler requirementId exceeds schema limit');
	});

	/**
	 * Orders measures the queryKey; products and customers measure the seeded TASK id, which
	 * is eight characters longer. A per-lane quirk, pinned rather than unified: changing which
	 * string is measured changes which windows a store can seed.
	 */
	it('measures the task id on the lanes that always have, and the key on the one that has not', () => {
		// A filter set long enough that the key fits the schema but `<key>:windowed` does not.
		const ids: number[] = [];
		let key = '';
		do {
			ids.push(ids.length + 1);
			key = `products:browse-window:limit=100:category=${ids.join(',')}`;
		} while (key.length <= 256 - ':windowed'.length);
		expect(key.length).toBeLessThanOrEqual(256);
		expect(`${key}:windowed`.length).toBeGreaterThan(256);
		const identity = { queryKey: key, taskId: `${key}:windowed`, requirementId: 'products.x' };
		expect(() => assertBrowseWindowKeyLengths(PRODUCT_BROWSE_WINDOW_GRAMMAR, identity)).toThrow(
			'Product browse-window scheduler queryKey exceeds schema limit'
		);
		expect(() => assertBrowseWindowKeyLengths(ORDER_BROWSE_WINDOW_GRAMMAR, identity)).not.toThrow();
	});
});

// ---------------------------------------------------------------------------
// 2. The mutual-inverse property, over all three grammars
// ---------------------------------------------------------------------------

/** The whole typed domain of each encoder, enumerated. */
const ORDER_DOMAIN: OrderBrowseWindowFields[] = [
	...(
		[
			undefined,
			['date', 'asc'],
			['modified', 'desc'],
			['id', 'desc'],
			['id', 'asc'],
			['status', 'asc'],
			['customer_id', 'desc'],
			['payment_method', 'asc'],
			['total', 'desc'],
		] as ([OrderBrowseWindowFields['orderby'], OrderBrowseWindowFields['order']] | undefined)[]
	).flatMap((sort) =>
		[1, 10, 100, 200, 100_000].map((limit): OrderBrowseWindowFields => ({
			status: 'processing',
			search: 'invoice:after=1',
			limit,
			customerId: 42,
			cashierId: 7,
			store: 'store-a',
			afterSeconds: 1_782_864_000,
			beforeSeconds: 1_784_073_599,
			...(sort ? { orderby: sort[0], order: sort[1] } : {}),
		}))
	),
	{ status: 'all', search: '', limit: 100 },
	{ status: 'all', search: '', limit: 'all', afterSeconds: 1 },
	{ status: 'completed', search: 'a:b=c', limit: 'all', beforeSeconds: 2 },
];

const PRODUCT_DOMAIN: ProductBrowseWindowDescriptor[] =
	PRODUCT_BROWSE_WINDOW_ORDERBY_VALUES.flatMap((orderby) =>
		(['asc', 'desc'] as const).flatMap((order) =>
			[1, 100, 4_300, 100_000].flatMap((limit): ProductBrowseWindowDescriptor[] => [
				{ limit, orderby, order },
				{
					limit,
					orderby,
					order,
					category: [3, 5],
					tag: [9],
					brand: [7],
					featured: false,
					on_sale: true,
					stock_status: 'onbackorder',
				},
			])
		)
	);

const CUSTOMER_DOMAIN: CustomerBrowseWindowDescriptor[] =
	CUSTOMER_BROWSE_WINDOW_ORDERBY_VALUES.flatMap((orderby) =>
		(['asc', 'desc'] as const).flatMap((order) =>
			[1, 100, 200, 6_400, 99_901].map((limit) => ({ limit, orderby, order }))
		)
	);

const GRAMMARS = [
	['orders', ORDER_BROWSE_WINDOW_GRAMMAR, ORDER_DOMAIN, 'orders:browser:'],
	[
		'products',
		PRODUCT_BROWSE_WINDOW_GRAMMAR,
		PRODUCT_DOMAIN,
		PRODUCT_BROWSE_WINDOW_QUERY_KEY_PREFIX,
	],
	[
		'customers',
		CUSTOMER_BROWSE_WINDOW_GRAMMAR,
		CUSTOMER_DOMAIN,
		CUSTOMER_BROWSE_WINDOW_QUERY_KEY_PREFIX,
	],
] as unknown as [string, BrowseWindowGrammar<never>, unknown[], string][];

describe.each(GRAMMARS)('%s browse-window grammar', (_name, grammar, domain, queryKeyPrefix) => {
	/**
	 * The encoder must never build a key the parser rejects. A one-sided key would seed a task
	 * the drain permanently refuses — and for an out-of-enum orderby it would be the one route
	 * by which a sort the server cannot accept could reach the wire.
	 */
	it('encoder and parser are mutually inverse over the whole encoder domain', () => {
		for (const window of domain as never[]) {
			const queryKey = grammar.encode(window);
			const parsed = grammar.parse(queryKey);
			expect({ window, parsed }).toEqual({ window, parsed: expect.anything() });
			expect(grammar.encode(parsed!)).toBe(queryKey);
			expect(grammar.limitOf(parsed!)).toEqual(grammar.limitOf(window));
		}
	});

	it('starts every key it builds with this lane s prefix, and claims no other lane s keys', () => {
		for (const window of domain as never[]) {
			expect(grammar.encode(window).startsWith(queryKeyPrefix)).toBe(true);
		}
		for (const foreign of [
			'orders:custom-pull',
			'orders:ids:1,2',
			'products:ids:1',
			'products:search:hat',
			'customers:ids:1',
			'customers:search=smith:limit=25',
			'taxRates:all',
		]) {
			if (foreign.startsWith(queryKeyPrefix)) continue;
			expect(grammar.parse(foreign)).toBeNull();
		}
	});

	/**
	 * The refusal is expressed differently per lane — the customers encoder throws, the
	 * products and orders encoders emit a key their own parser then rejects, and each seeder
	 * turns either into a refused seed — but the OUTCOME is the invariant: a value outside
	 * this grammar can never become a seedable lane identity.
	 */
	it('refuses to turn anything the parser would reject into a lane identity', () => {
		const unsupported = (window: unknown): boolean => {
			try {
				return grammar.parse(grammar.encode(window as never)) === null;
			} catch {
				return true;
			}
		};
		const sample = domain[0] as Record<string, unknown>;
		expect(unsupported({ ...sample, orderby: 'date_modified_gmt', order: 'asc' })).toBe(true);
		expect(unsupported({ ...sample, orderby: 'id', order: 'sideways' })).toBe(true);
		for (const limit of [0, -1, 10.5, Number.MAX_SAFE_INTEGER + 10]) {
			expect(unsupported({ ...sample, limit })).toBe(true);
		}
	});

	/**
	 * Eviction DELETES lanes on the authority of a survivor of the same view, so a key that
	 * parses but is not the key this encoder would have written must not be grouped into the
	 * canonical view. Unreachable from any encoder — which is exactly why it is pinned rather
	 * than left to the next reader to rediscover.
	 */
	it('gives a non-canonical spelling no lane identity at all', () => {
		const identify = browseWindowLaneIdentity(grammar);
		for (const window of (domain as never[]).slice(0, 8)) {
			const canonical = grammar.encode(window);
			if (grammar.limitOf(window) === 'all') continue;
			expect(identify(canonical)).not.toBeNull();
			expect(identify(canonical.replace(/:limit=(\d+)/, ':limit=0$1'))).toBeNull();
			if (canonical.includes(':customer=')) {
				expect(identify(canonical.replace(/:customer=(\d+)/, ':customer=00$1'))).toBeNull();
			}
		}
	});

	it('gives one window exactly one lane identity for the default sort', () => {
		// A restated default sort is not a second spelling of the same window — it is rejected,
		// so a lane cannot be forked in two by the door it came through.
		const restated = grammar.encode({
			...(domain[0] as Record<string, unknown>),
			limit: 100,
			orderby: grammar.collection === 'products' ? 'menu_order' : 'id',
			order:
				grammar.collection === 'customers'
					? 'asc'
					: grammar.collection === 'products'
						? 'asc'
						: 'desc',
		} as never);
		expect(restated).not.toContain(':orderby=');
	});
});

// ---------------------------------------------------------------------------
// 3. Legacy-encoder fixtures — the bodies as they stood before consolidation
// ---------------------------------------------------------------------------

/**
 * The pre-consolidation encoders as they stood at ad00dfa82, copied from
 * order-browser-scheduler-descriptor.ts (BOTH orders doors — the demand plane's
 * `orderBrowserQueryKey`, verbatim including its validation, and the seeder's hand-built
 * key), rx-order-scheduler-task-seeder.ts, rx-scheduler-product-task-seeder.ts and
 * rx-scheduler-customer-task-seeder.ts. They exist to prove the consolidation moved no
 * bytes; a deliberate future change to a key format has to change these too, which is
 * exactly the friction a persisted identity deserves.
 *
 * The products/customers/orders-seeder fixtures drop their callers' input validation (the
 * matrices below never trip it). The orders DEMAND-door fixture keeps every validation
 * verbatim, because the question it answers is precisely which inputs are refused before
 * reaching the sort tail — see the half-sort parity test.
 */
type LegacyOrderBrowseDimensions = {
	status?: string;
	search?: string;
	limit: number | 'all';
	customerId?: number;
	cashierId?: number;
	store?: string;
	afterSeconds?: number;
	beforeSeconds?: number;
	orderby?: string;
	order?: string;
};

function legacyOrderBrowserDemandKey(dims: LegacyOrderBrowseDimensions): string {
	const status = (dims.status ?? 'all').trim();
	const search = (dims.search ?? '').trim();
	const safeNonNegativeInteger = (value: number | undefined): number | undefined =>
		value !== undefined && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
	const afterSeconds = safeNonNegativeInteger(dims.afterSeconds);
	const beforeSeconds = safeNonNegativeInteger(dims.beforeSeconds);
	if (status === '') throw new TypeError('orders browse status must not be empty');
	if (status.includes(':')) throw new TypeError('orders browse status must not contain ":"');
	if ((dims.orderby === undefined) !== (dims.order === undefined)) {
		throw new TypeError('orders browse orderby and order must be provided together');
	}
	if (
		dims.orderby !== undefined &&
		dims.orderby !== 'date' &&
		dims.orderby !== 'modified' &&
		dims.orderby !== 'id' &&
		dims.orderby !== 'status' &&
		dims.orderby !== 'customer_id' &&
		dims.orderby !== 'payment_method' &&
		dims.orderby !== 'total'
	) {
		throw new TypeError(`unsupported orders browse orderby "${dims.orderby}"`);
	}
	if (dims.order !== undefined && dims.order !== 'asc' && dims.order !== 'desc') {
		throw new TypeError(`unsupported orders browse order "${dims.order}"`);
	}
	if (dims.limit === 'all' && afterSeconds === undefined && beforeSeconds === undefined) {
		throw new TypeError("orders browse limit 'all' requires a date range bound");
	}

	const dimension = (name: string, value: number | string | undefined): string =>
		value === undefined ? '' : `:${name}=${value}`;
	const store = dims.store && /^(?:\d+|[a-z0-9_-]+)$/.test(dims.store) ? dims.store : undefined;
	const sortPart =
		dims.limit === 'all' ||
		dims.orderby === undefined ||
		(dims.orderby === 'id' && dims.order === 'desc')
			? ''
			: `:orderby=${dims.orderby}:order=${dims.order}`;
	const limit =
		dims.limit === 'all' ? 'all' : normalizeOrderBrowseWindowLimit(dims.limit as number);

	return `orders:browser:status=${status}${dimension('customer', safeNonNegativeInteger(dims.customerId))}${dimension('cashier', safeNonNegativeInteger(dims.cashierId))}${dimension('store', store)}${dimension('after', afterSeconds)}${dimension('before', beforeSeconds)}${sortPart}:search=${search}:limit=${limit}`;
}

function legacyOrderSeederIdentity(input: {
	status: string;
	search: string;
	limit: number;
	customerId?: number;
	cashierId?: number;
	store?: string;
	afterSeconds?: number;
	beforeSeconds?: number;
	orderby?: string;
	order?: string;
	complete?: boolean;
}): { queryKey: string; requirementId: string } {
	const status = input.status.trim() || 'all';
	const search = input.search.trim();
	const customerPart = input.customerId === undefined ? '' : `:customer=${input.customerId}`;
	const cashierPart = input.cashierId === undefined ? '' : `:cashier=${input.cashierId}`;
	const storePart = input.store === undefined ? '' : `:store=${input.store}`;
	const rangePart = `${input.afterSeconds === undefined ? '' : `:after=${input.afterSeconds}`}${
		input.beforeSeconds === undefined ? '' : `:before=${input.beforeSeconds}`
	}`;
	const defaultSort = input.orderby === 'id' && input.order === 'desc';
	const sortPart =
		input.complete || defaultSort
			? ''
			: `${input.orderby === undefined ? '' : `:orderby=${input.orderby}`}${
					input.order === undefined ? '' : `:order=${input.order}`
				}`;
	const limitPart = input.complete ? 'all' : input.limit;
	const queryKey = `orders:browser:status=${status}${customerPart}${cashierPart}${storePart}${rangePart}${sortPart}:search=${search}:limit=${limitPart}`;
	const searchPart = search === '' ? '' : `.search.${search}`;
	const requirementId =
		customerPart || cashierPart || storePart || rangePart || sortPart
			? queryKey.replaceAll(':', '.')
			: `orders.browser.status.${status}${searchPart}.limit.${limitPart}`;
	return { queryKey, requirementId };
}

function legacyProductFilterPart(filters: Record<string, unknown>): string {
	const idPart = (field: 'category' | 'tag' | 'brand') => {
		const ids = filters[field] as number[] | undefined;
		if (!ids || ids.length === 0) return '';
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
		filters.stock_status ? `:stock_status=${filters.stock_status as string}` : '',
	].join('');
}

function legacyProductIdentity(descriptor: ProductBrowseWindowDescriptor): {
	queryKey: string;
	requirementId: string;
} {
	const isDefaultSort = descriptor.orderby === 'menu_order' && descriptor.order === 'asc';
	const sortPart = isDefaultSort ? '' : `:orderby=${descriptor.orderby}:order=${descriptor.order}`;
	const filterPart = legacyProductFilterPart(descriptor as unknown as Record<string, unknown>);
	const queryKey = `products:browse-window:limit=${descriptor.limit}${sortPart}${filterPart}`;
	const sortSuffix = isDefaultSort ? '' : `.${descriptor.orderby}.${descriptor.order}`;
	return {
		queryKey,
		requirementId: `products.browse-window.limit.${descriptor.limit}${sortSuffix}${filterPart.replaceAll(':', '.')}`,
	};
}

function legacyCustomerIdentity(descriptor: CustomerBrowseWindowDescriptor): {
	queryKey: string;
	requirementId: string;
} {
	const isDefaultSort = descriptor.orderby === 'id' && descriptor.order === 'asc';
	const sortPart = isDefaultSort ? '' : `:orderby=${descriptor.orderby}:order=${descriptor.order}`;
	const sortSuffix = isDefaultSort ? '' : `.${descriptor.orderby}.${descriptor.order}`;
	return {
		queryKey: `customers:browse-window:limit=${descriptor.limit}${sortPart}`,
		requirementId: `customers.browse-window.limit.${descriptor.limit}${sortSuffix}`,
	};
}

/** The orders DEMAND door's own input shape, for the fixture comparison. */
function orderDemandDimensions(window: OrderBrowseWindowFields): LegacyOrderBrowseDimensions {
	return {
		status: window.status,
		search: window.search,
		limit: window.limit,
		...(window.customerId !== undefined ? { customerId: window.customerId } : {}),
		...(window.cashierId !== undefined ? { cashierId: window.cashierId } : {}),
		...(window.store !== undefined ? { store: window.store } : {}),
		...(window.afterSeconds !== undefined ? { afterSeconds: window.afterSeconds } : {}),
		...(window.beforeSeconds !== undefined ? { beforeSeconds: window.beforeSeconds } : {}),
		...(window.orderby !== undefined ? { orderby: window.orderby } : {}),
		...(window.order !== undefined ? { order: window.order } : {}),
	};
}

describe('the consolidated grammar emits the pre-consolidation bytes', () => {
	it('matches the legacy ORDERS demand-plane encoder across the dimension matrix', () => {
		for (const window of ORDER_DOMAIN) {
			const dims = orderDemandDimensions(window);
			expect(orderBrowserQueryKey(dims as never)).toBe(legacyOrderBrowserDemandKey(dims));
		}
	});

	/**
	 * HALF A SORT PAIR, at both doors.
	 *
	 * The old demand-door encoder short-circuited its sort tail on `orderby === undefined`
	 * ALONE, while the consolidated one short-circuits only when BOTH halves are absent —
	 * which reads like a semantic change and is why this test exists. It is not one: the
	 * pairing REFUSAL above the tail is unchanged, so neither the old nor the new door ever
	 * reaches the tail with half a pair. Both throw, with the same message.
	 *
	 * The SEEDER door is where a half pair is representable, and there both encoders emit the
	 * same one-sided key — which the parser then rejects, so the seed is refused rather than
	 * silently seeding an unsorted lane. Emitting `''` there instead (the demand door's rule)
	 * would DROP the stray `order` and seed the default-sorted window, which is why the two
	 * doors must not be collapsed onto the demand rule.
	 */
	it('refuses half a sort pair at the demand door and one-sided-encodes it at the seeder door', () => {
		for (const half of [
			{ status: 'processing', search: '', limit: 50, order: 'asc' as const },
			{ status: 'processing', search: '', limit: 50, orderby: 'date' as const },
		]) {
			expect(() => legacyOrderBrowserDemandKey(half)).toThrow(
				'orders browse orderby and order must be provided together'
			);
			expect(() => orderBrowserQueryKey(half as never)).toThrow(
				'orders browse orderby and order must be provided together'
			);

			const legacySeeder = legacyOrderSeederIdentity(half);
			expect(ORDER_BROWSE_WINDOW_GRAMMAR.encode(half as OrderBrowseWindowFields)).toBe(
				legacySeeder.queryKey
			);
			expect(ORDER_BROWSE_WINDOW_GRAMMAR.requirementId(half as OrderBrowseWindowFields)).toBe(
				legacySeeder.requirementId
			);
			// One-sided, therefore not a lane identity anything can seed or drain.
			expect(
				ORDER_BROWSE_WINDOW_GRAMMAR.parse(
					ORDER_BROWSE_WINDOW_GRAMMAR.encode(half as OrderBrowseWindowFields)
				)
			).toBeNull();
		}
	});

	it('matches the legacy ORDERS seeder encoder across the dimension matrix', () => {
		for (const window of ORDER_DOMAIN) {
			const legacy = legacyOrderSeederIdentity({
				status: window.status,
				search: window.search,
				limit: window.limit === 'all' ? 10_000 : window.limit,
				...(window.customerId !== undefined ? { customerId: window.customerId } : {}),
				...(window.cashierId !== undefined ? { cashierId: window.cashierId } : {}),
				...(window.store !== undefined ? { store: window.store } : {}),
				...(window.afterSeconds !== undefined ? { afterSeconds: window.afterSeconds } : {}),
				...(window.beforeSeconds !== undefined ? { beforeSeconds: window.beforeSeconds } : {}),
				...(window.orderby !== undefined ? { orderby: window.orderby } : {}),
				...(window.order !== undefined ? { order: window.order } : {}),
				...(window.limit === 'all' ? { complete: true } : {}),
			});
			expect(ORDER_BROWSE_WINDOW_GRAMMAR.encode(window)).toBe(legacy.queryKey);
			expect(ORDER_BROWSE_WINDOW_GRAMMAR.requirementId(window)).toBe(legacy.requirementId);
		}
	});

	it('matches the legacy PRODUCTS seeder encoder across the sort/filter matrix', () => {
		for (const window of PRODUCT_DOMAIN) {
			const legacy = legacyProductIdentity(window);
			expect(PRODUCT_BROWSE_WINDOW_GRAMMAR.encode(window)).toBe(legacy.queryKey);
			expect(PRODUCT_BROWSE_WINDOW_GRAMMAR.requirementId(window)).toBe(legacy.requirementId);
		}
	});

	it('matches the legacy CUSTOMERS seeder encoder across the sort/growth matrix', () => {
		for (const window of CUSTOMER_DOMAIN) {
			const legacy = legacyCustomerIdentity(window);
			expect(CUSTOMER_BROWSE_WINDOW_GRAMMAR.encode(window)).toBe(legacy.queryKey);
			expect(CUSTOMER_BROWSE_WINDOW_GRAMMAR.requirementId(window)).toBe(legacy.requirementId);
		}
	});
});

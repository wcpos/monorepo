import {
	CUSTOMER_BROWSE_WINDOW_DEFAULT_LIMIT,
	CUSTOMER_BROWSE_WINDOW_ORDERBY_VALUES,
	customerBrowseWindowQueryKey,
	customerBrowseWindowQueryKeyFromDimensions,
	isCustomerBrowseWindowQueryKey,
	normalizeCustomerBrowseWindowLimit,
	parseCustomerBrowseWindowDescriptor,
} from './customer-browse-window-descriptor';

describe('customer browse-window descriptor', () => {
	it('keeps the bare limit form for the default (trickle-aligned) sort', () => {
		expect(customerBrowseWindowQueryKey(100)).toBe('customers:browse-window:limit=100');
		expect(customerBrowseWindowQueryKey(100, { orderby: 'id', order: 'asc' })).toBe(
			'customers:browse-window:limit=100'
		);
	});

	it('carries a non-default sort on the key', () => {
		expect(customerBrowseWindowQueryKey(100, { orderby: 'registered_date', order: 'desc' })).toBe(
			'customers:browse-window:limit=100:orderby=registered_date:order=desc'
		);
	});

	it('round-trips every key the encoder can build', () => {
		const sorts: (undefined | { orderby: string; order: 'asc' | 'desc' })[] = [
			undefined,
			{ orderby: 'name', order: 'asc' },
			{ orderby: 'registered_date', order: 'desc' },
			{ orderby: 'id', order: 'desc' },
		];
		for (const sort of sorts) {
			const queryKey = customerBrowseWindowQueryKey(200, sort);
			const descriptor = parseCustomerBrowseWindowDescriptor(queryKey);
			expect(descriptor).not.toBeNull();
			expect(customerBrowseWindowQueryKey(descriptor!.limit, descriptor!)).toBe(queryKey);
		}
	});

	it('rejects a restated default sort so one window has one lane identity', () => {
		expect(
			parseCustomerBrowseWindowDescriptor('customers:browse-window:limit=100:orderby=id:order=asc')
		).toBeNull();
	});

	// #1028 follow-on: the WCPOS plugin proxy now strips these off the inner wc/v3 request and
	// re-applies them through the V1 customer handler (#1488), with role sorted by staff
	// hierarchy (#1500). So they are ordinary supported sorts now — encodable and parseable.
	it('accepts the five sorts the plugin proxy now handles', () => {
		for (const orderby of ['first_name', 'last_name', 'email', 'role', 'username'] as const) {
			expect(customerBrowseWindowQueryKeyFromDimensions({ orderby, order: 'asc' })).toBe(
				`customers:browse-window:limit=100:orderby=${orderby}:order=asc`
			);
			expect(
				parseCustomerBrowseWindowDescriptor(
					`customers:browse-window:limit=100:orderby=${orderby}:order=desc`
				)
			).toEqual({ limit: 100, orderby, order: 'desc' });
		}
		expect(CUSTOMER_BROWSE_WINDOW_ORDERBY_VALUES).toEqual(
			expect.arrayContaining(['first_name', 'last_name', 'email', 'role', 'username'])
		);
	});

	it('does not collide with the customers search or targeted lanes', () => {
		expect(isCustomerBrowseWindowQueryKey('customers:search=smith:limit=25')).toBe(false);
		expect(isCustomerBrowseWindowQueryKey('customers:ids:1,2,3')).toBe(false);
		expect(isCustomerBrowseWindowQueryKey('customers:browse-window:limit=100')).toBe(true);
	});

	it('quantizes the grid limit into window sizes and mints a DISTINCT key per growth (#957)', () => {
		expect(normalizeCustomerBrowseWindowLimit(undefined)).toBe(
			CUSTOMER_BROWSE_WINDOW_DEFAULT_LIMIT
		);
		expect(normalizeCustomerBrowseWindowLimit(10)).toBe(100);
		expect(normalizeCustomerBrowseWindowLimit(100)).toBe(100);
		expect(normalizeCustomerBrowseWindowLimit(110)).toBe(200);
		const keys = [100, 110, 250, 1_010].map((limit) =>
			customerBrowseWindowQueryKeyFromDimensions({ limit })
		);
		expect(new Set(keys).size).toBe(keys.length);
	});

	/**
	 * Every window is a fresh walk from page 1, so a fixed 100-row step would re-read the
	 * previous window each time — quadratic, and unbounded once the cap is gone (R8). Doubling
	 * keeps the total transferred under a constant multiple of the rows actually shown.
	 */
	it('grows geometrically so an uncapped window cannot become quadratic to scroll', () => {
		expect([100, 101, 200, 201, 400, 801, 1_340].map(normalizeCustomerBrowseWindowLimit)).toEqual([
			100, 200, 200, 400, 400, 1_600, 1_600,
		]);

		// Reaching 5,000 rows: sum of the windows walked vs. the rows the grid shows.
		const windows: number[] = [];
		for (let shown = 100; shown <= 5_000; shown += 10) {
			const window = normalizeCustomerBrowseWindowLimit(shown);
			if (windows.at(-1) !== window) windows.push(window);
		}
		expect(windows).toEqual([100, 200, 400, 800, 1_600, 3_200, 6_400]);
		const transferred = windows.reduce((total, window) => total + window, 0);
		expect(transferred).toBeLessThan(4 * 5_000);
		// A fixed 100-row step would have cost 50 lanes and ~127,500 row-reads.
		expect(windows).toHaveLength(7);
	});

	it('has NO record cap — the window keeps growing with the grid (R8)', () => {
		expect(normalizeCustomerBrowseWindowLimit(5_000)).toBe(6_400);
		expect(normalizeCustomerBrowseWindowLimit(24_500)).toBe(25_600);
		expect(customerBrowseWindowQueryKeyFromDimensions({ limit: 12_345 })).toBe(
			'customers:browse-window:limit=12800'
		);
		// The parser is not restricted to the growth curve — a key persisted by any window size
		// still round-trips, which is what keeps older persisted tasks readable.
		expect(parseCustomerBrowseWindowDescriptor('customers:browse-window:limit=99900')?.limit).toBe(
			99_900
		);
	});

	/**
	 * The encoder must never build a key the parser rejects. A one-sided key would seed a task
	 * the drain permanently refuses — and for an out-of-enum orderby it would be the one route
	 * by which a sort wc/v3 cannot accept could reach the wire.
	 */
	it('encoder and parser are mutually inverse over the whole encoder domain', () => {
		for (const orderby of CUSTOMER_BROWSE_WINDOW_ORDERBY_VALUES) {
			for (const order of ['asc', 'desc'] as const) {
				for (const limit of [1, 100, 200, 6_400, 99_901]) {
					const queryKey = customerBrowseWindowQueryKey(limit, { orderby, order });
					const descriptor = parseCustomerBrowseWindowDescriptor(queryKey);
					expect(descriptor).toEqual({ limit, orderby, order });
					expect(customerBrowseWindowQueryKey(descriptor!.limit, descriptor!)).toBe(queryKey);
				}
			}
		}
	});

	it('refuses to encode anything the parser would reject', () => {
		expect(() =>
			customerBrowseWindowQueryKey(100, { orderby: 'date_modified_gmt', order: 'asc' })
		).toThrow(/unsupported customer browse orderby/);
		expect(() => customerBrowseWindowQueryKey(100, { orderby: 'id', order: 'sideways' })).toThrow(
			/unsupported customer browse order/
		);
		expect(() => customerBrowseWindowQueryKey(0)).toThrow(/positive safe integer/);
		expect(() => customerBrowseWindowQueryKey(10.5)).toThrow(/positive safe integer/);
		expect(() => customerBrowseWindowQueryKey(Number.MAX_SAFE_INTEGER + 10)).toThrow(
			/positive safe integer/
		);
	});

	it('requires orderby and order together', () => {
		expect(() => customerBrowseWindowQueryKeyFromDimensions({ orderby: 'name' })).toThrow(
			/together/
		);
		expect(
			parseCustomerBrowseWindowDescriptor('customers:browse-window:limit=100:orderby=name')
		).toBeNull();
	});
});

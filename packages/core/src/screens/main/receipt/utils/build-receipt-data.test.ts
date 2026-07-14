import { mapReceiptData, ReceiptDataSchema } from '@wcpos/printer/encoder';

import { buildReceiptData } from './build-receipt-data';

const mockOrder = {
	id: 123,
	number: '1234',
	status: 'completed',
	currency: 'USD',
	date_created: '2026-03-06T10:00:00',
	total: '25.00',
	total_tax: '2.50',
	discount_total: '5.00',
	shipping_total: '0.00',
	billing: {
		first_name: 'John',
		last_name: 'Doe',
		email: 'john@example.com',
		phone: '555-1234',
		address_1: '123 Main St',
		address_2: '',
		city: 'Springfield',
		state: 'IL',
		postcode: '62701',
		country: 'US',
		company: '',
	},
	shipping: {
		first_name: 'John',
		last_name: 'Doe',
		address_1: '123 Main St',
		address_2: '',
		city: 'Springfield',
		state: 'IL',
		postcode: '62701',
		country: 'US',
		company: '',
		phone: '',
	},
	payment_method: 'pos_cash',
	payment_method_title: 'Cash',
	transaction_id: 'txn_001',
	line_items: [
		{
			id: 1,
			name: 'Widget',
			quantity: 2,
			price: 12.5,
			total: '20.00',
			total_tax: '2.00',
			subtotal: '25.00',
			subtotal_tax: '2.50',
			sku: 'WDG-001',
		},
	],
};

const mockStore = {
	name: 'My POS Store',
	store_address: '456 Commerce Ave',
	store_city: 'Springfield',
	store_state: 'IL',
	store_postcode: '62701',
	store_country: 'US',
	phone: '555-9876',
	email: 'store@example.com',
};

const aliasOrder = {
	...mockOrder,
	total: '24.00',
	total_tax: '4.00',
	discount_total: '5.00',
	discount_tax: '1.00',
	line_items: [
		{
			id: 2,
			name: 'Taxed Widget',
			quantity: 2,
			price: 12.5,
			total: '20.00',
			total_tax: '4.00',
			subtotal: '25.00',
			subtotal_tax: '5.00',
			sku: 'TAX-001',
			meta_data: [{ key: 'color', value: 'red' }],
		},
	],
};

const inclStore = {
	...mockStore,
	tax_display_cart: 'incl',
	prices_include_tax: 'yes',
	locale: 'en_US',
};

const exclStore = {
	...mockStore,
	tax_display_cart: 'excl',
	prices_include_tax: 'no',
	locale: 'en_US',
};

const orderLevelDiscountOrder = {
	...aliasOrder,
	total: '22.00',
	total_tax: '4.00',
	discount_total: '7.00',
	discount_tax: '1.00',
};

const orderWithAdjustments = {
	...aliasOrder,
	fee_lines: [{ name: 'Service Fee', total: '2.00', total_tax: '0.20' }],
	shipping_lines: [{ method_title: 'Flat Rate', total: '3.00', total_tax: '0.30' }],
	coupon_lines: [{ code: 'SPRING', discount: '1.50', discount_tax: '0.15' }],
};

describe('buildReceiptData', () => {
	it('maps order section from order', () => {
		const result = buildReceiptData(mockOrder, mockStore);
		expect(result.order.id).toBe(123);
		expect(result.order.number).toBe('1234');
		expect(result.order.currency).toBe('USD');
		expect(result.order.wc_status).toBe('completed');
		expect(result.order.created.datetime).toBe('2026-03-06T10:00:00');
	});

	it('maps order payment-state fields from order', () => {
		const result = buildReceiptData(
			{
				...mockOrder,
				needs_payment: true,
				payment_url: 'https://example.test/checkout/order-pay/1234',
			},
			mockStore
		);

		expect(result.order.needs_payment).toBe(true);
		expect(result.order.payment_url).toBe('https://example.test/checkout/order-pay/1234');
	});

	it('defaults order payment-state fields when omitted', () => {
		const result = buildReceiptData(mockOrder, mockStore);

		expect(result.order.needs_payment).toBe(false);
		expect(result.order.payment_url).toBe('');
	});

	it('emits a render-time order.printed datetime', () => {
		const result = buildReceiptData(mockOrder, mockStore);
		expect(result.order.printed.datetime).not.toBe('');
		expect(result.order.printed.datetime).toContain(String(new Date().getFullYear()));
	});

	it('formats order.printed in the configured store timezone', () => {
		const printedAt = new Date('2026-03-06T12:34:00Z');
		jest.useFakeTimers();
		jest.setSystemTime(printedAt);

		try {
			// Choose two timezones with a >12h offset so the rendered hour differs
			// regardless of the runtime's local zone.
			const earlyZone = buildReceiptData(mockOrder, { ...mockStore, timezone: 'Pacific/Auckland' });
			const lateZone = buildReceiptData(mockOrder, { ...mockStore, timezone: 'Pacific/Honolulu' });
			expect(earlyZone.order.printed.datetime).not.toBe(lateZone.order.printed.datetime);
		} finally {
			jest.useRealTimers();
		}
	});

	it('falls back when the configured store timezone is invalid', () => {
		const printedAt = new Date('2026-03-06T12:34:00Z');
		jest.useFakeTimers();
		jest.setSystemTime(printedAt);

		try {
			const result = buildReceiptData(mockOrder, { ...mockStore, timezone: 'Invalid/Zone' });
			expect(result.order.printed.datetime).toBe(
				new Intl.DateTimeFormat('en-US', {
					year: 'numeric',
					month: 'short',
					day: 'numeric',
					hour: 'numeric',
					minute: '2-digit',
					hour12: true,
				}).format(printedAt)
			);
		} finally {
			jest.useRealTimers();
		}
	});

	it('falls back to capitalized status_label when no resolver is provided', () => {
		const result = buildReceiptData({ ...mockOrder, status: 'on-hold' }, mockStore);
		expect(result.order.wc_status).toBe('on-hold');
		expect(result.order.status_label).toBe('On Hold');
	});

	it('coerces malformed order status before capitalizing status_label', () => {
		const result = buildReceiptData({ ...mockOrder, status: 123 }, mockStore);
		expect(result.order.wc_status).toBe('123');
		expect(result.order.status_label).toBe('123');
	});

	it('uses the getStatusLabel callback when provided', () => {
		const result = buildReceiptData(mockOrder, mockStore, 2, {
			getStatusLabel: (status) => (status === 'completed' ? 'Terminé' : status),
		});
		expect(result.order.status_label).toBe('Terminé');
	});

	it('uses the capitalized fallback when getStatusLabel returns the raw status', () => {
		// useOrderStatusLabel.getLabel returns the raw status when it has no
		// match — verify we capitalize that fall-through rather than emitting
		// the raw lowercase value.
		const result = buildReceiptData({ ...mockOrder, status: 'pending' }, mockStore, 2, {
			getStatusLabel: (status) => status,
		});
		expect(result.order.status_label).toBe('Pending');
	});

	it('maps store section from store document', () => {
		const result = buildReceiptData(mockOrder, mockStore);
		expect(result.store.name).toBe('My POS Store');
		expect(result.store.phone).toBe('555-9876');
		expect(result.store.email).toBe('store@example.com');
		expect(result.store.address).toContain('456 Commerce Ave');
		expect(result.store.tax_id).toBe('');
		expect(result.store.tax_ids).toEqual([]);
	});

	it('maps customer section from billing', () => {
		const result = buildReceiptData(mockOrder, mockStore);
		expect(result.customer.name).toBe('John Doe');
		expect(result.customer.email).toBe('john@example.com');
		expect(result.customer.phone).toBe('555-1234');
	});

	it('maps line items', () => {
		const result = buildReceiptData(mockOrder, mockStore);
		expect(result.lines).toHaveLength(1);
		expect(result.lines[0].name).toBe('Widget');
		expect(result.lines[0].quantity).toBe(2);
		expect(result.lines[0].price).toBe(12.5);
		expect(result.lines[0].sku).toBe('WDG-001');
		expect(result.lines[0].total).toBe('20.00');
	});

	it('maps totals', () => {
		const result = buildReceiptData(mockOrder, mockStore);
		expect(result.totals.subtotal).toBe('25.00');
		expect(result.totals.total_incl).toBe('25.00');
		expect(result.totals.tax_total).toBe('2.50');
		expect(result.totals.discount_total).toBe('5.00');
	});

	it('exposes item-count summaries in totals', () => {
		const result = buildReceiptData(mockOrder, mockStore);
		// Mock order has a single line item with quantity 2.
		expect(result.totals.total_qty).toBe(2);
		expect(result.totals.line_count).toBe(1);
	});

	it('maps payments', () => {
		const result = buildReceiptData(mockOrder, mockStore);
		expect(result.payments).toHaveLength(1);
		expect(result.payments[0].method).toBe('Cash');
		expect(result.payments[0].amount).toBe('25.00');
		expect(result.payments[0].transaction_id).toBe('txn_001');
	});

	it('handles missing billing gracefully', () => {
		const orderNoBilling = { ...mockOrder, billing: undefined };
		const result = buildReceiptData(orderNoBilling, mockStore);
		expect(result.customer.name).toBe('');
		expect(result.customer.email).toBe('');
	});

	it('handles empty line_items', () => {
		const orderNoLines = { ...mockOrder, line_items: [] };
		const result = buildReceiptData(orderNoLines, mockStore);
		expect(result.lines).toHaveLength(0);
		expect(result.totals.subtotal).toBe('0.00');
	});

	it('handles malformed subtotal without producing NaN', () => {
		const orderBadSubtotal = {
			...mockOrder,
			line_items: [
				{ ...mockOrder.line_items[0], subtotal: 'not-a-number' },
				{ ...mockOrder.line_items[0], subtotal: '10.00' },
			],
		};
		const result = buildReceiptData(orderBadSubtotal, mockStore);
		expect(result.totals.subtotal).toBe('10.00');
	});

	it('formats tax_total using the requested decimal precision', () => {
		const result = buildReceiptData({ ...mockOrder, total_tax: '2.5' }, mockStore, 3);
		expect(result.totals.tax_total).toBe('2.500');
	});

	it('adds display aliases and hints for tax-inclusive cart display', () => {
		const result = buildReceiptData(aliasOrder, inclStore);
		const line = result.lines[0];

		expect(line.unit_price).toBe('15.00');
		expect(line.line_subtotal).toBe('30.00');
		expect(line.discounts).toBe('6.00');
		expect(line.line_total).toBe('24.00');
		expect(line.meta).toEqual([{ key: 'color', value: 'red' }]);

		expect(result.totals.subtotal).toBe('30.00');
		expect(result.totals.discount_total).toBe('6.00');
		expect(result.totals.total).toBe('24.00');
		expect(result.presentation_hints.display_tax).toBe('incl');
		expect(result.presentation_hints.prices_entered_with_tax).toBe(true);
		expect(result.presentation_hints.locale).toBe('en_US');
	});

	it('adds display aliases for tax-exclusive cart display', () => {
		const result = buildReceiptData(aliasOrder, exclStore);
		const line = result.lines[0];

		expect(line.unit_price).toBe('12.50');
		expect(line.line_subtotal).toBe('25.00');
		expect(line.discounts).toBe('5.00');
		expect(line.line_total).toBe('20.00');
		expect(line.meta).toEqual([{ key: 'color', value: 'red' }]);

		expect(result.totals.subtotal).toBe('25.00');
		expect(result.totals.discount_total).toBe('5.00');
		expect(result.totals.total).toBe('20.00');
		expect(result.presentation_hints.display_tax).toBe('excl');
		expect(result.presentation_hints.prices_entered_with_tax).toBe(false);
	});

	it('uses order-level discount totals when they differ from summed line discounts', () => {
		const inclResult = buildReceiptData(orderLevelDiscountOrder, inclStore);
		const exclResult = buildReceiptData(orderLevelDiscountOrder, exclStore);

		expect(inclResult.lines[0].discounts).toBe('6.00');
		expect(exclResult.lines[0].discounts).toBe('5.00');

		expect(inclResult.totals.discount_total).toBe('8.00');
		expect(inclResult.totals.discount_total_incl).toBe('8.00');
		expect(inclResult.totals.discount_total_excl).toBe('7.00');

		expect(exclResult.totals.discount_total).toBe('7.00');
		expect(exclResult.totals.discount_total_incl).toBe('8.00');
		expect(exclResult.totals.discount_total_excl).toBe('7.00');
	});

	describe('store.tax_ids mapping', () => {
		it('defaults tax_id to empty string and tax_ids to [] when tax_ids is missing', () => {
			const storeNoTaxIds = { ...mockStore };
			const result = buildReceiptData(mockOrder, storeNoTaxIds);
			expect(result.store.tax_id).toBe('');
			expect(result.store.tax_ids).toEqual([]);
		});

		it('defaults tax_id to empty string and tax_ids to [] when tax_ids is an empty array', () => {
			const storeEmptyTaxIds = { ...mockStore, tax_ids: [] };
			const result = buildReceiptData(mockOrder, storeEmptyTaxIds);
			expect(result.store.tax_id).toBe('');
			expect(result.store.tax_ids).toEqual([]);
		});

		it('derives tax_id from the first entry and preserves the full tax_ids array', () => {
			const taxIds = [
				{ type: 'eu_vat', value: 'DE123', country: 'DE' },
				{ type: 'de_steuernummer', value: '05/123/45678', country: 'DE' },
			];
			const storeWithTaxIds = { ...mockStore, tax_ids: taxIds };
			const result = buildReceiptData(mockOrder, storeWithTaxIds);
			expect(result.store.tax_id).toBe('DE123');
			expect(result.store.tax_ids).toEqual(taxIds);
		});
	});

	it('serializes fee, shipping, and coupon rows for offline templates', () => {
		const inclResult = buildReceiptData(orderWithAdjustments, inclStore);
		const exclResult = buildReceiptData(orderWithAdjustments, exclStore);

		expect(inclResult.fees).toEqual([
			{ label: 'Service Fee', total: '2.20', total_incl: '2.20', total_excl: '2.00' },
		]);
		expect(inclResult.shipping).toEqual([
			{ label: 'Flat Rate', total: '3.30', total_incl: '3.30', total_excl: '3.00' },
		]);
		expect(inclResult.discounts).toEqual([
			{ label: 'SPRING', total: '1.65', total_incl: '1.65', total_excl: '1.50' },
		]);

		expect(exclResult.fees).toEqual([
			{ label: 'Service Fee', total: '2.00', total_incl: '2.20', total_excl: '2.00' },
		]);
		expect(exclResult.shipping).toEqual([
			{ label: 'Flat Rate', total: '3.00', total_incl: '3.30', total_excl: '3.00' },
		]);
		expect(exclResult.discounts).toEqual([
			{ label: 'SPRING', total: '1.50', total_incl: '1.65', total_excl: '1.50' },
		]);
	});

	describe('tax summary and tax section', () => {
		// Mirrors a UK order with two rates (VAT 20% + Surcharge 2%) applied to
		// a single 35.00 line — the shape produced by WC REST orders.
		const orderWithTaxLines = {
			...mockOrder,
			total: '42.84',
			total_tax: '7.84',
			discount_total: '0.00',
			line_items: [
				{
					id: 3,
					name: 'Hoodie with Pocket',
					quantity: 1,
					price: 35,
					total: '35.00',
					total_tax: '7.84',
					subtotal: '45.00',
					subtotal_tax: '9.84',
					sku: 'woo-hoodie-with-pocket',
					taxes: [
						{ id: 10, total: '7.00', subtotal: '9.00' },
						{ id: 7, total: '0.84', subtotal: '1.08' },
					],
				},
			],
			tax_lines: [
				{
					id: 100,
					rate_code: 'GB-VAT-1',
					rate_id: 10,
					label: 'VAT',
					compound: false,
					tax_total: '7.00',
					shipping_tax_total: '0.00',
					rate_percent: 20,
				},
				{
					id: 101,
					rate_code: 'GB-SURCHARGE-2',
					rate_id: 7,
					label: 'Surcharge',
					compound: true,
					tax_total: '0.84',
					shipping_tax_total: '0.00',
					rate_percent: 2,
				},
			],
		};
		const taxStore = { ...inclStore, calc_taxes: 'yes', tax_total_display: 'itemized' };

		it('builds per-rate tax_summary rows from tax_lines with taxable bases', () => {
			const result = buildReceiptData(orderWithTaxLines, taxStore);

			expect(result.has_tax_summary).toBe(true);
			expect(result.tax_summary).toEqual([
				{
					code: '10',
					rate: 20,
					label: 'VAT',
					compound: false,
					taxable_amount_excl: 35,
					tax_amount: 7,
					taxable_amount_incl: 42,
				},
				{
					code: '7',
					rate: 2,
					label: 'Surcharge',
					compound: true,
					taxable_amount_excl: 35,
					tax_amount: 0.84,
					taxable_amount_incl: 35.84,
				},
			]);
		});

		it('includes shipping tax in tax_amount and shipping lines in taxable bases', () => {
			const order = {
				...orderWithTaxLines,
				shipping_lines: [
					{
						method_title: 'Flat Rate',
						total: '5.00',
						total_tax: '1.00',
						taxes: [{ id: 10, total: '1.00', subtotal: '1.00' }],
					},
				],
				tax_lines: [
					{
						rate_id: 10,
						label: 'VAT',
						compound: false,
						tax_total: '7.00',
						shipping_tax_total: '1.00',
						rate_percent: 20,
					},
				],
			};

			const result = buildReceiptData(order, taxStore);

			expect(result.tax_summary).toHaveLength(1);
			expect(result.tax_summary[0].tax_amount).toBe(8);
			expect(result.tax_summary[0].taxable_amount_excl).toBe(40);
			expect(result.tax_summary[0].taxable_amount_incl).toBe(48);
		});

		it('skips empty-string tax totals when summing taxable bases', () => {
			const order = {
				...orderWithTaxLines,
				line_items: [
					{
						...orderWithTaxLines.line_items[0],
						taxes: [
							{ id: 10, total: '7.00', subtotal: '9.00' },
							{ id: 7, total: '', subtotal: '' },
						],
					},
				],
			};

			const result = buildReceiptData(order, taxStore);
			const surcharge = result.tax_summary.find((row) => row.code === '7');

			expect(surcharge?.taxable_amount_excl).toBeNull();
			expect(surcharge?.taxable_amount_incl).toBeNull();
		});

		it('emits rate null when rate_percent is missing', () => {
			const order = {
				...orderWithTaxLines,
				tax_lines: [{ rate_id: 10, label: 'VAT', tax_total: '7.00', shipping_tax_total: '0.00' }],
			};

			const result = buildReceiptData(order, taxStore);

			expect(result.tax_summary[0].rate).toBeNull();
		});

		it('returns empty tax_summary and has_tax_summary false without tax_lines', () => {
			const result = buildReceiptData(mockOrder, taxStore);

			expect(result.tax_summary).toEqual([]);
			expect(result.has_tax_summary).toBe(false);
		});

		it('builds the tax section from store settings', () => {
			const result = buildReceiptData(orderWithTaxLines, taxStore);

			expect(result.tax).toEqual({
				display: 'incl',
				display_incl: true,
				display_excl: false,
				breakdown: 'itemized',
				breakdown_hidden: false,
				breakdown_single: false,
				breakdown_itemized: true,
			});
		});

		it('hides the tax breakdown when taxes are disabled', () => {
			const result = buildReceiptData(orderWithTaxLines, {
				...exclStore,
				calc_taxes: 'no',
				tax_total_display: 'itemized',
			});

			expect(result.tax.display).toBe('excl');
			expect(result.tax.breakdown).toBe('hidden');
			expect(result.tax.breakdown_hidden).toBe(true);
		});

		it('defaults breakdown to itemized when tax_total_display is invalid', () => {
			const result = buildReceiptData(orderWithTaxLines, {
				...inclStore,
				calc_taxes: 'yes',
				tax_total_display: 'bogus',
			});

			expect(result.tax.breakdown).toBe('itemized');
		});
	});

	describe('Receipt Data v1.1 savings', () => {
		const posData = (price: number, regularPrice: number, taxStatus = 'taxable') => ({
			key: '_woocommerce_pos_data',
			value: JSON.stringify({ price, regular_price: regularPrice, tax_status: taxStatus }),
		});

		it('builds on-sale prices and savings on both tax bases and parses canonically', () => {
			const result = buildReceiptData(
				{
					...aliasOrder,
					line_items: [
						{
							...aliasOrder.line_items[0],
							meta_data: [posData(15, 18)],
						},
					],
				},
				inclStore
			);

			expect(result.lines[0]).toMatchObject({
				regular_price: '18.00',
				regular_price_incl: '18.00',
				regular_price_excl: '15.00',
				selling_price: '15.00',
				selling_price_incl: '15.00',
				selling_price_excl: '12.50',
				unit_savings: '3.00',
				unit_savings_incl: '3.00',
				unit_savings_excl: '2.50',
				line_regular_total_incl: '36.00',
				line_regular_total_excl: '30.00',
				line_selling_total_incl: '30.00',
				line_selling_total_excl: '25.00',
				line_savings: '6.00',
				line_savings_incl: '6.00',
				line_savings_excl: '5.00',
				savings_in_discounts: false,
			});
			expect(result.totals).toMatchObject({
				sale_savings_total: '6.00',
				sale_savings_total_incl: '6.00',
				sale_savings_total_excl: '5.00',
				total_saved: '12.00',
				total_saved_incl: '12.00',
				total_saved_excl: '10.00',
				total_saved_complete: true,
			});

			const canonical = mapReceiptData(result as unknown as Record<string, unknown>);
			const parsed = ReceiptDataSchema.safeParse(canonical);
			if (!parsed.success) throw new Error(parsed.error.message);
			expect(parsed.success).toBe(true);
		});

		it('converts recorded prices on the order tax basis, not the store setting', () => {
			const result = buildReceiptData(
				{
					...aliasOrder,
					prices_include_tax: false,
					line_items: [
						{
							...aliasOrder.line_items[0],
							meta_data: [posData(12.5, 15)],
						},
					],
				},
				inclStore
			);

			// Recorded prices are exclusive (the order's basis) even though the
			// store currently enters prices inclusive: incl = value * 30 / 25.
			expect(result.lines[0]).toMatchObject({
				regular_price_incl: '18.00',
				regular_price_excl: '15.00',
				selling_price_incl: '15.00',
				selling_price_excl: '12.50',
				unit_savings_incl: '3.00',
				unit_savings_excl: '2.50',
			});
			expect(result.totals).toMatchObject({
				sale_savings_total_incl: '6.00',
				sale_savings_total_excl: '5.00',
				total_saved_complete: true,
			});
		});

		it('preserves unknown savings when a line has no valid POS price metadata', () => {
			const result = buildReceiptData(
				{
					...aliasOrder,
					line_items: [
						{ ...aliasOrder.line_items[0], id: 1, meta_data: [posData(15, 18)] },
						{
							...aliasOrder.line_items[0],
							id: 2,
							quantity: 1,
							total: '10.00',
							total_tax: '2.00',
							subtotal: '10.00',
							subtotal_tax: '2.00',
							meta_data: [
								{
									key: '_woocommerce_pos_data',
									value: '{"price":10,"regular_price":"0x10","tax_status":"taxable"}',
								},
							],
						},
					],
				},
				inclStore
			);

			expect(result.lines[1]).toMatchObject({
				regular_price: null,
				regular_price_incl: null,
				regular_price_excl: null,
				selling_price: '12.00',
				selling_price_incl: '12.00',
				selling_price_excl: '10.00',
				unit_savings: null,
				line_savings: null,
			});
			expect(result.totals).toMatchObject({
				sale_savings_total: null,
				sale_savings_total_incl: null,
				sale_savings_total_excl: null,
				total_saved: null,
				total_saved_incl: null,
				total_saved_excl: null,
				total_saved_complete: false,
			});
		});

		it('emits known zero savings when recorded regular and selling prices match', () => {
			const result = buildReceiptData(
				{
					...mockOrder,
					line_items: [
						{
							...mockOrder.line_items[0],
							total: '25.00',
							total_tax: '2.50',
							meta_data: [posData(12.5, 12.5, 'none')],
						},
					],
				},
				exclStore
			);

			expect(result.lines[0]).toMatchObject({
				unit_savings: '0.00',
				unit_savings_incl: '0.00',
				unit_savings_excl: '0.00',
				line_savings: '0.00',
				line_savings_incl: '0.00',
				line_savings_excl: '0.00',
			});
			expect(result.totals.sale_savings_total).toBe('0.00');
		});

		it('detects legacy savings already included in WooCommerce discounts', () => {
			const result = buildReceiptData(
				{
					...mockOrder,
					total: '14.50',
					total_tax: '0.00',
					discount_total: '2.50',
					discount_tax: '0.00',
					line_items: [
						{
							...mockOrder.line_items[0],
							quantity: 1,
							subtotal: '17.00',
							subtotal_tax: '0.00',
							total: '14.50',
							total_tax: '0.00',
							meta_data: [posData(14.5, 17, 'none')],
						},
					],
				},
				exclStore
			);

			expect(result.lines[0].savings_in_discounts).toBe(true);
			expect(result.totals.sale_savings_total).toBe('2.50');
			expect(result.totals.total_saved).toBe('2.50');
			expect(result.totals.total_saved_complete).toBe(true);
		});

		it('converts recorded prices excl-to-incl and keeps tax-status none unchanged', () => {
			const taxable = buildReceiptData(
				{
					...aliasOrder,
					line_items: [{ ...aliasOrder.line_items[0], meta_data: [posData(12.5, 15)] }],
				},
				exclStore
			);
			const nonTaxable = buildReceiptData(
				{
					...aliasOrder,
					line_items: [{ ...aliasOrder.line_items[0], meta_data: [posData(12.5, 15, 'none')] }],
				},
				exclStore
			);

			expect(taxable.lines[0]).toMatchObject({
				regular_price_incl: '18.00',
				regular_price_excl: '15.00',
				selling_price_incl: '15.00',
				selling_price_excl: '12.50',
			});
			expect(nonTaxable.lines[0]).toMatchObject({
				regular_price_incl: '15.00',
				regular_price_excl: '15.00',
				selling_price_incl: '12.50',
				selling_price_excl: '12.50',
			});
		});
	});
});

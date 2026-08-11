import { createCustomerDisplayState, createIdleCustomerDisplayState } from './create-snapshot';

describe('createCustomerDisplayState', () => {
	it('projects the exact customer-safe V1 state and preserves decimal strings', () => {
		const state = createCustomerDisplayState({
			status: 'cart',
			currencyCode: 'BHD',
			currencySymbol: 'BD',
			decimalPlaces: 3,
			pricesIncludeTax: true,
			lineItems: [
				{
					productId: 10,
					name: 'Coffee',
					quantity: 2,
					price: '1.125',
					subtotal: '2.250',
					subtotalTax: '0.225',
					total: '2.000',
					totalTax: '0.200',
					image: { src: 'https://user:password@example.test/coffee.jpg?token=private#hash' },
				},
			],
			feeLines: [{ name: 'Service', total: '0.500', totalTax: '0.050' }],
			shippingLines: [{ methodId: 'pickup', name: 'Pickup', total: '0.000', totalTax: '0.000' }],
			totals: {
				subtotal: '2.250',
				subtotalTax: '0.225',
				discount: '0.250',
				discountTax: '0.025',
				fee: '0.500',
				feeTax: '0.050',
				shipping: '0.000',
				shippingTax: '0.000',
				tax: '0.250',
				total: '2.750',
			},
		});

		expect(state).toEqual({
			status: 'cart',
			currency: {
				code: 'BHD',
				symbol: 'BD',
				decimalPlaces: 3,
				pricesIncludeTax: true,
			},
			items: [
				{
					name: 'Coffee',
					quantity: 2,
					price: '1.125',
					subtotal: '2.250',
					subtotalTax: '0.225',
					total: '2.000',
					totalTax: '0.200',
					imageUrl: 'https://example.test/coffee.jpg',
				},
			],
			fees: [{ name: 'Service', total: '0.500', totalTax: '0.050' }],
			shipping: [{ name: 'Pickup', total: '0.000', totalTax: '0.000' }],
			totals: {
				subtotal: '2.250',
				subtotalTax: '0.225',
				discount: '0.250',
				discountTax: '0.025',
				fee: '0.500',
				feeTax: '0.050',
				shipping: '0.000',
				shippingTax: '0.000',
				tax: '0.250',
				total: '2.750',
			},
		});
	});

	it('filters tombstones and never serializes private or internal source fields', () => {
		const source = {
			status: 'awaiting-payment' as const,
			currencyCode: 'USD',
			lineItems: [
				{
					productId: null,
					name: 'Deleted',
					quantity: 1,
				},
				{
					productId: 20,
					name: 'Visible',
					quantity: 1,
					price: '5',
					subtotal: '5',
					subtotalTax: '0',
					total: '5',
					totalTax: '0',
					sku: 'SECRET-SKU',
					meta_data: [{ key: 'cost', value: '1' }],
					cost_of_goods_sold: { value: 1 },
				},
			],
			feeLines: [{ name: null, total: '99' }],
			shippingLines: [{ methodId: null, name: 'Deleted shipping', total: '99' }],
			billing: { email: 'private@example.test', phone: '555-0100' },
			customer_note: 'private note',
			coupon_lines: [{ code: 'SECRET' }],
			payment_url: 'https://pay.example.test/private',
			transaction_id: 'private-transaction',
		};

		const serialized = JSON.stringify(createCustomerDisplayState(source));
		expect(serialized).toContain('Visible');
		for (const privateValue of [
			'Deleted',
			'SECRET-SKU',
			'cost',
			'private@example.test',
			'555-0100',
			'private note',
			'SECRET',
			'pay.example.test',
			'private-transaction',
		]) {
			expect(serialized).not.toContain(privateValue);
		}
	});

	it('creates a customer-safe idle state', () => {
		expect(createIdleCustomerDisplayState()).toMatchObject({
			status: 'idle',
			items: [],
			fees: [],
			shipping: [],
			totals: { total: '0' },
		});
	});

	it('normalizes absent labels and invalid numeric formats without dropping active lines', () => {
		const state = createCustomerDisplayState({
			status: 'cart',
			lineItems: [
				{ productId: 1, quantity: 0, price: '0x10', total: '1e3' },
				{ productId: 2, quantity: undefined, subtotal: '999999999999999999999999.99' },
			],
			feeLines: [{ name: undefined }],
			shippingLines: [{ methodId: undefined, name: undefined }],
		});

		expect(state.items).toHaveLength(2);
		expect(state.items[0]).toMatchObject({ name: '', quantity: 0, price: '0', total: '0' });
		expect(state.items[1]).toMatchObject({
			name: '',
			quantity: 0,
			subtotal: '999999999999999999999999.99',
		});
		expect(state.fees).toEqual([{ name: '', total: '0', totalTax: '0' }]);
		expect(state.shipping).toEqual([{ name: '', total: '0', totalTax: '0' }]);
	});
});

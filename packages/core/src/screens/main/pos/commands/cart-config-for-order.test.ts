import { orderTaxLocation } from './cart-config-for-order';

const base = { country: 'US', state: 'CA', city: 'LA', postcode: '90001' };

describe('orderTaxLocation', () => {
	it('uses the billing address when tax is based on shipping and the shipping country is empty', () => {
		const result = orderTaxLocation(base, 'shipping', {
			billing: { country: 'GB', state: '', city: 'London', postcode: 'N1' },
			shipping: { country: '', state: '', city: '', postcode: '' },
		});

		expect(result.location).toEqual({ country: 'GB', state: '', city: 'London', postcode: 'N1' });
		expect(result.addressUsed).toBe('billing');
		expect(result.taxBasedOn).toBe('shipping');
	});

	it('uses the shop base when neither order address has a country', () => {
		const result = orderTaxLocation(base, 'shipping', {
			billing: { country: '', state: 'NY' },
			shipping: { country: '', state: '', city: '', postcode: '' },
		});

		expect(result.location).toEqual(base);
		expect(result.addressUsed).toBe('base');
	});

	it('uses the shop base when tax is based on billing and the billing country is empty', () => {
		const result = orderTaxLocation(base, 'billing', {
			billing: { country: '', postcode: 'N1' },
			shipping: { country: 'GB' },
		});

		expect(result.location).toEqual(base);
		expect(result.addressUsed).toBe('base');
	});

	it('follows a meta override to billing and falls back from it', () => {
		const result = orderTaxLocation(base, 'shipping', {
			meta_data: [{ key: '_woocommerce_pos_tax_based_on', value: 'billing' }],
			billing: { country: '' },
			shipping: { country: 'GB' },
		});

		expect(result.taxBasedOn).toBe('billing');
		expect(result.location).toEqual(base);
		expect(result.addressUsed).toBe('base');
	});

	it('keeps the shipping address once it has a country', () => {
		const result = orderTaxLocation(base, 'shipping', {
			billing: { country: 'FR' },
			shipping: { country: 'GB' },
		});

		expect(result.location.country).toBe('GB');
		expect(result.addressUsed).toBe('shipping');
	});

	it('uses the shop base without an order', () => {
		const result = orderTaxLocation(base, 'shipping');

		expect(result.location).toEqual(base);
		expect(result.addressUsed).toBe('base');
	});
});

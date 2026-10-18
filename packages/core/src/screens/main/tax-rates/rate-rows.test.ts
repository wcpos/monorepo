import { locationField, phoneLocation, phoneTags, rateCount, rateTags } from './rate-rows';

import type { TaxRateData } from '../contexts/tax-rates';

const t = (key: string, options?: Record<string, unknown>) =>
	options ? `${key} ${JSON.stringify(options)}` : key;

const rate = (fields: Partial<TaxRateData>) =>
	({
		id: 1,
		name: 'VAT',
		rate: '20.0000',
		class: 'standard',
		country: 'GB',
		state: '',
		postcodes: [],
		cities: [],
		priority: 1,
		compound: false,
		shipping: true,
		order: 0,
		...fields,
	}) as TaxRateData;

describe('locationField', () => {
	it("reads WooCommerce's empty fields as any, and keeps what is stored", () => {
		expect(locationField('')).toBeNull();
		expect(locationField([])).toBeNull();
		expect(locationField(undefined)).toBeNull();
		expect(locationField('AL')).toBe('AL');
		expect(locationField(['12345', '972*'])).toBe('12345, 972*');
	});
});

describe('rateTags', () => {
	it('says nothing for the defaults', () => {
		expect(rateTags(rate({}), t)).toBe('');
	});

	it('names compound and not-on-shipping, in that order', () => {
		expect(rateTags(rate({ compound: true }), t)).toBe('tax_rates.compound');
		expect(rateTags(rate({ compound: true, shipping: false }), t)).toBe(
			'tax_rates.compound · tax_rates.not_on_shipping'
		);
	});
});

describe('phoneLocation', () => {
	it('says any state, postcode or city when nothing narrows the country', () => {
		expect(phoneLocation(rate({}), t)).toBe('GB · tax_rates.any_location');
	});

	it('lists what narrows it, with any state when only a postcode or city does', () => {
		expect(
			phoneLocation(rate({ country: 'US', state: 'AL', postcodes: ['12345', '123456'] }), t)
		).toBe('US · AL · 12345, 123456');
		expect(phoneLocation(rate({ cities: ['PORTLAND'] }), t)).toBe(
			'GB · tax_rates.any_state · PORTLAND'
		);
	});

	it('reads a worldwide rate as any country', () => {
		expect(phoneLocation(rate({ country: '' }), t)).toBe('tax_rates.any · tax_rates.any_location');
	});
});

describe('phoneTags', () => {
	it('adds the priority only when it is not the default', () => {
		expect(phoneTags(rate({}), t)).toBe('');
		expect(phoneTags(rate({ compound: true, priority: 2 }), t)).toBe(
			'tax_rates.compound · tax_rates.priority_n {"n":2}'
		);
	});
});

describe('rateCount', () => {
	it('is a plain count when nothing vouches or the device holds every vouched rate', () => {
		expect(rateCount(6, null, t)).toBe('tax_rates.count {"count":6,"n":"6"}');
		expect(rateCount(6, 6, t)).toBe('tax_rates.count {"count":6,"n":"6"}');
	});

	it('says how many are synced while behind', () => {
		expect(rateCount(2, 48, t)).toBe('tax_rates.count_synced {"synced":"2","total":"48"}');
	});
});

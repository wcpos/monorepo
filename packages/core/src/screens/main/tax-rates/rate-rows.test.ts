import {
	appliesCount,
	isApplied,
	locationField,
	matchedRateIds,
	parseAppliesAddress,
	phoneLocation,
	phoneTags,
	rateCount,
	rateTags,
} from './rate-rows';

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

describe('parseAppliesAddress', () => {
	it('reads no applies as opened from elsewhere: no marks', () => {
		expect(parseAppliesAddress({})).toBeNull();
		expect(parseAppliesAddress({ country: 'GB' })).toBeNull();
	});

	it('reads the four fields, empty where the panel sent none', () => {
		expect(parseAppliesAddress({ applies: '1', country: 'US', postcode: ['97201', 'x'] })).toEqual({
			country: 'US',
			state: '',
			city: '',
			postcode: '97201',
		});
	});
});

describe('matchedRateIds', () => {
	const portland = { country: 'US', state: 'OR', city: 'Portland', postcode: '97201' };

	it('matches the current rates with the shared matcher, a postcode pattern included', () => {
		const rates = [
			rate({ id: 1, country: 'US', state: 'OR' }),
			rate({ id: 2, country: 'US', state: 'OR', postcodes: ['972*'], priority: 2 }),
			rate({ id: 3, country: 'US', state: 'CA' }),
			rate({ id: 4, country: 'GB' }),
		];
		expect(matchedRateIds(rates, portland)).toEqual(new Set([1, 2]));
	});

	it('matches nothing for an address the store has no rate for', () => {
		expect(matchedRateIds([rate({ country: 'GB' })], { ...portland, country: 'IS' })).toEqual(
			new Set()
		);
	});
});

describe('appliesCount', () => {
	it('counts with the country in brackets, and without them when there is none', () => {
		expect(appliesCount(2, 'GB', t)).toBe(
			'tax_rates.count_applies {"count":2,"n":"2","country":"GB"}'
		);
		expect(appliesCount(1, '', t)).toBe('tax_rates.count_applies_no_country {"count":1,"n":"1"}');
	});

	it('says none apply rather than 0', () => {
		expect(appliesCount(0, 'IS', t)).toBe('tax_rates.count_applies_none {"country":"IS"}');
		expect(appliesCount(0, '', t)).toBe('tax_rates.count_applies_none_no_country');
	});
});

it('marks a rate only when the panel sent its id', () => {
	expect(isApplied(new Set([1]), rate({ id: 1 }))).toBe(true);
	expect(isApplied(new Set([1]), rate({ id: 2 }))).toBe(false);
	expect(isApplied(null, rate({ id: 1 }))).toBe(false);
});

import { createCartConfig } from '@wcpos/order-math';

import {
	classLedgers,
	derivationFailure,
	postalLine,
	rateWhy,
	roundPercent,
} from './tax-derivation';

import type { TaxRateData } from '../../../contexts/tax-rates';

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

const portland = { country: 'US', state: 'OR', city: 'Portland', postcode: '97201' };

const config = (rates: TaxRateData[]) =>
	createCartConfig({
		rates: rates as never,
		allRates: rates as never,
		calcTaxes: true,
		pricesIncludeTax: false,
		taxRoundAtSubtotal: false,
		dp: 2,
		shippingTaxClass: 'standard',
		taxClassSlugs: ['standard', 'reduced-rate'],
		calcDiscountsSequentially: false,
	});

describe('rateWhy', () => {
	it('names the postcode pattern that matched, then city, then state, then the country', () => {
		expect(rateWhy(rate({ postcodes: ['970*', '972*'], cities: ['PORTLAND'] }), portland)).toEqual({
			field: 'postcode',
			pattern: '972*',
		});
		expect(rateWhy(rate({ cities: ['PORTLAND'], state: 'OR' }), portland)).toEqual({
			field: 'city',
		});
		expect(rateWhy(rate({ state: 'OR' }), portland)).toEqual({ field: 'state' });
		expect(rateWhy(rate({ country: 'US' }), portland)).toEqual({
			field: 'country',
			country: 'US',
		});
		// A worldwide rate is "anywhere", never pinned to the address's own country.
		expect(rateWhy(rate({ country: '' }), portland)).toEqual({ field: 'anywhere' });
	});

	it('reads a range pattern through the shared postcode expansion', () => {
		expect(rateWhy(rate({ postcodes: ['97200...97210'] }), portland)).toEqual({
			field: 'postcode',
			pattern: '97200...97210',
		});
	});
});

it('rounds a percentage to four places so trailing zeros fall away', () => {
	expect(roundPercent(20)).toBe(20);
	expect(roundPercent(1.125)).toBe(1.125);
	expect(roundPercent(4.72500000001)).toBe(4.725);
	expect(String(roundPercent(parseFloat('20.0000')))).toBe('20');
});

describe('classLedgers', () => {
	it('orders classes as the store lists them and takes each sum from the cart engine', () => {
		const rates = [
			rate({ id: 3, name: 'Reduced VAT', rate: '5.0000', class: 'reduced-rate' }),
			rate({ id: 1, name: 'VAT', priority: 1 }),
			// Compound at a later priority: 2% of the VAT-inclusive 120, not of 100.
			rate({ id: 2, name: 'Surcharge', rate: '2.0000', priority: 2, compound: true }),
		];
		const ledgers = classLedgers(
			rates,
			[
				{ slug: 'standard', name: 'Standard rate' },
				{ slug: 'reduced-rate', name: 'Reduced rate' },
			],
			{ country: 'GB', state: '', city: '', postcode: '' },
			config(rates)
		);
		expect(ledgers.map((ledger) => [ledger.name, ledger.percent])).toEqual([
			['Standard rate', 22.4],
			['Reduced rate', 5],
		]);
		expect(ledgers[0].rates.map(({ rate: r }) => r.name)).toEqual(['VAT', 'Surcharge']);
	});

	it('falls back to the slug for a class the store list does not name', () => {
		const rates = [rate({ class: 'zero-rate', rate: '0.0000' })];
		const [ledger] = classLedgers(rates, [], portland, config(rates));
		expect(ledger).toMatchObject({ slug: 'zero-rate', name: 'zero-rate', percent: 0 });
	});
});

describe('derivationFailure', () => {
	const empty = { country: '', state: '', city: '', postcode: '' };

	it('breaks at the address when the order has none of the four fields', () => {
		expect(derivationFailure(empty, true, 0)).toBe('address');
	});

	it('breaks at the rates when an address matched nothing', () => {
		expect(derivationFailure({ ...empty, country: 'IS', postcode: '101' }, true, 0)).toBe('rates');
	});

	it('does not fail a missing state that still matched a country-wide rate', () => {
		expect(derivationFailure({ ...portland, state: '' }, true, 1)).toBeNull();
	});

	it('never blames the order for the shop base address', () => {
		expect(derivationFailure(empty, false, 0)).toBe('rates');
	});
});

it('writes the postal line from whatever fields exist', () => {
	expect(postalLine({ ...portland, state: 'OR' }, 'United States (US)')).toBe(
		'Portland OR 97201, United States (US)'
	);
	expect(
		postalLine({ country: 'GB', state: '', city: '', postcode: '' }, 'United Kingdom (UK)')
	).toBe('United Kingdom (UK)');
});

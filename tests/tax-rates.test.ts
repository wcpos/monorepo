import { filterTaxRates } from '../src/hooks/tax-rates.helpers';

type TaxRate = import('@wcpos/database').TaxRateDocument;

describe('filterTaxRates', () => {
	let taxRates: TaxRate[];

	beforeEach(() => {
		// Sample tax rates data setup
		taxRates = [
			{
				id: '72',
				country: 'US',
				state: 'AL',
				postcode: '35041',
				city: 'Cardiff',
				postcodes: ['35014', '35036', '35041'],
				cities: ['Alpine', 'Brookside', 'Cardiff'],
				rate: '4.0000',
				name: 'State Tax',
				priority: 0,
				compound: false,
				shipping: false,
				order: 1,
				class: 'standard',
				_links: {
					self: [
						{
							href: 'https://example.com/wp-json/wc/v3/taxes/72',
						},
					],
					collection: [
						{
							href: 'https://example.com/wp-json/wc/v3/taxes',
						},
					],
				},
			},
			{
				id: '73',
				country: 'US',
				state: 'AZ',
				postcode: '',
				city: '',
				postcodes: [],
				cities: [],
				rate: '5.6000',
				name: 'State Tax',
				priority: 0,
				compound: false,
				shipping: false,
				order: 2,
				class: 'standard',
				_links: {
					self: [
						{
							href: 'https://example.com/wp-json/wc/v3/taxes/73',
						},
					],
					collection: [
						{
							href: 'https://example.com/wp-json/wc/v3/taxes',
						},
					],
				},
			},
			{
				id: '74',
				country: 'US',
				state: 'AR',
				postcode: '',
				city: '',
				postcodes: [],
				cities: [],
				rate: '6.5000',
				name: 'State Tax',
				priority: 0,
				compound: false,
				shipping: true,
				order: 3,
				class: 'standard',
				_links: {
					self: [
						{
							href: 'https://example.com/wp-json/wc/v3/taxes/74',
						},
					],
					collection: [
						{
							href: 'https://example.com/wp-json/wc/v3/taxes',
						},
					],
				},
			},
			{
				id: '75',
				country: 'US',
				state: 'CA',
				postcode: '',
				city: '',
				postcodes: [],
				cities: [],
				rate: '7.5000',
				name: 'State Tax',
				priority: 0,
				compound: false,
				shipping: false,
				order: 4,
				class: 'standard',
				_links: {
					self: [
						{
							href: 'https://example.com/wp-json/wc/v3/taxes/75',
						},
					],
					collection: [
						{
							href: 'https://example.com/wp-json/wc/v3/taxes',
						},
					],
				},
			},
			{
				id: '76',
				country: 'US',
				state: 'CO',
				postcode: '',
				city: '',
				postcodes: [],
				cities: [],
				rate: '2.9000',
				name: 'State Tax',
				priority: 0,
				compound: false,
				shipping: false,
				order: 5,
				class: 'standard',
				_links: {
					self: [
						{
							href: 'https://example.com/wp-json/wc/v3/taxes/76',
						},
					],
					collection: [
						{
							href: 'https://example.com/wp-json/wc/v3/taxes',
						},
					],
				},
			},
			{
				id: '77',
				country: 'US',
				state: 'CT',
				postcode: '',
				city: '',
				postcodes: [],
				cities: [],
				rate: '6.3500',
				name: 'State Tax',
				priority: 0,
				compound: false,
				shipping: true,
				order: 6,
				class: 'standard',
				_links: {
					self: [
						{
							href: 'https://example.com/wp-json/wc/v3/taxes/77',
						},
					],
					collection: [
						{
							href: 'https://example.com/wp-json/wc/v3/taxes',
						},
					],
				},
			},
			{
				id: '78',
				country: 'US',
				state: 'DC',
				postcode: '',
				city: '',
				postcodes: [],
				cities: [],
				rate: '5.7500',
				name: 'State Tax',
				priority: 0,
				compound: false,
				shipping: true,
				order: 7,
				class: 'standard',
				_links: {
					self: [
						{
							href: 'https://example.com/wp-json/wc/v3/taxes/78',
						},
					],
					collection: [
						{
							href: 'https://example.com/wp-json/wc/v3/taxes',
						},
					],
				},
			},
			{
				id: '79',
				country: 'US',
				state: 'FL',
				postcode: '',
				city: '',
				postcodes: [],
				cities: [],
				rate: '6.0000',
				name: 'State Tax',
				priority: 0,
				compound: false,
				shipping: true,
				order: 8,
				class: 'standard',
				_links: {
					self: [
						{
							href: 'https://example.com/wp-json/wc/v3/taxes/79',
						},
					],
					collection: [
						{
							href: 'https://example.com/wp-json/wc/v3/taxes',
						},
					],
				},
			},
			{
				id: '80',
				country: 'US',
				state: 'GA',
				postcode: '',
				city: '',
				postcodes: [],
				cities: [],
				rate: '4.0000',
				name: 'State Tax',
				priority: 0,
				compound: false,
				shipping: true,
				order: 9,
				class: 'standard',
				_links: {
					self: [
						{
							href: 'https://example.com/wp-json/wc/v3/taxes/80',
						},
					],
					collection: [
						{
							href: 'https://example.com/wp-json/wc/v3/taxes',
						},
					],
				},
			},
			{
				id: '81',
				country: 'US',
				state: 'GU',
				postcode: '',
				city: '',
				postcodes: [],
				cities: [],
				rate: '4.0000',
				name: 'State Tax',
				priority: 0,
				compound: false,
				shipping: false,
				order: 10,
				class: 'standard',
				_links: {
					self: [
						{
							href: 'https://example.com/wp-json/wc/v3/taxes/81',
						},
					],
					collection: [
						{
							href: 'https://example.com/wp-json/wc/v3/taxes',
						},
					],
				},
			},
		];
	});

	it('should filter tax rates by country', () => {
		const filtered = filterTaxRates(taxRates, 'US');
		expect(filtered.every((rate) => rate.country === 'US')).toBeTruthy();
	});

	it('should filter tax rates by state', () => {
		const filtered = filterTaxRates(taxRates, '', 'CA');
		expect(filtered.every((rate) => rate.state === 'CA')).toBeTruthy();
	});

	it('should match tax rate with postcode', () => {
		const filtered = filterTaxRates(taxRates, 'US', 'AL', '35041', 'Brookside');
		expect(filtered.length).toBe(1);
		expect(filtered[0].id).toBe('72');
	});

	it('should correctly filter tax rates with wildcard postcodes', () => {
		const wildCardTaxes = [
			{
				id: '72',
				country: 'US',
				state: 'AL',
				postcode: '35014',
				city: 'Cardiff',
				postcodes: ['35014...35036'],
				cities: [],
				rate: '4.0000',
				name: 'State Tax',
				priority: 0,
				compound: false,
				shipping: false,
				order: 1,
				class: 'standard',
				_links: {
					self: [
						{
							href: 'https://example.com/wp-json/wc/v3/taxes/72',
						},
					],
					collection: [
						{
							href: 'https://example.com/wp-json/wc/v3/taxes',
						},
					],
				},
			},
			{
				id: '73',
				country: 'US',
				state: 'AL',
				postcode: '35047',
				city: 'Cardiff',
				postcodes: ['3504*'],
				cities: [],
				rate: '4.0000',
				name: 'State Tax',
				priority: 0,
				compound: false,
				shipping: false,
				order: 1,
				class: 'standard',
				_links: {
					self: [
						{
							href: 'https://example.com/wp-json/wc/v3/taxes/72',
						},
					],
					collection: [
						{
							href: 'https://example.com/wp-json/wc/v3/taxes',
						},
					],
				},
			},
		];
		const filtered1 = filterTaxRates(wildCardTaxes, 'US', 'AL', '35020');
		expect(filtered1.length).toBe(1);
		expect(filtered1[0].id).toBe('72');

		const filtered2 = filterTaxRates(wildCardTaxes, 'US', 'AL', '35044');
		expect(filtered2.length).toBe(1);
		expect(filtered2[0].id).toBe('73');
	});

	it('should prioritize tax rates correctly and exclude same-priority tax rates', () => {
		const filtered = filterTaxRates(taxRates, 'US');
		const priorities = filtered.map((rate) => rate.priority);
		// Check if the priorities array is sorted
		expect(priorities).toEqual([...priorities].sort());
		// Check if same-priority rates are excluded
		const uniquePriorities = new Set(priorities);
		expect(uniquePriorities.size).toBe(priorities.length);
	});

	it('should return an empty array if no matches are found', () => {
		const filtered = filterTaxRates(taxRates, 'XX', 'YY', '12345', 'Nowhere');
		expect(filtered).toEqual([]);
	});

	it('should return tax rates with correct structure', () => {
		const filtered = filterTaxRates(taxRates, 'US', 'CA');
		expect(
			filtered.every((rate) => typeof rate === 'object' && rate !== null && 'id' in rate)
		).toBeTruthy();
	});

	it('should return the first sorted tax rate if priorities are the same', () => {
		const priorityTaxRates = [
			{
				id: '72',
				country: 'DK',
				state: '',
				postcode: '',
				city: '',
				postcodes: [],
				cities: [],
				rate: '25.0000',
				name: 'Moms',
				priority: 1,
				compound: false,
				shipping: true,
				order: 2,
				class: 'standard',
			},
			{
				id: '73',
				country: 'DK',
				state: '',
				postcode: '',
				city: '',
				postcodes: [],
				cities: [],
				rate: '25.0000',
				name: 'Moms',
				priority: 1,
				compound: false,
				shipping: true,
				order: 1,
				class: 'standard',
			},
		];
		const filtered = filterTaxRates(priorityTaxRates, 'DK');
		expect(filtered.length).toBe(1);
		expect(filtered[0].id).toBe('73');
	});

	describe('BUG: DK user', () => {
		it('should match the DK tax rate', () => {
			const filtered = filterTaxRates(
				[
					{
						id: '72',
						country: 'DK',
						state: '',
						postcode: '',
						city: '',
						postcodes: [],
						cities: [],
						rate: '25.0000',
						name: 'Moms',
						priority: 1,
						compound: false,
						shipping: true,
						order: 1,
						class: 'standard',
					},
				],
				'DK',
				'',
				'København NV',
				'2400'
			);
			expect(filtered.length).toBe(1);
			expect(filtered[0].id).toBe('72');
		});

		it('should match the DK tax rate with other rates', () => {
			const filtered = filterTaxRates(
				[
					{
						id: '71',
						country: 'DE',
						state: '',
						postcode: '',
						city: '',
						postcodes: [],
						cities: [],
						rate: '25.0000',
						name: 'Moms',
						priority: 1,
						compound: false,
						shipping: true,
						order: 1,
						class: 'standard',
					},
					{
						id: '72',
						country: 'DK',
						state: '',
						postcode: '',
						city: '',
						postcodes: [],
						cities: [],
						rate: '25.0000',
						name: 'Moms',
						priority: 1,
						compound: false,
						shipping: true,
						order: 1,
						class: 'standard',
					},
					{
						id: '73',
						country: '',
						state: '',
						postcode: '',
						city: '',
						postcodes: [],
						cities: [],
						rate: '25.0000',
						name: 'Moms',
						priority: 1,
						compound: false,
						shipping: true,
						order: 1,
						class: 'standard',
					},
				],
				'DK',
				'',
				'København NV',
				'2400'
			);
			expect(filtered.length).toBe(1);
			expect(filtered[0].id).toBe('72');
		});
	});
});

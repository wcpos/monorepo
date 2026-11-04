/**
 * Where the showcase seed applies, and the fixed lists it draws from.
 *
 * Every value the seed writes comes from here or from plan.mjs, so a run is
 * reproducible. Store ids are the wcpos/v1 store ids on each site; `0` is the
 * free plugin's single default store. `cashierIds` are the cashier users on
 * that site; a target with none uses `fallbackCashierId`.
 */
export const TARGETS = {
	demo: {
		url: 'https://demo.wcpos.com',
		windowStart: '2026-10-05',
		/** When the full seed began on this target; null means it has not been applied and the tidy refuses to run. */
		tidyBaselineGmt: '2026-11-04T20:40:08Z',
		fallbackCashierId: 4,
		stores: [
			{
				key: 'us',
				id: 1234,
				currency: 'USD',
				ordersPerDay: 14,
				openHour: 9,
				closeHour: 19,
				closedWeekdays: [],
				region: 'us',
				cashierIds: [16487, 16488, 16489],
				couponCodes: ['LOCALS10', 'SAVE5'],
				basketScale: 1,
			},
			{
				key: 'uk',
				id: 1235,
				currency: 'USD',
				ordersPerDay: 10,
				openHour: 9,
				closeHour: 18,
				closedWeekdays: [],
				region: 'uk',
				cashierIds: [16490, 16491],
				couponCodes: ['LOCALS10', 'SAVE5'],
				basketScale: 1,
			},
			{
				key: 'wholesale',
				id: 14214,
				currency: 'USD',
				ordersPerDay: 8,
				openHour: 7,
				closeHour: 16,
				closedWeekdays: [0],
				region: 'us',
				cashierIds: [16492, 16493],
				couponCodes: ['TRADE15'],
				basketScale: 3,
			},
			{
				key: 'eu',
				id: 33861,
				currency: 'EUR',
				ordersPerDay: 10,
				openHour: 9,
				closeHour: 18,
				closedWeekdays: [0],
				region: 'eu',
				cashierIds: [16494, 16495],
				couponCodes: ['LOCALS10', 'SAVE5'],
				basketScale: 1,
			},
		],
	},
	'dev-free': {
		url: 'https://dev-free.wcpos.com',
		windowStart: '2026-10-05',
		/** When the full seed began on this target; null means it has not been applied and the tidy refuses to run. */
		tidyBaselineGmt: null,
		fallbackCashierId: null,
		stores: [
			{
				key: 'store',
				id: 0,
				currency: 'USD',
				ordersPerDay: 12,
				openHour: 9,
				closeHour: 19,
				closedWeekdays: [],
				region: 'us',
				cashierIds: [],
				couponCodes: ['LOCALS10', 'SAVE5'],
				basketScale: 1,
			},
		],
	},
};

/** Meta key on every customer, coupon and order the seed creates; its value is the plan key. */
export const SEED_META_KEY = '_wcpos_showcase_key';

/** Customer count per target, split across stores by their share of ordersPerDay. */
export const CUSTOMER_COUNT = 40;

/** At least this many named customers per store, so every store has regulars. */
export const MIN_CUSTOMERS_PER_STORE = 4;

/** Coupons a store may name in `couponCodes`. Amounts are strings, as WooCommerce sends them. */
export const COUPONS = [
	{ code: 'LOCALS10', discount_type: 'percent', amount: '10', description: 'Locals discount' },
	{ code: 'SAVE5', discount_type: 'fixed_cart', amount: '5', description: 'Five off your basket' },
	{
		code: 'TRADE15',
		discount_type: 'percent',
		amount: '15',
		description: 'Trade account discount',
	},
];

/** Forty first and last names, none of them famous. */
export const NAMES = [
	['Maya', 'Thompson'],
	['Daniel', 'Okafor'],
	['Priya', 'Raman'],
	['Lucas', 'Moreau'],
	['Aisha', 'Bello'],
	['Tom', 'Gallagher'],
	['Mei Lin', 'Chen'],
	['Rafael', 'Ortega'],
	['Hannah', 'Fischer'],
	['Kwame', 'Mensah'],
	['Sofia', 'Rossi'],
	['Liam', "O'Connor"],
	['Yuki', 'Tanaka'],
	['Grace', 'Mwangi'],
	['Oliver', 'Bennett'],
	['Fatima', 'Haddad'],
	['Jonas', 'Lindqvist'],
	['Ana', 'Souza'],
	['Ethan', 'Brooks'],
	['Nadia', 'Kowalski'],
	['Samuel', 'Adeyemi'],
	['Chloé', 'Dubois'],
	['Arjun', 'Mehta'],
	['Isabel', 'Navarro'],
	['Noah', 'Whitfield'],
	['Leila', 'Karimi'],
	['Marcus', 'Hale'],
	['Elena', 'Petrova'],
	['Kofi', 'Asante'],
	['Ruth', 'Abernathy'],
	['Diego', 'Castillo'],
	['Ingrid', 'Halvorsen'],
	['Tariq', 'Rahman'],
	['Emily', 'Carver'],
	['Jae-won', 'Park'],
	['Lucia', 'Ferreira'],
	['Henry', 'Osei'],
	['Zoë', 'van Dijk'],
	['Amara', 'Nwosu'],
	['Patrick', 'Doyle'],
];

/** Company names for trade customers: `${last} ${suffix}`. */
export const COMPANY_SUFFIXES = [
	'Catering',
	'Kitchen Supplies',
	'Hospitality',
	'Trading Co',
	'Cafe Group',
];

/**
 * Addresses per region: [address_1, city, state, postcode, country, areaCode].
 * Street numbers are made up; cities are real. Phones are drawn from the
 * ranges set aside for fiction: US 555-01xx, UK 020 7946 0xxx, NL +31 20 555 01xx.
 */
export const ADDRESSES = {
	us: [
		['418 Maple Avenue', 'Portland', 'OR', '97205', 'US', '503'],
		['72 Elm Street', 'Austin', 'TX', '78701', 'US', '512'],
		['1290 Cedar Lane', 'Denver', 'CO', '80203', 'US', '303'],
		['35 Harbor Road', 'Seattle', 'WA', '98101', 'US', '206'],
		['806 Oak Park Drive', 'Chicago', 'IL', '60614', 'US', '312'],
		['221 Willow Way', 'Sacramento', 'CA', '95814', 'US', '916'],
		['57 Birch Court', 'Minneapolis', 'MN', '55401', 'US', '612'],
		['940 Pine Street', 'Boise', 'ID', '83702', 'US', '208'],
	],
	uk: [
		['14 Kingsley Road', 'London', '', 'N16 7RT', 'GB'],
		['3 Mill Lane', 'Bristol', '', 'BS1 4QA', 'GB'],
		['27 Station Street', 'Manchester', '', 'M1 2PF', 'GB'],
		['9 Church Walk', 'Leeds', '', 'LS1 6HD', 'GB'],
		['61 Victoria Terrace', 'Edinburgh', '', 'EH1 2JL', 'GB'],
		['18 Orchard Close', 'Cambridge', '', 'CB1 2AB', 'GB'],
		['42 Riverside Way', 'Norwich', '', 'NR1 1EF', 'GB'],
		['5 Albert Square', 'Brighton', '', 'BN1 1AA', 'GB'],
	],
	eu: [
		['Prinsengracht 412', 'Amsterdam', '', '1016 HZ', 'NL'],
		['Oudegracht 88', 'Utrecht', '', '3511 AV', 'NL'],
		['Grote Markt 17', 'Haarlem', '', '2011 RD', 'NL'],
		['Witte de Withstraat 63', 'Rotterdam', '', '3012 BN', 'NL'],
		['Breestraat 129', 'Leiden', '', '2311 CM', 'NL'],
		['Voldersgracht 22', 'Delft', '', '2611 EV', 'NL'],
		['Lange Voorhout 9', 'Den Haag', '', '2514 EA', 'NL'],
		['Stadsplein 41', 'Amstelveen', '', '1181 ZM', 'NL'],
	],
};

/** Short refund reasons a cashier would type. */
export const REFUND_REASONS = ['Changed mind', 'Damaged on opening', 'Wrong size'];

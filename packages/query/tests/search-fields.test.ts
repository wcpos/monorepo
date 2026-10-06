import { searchTerms } from '@wcpos/sync-core';

import { searchRows } from '../src/search-blob';
import { phoneDigits, SEARCH_FIELDS, searchRowText, valuesAtPath } from '../src/search-fields';

/**
 * The field table is the client's mirror of the plugin's `Collection_Rules` search
 * declaration (wcpos/woocommerce-pos). Audited 2026-10-07 on monorepo#2411; a change here
 * is a change to what a cashier can find and must land on the server in the same release.
 */
describe('SEARCH_FIELDS (audited table, #2411)', () => {
	it('pins the audited field set per collection', () => {
		expect(SEARCH_FIELDS).toEqual({
			products: ['name', 'sku', 'barcode'],
			variations: ['sku', 'barcode'],
			orders: [
				'number',
				'billing.first_name',
				'billing.last_name',
				'billing.email',
				'billing.company',
				'billing.phone',
				'shipping.first_name',
				'shipping.last_name',
				'shipping.company',
				'shipping.phone',
				'line_items.name',
				'line_items.sku',
			],
			customers: [
				'first_name',
				'last_name',
				'email',
				'username',
				'billing.first_name',
				'billing.last_name',
				'billing.email',
				'billing.company',
				'billing.phone',
				'shipping.first_name',
				'shipping.last_name',
				'shipping.company',
				'shipping.phone',
				'tax_ids.value',
			],
			'products/categories': ['name'],
			'products/tags': ['name'],
			'products/brands': ['name'],
			coupons: ['code', 'description'],
		});
	});
});

describe('valuesAtPath', () => {
	it('reads nested scalars and maps over arrays met on the way', () => {
		const order = {
			number: 1042,
			billing: { first_name: 'Ada', phone: '+61 412 345 678' },
			line_items: [{ name: 'Blue Shirt', sku: 'BLU-M' }, { name: 'Cap' }],
		};
		expect(valuesAtPath(order, 'number')).toEqual(['1042']);
		expect(valuesAtPath(order, 'billing.first_name')).toEqual(['Ada']);
		expect(valuesAtPath(order, 'line_items.name')).toEqual(['Blue Shirt', 'Cap']);
		expect(valuesAtPath(order, 'line_items.sku')).toEqual(['BLU-M']);
	});

	it('contributes nothing for missing paths, null leaves and object leaves', () => {
		expect(valuesAtPath({}, 'billing.phone')).toEqual([]);
		expect(valuesAtPath({ billing: null }, 'billing.phone')).toEqual([]);
		expect(valuesAtPath({ billing: { phone: null } }, 'billing.phone')).toEqual([]);
		expect(valuesAtPath({ line_items: [{ meta: { a: 1 } }] }, 'line_items.meta')).toEqual([]);
		expect(valuesAtPath(undefined, 'x')).toEqual([]);
	});
});

describe('searchRowText', () => {
	it('folds every field value into one row and never stringifies an object', () => {
		const row = searchRowText(SEARCH_FIELDS.orders, {
			number: '1042',
			billing: { first_name: 'Chloé', company: 'Dürr & Co', email: 'c@x.io' },
			shipping: { first_name: 'Bo', phone: '' },
			line_items: [{ name: 'Crème Brûlée Kit', sku: 'CBK-1' }],
		});
		expect(row).toBe('1042 chloe c@x.io durr & co bo creme brulee kit cbk-1');
		expect(row).not.toContain('[object');
	});

	it('appends the digits of every phone field, so one typed shape finds every stored shape', () => {
		const row = searchRowText(['billing.phone', 'shipping.phone'], {
			billing: { phone: '+61 412-345-678' },
			shipping: { phone: '(04) 1234 5678' },
		});
		expect(row).toBe('+61 412-345-678 61412345678 (04) 1234 5678 0412345678');
		for (const typed of ['0412', '412345', '+61 412', '61412345678', '(04) 1234']) {
			expect(searchRows(new Map([['o', row]]), searchTerms(typed))).toEqual(['o']);
		}
	});

	it('keeps a digits-only phone once', () => {
		expect(searchRowText(['phone'], { phone: '0412345678' })).toBe('0412345678');
		expect(phoneDigits('0412345678')).toBe('0412345678');
	});

	it('reads customer tax IDs from the tax_ids array', () => {
		const row = searchRowText(SEARCH_FIELDS.customers, {
			first_name: 'Sam',
			tax_ids: [
				{ type: 'au_abn', value: '51 824 753 556', country: 'AU' },
				{ type: 'eu_vat', value: 'DE123456789' },
			],
		});
		expect(searchRows(new Map([['c', row]]), searchTerms('824 753'))).toEqual(['c']);
		expect(searchRows(new Map([['c', row]]), searchTerms('de123456789'))).toEqual(['c']);
		expect(searchRows(new Map([['c', row]]), searchTerms('au_abn'))).toEqual([]);
	});

	it('finds an order by a line item name or sku as sold, any term order', () => {
		const row = searchRowText(SEARCH_FIELDS.orders, {
			number: '77',
			billing: { first_name: 'Ada', last_name: 'Lovelace' },
			line_items: [{ name: 'Blue Cotton Shirt', sku: 'BCS-M' }, { name: 'Cap' }],
		});
		const rows = new Map([['o', row]]);
		expect(searchRows(rows, searchTerms('shirt lovelace'))).toEqual(['o']);
		expect(searchRows(rows, searchTerms('bcs-m'))).toEqual(['o']);
		expect(searchRows(rows, searchTerms('cap 77'))).toEqual(['o']);
		expect(searchRows(rows, searchTerms('hat'))).toEqual([]);
	});
});

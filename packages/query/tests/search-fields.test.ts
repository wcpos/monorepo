import { searchTerms } from '@wcpos/sync-core';

import { engineCollectionNameFor } from '../src/engine-adapter/collection-map';
import { legacySearchSnapshot, searchProjection } from '../src/engine-adapter/search-snapshot';
import { searchRows } from '../src/search-blob';
import { phoneDigits, SEARCH_FIELDS, searchRowText, valuesAtPath } from '../src/search-fields';
import { createEngineDatabase, engineOrder } from '../src/testing';

import type { EngineRxDocument } from '../src/engine-adapter/execute-query';
import type { SearchableCollection } from '../src/search-shared';
import type { RxDatabase } from 'rxdb';

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

/**
 * The module doc's promise: a cold row (projection read) and a live row (change event
 * snapshot) fold to the SAME text, for the two collections whose fields reach into
 * promoted columns (`number`) and arrays (`line_items`, `tax_ids`). A reader that handed
 * back JSON text for an object path, or a map entry that reshaped a field, would fail here.
 */
describe('cold projection row equals live snapshot row', () => {
	let database: RxDatabase;
	afterEach(async () => {
		if (!database.destroyed) await database.remove();
	});

	async function rowsBothWays(name: 'orders' | 'customers') {
		const collection = database.collections[
			engineCollectionNameFor(name)
		] as unknown as SearchableCollection & { find(): { exec(): Promise<EngineRxDocument[]> } };
		const fields = SEARCH_FIELDS[name];
		const cold = new Map(
			(await searchProjection(collection, name, fields)).map((row) => [
				row.id,
				searchRowText(fields, row.snapshot),
			])
		);
		const live = new Map(
			(await collection.find().exec()).map((document) => [
				document.primary,
				searchRowText(fields, legacySearchSnapshot(name, document)),
			])
		);
		return { cold, live };
	}

	it('orders: promoted number, billing, shipping and line items', async () => {
		database = await createEngineDatabase(['orders']);
		await database.collections.orders.bulkInsert([
			engineOrder({
				uuid: 'o-full',
				id: 1042,
				number: '1042',
				billing: {
					first_name: 'Chloé',
					last_name: 'Dürr',
					company: 'Dürr & Co',
					email: 'c@x.io',
					phone: '+61 412 345 678',
				},
				shipping: { first_name: 'Bo', last_name: 'Li', company: '', phone: '(04) 1234 5678' },
				line_items: [{ name: 'Crème Brûlée Kit', sku: 'CBK-1' }, { name: 'Cap' }],
			}),
			engineOrder({ uuid: 'o-bare', id: 7 }),
			engineOrder({ uuid: 'o-empty-number', id: 8, number: '' }),
		]);
		const { cold, live } = await rowsBothWays('orders');
		expect(cold.size).toBe(3);
		expect(cold).toEqual(live);
		expect(cold.get('o-full')).toContain('creme brulee kit cap cbk-1');
		expect(cold.get('o-full')).toContain('61412345678');
	});

	it('customers: identity, billing, shipping and tax ids', async () => {
		database = await createEngineDatabase(['customers']);
		const customer = (uuid: string, payload: Record<string, unknown>) => ({
			uuid,
			remoteId: payload.id ?? null,
			remoteKey: `woo:${payload.id}`,
			payload,
			sync: { revision: '1', partial: false, source: 'woo-rest' },
			local: { dirty: false, pendingMutationIds: [] },
		});
		await database.collections.customers.bulkInsert([
			customer('c-full', {
				id: 5,
				first_name: 'Sam',
				last_name: 'Ó Brien',
				email: 'sam@x.io',
				username: 'sam',
				billing: { first_name: 'Sam', phone: '0412 345 678', company: 'Acme' },
				shipping: { first_name: 'Pat', phone: '' },
				tax_ids: [{ type: 'au_abn', value: '51 824 753 556', country: 'AU' }],
			}),
			customer('c-bare', { id: 6 }),
		]);
		const { cold, live } = await rowsBothWays('customers');
		expect(cold.size).toBe(2);
		expect(cold).toEqual(live);
		expect(cold.get('c-full')).toContain('51 824 753 556');
	});
});

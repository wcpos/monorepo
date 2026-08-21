/** @jest-environment node */

import { legacySearchSnapshot } from '../../src/engine-adapter/search-snapshot';

import type { EngineDocument, LegacyCollectionName } from '../../src/engine-adapter/collection-map';
import type { RxDocument } from 'rxdb';

/**
 * These tests pin the SHAPE the search plane depends on (LEGACY_SEARCH_FIELDS spellings
 * resolved by lodash/get, FlexSearch docToString). Golden fixtures below pin the exact object
 * independently of the deleted document proxy. If the snapshot output ever changes,
 * SEARCH_INDEX_VERSION in
 * @wcpos/database's search plugin must be bumped (the index is checkpoint-persisted and
 * never re-tokenized).
 */
function fakeRxDocument(document: EngineDocument): RxDocument<EngineDocument> {
	return {
		...document,
		collection: { name: 'fake' },
		getLatest: () => fakeRxDocument(document),
		toJSON: () => document,
	} as unknown as RxDocument<EngineDocument>;
}

function snapshot(collection: LegacyCollectionName, document: EngineDocument) {
	return legacySearchSnapshot(collection, fakeRxDocument(document));
}

describe('legacySearchSnapshot', () => {
	const goldenFixtures: {
		collection: LegacyCollectionName;
		document: EngineDocument;
		expected: Record<string, unknown>;
	}[] = [
		{
			collection: 'products',
			document: {
				uuid: 'product-uuid',
				remoteId: '101',
				payload: { name: 'Golden coffee', sku: 'GOLD-COFFEE', barcode: '101010' },
			},
			expected: {
				name: 'Golden coffee',
				sku: 'GOLD-COFFEE',
				barcode: '101010',
				uuid: 'product-uuid',
				id: 101,
			},
		},
		{
			collection: 'variations',
			document: {
				uuid: 'variation-uuid',
				remoteId: '102',
				payload: {
					sku: 'GOLD-COFFEE-L',
					barcode: '102102',
					attributes: [
						{ id: 0, name: 'Size', option: 'Large' },
						{ id: 1, name: 'Malformed' },
					],
				},
			},
			expected: {
				sku: 'GOLD-COFFEE-L',
				barcode: '102102',
				attributes: [{ id: 0, name: 'Size', option: 'Large' }],
				uuid: 'variation-uuid',
				id: 102,
			},
		},
		{
			collection: 'orders',
			document: {
				uuid: 'order-uuid',
				remoteId: '103',
				payload: {
					number: '103',
					billing: {
						first_name: 'Ada',
						last_name: 'Lovelace',
						email: 'ada@example.com',
						company: 'Analytical Engines',
						phone: '555-0103',
					},
				},
			},
			expected: {
				number: '103',
				billing: {
					first_name: 'Ada',
					last_name: 'Lovelace',
					email: 'ada@example.com',
					company: 'Analytical Engines',
					phone: '555-0103',
				},
				uuid: 'order-uuid',
				id: 103,
			},
		},
		{
			collection: 'customers',
			document: {
				uuid: 'customer-uuid',
				remoteId: '104',
				payload: {
					first_name: 'Grace',
					last_name: 'Hopper',
					email: 'grace@example.com',
					username: 'grace',
					billing: {
						first_name: 'Grace',
						last_name: 'Hopper',
						email: 'billing@example.com',
						company: 'Navy',
						phone: '555-0104',
					},
				},
			},
			expected: {
				first_name: 'Grace',
				last_name: 'Hopper',
				email: 'grace@example.com',
				username: 'grace',
				billing: {
					first_name: 'Grace',
					last_name: 'Hopper',
					email: 'billing@example.com',
					company: 'Navy',
					phone: '555-0104',
				},
				uuid: 'customer-uuid',
				id: 104,
			},
		},
		...(
			[
				['products/categories', 'category', '105', 'Golden category'],
				['products/tags', 'tag', '106', 'Golden tag'],
				['products/brands', 'brand', '107', 'Golden brand'],
			] as const
		).map(([collection, kind, remoteId, name]) => ({
			collection,
			document: { uuid: `${kind}-uuid`, remoteId, payload: { name } },
			expected: { name, uuid: `${kind}-uuid`, id: Number(remoteId) },
		})),
		{
			collection: 'coupons',
			document: {
				uuid: 'coupon-uuid',
				remoteId: '108',
				payload: { code: 'GOLDEN', description: 'Golden coupon' },
			},
			expected: {
				code: 'GOLDEN',
				description: 'Golden coupon',
				uuid: 'coupon-uuid',
				id: 108,
			},
		},
	];

	it.each(goldenFixtures)('matches the $collection golden fixture exactly', (fixture) => {
		expect(snapshot(fixture.collection, fixture.document)).toEqual(fixture.expected);
	});

	it('flattens payload fields to the top level (the LEGACY_SEARCH_FIELDS shape)', () => {
		const result = snapshot('orders', {
			uuid: 'o-1',
			remoteId: '77',
			payload: {
				id: 77,
				number: '77',
				billing: { first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.com' },
			},
		} as EngineDocument);
		expect(result.number).toBe('77');
		expect((result.billing as Record<string, unknown>).first_name).toBe('Ada');
		expect(result.uuid).toBe('o-1');
	});

	it('overlays the legacy id from the record identity even when the payload lacks one', () => {
		const result = snapshot('products', {
			uuid: 'p-1',
			remoteId: '42',
			payload: { name: 'Chai Tea', sku: 'CHAI' },
		} as EngineDocument);
		expect(result.id).toBe(42);
		expect(result.uuid).toBe('p-1');
		expect(result.name).toBe('Chai Tea');
	});

	it('the identity overlay wins over a stale payload id', () => {
		const result = snapshot('products', {
			uuid: 'p-2',
			remoteId: '42',
			payload: { id: 999, name: 'Stale' },
		} as EngineDocument);
		expect(result.id).toBe(42);
	});

	it('an unacknowledged record (remoteId null) snapshots without a fabricated id', () => {
		const result = snapshot('orders', {
			uuid: 'o-2',
			remoteId: null,
			payload: { number: 'draft' },
		} as never);
		expect(result.number).toBe('draft');
		expect(result.uuid).toBe('o-2');
		expect(result.id).toBeUndefined();
	});

	it('applies the sanitized boundary read for variation attributes without adding absent fields (#811)', () => {
		const withAttributes = snapshot('variations', {
			uuid: 'v-1',
			remoteId: '43',
			payload: {
				sku: 'CHAI-L',
				attributes: [
					{ id: 0, name: 'Size', option: ' Large ' },
					{ id: 1, name: 'Malformed' },
				],
			},
		} as EngineDocument);
		expect(withAttributes.attributes).toEqual([{ id: 0, name: 'Size', option: ' Large ' }]);

		const withoutAttributes = snapshot('variations', {
			uuid: 'v-2',
			remoteId: '44',
			payload: { sku: 'CHAI-S' },
		} as EngineDocument);
		expect('attributes' in withoutAttributes).toBe(false);
	});
});

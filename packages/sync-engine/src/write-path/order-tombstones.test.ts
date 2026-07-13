// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { orderStorageIdsForWooDeletes } from './order-tombstones';

const doc = (id: string, wooOrderId: number | null) => ({ id, wooOrderId });

describe('orderStorageIdsForWooDeletes', () => {
	it('resolves Woo order ids to the stored uuid keys (P0-1 — not woo-order:<id>)', () => {
		const docs = [
			doc('5b8e1a3c-2f4d-4a6b-9c8e-000000000999', 999),
			doc('a1b2c3d4-e5f6-4a7b-8c9d-000000001000', 1000),
			doc('uuid-untouched', 42),
		];
		// The server deletes channel speaks Woo ids 999/1000; removal must target the uuid keys.
		expect(orderStorageIdsForWooDeletes(docs, [999, 1000])).toEqual([
			'5b8e1a3c-2f4d-4a6b-9c8e-000000000999',
			'a1b2c3d4-e5f6-4a7b-8c9d-000000001000',
		]);
	});

	it('never matches a born-local order (null wooOrderId) on an upstream delete', () => {
		const docs = [doc('local-uuid', null), doc('server-uuid', 999)];
		expect(orderStorageIdsForWooDeletes(docs, [999])).toEqual(['server-uuid']);
	});

	it('ignores Woo order ids that have no local row', () => {
		expect(orderStorageIdsForWooDeletes([doc('u', 999)], [12345])).toEqual([]);
	});

	it('returns nothing for an empty tombstone', () => {
		expect(orderStorageIdsForWooDeletes([doc('u', 999)], [])).toEqual([]);
	});
});

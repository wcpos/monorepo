/** @jest-environment node */

import { legacySearchSnapshot } from '../../src/engine-adapter/search-snapshot';

import type { EngineDocument, LegacyCollectionName } from '../../src/engine-adapter/collection-map';
import type { RxDocument } from 'rxdb';

/**
 * These tests pin the SHAPE the search plane depends on (LEGACY_SEARCH_FIELDS spellings
 * resolved by lodash/get, FlexSearch docToString). The document proxy's toJSON aliases this
 * same implementation, so there is deliberately no proxy-parity test — it would compare the
 * function against itself. If the snapshot output ever changes, SEARCH_INDEX_VERSION in
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

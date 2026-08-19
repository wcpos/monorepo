// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { materializeLocalOnly } from '../materialization/record-materialization';
import { EngineOrderRepository, type OrderRepositoryDatabase } from './engine-order-repository';

/**
 * upsertMany extracts the Leg-3 manifest row BEFORE it rebuilds documents (the
 * identity-meta graft and `withOrderColumns` both spread the document, and a
 * spread drops the non-enumerable Symbol the row rides on — #1340/#1345). That
 * ordering is load-bearing and nothing in the types enforces it, so this test
 * pins it end to end: a materialized order whose row rides ONLY the Symbol
 * (the payload digest is stripped at materialization) must still seed the
 * order existence manifest through a full upsertMany.
 */

function orderDatabase() {
	const orderUpserts: unknown[][] = [];
	const manifestUpserts: unknown[][] = [];
	const db = {
		orders: {
			bulkUpsert: async (documents: unknown[]) => {
				orderUpserts.push(documents);
				return [];
			},
			findByIds: () => ({ exec: async () => new Map() }),
			count: () => ({ exec: async () => 0 }),
		},
		existenceManifestOrders: {
			bulkUpsert: async (rows: unknown[]) => {
				manifestUpserts.push(rows);
				return [];
			},
			bulkRemove: async () => [],
			find: () => ({ exec: async () => [] }),
		},
		syncCheckpoints: { findOne: () => ({ exec: async () => null }), upsert: async () => [] },
		close: async () => true,
	} as unknown as OrderRepositoryDatabase;
	return { db, orderUpserts, manifestUpserts };
}

describe('EngineOrderRepository upsertMany — Symbol-borne manifest rows', () => {
	it('seeds the manifest from a row that rides only the Symbol, despite later rebuilds', async () => {
		const { storedDocument } = materializeLocalOnly({
			id: 77,
			status: 'processing',
			meta_data: [{ key: '_woocommerce_pos_uuid', value: '00000000-0000-4000-8000-000000000077' }],
			_rxdb_digest: 'd77',
		} as never);
		expect('_rxdb_digest' in (storedDocument.payload as object)).toBe(false);

		const { db, orderUpserts, manifestUpserts } = orderDatabase();
		await new EngineOrderRepository(db).upsertMany([storedDocument]);

		expect(manifestUpserts).toEqual([
			[{ remoteId: '77', wooId: 77, objectType: 'order', digest: 'd77' }],
		]);
		// The stored document was rebuilt with promoted columns and no digest.
		const stored = orderUpserts[0][0] as { status: string; payload: Record<string, unknown> };
		expect(stored.status).toBe('processing');
		expect('_rxdb_digest' in stored.payload).toBe(false);
	});
});

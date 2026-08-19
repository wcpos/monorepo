// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { materializeLocalOnly } from '../materialization/record-materialization';
import { EngineOrderRepository, type OrderRepositoryDatabase } from './engine-order-repository';

/**
 * This file pins the contract that REPLACED the Symbol channel (#1340/#1345, ADR 0028 rider).
 * The manifest row used to ride the stored document on a non-enumerable Symbol which
 * `upsertMany` extracted before its rebuilds; a spread anywhere upstream dropped it silently.
 * Now the row travels on the materialization envelope and the INGEST SITE records it, so this
 * repository has exactly two jobs left at that boundary:
 *  - `upsertMany` writes NO manifest rows (a row must never be implied by storing a document),
 *    and still lets no transport-only `_rxdb_digest` reach storage;
 *  - `upsertManifestRows` is the explicit port the pull lanes call for the rows they applied.
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

const materializedOrder = () =>
	materializeLocalOnly({
		id: 77,
		status: 'processing',
		meta_data: [{ key: '_woocommerce_pos_uuid', value: '00000000-0000-4000-8000-000000000077' }],
		_rxdb_digest: 'd77',
	} as never);

describe('EngineOrderRepository — the manifest boundary after the Symbol', () => {
	it('stores the document without its digest and writes no manifest row of its own', async () => {
		const { storedDocument, manifestRow } = materializedOrder();
		expect(manifestRow).toMatchObject({ wooId: 77, digest: 'd77' });
		expect('_rxdb_digest' in (storedDocument.payload as object)).toBe(false);

		const { db, orderUpserts, manifestUpserts } = orderDatabase();
		await new EngineOrderRepository(db).upsertMany([storedDocument]);

		// The ingest site owns the manifest write — storing a document implies nothing.
		expect(manifestUpserts).toEqual([]);
		const stored = orderUpserts[0][0] as { status: string; payload: Record<string, unknown> };
		expect(stored.status).toBe('processing');
		expect('_rxdb_digest' in stored.payload).toBe(false);
	});

	it('strips a digest that reaches the storage boundary un-materialized', async () => {
		const { db, orderUpserts } = orderDatabase();
		await new EngineOrderRepository(db).upsertMany([
			{
				uuid: 'uuid-78',
				remoteId: '78',
				payload: { id: 78, status: 'completed', _rxdb_digest: 'd78' },
				sync: { revision: 'r', partial: false, source: 'woo-rest' },
				local: { dirty: false, pendingMutationIds: [] },
			} as never,
		]);
		const stored = orderUpserts[0][0] as { payload: Record<string, unknown> };
		expect('_rxdb_digest' in stored.payload).toBe(false);
	});

	it('seeds the order manifest through the explicit port the pull lanes call', async () => {
		const { db, manifestUpserts } = orderDatabase();
		const repository = new EngineOrderRepository(db);
		const { manifestRow } = materializedOrder();

		await repository.upsertManifestRows([]);
		expect(manifestUpserts).toEqual([]); // no rows, no write

		await repository.upsertManifestRows([manifestRow!]);
		expect(manifestUpserts).toEqual([
			[{ remoteId: '77', wooId: 77, objectType: 'order', digest: 'd77' }],
		]);
	});
});

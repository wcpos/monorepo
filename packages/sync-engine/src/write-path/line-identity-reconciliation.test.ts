import { describe, expect, it } from 'vitest';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import { createEngineHarness, remoteId } from '../testing';
import { writeFacetFor } from '../collections/collection-descriptors';

setPremiumFlag();
const UUID = '22222222-2222-4222-8222-222222222222';
const meta_data = [{ key: '_woocommerce_pos_uuid', value: UUID }];
const live = { id: 11, product_id: 82, quantity: 3, meta_data };
const tombstone = { id: 12, product_id: null };
const kept = { id: 13, product_id: 83 };
const truth = { id: 900, meta_data, line_items: [kept] };

describe('checkout line identity', () => {
	it.each([null, { id: 900, line_items: [] }])(
		'preserves ids and tombstones when the adoption document cannot materialize: %j',
		async (document) => {
			const { engine } = await createEngineHarness({ mode: 'manual' });
			try {
				await engine.ready;
				const db = engine.active()!.database;
				const facet = writeFacetFor('orders')!;
				const payload = { ...truth, line_items: [live, tombstone, kept] };
				await facet.upsertServerDocument(db, facet.documentFromServerPayload(payload));
				await facet.reconcile(db, {
					recordId: UUID,
					remoteId: remoteId(900),
					currentRevision: 'server-base',
					mutation: { mutationId: 'deletion-A', operation: 'update', recordId: UUID },
					document,
					identityDocument: { ...truth, line_items: [] },
				});
				const doc = await db.collections.orders.findOne(UUID).exec();
				expect(doc!.toJSON().payload.line_items).toEqual([live, tombstone, kept]);
			} finally {
				await engine.dispose();
			}
		}
	);

	it.each([
		'successor',
		'undo',
		'adoption',
		'automatic rebase',
		'manual rebase',
		'successor without payload id',
		'automatic rebase without payload id',
	])('%s never pushes retired line ids or completed tombstones', async (scenario) => {
		const outbound: Record<string, unknown>[][] = [];
		let conflicts = scenario.startsWith('automatic rebase')
			? 1
			: scenario === 'manual rebase'
				? 2
				: 0;
		const { engine } = await createEngineHarness({
			mode: 'manual',
			fetch: async (_url, init) => {
				const body = JSON.parse(String(init?.body));
				outbound.push(body.payload.line_items);
				if (conflicts-- > 0)
					return new Response(
						JSON.stringify({
							code: 'woo_rxdb_sync_conflict',
							currentRevision: 'server-base',
							current: truth,
						}),
						{ status: 409 }
					);
				return new Response(JSON.stringify({ document: truth, currentRevision: 'acked' }), {
					status: 200,
				});
			},
		});
		try {
			await engine.ready;
			const db = engine.active()!.database;
			await writeFacetFor('orders')!.upsertServerDocument(
				db,
				writeFacetFor('orders')!.documentFromServerPayload(truth)
			);
			const doc = await db.collections.orders.findOne(UUID).exec();
			const { id: _id, ...withoutId } = truth;
			const payload = {
				...(scenario.endsWith('without payload id') ? withoutId : truth),
				line_items: [live, tombstone, kept],
			};
			await doc!.incrementalModify((row: Record<string, unknown>) => ({ ...row, payload }));
			const receipt =
				scenario !== 'adoption'
					? await engine.write({
							collection: 'orders',
							operation: 'update',
							recordId: UUID,
							payload,
						})
					: undefined;
			if (scenario.startsWith('successor') || scenario === 'undo' || scenario === 'adoption') {
				// Deletion A's full echo lands while B's frozen payload is pending.
				await writeFacetFor('orders')!.reconcile(db, {
					recordId: UUID,
					remoteId: remoteId(900),
					currentRevision: 'server-base',
					mutation: {
						mutationId: 'deletion-A',
						operation: 'update',
						recordId: UUID,
					},
					document: truth,
					identityDocument: truth,
				});
				if (scenario === 'undo') {
					// Captured Undo restores the pre-deletion id after the echo.
					await doc!.incrementalModify((row: Record<string, unknown>) => ({
						...row,
						payload: { ...truth, line_items: [{ product_id: 82, quantity: 3, meta_data }, kept] },
					}));
				}
			}
			if (scenario === 'adoption') {
				expect(doc!.getLatest().toJSON().payload.line_items).toEqual([
					kept,
					{ product_id: 82, quantity: 3, meta_data },
				]);
				await engine.write({ collection: 'orders', operation: 'update', recordId: UUID, payload });
			}
			await engine.sync('write-drain');
			if (scenario === 'manual rebase') {
				await doc!.incrementalModify((row: Record<string, unknown>) => ({ ...row, payload }));
				await engine.resolveConflict(receipt!.mutationId, 'retry-with-server-base');
				await engine.sync('write-drain');
			}
			const lines = outbound.at(-1)!;
			expect(lines).toEqual([{ product_id: 82, quantity: 3, meta_data }, kept]);
			expect(
				lines.every((line) => !line.id || truth.line_items.some((server) => server.id === line.id))
			).toBe(true);
			expect(lines.some((line) => line.product_id === null)).toBe(false);
		} finally {
			await engine.dispose();
		}
	});
});

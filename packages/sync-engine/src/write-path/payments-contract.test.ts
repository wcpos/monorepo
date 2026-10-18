import { expect, it } from 'vitest';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import { recordMutationQueueMigrationStrategies } from '@wcpos/sync-core';
import { createFakeWriteServer, ORDER_MONEY_ORACLE } from '@wcpos/sync-core/testing';

import { createEngineHarness } from '../testing';
import { writeFacetFor } from '../collections/collection-descriptors';
import { tillAggregateFor } from './order-till-aggregate';
import { queueFor } from './write-intents';

setPremiumFlag();
type Resident = {
	payload: Record<string, unknown> & { meta_data: { key: string; value: unknown }[] };
};
const id = '9a9a9a9a-1111-4111-8111-aaaaaaaaaaaa';
it.each([null, '1.2', '1.3'])(
	'gates wire fields at contract %s and stamps epoch at enqueue',
	async (contract) => {
		const server = createFakeWriteServer();
		const sent: Record<string, unknown>[] = [];
		const { engine } = createEngineHarness({
			mode: 'manual',
			ports: { paymentsContract: () => contract },
			fetch: async (url, init) => {
				if (url.includes('/push/orders')) sent.push(JSON.parse(init!.body as string));
				return server.fetch(url, init as never);
			},
			awaitReady: false,
		});
		try {
			await engine.ready;
			const db = engine.active()!.database;
			const payload: Record<string, unknown> = {
				...structuredClone(ORDER_MONEY_ORACLE.pos),
				status: 'processing',
				meta_data: [{ key: '_woocommerce_pos_uuid', value: id }],
			};
			await db.collections.orders.insert({
				uuid: id,
				remoteId: null,
				remoteKey: 'null',
				posUserId: '',
				posStoreId: '',
				number: '',
				dateCreatedGmt: '2026-08-06T00:00:00',
				status: 'processing',
				total: payload.total,
				customerId: 0,
				payload,
				sync: { revision: '', partial: false, source: 'skeleton' },
				local: { dirty: false, pendingMutationIds: [] },
			});
			await engine.write({
				collection: 'orders',
				operation: 'create',
				recordId: id,
				payload,
				explicit: true,
			});
			await engine.sync('write-drain');
			const resident = await db.collections.orders.findOne(id).exec();
			const current = resident!.toJSON().payload;
			await engine.write({
				collection: 'orders',
				operation: 'update',
				recordId: id,
				payload: current,
				explicit: true,
			});
			expect((await queueFor(db).pending())[0].expectedEpoch).toBe(0);
			await engine.sync('write-drain');
			const envelope = sent[1];
			expect(envelope).toBeDefined();
			if (contract === '1.3') {
				expect(envelope.expectedEpoch).toBe(0);
				expect(envelope.tillAggregate).toEqual(
					tillAggregateFor(envelope.payload as Record<string, unknown>, current)
				);
				expect(envelope.tillAggregate).not.toBeNull();
			} else {
				expect(Object.keys(envelope).sort()).toEqual(
					['mutationId', 'operation', 'collection', 'recordId', 'baseRevision', 'payload'].sort()
				);
			}
			await resident!.incrementalModify((row: Resident) => ({
				...row,
				payload: {
					...row.payload,
					meta_data: [...row.payload.meta_data, { key: '_wcpos_money_epoch', value: 2 }],
				},
			}));
			await engine.write({
				collection: 'orders',
				operation: 'update',
				recordId: id,
				payload: { customer_note: 'first' },
			});
			expect((await queueFor(db).pending())[0].expectedEpoch).toBe(2);
			await resident!.incrementalModify((row: Resident) => ({
				...row,
				payload: {
					...row.payload,
					meta_data: row.payload.meta_data.map((entry) =>
						entry.key === '_wcpos_money_epoch' ? { ...entry, value: 3 } : entry
					),
				},
			}));
			await engine.write({
				collection: 'orders',
				operation: 'update',
				recordId: id,
				payload: { customer_note: 'second' },
			});
			const queued = await queueFor(db).pending();
			expect(queued).toHaveLength(1);
			expect(queued[0].expectedEpoch).toBe(2);
			await engine.sync('write-drain');
			expect(sent.at(-1)!.expectedEpoch).toBe(contract === '1.3' ? 2 : undefined);
			await engine.write({
				collection: 'orders',
				operation: 'update',
				recordId: id,
				payload: { customer_note: 'legacy' },
			});
			// Upgraded queues must not acquire an invented epoch through migration or coalescing.
			const { expectedEpoch: _epoch, ...legacy } = (await queueFor(db).pending())[0];
			expect(recordMutationQueueMigrationStrategies[8](legacy)).not.toHaveProperty('expectedEpoch');
			await queueFor(db).replace(legacy);
			await engine.write({
				collection: 'orders',
				operation: 'update',
				recordId: id,
				payload: { customer_note: 'third' },
			});
			expect((await queueFor(db).pending())[0]).not.toHaveProperty('expectedEpoch');
			await engine.sync('write-drain');
			expect(sent.at(-1)).not.toHaveProperty('expectedEpoch');
		} finally {
			await engine.dispose();
		}
	}
);

it.each([6])(
	'generation %s captures a string epoch and coalesces against the first base',
	async (generation) => {
		const { engine } = await createEngineHarness({
			mode: 'manual',
			ports: { scopeDatabaseGeneration: generation },
		});
		try {
			const db = engine.active()!.database;
			const facet = writeFacetFor('orders')!;
			const payload = {
				id: 1,
				meta_data: [
					{ key: '_woocommerce_pos_uuid', value: id },
					{ key: '_wcpos_money_epoch', value: '2' },
				],
			};
			await facet.upsertServerDocument(db, facet.documentFromServerPayload(payload));
			await engine.write({
				collection: 'orders',
				operation: 'update',
				recordId: id,
				payload: { customer_note: 'first' },
			});
			expect((await queueFor(db).pending())[0].expectedEpoch).toBe(2);
			const resident = await db.collections.orders.findOne(id).exec();
			await resident!.incrementalPatch({
				payload: {
					...payload,
					meta_data: [payload.meta_data[0], { key: '_wcpos_money_epoch', value: '3' }],
				},
			});
			await engine.write({
				collection: 'orders',
				operation: 'update',
				recordId: id,
				payload: { customer_note: 'second' },
			});
			expect((await queueFor(db).pending()).map((row) => row.expectedEpoch)).toEqual([2]);
		} finally {
			await engine.dispose();
		}
	}
);

it('pushes a drainable-generation row without an epoch even at contract 1.3', async () => {
	const server = createFakeWriteServer();
	server.seed(id, { id: 42, revision: 'sha256:base-r1' });
	const sent: Record<string, unknown>[] = [];
	const { engine } = await createEngineHarness({
		mode: 'manual',
		ports: { scopeDatabaseGeneration: 5, paymentsContract: () => '1.3' },
		fetch: async (url, init) => {
			if (url.includes('/push/orders')) sent.push(JSON.parse(init!.body as string));
			return server.fetch(url, init as never);
		},
	});
	try {
		const db = engine.active()!.database;
		const facet = writeFacetFor('orders')!;
		const payload = {
			id: 42,
			customer_note: 'queued before upgrade',
			meta_data: [{ key: '_woocommerce_pos_uuid', value: id }],
		};
		await facet.upsertServerDocument(db, facet.documentFromServerPayload(payload));
		// This row was queued by the old app, not by today's enqueue path.
		await queueFor(db).enqueue({
			mutationId: 'legacy-order-update',
			collectionName: 'orders',
			operation: 'update',
			recordId: id,
			origin: 'existing',
			payload,
			baseRevision: 'sha256:base-r1',
			queuedAt: '2026-10-18T00:00:00.000Z',
		});
		expect((await queueFor(db).pending())[0]).not.toHaveProperty('expectedEpoch');
		await engine.sync('write-drain');
		expect(sent).toHaveLength(1);
		expect(sent[0]).toMatchObject({ operation: 'update', recordId: id });
		expect(sent[0]).not.toHaveProperty('expectedEpoch');
		expect(await queueFor(db).pending()).toHaveLength(0);
	} finally {
		await engine.dispose();
	}
});

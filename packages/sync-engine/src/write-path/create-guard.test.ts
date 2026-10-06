/**
 * Create or update is settled inside the write's placement turn: a `create` for
 * a record whose resident already carries a server id is enqueued as an UPDATE
 * of that record — no throw, every caller safe. (Belt and braces: the server's
 * born-twice contract also matches a create under the same uuid.)
 */
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';
import { describe, expect, it } from 'vitest';

import { createFakeWriteServer } from '@wcpos/sync-core/testing';
import { withOrderColumns } from '@wcpos/sync-core';

import { materializeLocalOnly } from '../materialization/record-materialization';
import { createEngineHarness } from '../testing';

setPremiumFlag();

const UUID = '00000000-0000-4000-8000-000000000177';
const meta = [{ key: '_woocommerce_pos_uuid', value: UUID }];

/** A synced order (server id 177), or with `bornLocal` the same order before the server knew it. */
function orderDocument(bornLocal = false) {
	const { storedDocument } = materializeLocalOnly({
		id: 177,
		status: 'processing',
		meta_data: meta,
	} as never);
	const { id: _serverId, ...localPayload } = storedDocument.payload as Record<string, unknown>;
	return withOrderColumns({
		...storedDocument,
		...(bornLocal ? { remoteId: null, remoteKey: '', payload: localPayload } : {}),
		sync: { ...storedDocument.sync, revision: bornLocal ? '' : 'sha256:r1' },
	} as never) as Record<string, unknown>;
}

async function harnessWithServer() {
	const server = createFakeWriteServer({ firstId: 177 });
	const harness = await createEngineHarness({
		mode: 'manual',
		fetch: async (url: string, init?: RequestInit) =>
			url.includes('/push/') ? server.fetch(url, init as never) : Response.json([]),
	});
	return { server, harness };
}

describe('write(create) for a record the server already holds', () => {
	it('is enqueued as an update of that record, under the receipt the caller waits on', async () => {
		const { server, harness } = await harnessWithServer();
		try {
			server.seed(UUID, { id: 177, revision: 'sha256:r1' });
			await harness.collection('orders').insert(orderDocument() as never);

			const receipt = await harness.engine.write({
				collection: 'orders',
				operation: 'create',
				recordId: UUID,
				payload: { status: 'completed', meta_data: meta },
			});
			const rows = (await harness.collection('mutations').find().exec()).map(
				(doc) => doc.toJSON() as Record<string, unknown>
			);
			expect(rows).toHaveLength(1);
			expect(rows[0]).toMatchObject({
				mutationId: receipt.mutationId,
				operation: 'update',
				recordId: UUID,
			});

			// The receipt's mutation is the one pushed and acknowledged: a waiter is answered.
			expect(await harness.engine.sync('write-drain')).toMatchObject({ pushed: 1, rejected: 0 });
			expect(server.received.map((envelope) => envelope.operation)).toEqual(['update']);
			expect(harness.events).toContainEqual(
				expect.objectContaining({ type: 'write-acknowledged', mutationId: receipt.mutationId })
			);
		} finally {
			await harness.dispose();
		}
	});

	it("the pay path's race: a create decided before the earlier create's ack landed becomes one update, no throw", async () => {
		const { server, harness } = await harnessWithServer();
		try {
			await harness.collection('orders').insert(orderDocument(true) as never);
			await harness.engine.write({
				collection: 'orders',
				operation: 'create',
				recordId: UUID,
				payload: { status: 'processing', meta_data: meta },
			});
			// The earlier create is pushed and acknowledged: the resident now has its server id.
			expect(await harness.engine.sync('write-drain')).toMatchObject({ pushed: 1 });
			const acked = (await harness.collection('orders').findOne(UUID).exec())!.toJSON() as {
				remoteId?: unknown;
			};
			expect(acked.remoteId).not.toBeNull();

			// The pay path read "no server id" just before that ack and asks for a create.
			const receipt = await harness.engine.write({
				collection: 'orders',
				operation: 'create',
				recordId: UUID,
				payload: { status: 'completed', meta_data: meta },
				explicit: true,
			});
			const rows = (await harness.collection('mutations').find().exec()).map(
				(doc) => doc.toJSON() as Record<string, unknown>
			);
			expect(rows).toEqual([
				expect.objectContaining({ mutationId: receipt.mutationId, operation: 'update' }),
			]);
			expect(await harness.engine.sync('write-drain')).toMatchObject({ pushed: 1, rejected: 0 });
			expect(server.received.map((envelope) => envelope.operation)).toEqual(['create', 'update']);
			expect(server.applied.size).toBe(1);
		} finally {
			await harness.dispose();
		}
	});

	it('requeueing a dead-lettered create whose record now has a server id re-sends it as an update', async () => {
		const { harness } = await harnessWithServer();
		try {
			await harness.collection('orders').insert(orderDocument() as never);
			const deadLetter = '00000000-0000-4000-8000-0000000001aa';
			await harness.collection('mutations').insert({
				mutationId: deadLetter,
				collectionName: 'orders',
				operation: 'create',
				recordId: UUID,
				origin: 'existing',
				payload: { status: 'processing', meta_data: meta },
				baseRevision: null,
				queuedAt: '2026-09-30T08:00:00.000Z',
				seq: 1,
				status: 'rejected',
				rejectedStatus: 400,
				rejectedReason: 'rest_invalid_param',
			});

			await harness.engine.resolveConflict(deadLetter, 'requeue-rebuilt');
			const rows = (await harness.collection('mutations').find().exec()).map(
				(doc) => doc.toJSON() as Record<string, unknown>
			);
			expect(rows).toEqual([
				expect.objectContaining({ operation: 'update', recordId: UUID, status: 'pending' }),
			]);
		} finally {
			await harness.dispose();
		}
	});
});

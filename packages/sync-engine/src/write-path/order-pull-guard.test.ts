// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import { type QueuedMutation, RecordMutationQueue } from '@wcpos/sync-core';

import { createEngineHarness } from '../testing';
import { createOrderHeldRowDiscarder } from './order-pull-guard';

setPremiumFlag();
afterEach(() => {
	vi.restoreAllMocks();
	return createEngineHarness.disposeTrackedEngines();
});
const UUID = '5b8e1a3c-2f4d-4a6b-9c8e-000000000042';
const row = (mutationId: string, seq: number, overrides: Partial<QueuedMutation> = {}) => ({
	mutationId,
	seq,
	recordId: UUID,
	collectionName: 'orders',
	operation: 'update',
	payload: { status: 'pos-open' },
	queuedAt: '2026-09-01T10:02:00.000Z',
	...overrides,
});

describe('createOrderHeldRowDiscarder', () => {
	it('removes pending/legacy candidates newest-first and clears only their resident ids', async () => {
		const harness = await createEngineHarness();
		await harness.engine.adoptOrderSnapshot({
			id: 42,
			status: 'pos-open',
			meta_data: [{ key: '_woocommerce_pos_uuid', value: UUID }],
		});
		const resident = await harness.collection('orders').findOne(UUID).exec();
		await resident!.incrementalPatch({
			local: { dirty: true, pendingMutationIds: ['older', 'newer', 'unrelated'] },
		});
		await harness.seed('recordMutations', [
			row('older', 1),
			row('newer', 2, { status: 'pending' }),
			row('dead', 3, { status: 'rejected' }),
		]);
		const remove = vi.spyOn(RecordMutationQueue.prototype, 'removePending');
		const discard = createOrderHeldRowDiscarder(
			harness.collection('recordMutations'),
			harness.collection('orders')
		);
		expect(await discard(UUID)).toBe(2);
		expect(remove.mock.calls).toEqual([['newer'], ['older']]);
		expect(
			(await harness.collection('recordMutations').find().exec()).map(
				(doc) => doc.toJSON().mutationId
			)
		).toEqual(['dead']);
		expect((await harness.collection('orders').findOne(UUID).exec())!.toJSON().local).toMatchObject(
			{ dirty: true, pendingMutationIds: ['unrelated'] }
		);
	});

	it.each<Partial<QueuedMutation>>([
		{ explicit: true },
		{ status: 'claimed' },
		{ status: 'conflicted' },
		{ status: 'needs-revision' },
		{ operation: 'delete' },
	])('touches nothing when any row is not held: %j', async (blocked) => {
		const harness = await createEngineHarness();
		await harness.seed('recordMutations', [row('held', 2), row('blocked', 1, blocked)]);
		const orders = { findOne: vi.fn() };
		const remove = vi.spyOn(RecordMutationQueue.prototype, 'removePending');
		expect(
			await createOrderHeldRowDiscarder(harness.collection('recordMutations'), orders)(UUID)
		).toBe(0);
		expect(remove).not.toHaveBeenCalled();
		expect(orders.findOne).not.toHaveBeenCalled();
		expect(await harness.collection('recordMutations').count().exec()).toBe(2);
	});
});

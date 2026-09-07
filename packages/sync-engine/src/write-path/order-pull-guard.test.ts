// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import { type QueuedMutation, RecordMutationQueue } from '@wcpos/sync-core';

import { createEngineHarness } from '../testing';
import { createOrderHeldRowDiscarder, type IncomingOrderSettlement } from './order-pull-guard';

setPremiumFlag();
afterEach(() => {
	vi.restoreAllMocks();
	return createEngineHarness.disposeTrackedEngines();
});
const UUID = '5b8e1a3c-2f4d-4a6b-9c8e-000000000042';
/** A paid document, newer than anything the till adopted (the seeded residents carry revision ''). */
const PAID: IncomingOrderSettlement = {
	status: 'completed',
	datePaid: '2026-09-01T10:03:00',
	revision: 'paid-revision',
};
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

type Harness = Awaited<ReturnType<typeof createEngineHarness>>;

/** Seed the resident the till holds, then mark it dirty with the given pending ids. */
async function seedResident(
	harness: Harness,
	payload: Record<string, unknown>,
	pendingMutationIds: string[]
) {
	expect(
		await harness.engine.adoptOrderSnapshot({
			id: 42,
			meta_data: [{ key: '_woocommerce_pos_uuid', value: UUID }],
			...payload,
		})
	).toBe('applied');
	const resident = await harness.collection('orders').findOne(UUID).exec();
	await resident!.incrementalPatch({ local: { dirty: true, pendingMutationIds } });
}

async function discarder(harness: Harness) {
	return createOrderHeldRowDiscarder(
		harness.collection('recordMutations'),
		harness.collection('orders')
	);
}

describe('createOrderHeldRowDiscarder', () => {
	it('retires held rows newest-first and clears only their resident ids once the store took payment', async () => {
		const harness = await createEngineHarness();
		await seedResident(harness, { status: 'pos-open' }, ['older', 'newer', 'unrelated']);
		await harness.seed('recordMutations', [
			row('older', 1),
			row('newer', 2, { status: 'pending' }),
			row('dead', 3, { status: 'rejected' }),
		]);
		const remove = vi.spyOn(RecordMutationQueue.prototype, 'removePending');

		expect(await (await discarder(harness))(UUID, PAID)).toBe(2);

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

	it('treats pos-partial as settlement even without a date_paid (the cash gateway sets none)', async () => {
		const harness = await createEngineHarness();
		await seedResident(harness, { status: 'pos-open' }, ['held']);
		await harness.seed('recordMutations', [row('held', 1)]);

		expect(
			await (
				await discarder(harness)
			)(UUID, { status: 'pos-partial', revision: 'partial-2' })
		).toBe(1);

		expect(await harness.collection('recordMutations').count().exec()).toBe(0);
		expect((await harness.collection('orders').findOne(UUID).exec())!.toJSON().local).toMatchObject(
			{ dirty: false, pendingMutationIds: [] }
		);
	});

	it('keeps the reopen of a pos-partial order: the incoming revision is the one the till already adopted', async () => {
		const harness = await createEngineHarness();
		// The till adopted the pos-partial document (revision = its date_modified_gmt), then the
		// cashier reopened it: pos-open, no date_paid on either side, one held row.
		await seedResident(harness, { status: 'pos-open', date_modified_gmt: '2026-09-01T09:30:00' }, [
			'reopen',
		]);
		await harness.seed('recordMutations', [row('reopen', 1)]);
		const remove = vi.spyOn(RecordMutationQueue.prototype, 'removePending');

		expect(
			await (
				await discarder(harness)
			)(UUID, {
				status: 'pos-partial',
				revision: '2026-09-01T09:30:00',
			})
		).toBe(0);

		expect(remove).not.toHaveBeenCalled();
		expect(await harness.collection('recordMutations').count().exec()).toBe(1);
		expect((await harness.collection('orders').findOne(UUID).exec())!.toJSON().local).toMatchObject(
			{ dirty: true, pendingMutationIds: ['reopen'] }
		);
	});

	it('clears the resident bookkeeping before removing rows, so a refused removal leaves a recoverable state', async () => {
		const harness = await createEngineHarness();
		await seedResident(harness, { status: 'pos-open' }, ['held']);
		await harness.seed('recordMutations', [row('held', 1)]);
		vi.spyOn(RecordMutationQueue.prototype, 'removePending').mockResolvedValueOnce(false);

		expect(await (await discarder(harness))(UUID, PAID)).toBe(0);

		// The row is still pending (so the record stays protected and the next settled
		// snapshot retries), and the resident no longer claims it — never the reverse.
		expect(await harness.collection('recordMutations').count().exec()).toBe(1);
		expect((await harness.collection('orders').findOne(UUID).exec())!.toJSON().local).toMatchObject(
			{ dirty: false, pendingMutationIds: [] }
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
		await seedResident(harness, { status: 'pos-open' }, ['held', 'blocked']);
		await harness.seed('recordMutations', [row('held', 2), row('blocked', 1, blocked)]);
		const remove = vi.spyOn(RecordMutationQueue.prototype, 'removePending');

		expect(await (await discarder(harness))(UUID, PAID)).toBe(0);

		expect(remove).not.toHaveBeenCalled();
		expect(await harness.collection('recordMutations').count().exec()).toBe(2);
		expect((await harness.collection('orders').findOne(UUID).exec())!.toJSON().local).toMatchObject(
			{ dirty: true, pendingMutationIds: ['held', 'blocked'] }
		);
	});

	it.each<IncomingOrderSettlement>([
		{ status: 'completed' }, // a status change without a payment is not settlement
		{ status: 'pos-open', datePaid: '2026-09-01T10:03:00' },
		{ status: undefined, datePaid: '2026-09-01T10:03:00' },
		{ status: '', datePaid: '2026-09-01T10:03:00' },
	])('touches nothing when the incoming document is not a settled sale: %j', async (incoming) => {
		const harness = await createEngineHarness();
		await seedResident(harness, { status: 'pos-open' }, ['held']);
		await harness.seed('recordMutations', [row('held', 1)]);
		const remove = vi.spyOn(RecordMutationQueue.prototype, 'removePending');

		expect(await (await discarder(harness))(UUID, incoming)).toBe(0);

		expect(remove).not.toHaveBeenCalled();
		expect(await harness.collection('recordMutations').count().exec()).toBe(1);
	});

	it.each([
		// A reopened order: pos-open locally, but the resident carries the date_paid it adopted
		// from the paid document — the held row IS the cashier's reopen.
		{
			label: 'a reopened paid order',
			payload: { status: 'pos-open', date_paid: '2026-09-01T09:00:00' },
		},
		{
			label: 'a reopen carrying date_paid_gmt only',
			payload: { status: 'pos-open', date_paid_gmt: '2026-09-01T09:00:00' },
		},
		// A void the server refused, converted to pending; an edit on a processing order.
		{ label: 'a void converted to pending', payload: { status: 'pending' } },
		{
			label: 'an edited processing order',
			payload: { status: 'processing', date_paid: '2026-09-01T09:00:00' },
		},
	])(
		'touches nothing when the till does not hold an unpaid open cart: $label',
		async ({ payload }) => {
			const harness = await createEngineHarness();
			await seedResident(harness, payload, ['held']);
			await harness.seed('recordMutations', [row('held', 1)]);
			const remove = vi.spyOn(RecordMutationQueue.prototype, 'removePending');

			expect(await (await discarder(harness))(UUID, PAID)).toBe(0);

			expect(remove).not.toHaveBeenCalled();
			expect(await harness.collection('recordMutations').count().exec()).toBe(1);
			expect(
				(await harness.collection('orders').findOne(UUID).exec())!.toJSON().local
			).toMatchObject({ dirty: true, pendingMutationIds: ['held'] });
		}
	);
});

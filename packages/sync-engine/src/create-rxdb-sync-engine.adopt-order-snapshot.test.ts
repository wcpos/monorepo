// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import { createEngineHarness, remoteId } from './testing';

setPremiumFlag();

const ORDER_UUID = '5b8e1a3c-2f4d-4a6b-9c8e-000000000042';

/** A server order payload; paid statuses carry the payment stamp WooCommerce sets on payment_complete(). */
function orderSnapshot(
	status: string,
	datePaid: string | null = status === 'pos-open' ? null : '2026-09-01T10:02:00'
) {
	return {
		id: 42,
		number: '42',
		status,
		date_created_gmt: '2026-09-01T10:00:00',
		date_modified_gmt: '2026-09-01T10:01:00',
		date_paid_gmt: datePaid,
		total: '10.00',
		customer_id: 0,
		meta_data: [{ key: '_woocommerce_pos_uuid', value: ORDER_UUID }],
		line_items: [],
	};
}

afterEach(createEngineHarness.disposeTrackedEngines);

describe('RxdbSyncEngine.adoptOrderSnapshot', () => {
	it('materializes and applies a valid checkout snapshot', async () => {
		const harness = await createEngineHarness();
		const payload = orderSnapshot('completed');

		expect(await harness.engine.adoptOrderSnapshot(payload)).toBe('applied');

		const stored = (await harness.collection('orders').findOne(ORDER_UUID).exec())?.toJSON() as
			Record<string, unknown> | undefined;
		expect(stored).toMatchObject({
			uuid: ORDER_UUID,
			remoteId: remoteId(42),
			status: 'completed',
			payload: { id: 42, status: 'completed' },
		});
	});

	it.each([
		// An explicit row is the cashier asking for a push: it protects, as it always did.
		{ explicit: true, status: 'completed', residentPaid: false, outcome: 'protected' },
		// The bug: a held (non-explicit) row on an unpaid open cart must not block the paid sale.
		{ explicit: false, status: 'completed', residentPaid: false, outcome: 'applied' },
		// The hold still holds while the store also says pos-open.
		{ explicit: false, status: 'pos-open', residentPaid: false, outcome: 'protected' },
		// A REOPENED order is pos-open locally but carries the date_paid it adopted from the paid
		// document: its held row is the cashier's reopen, and a pull of the paid document must not
		// throw it away.
		{ explicit: false, status: 'completed', residentPaid: true, outcome: 'protected' },
	])(
		'adopts $status over explicit=$explicit local work (resident paid=$residentPaid): $outcome',
		async ({ explicit, status, residentPaid, outcome }) => {
			const harness = await createEngineHarness();
			const residentPayload = orderSnapshot(
				'pos-open',
				residentPaid ? '2026-09-01T09:00:00' : null
			);
			await harness.seed('orders', [
				{
					uuid: ORDER_UUID,
					remoteId: remoteId(42),
					number: '42',
					dateCreatedGmt: '2026-09-01T10:00:00',
					status: 'pos-open',
					total: '10.00',
					customerId: 0,
					payload: residentPayload,
					sync: { revision: '', partial: false, source: 'woo-rest' },
					local: { dirty: true, pendingMutationIds: ['mutation-42'] },
				},
			]);
			await harness.seed('recordMutations', [
				{
					mutationId: 'mutation-42',
					explicit,
					seq: 1,
					status: 'pending',
					recordId: ORDER_UUID,
					collectionName: 'orders',
					operation: 'update',
					payload: { status: 'pos-open' },
					queuedAt: '2026-09-01T10:02:00.000Z',
				},
			]);

			expect(await harness.engine.adoptOrderSnapshot(orderSnapshot(status))).toBe(outcome);

			const stored = (await harness.collection('orders').findOne(ORDER_UUID).exec())?.toJSON() as
				Record<string, unknown> | undefined;
			expect(stored).toMatchObject({
				status: outcome === 'applied' ? 'completed' : 'pos-open',
				payload: { status: outcome === 'applied' ? 'completed' : 'pos-open' },
				local: {
					dirty: outcome !== 'applied',
					pendingMutationIds: outcome === 'applied' ? [] : ['mutation-42'],
				},
			});
			expect(await harness.collection('recordMutations').count().exec()).toBe(
				outcome === 'applied' ? 0 : 1
			);
		}
	);

	it('re-resolves pending mutations after the mutation collection is reset', async () => {
		const harness = await createEngineHarness();
		expect(await harness.engine.adoptOrderSnapshot(orderSnapshot('pos-open'))).toBe('applied');
		expect(
			await harness.engine.scope.resetCollection('mutations', { confirmDestroyQueue: true })
		).toBe('reset');
		await harness.seed('recordMutations', [
			{
				mutationId: 'mutation-after-reset',
				explicit: true,
				seq: 1,
				status: 'pending',
				recordId: ORDER_UUID,
				collectionName: 'orders',
				operation: 'update',
				payload: { status: 'pos-open' },
				queuedAt: '2026-09-01T10:02:00.000Z',
			},
		]);

		expect(await harness.engine.adoptOrderSnapshot(orderSnapshot('completed'))).toBe('protected');
		const stored = (await harness.collection('orders').findOne(ORDER_UUID).exec())?.toJSON() as
			Record<string, unknown> | undefined;
		expect(stored?.payload).toMatchObject({ status: 'pos-open' });
	});

	it('rejects an invalid payload without writing an order', async () => {
		const harness = await createEngineHarness();

		expect(await harness.engine.adoptOrderSnapshot({ id: 42, status: '' })).toBe('invalid');
		expect(await harness.collection('orders').count().exec()).toBe(0);
	});
});

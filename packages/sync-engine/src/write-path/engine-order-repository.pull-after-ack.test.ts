/**
 * A pull requested before an ack adopted the order whole must not overwrite it. Measured on
 * dev-next 2026-10-23 (orders 115547, 115569): a boot pull answered mid-create with Woo's
 * half-saved snapshot (`pending`, total 0.00) landed after the ack and zeroed the till's total.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import { withOrderColumns } from '@wcpos/sync-core';

import { createEngineHarness } from '../testing';
import { materializeLocalOnly } from '../materialization/record-materialization';
import { EngineOrderRepository } from './engine-order-repository';

setPremiumFlag();
let sequence = 0;
afterEach(() => createEngineHarness.disposeTrackedEngines());

const order = (status: string, total: string, revision: string) => {
	const document = materializeLocalOnly({
		id: 115547,
		status,
		total,
		meta_data: [{ key: '_woocommerce_pos_uuid', value: '00000000-0000-4000-8000-000000115547' }],
	} as never).storedDocument;
	return { ...document, sync: { ...document.sync, revision } };
};
const acked = () => {
	const document = order('processing', '25.000000', 'r2');
	return { ...document, sync: { ...document.sync, adopted: { revision: 'r2', at: 100 } } };
};

async function harness() {
	const h = await createEngineHarness({
		site: 'https://pull-after-ack.test',
		identity: { site: 'https://pull-after-ack.test', storeId: 1, cashierId: `c-${++sequence}` },
	});
	const scope = await h.engine.whenActive();
	const repo = new EngineOrderRepository(scope.database.collections as never);
	const orders = h.collection<ReturnType<typeof order>>('orders');
	const total = async () =>
		(await orders.findOne(acked().uuid).exec())?.toJSON().payload.total as string;
	return { repo, orders, total };
}

describe('a pull requested before the ack adopted the order', () => {
	it.each([
		{
			name: 'requested before the adoption: kept',
			requestedAt: 50,
			applied: 0,
			total: '25.000000',
		},
		{ name: 'requested after the adoption: applied', requestedAt: 150, applied: 1, total: '0.00' },
	])('$name', async ({ requestedAt, applied, total }) => {
		const h = await harness();
		await h.orders.insert(withOrderColumns(acked()));
		const stale = order('pending', '0.00', 'r1');
		expect(await h.repo.upsertMany([stale], { source: 'pull', requestedAt })).toHaveLength(applied);
		expect(await h.total()).toBe(total);
	});

	it('keeps an adoption that lands while the pull is being written', async () => {
		const h = await harness();
		await h.orders.insert(withOrderColumns(order('pending', '0.00', 'r0')));
		const getLocal = h.orders.getLocal.bind(h.orders);
		vi.spyOn(h.orders, 'getLocal').mockImplementationOnce(async (id) => {
			const resident = await h.orders.findOne(acked().uuid).exec();
			await resident!.incrementalModify(() => withOrderColumns(acked()) as never);
			return getLocal(id);
		});
		const stale = order('pending', '0.00', 'r1');
		expect(await h.repo.upsertMany([stale], { source: 'pull', requestedAt: 50 })).toEqual([]);
		expect(await h.total()).toBe('25.000000');
	});

	it('leaves the ack unaffected', async () => {
		const h = await harness();
		await h.orders.insert(withOrderColumns(acked()));
		const next = order('completed', '30.000000', 'r3');
		const context = { source: 'ack', mutationId: 'm', recordId: next.uuid } as const;
		expect(await h.repo.upsertMany([next], context)).toHaveLength(1);
		expect(await h.total()).toBe('30.000000');
	});
});

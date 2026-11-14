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
import { createOrderRevisionDoor } from './order-revision';

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
	const door = createOrderRevisionDoor({
		resolveDatabase: async () => scope.database as never,
		require: () => {
			throw new Error('unused');
		},
	});
	const sync = async () =>
		(await orders.findOne(acked().uuid).exec())?.toJSON().sync as Record<string, unknown>;
	return { repo, orders, total, door, sync };
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

describe("a mirrored answer's stamp and the pull (ADR 0040 §1.3)", () => {
	it('an equal-revision stamp after the ack never lets a pull requested before the adoption in', async () => {
		const h = await harness();
		await h.orders.insert(withOrderColumns(acked()));
		await h.door.stamp(acked().uuid, 'r2', 120);
		expect(await h.sync()).toMatchObject({ revision: 'r2', stamped: { at: 120 } });
		const stale = order('pending', '0.00', 'r1');
		expect(await h.repo.upsertMany([stale], { source: 'pull', requestedAt: 50 })).toEqual([]);
		expect(await h.total()).toBe('25.000000');
	});

	it('a naked stamp after the ack never lets a pull requested before the adoption in', async () => {
		const h = await harness();
		await h.orders.insert(withOrderColumns(acked()));
		await h.door.stamp(acked().uuid, 'r3', 120);
		const stale = order('pending', '0.00', 'r1');
		expect(await h.repo.upsertMany([stale], { source: 'pull', requestedAt: 50 })).toEqual([]);
		expect(await h.total()).toBe('25.000000');
	});

	it('an unchanged pull after a poll stays skipped and keeps the stamp', async () => {
		const h = await harness();
		await h.orders.insert(withOrderColumns(acked()));
		await h.door.stamp(acked().uuid, 'r2', 120);
		const before = await h.sync();
		const same = order('processing', '25.000000', 'r2');
		await h.repo.upsertMany([same], { source: 'pull', requestedAt: 150 });
		expect(await h.sync()).toEqual(before);
	});

	it('a written pull adopts its document and clears the stamp', async () => {
		const h = await harness();
		await h.orders.insert(withOrderColumns(acked()));
		await h.door.stamp(acked().uuid, 'r2', 120);
		const moved = order('completed', '30.000000', 'r3');
		expect(await h.repo.upsertMany([moved], { source: 'pull', requestedAt: 150 })).toHaveLength(1);
		const sync = await h.sync();
		expect(sync).toMatchObject({ revision: 'r3', adopted: { revision: 'r3' } });
		expect(sync).not.toHaveProperty('stamped');
	});

	it('keeps a stamp that lands while the pull is being written', async () => {
		const h = await harness();
		await h.orders.insert(withOrderColumns(acked()));
		const later = Date.now() + 60_000; // the answer arrived after this pull adopts
		const getLocal = h.orders.getLocal.bind(h.orders);
		vi.spyOn(h.orders, 'getLocal').mockImplementationOnce(async (id) => {
			await h.door.stamp(acked().uuid, 'r4', later);
			return getLocal(id);
		});
		const moved = order('completed', '30.000000', 'r3');
		expect(await h.repo.upsertMany([moved], { source: 'pull', requestedAt: 150 })).toHaveLength(1);
		expect(await h.sync()).toMatchObject({ stamped: { at: later }, adopted: { revision: 'r3' } });
	});
});

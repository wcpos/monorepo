/**
 * The receipt print-count stash has two writers — the pull's materialisation
 * retiring applied entries, and the previous-generation drain adding entries —
 * so every change is an atomic modification of the latest document, never a
 * read-modify-write of a snapshot (which drops the other writer's entries).
 */
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';
import { describe, expect, it } from 'vitest';

import { withOrderColumns } from '@wcpos/sync-core';

import { materializeLocalOnly } from '../materialization/record-materialization';
import { createEngineHarness } from '../testing';
import {
	applyStashedPrintCounts,
	EngineOrderRepository,
	RESYNC_RECEIPT_PRINT_COUNTS_ID,
	retireStashedPrintCounts,
	stashPrintCounts,
} from './engine-order-repository';

setPremiumFlag();

describe('the receipt print-count stash', () => {
	it('a drain merge interleaved with a pull retiring an entry: the merged entry survives', async () => {
		const harness = await createEngineHarness({ mode: 'manual' });
		try {
			const orders = harness.collection('orders') as never;
			await stashPrintCounts(orders, { A: 1, C: 3 });
			// The pull retires A while the drain stashes B: neither may undo the other.
			await Promise.all([
				retireStashedPrintCounts(orders, ['A']),
				stashPrintCounts(orders, { B: 2 }),
			]);
			const stash = await harness.collection('orders').getLocal(RESYNC_RECEIPT_PRINT_COUNTS_ID);
			expect(stash?.get('counts')).toEqual({ B: 2, C: 3 });
		} finally {
			await harness.dispose();
		}
	});

	it('two drains stashing at once keep both, and the larger count for one order', async () => {
		const harness = await createEngineHarness({ mode: 'manual' });
		try {
			const orders = harness.collection('orders') as never;
			await Promise.all([
				stashPrintCounts(orders, { A: 1, B: 2 }),
				stashPrintCounts(orders, { A: 4, C: 1 }),
			]);
			const stash = await harness.collection('orders').getLocal(RESYNC_RECEIPT_PRINT_COUNTS_ID);
			expect(stash?.get('counts')).toEqual({ A: 4, B: 2, C: 1 });
		} finally {
			await harness.dispose();
		}
	});

	const X = '00000000-0000-4000-8000-0000000002aa';
	/** A synced order X whose receipt was printed `count` times on this till. */
	const syncedOrder = (count?: number) => {
		const { storedDocument } = materializeLocalOnly({
			id: 202,
			status: 'completed',
			meta_data: [{ key: '_woocommerce_pos_uuid', value: X }],
		} as never);
		return withOrderColumns({
			...storedDocument,
			local: {
				dirty: false,
				pendingMutationIds: [],
				...(count === undefined ? {} : { receiptPrintCount: count }),
			},
		} as never) as never;
	};
	/** The orders collection with one method intercepted. */
	const intercept = <T extends object>(
		target: T,
		name: string,
		around: (...args: never[]) => unknown
	) =>
		new Proxy(target, {
			get(real, property) {
				if (property === name) return around;
				const value = Reflect.get(real, property, real) as unknown;
				return typeof value === 'function' ? value.bind(real) : value;
			},
		});

	it('an apply whose order a reset removes before retirement keeps the entry; the next pull lands it', async () => {
		const harness = await createEngineHarness({ mode: 'manual' });
		try {
			const real = harness.collection('orders');
			await real.insert(syncedOrder(1));
			await stashPrintCounts(real as never, { [X]: 5 });
			// The apply raises X to 5; a reset (whose stash already kept 5) removes X before the
			// apply's retirement re-reads it inside the stash turn.
			let reads = 0;
			const orders = intercept(real, 'findByIds', ((ids: string[]) => ({
				exec: async () => {
					reads += 1;
					if (reads === 2) await (await real.findOne(X).exec())?.remove();
					return real.findByIds(ids).exec();
				},
			})) as never);
			await applyStashedPrintCounts(orders as never, [X]);
			expect((await real.getLocal(RESYNC_RECEIPT_PRINT_COUNTS_ID))?.get('counts')).toEqual({
				[X]: 5,
			});

			const { database } = await harness.engine.whenActive();
			await new EngineOrderRepository(database.collections as never).upsertMany([syncedOrder()]);
			expect(((await real.findOne(X).exec())?.toJSON() as { local: unknown }).local).toMatchObject({
				receiptPrintCount: 5,
			});
		} finally {
			await harness.dispose();
		}
	});

	it('a reset keeps the count an apply raised after the reset read the order', async () => {
		const harness = await createEngineHarness({ mode: 'manual' });
		try {
			const real = harness.collection('orders');
			await real.insert(syncedOrder(1));
			// The reset read X at 1; an apply raises it to 5 just before the reset removes it.
			const orders = intercept(real, 'bulkRemove', (async (ids: string[]) => {
				await (await real.findOne(X).exec())!.incrementalModify(
					(data: Record<string, unknown>) => ({
						...data,
						local: { ...(data.local as object), receiptPrintCount: 5 },
					})
				);
				return real.bulkRemove(ids);
			}) as never);
			const { database } = await harness.engine.whenActive();
			await new EngineOrderRepository({
				...database.collections,
				orders,
			} as never).resetForResync();
			expect(await real.findOne(X).exec()).toBeNull();
			expect((await real.getLocal(RESYNC_RECEIPT_PRINT_COUNTS_ID))?.get('counts')).toEqual({
				[X]: 5,
			});

			await new EngineOrderRepository(database.collections as never).upsertMany([syncedOrder()]);
			expect(((await real.findOne(X).exec())?.toJSON() as { local: unknown }).local).toMatchObject({
				receiptPrintCount: 5,
			});
		} finally {
			await harness.dispose();
		}
	});
});

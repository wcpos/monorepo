// #3605: a journal reset empties the orders, so it forgets the completed orders walks too.
// In-flight rows stay: the reset runs inside a walk whose lease renews against its row.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import { createEngineHarness } from '../testing';
import { materializeLocalOnly } from '../materialization/record-materialization';
import { coverageLaneKey } from '../local-coverage/persistence';
import { seedOrderFilterSchedulerTask } from '../scheduler/rx-order-scheduler-task-seeder';
import { RxSchedulerTaskStateRepository } from '../scheduler/rx-scheduler-task-state-repository';
import { EngineOrderRepository } from './engine-order-repository';

import type { PersistedSchedulerTaskState } from '../scheduler/persisted-scheduler-state';

setPremiumFlag();
afterEach(() => createEngineHarness.disposeTrackedEngines());

const T = 1_000_000;
const RANGE = { status: 'completed', search: '', limit: 100, complete: true } as const;
let sequence = 0;

async function harness() {
	const h = await createEngineHarness({
		site: 'https://reset-for-resync.test',
		identity: { site: 'https://reset-for-resync.test', storeId: 1, cashierId: `c-${++sequence}` },
	});
	const { database } = await h.engine.whenActive();
	const collections = database.collections;
	const tasks = new RxSchedulerTaskStateRepository(collections);
	return {
		...h,
		collections,
		tasks,
		repo: new EngineOrderRepository(collections as never),
		states: (collection = 'orders') => tasks.readForCollections([collection]),
		seed: (nowMs: number) =>
			seedOrderFilterSchedulerTask({ ...RANGE, afterSeconds: 1, nowMs, database: collections }),
	};
}

/** The runner's own transitions: claim in-flight, then complete. */
async function claim(tasks: RxSchedulerTaskStateRepository, queued: PersistedSchedulerTaskState) {
	const inFlight = {
		...queued,
		status: 'in-flight' as const,
		ownerId: 'walk-owner',
		claimedUntilMs: T + 60_000,
		updatedAtMs: T,
	};
	expect(await tasks.claim(queued, inFlight)).toBe(true);
	return inFlight;
}
async function complete(
	tasks: RxSchedulerTaskStateRepository,
	queued: PersistedSchedulerTaskState
) {
	const inFlight = await claim(tasks, queued);
	const completed = {
		...inFlight,
		status: 'completed' as const,
		ownerId: null,
		claimedUntilMs: null,
		retryAfterMs: null,
		updatedAtMs: T,
	};
	expect(await tasks.markCompleted(inFlight, completed)).toBe(true);
	return completed;
}

function lane(queryKey: string) {
	return {
		laneKey: coverageLaneKey('orders', queryKey),
		collectionName: 'orders',
		queryKey,
		complete: true,
		expectedRecordIds: ['a'],
		freshUntilMs: T + 60_000,
		updatedAtMs: T,
		schemaVersion: 3,
	};
}

const order = (id: number) =>
	materializeLocalOnly({
		id,
		status: 'completed',
		meta_data: [
			{
				key: '_woocommerce_pos_uuid',
				value: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
			},
		],
	} as never).storedDocument;

describe('resetForResync and the orders walks', () => {
	it('a range walked just before the reset is walked again, not skipped as completed', async () => {
		const h = await harness();
		expect((await h.seed(T)).inserted).toBe(1);
		const [queued] = await h.states();
		const completed = await complete(h.tasks, queued!);
		// Inside the 30 s completed-dedupe, a re-seed is skipped: the baseline the reset must lift.
		expect((await h.seed(T + 500)).skippedCompleted).toBe(1);
		// Another collection's completed walk is not the reset's to forget.
		await h.tasks.upsert({ ...completed, taskId: 'products:walked', collection: 'products' });

		await h.repo.resetForResync();

		const again = await h.seed(T + 1_000);
		expect(again.skippedCompleted).toBe(0);
		expect(again.inserted).toBe(1);
		expect((await h.states()).map((state) => state.status)).toEqual(['queued']);
		expect((await h.states('products')).map((state) => state.status)).toEqual(['completed']);
	});

	it('an in-flight orders walk keeps its row through the reset, and renews its lease', async () => {
		const h = await harness();
		await h.seed(T);
		const [queued] = await h.states();
		const inFlight = await claim(h.tasks, queued!);

		await h.repo.resetForResync();

		expect(await h.states()).toEqual([inFlight]);
		const renewed = { ...inFlight, claimedUntilMs: T + 120_000, updatedAtMs: T + 60_000 };
		expect(await h.tasks.claim(inFlight, renewed)).toBe(true);
		// Why it must stay: renewing a missing row fails, so the walk would end renewal-lost.
		expect(await h.tasks.remove(renewed)).toBe(true);
		expect(await h.tasks.claim(renewed, { ...renewed, updatedAtMs: T + 90_000 })).toBe(false);
	});

	it('a lane published while the reset removes the orders is gone when the reset resolves', async () => {
		const h = await harness();
		await h.repo.upsertMany([order(42)]);
		const orders = h.collections.orders;
		const removeOrders = orders.bulkRemove.bind(orders);
		const late = lane('orders:late-walk');
		let published = false; // a flag, not toHaveBeenCalled: mockRestore clears the recorded calls
		const remove = vi.spyOn(orders, 'bulkRemove').mockImplementationOnce(async (ids) => {
			// A walk that started inside the reset's scan publishes over orders about to go.
			await h.collections.coverageLanes.upsert(late);
			published = true;
			return removeOrders(ids as string[]);
		});
		try {
			await h.repo.resetForResync();
		} finally {
			remove.mockRestore();
		}
		expect(published).toBe(true);
		expect(await orders.findOne(order(42).uuid).exec()).toBeNull();
		expect(await h.collections.coverageLanes.findOne(late.laneKey).exec()).toBeNull();
	});
});

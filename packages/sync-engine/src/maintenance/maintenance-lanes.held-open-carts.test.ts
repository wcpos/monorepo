import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StoreScopeManager, type SyncEvent } from '@wcpos/sync-core';

import { createMaintenanceLanes } from './maintenance-lanes';
import { censusTotalsFromCache } from '../scheduler';
import { seedPersistedSchedulerTasks } from '../scheduler/rx-scheduler-task-seeder';
import { remoteId } from '../testing';

vi.mock('../scheduler/rx-scheduler-task-seeder', async (importOriginal) => ({
	...(await importOriginal<typeof import('../scheduler/rx-scheduler-task-seeder')>()),
	seedPersistedSchedulerTasks: vi.fn(async () => ({
		inserted: 1,
		requeued: 0,
		skippedActive: 0,
		skippedCompleted: 0,
		skippedRunnable: 0,
		claimLost: 0,
	})),
}));

type Resident = {
	remoteId: ReturnType<typeof remoteId> | null;
	status: string;
	local: { dirty: boolean; pendingMutationIds: string[] };
};
const resident = (id: number | null, overrides: Partial<Resident> = {}): Resident => ({
	remoteId: id === null ? null : remoteId(id),
	status: 'pos-open',
	local: { dirty: false, pendingMutationIds: [] },
	...overrides,
});

async function harness(rows: Resident[]) {
	const find = vi.fn(({ selector }: { selector: { status: string } }) => ({
		exec: async () =>
			rows.filter((row) => row.status === selector.status).map((row) => ({ toJSON: () => row })),
	}));
	const database = {
		collections: { orders: { find } },
		listCollections: () => [],
		resetCollection: async () => undefined,
		pendingMutationIds: async () => [],
		close: async () => undefined,
	};
	const manager = new StoreScopeManager({ createDatabase: async () => database });
	await manager.switchTo('scope');
	const diagnostics: SyncEvent[] = [];
	const lanes = createMaintenanceLanes({
		manager,
		databaseFor: () => database as never,
		coverageFor: () => null,
		syncBaseUrl: 'https://example.test/wp-json/wcpos/v2',
		fetcher: async () => Response.json({}),
		connectivity: () => 'online',
		diagnostics: (event) => diagnostics.push(event),
		ownerId: () => 'owner',
		censusFreshForMs: 60_000,
		customerTrickleStateFor: () => ({ get: async () => null, set: async () => undefined }),
		censusTotals: async () => censusTotalsFromCache([], 1_000),
		customerCensusTotal: async () => null,
		productTrickleStateFor: () => ({ get: async () => null, set: async () => undefined }),
		productCensusTotal: async () => null,
		variationPrefetchStateFor: () => ({ get: async () => null, set: async () => undefined }),
		variationCensusTotal: async () => null,
		hasPendingInteractiveWork: () => false,
		emitEvent: () => undefined,
		now: () => 1_000,
	});
	return { lanes, find, diagnostics };
}

const targetedSeeds = () =>
	vi
		.mocked(seedPersistedSchedulerTasks)
		.mock.calls.map(([input]) => input)
		.filter((input) => input.tasks.some((task) => task.mode === 'on-demand'));

describe('order window held open carts', () => {
	beforeEach(() => vi.clearAllMocks());

	it('checks only remote-backed open carts with no pending local work on each tick', async () => {
		const context = await harness([
			resident(101),
			resident(102),
			resident(null),
			resident(103, { local: { dirty: true, pendingMutationIds: [] } }),
			resident(104, { local: { dirty: false, pendingMutationIds: ['mutation'] } }),
			resident(105, { status: 'completed' }),
		]);
		for (let tick = 0; tick < 2; tick++) {
			await expect(context.lanes.orderWindowSeed.tick()).resolves.toMatchObject({ status: 'ran' });
		}
		expect(context.find).toHaveBeenCalledWith({ selector: { status: 'pos-open' } });
		expect(targetedSeeds()).toHaveLength(2);
		for (const seed of targetedSeeds()) {
			expect(seed).toMatchObject({
				tasks: [
					{ collection: 'orders', remoteIds: ['101', '102'], priority: 600, mode: 'on-demand' },
				],
				completedDedupeForMs: 0,
				nowMs: 1_000,
			});
		}
		expect(context.diagnostics).toContainEqual(
			expect.objectContaining({
				message: expect.stringContaining('queued a check of 2 held open carts'),
			})
		);
	});

	it.each([
		{ label: 'empty residency', rows: [] },
		{
			label: 'only ineligible carts',
			rows: [
				resident(null),
				resident(103, { local: { dirty: true, pendingMutationIds: [] } }),
				resident(104, { local: { dirty: false, pendingMutationIds: ['mutation'] } }),
				resident(105, { status: 'completed' }),
			],
		},
	])('seeds no targeted task for $label', async ({ rows }) => {
		const context = await harness(rows);
		await expect(context.lanes.orderWindowSeed.tick()).resolves.toMatchObject({ status: 'ran' });
		expect(targetedSeeds()).toEqual([]);
	});
});

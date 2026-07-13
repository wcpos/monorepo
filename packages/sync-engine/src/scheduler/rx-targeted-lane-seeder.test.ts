// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { seedTargetedLane, type TargetedLaneDescriptor } from './rx-targeted-lane-seeder';

const mocks = vi.hoisted(() => ({
	getRepository: vi.fn(),
	RxSchedulerTaskStateRepository: vi.fn(),
	seedPersistedSchedulerTasks: vi.fn(),
}));

vi.mock('./rx-scheduler-task-state-repository', () => ({
	RxSchedulerTaskStateRepository: mocks.RxSchedulerTaskStateRepository,
}));

vi.mock('./rx-scheduler-task-seeder', () => ({
	seedPersistedSchedulerTasks: mocks.seedPersistedSchedulerTasks,
}));

// A synthetic third-collection descriptor — the PLANNED `variations` replication
// lane (rxChangeSignalReplicationTick.ts defers variation pulls today). Using it
// here proves the generic helper is ready for the third lane without shipping an
// unwired production seeder.
const VARIATIONS_LANE: TargetedLaneDescriptor = {
	collection: 'variations',
	idLabel: 'variation',
	keyPrefix: 'variations',
	requirementPrefix: 'variations',
	documentId: (id) => `woo-variation:${id}`,
	defaultPriority: 800,
	defaultBatchSize: 50,
	defaultCompletedDedupeForMs: 20_000,
};

function fakeWiring() {
	const orderRepository = { getDatabase: vi.fn(() => ({ name: 'mock-db' })) };
	const schedulerRepository = { readForTaskIds: vi.fn(), claimNew: vi.fn(), claim: vi.fn() };
	const result = {
		inserted: 1,
		requeued: 0,
		skippedActive: 0,
		skippedCompleted: 0,
		skippedRunnable: 0,
		claimLost: 0,
	};
	mocks.getRepository.mockResolvedValue(orderRepository);
	mocks.RxSchedulerTaskStateRepository.mockImplementation(
		function RxSchedulerTaskStateRepositoryMock() {
			return schedulerRepository;
		}
	);
	mocks.seedPersistedSchedulerTasks.mockResolvedValue(result);
	return { orderRepository, schedulerRepository, result };
}

describe('seedTargetedLane', () => {
	beforeEach(() => {
		mocks.getRepository.mockReset();
		mocks.RxSchedulerTaskStateRepository.mockReset();
		mocks.seedPersistedSchedulerTasks.mockReset();
	});

	it('normalizes (dedup + ascending sort) and builds the descriptor task shape', async () => {
		const { orderRepository, schedulerRepository, result } = fakeWiring();

		await expect(
			seedTargetedLane(VARIATIONS_LANE, {
				getRepository: mocks.getRepository,
				ids: [456, 123, 123],
				priority: 950,
				batchSize: 50,
				completedDedupeForMs: 30_000,
				nowMs: 12_000,
			})
		).resolves.toBe(result);

		expect(orderRepository.getDatabase).toHaveBeenCalledTimes(1);
		expect(mocks.RxSchedulerTaskStateRepository).toHaveBeenCalledWith({ name: 'mock-db' });
		expect(mocks.seedPersistedSchedulerTasks).toHaveBeenCalledWith({
			repository: schedulerRepository,
			tasks: [
				{
					id: 'variations:ids:123,456:on-demand',
					requirementId: 'variations.targeted.123,456',
					collection: 'variations',
					queryKey: 'variations:ids:123,456',
					ids: ['woo-variation:123', 'woo-variation:456'],
					wooIds: [123, 456],
					limit: 50,
					priority: 950,
					mode: 'on-demand',
				},
			],
			nowMs: 12_000,
			completedDedupeForMs: 30_000,
			coalesceInFlight: false, // generic lane defaults off; only change-signal seeders opt in
		});
		const seederInput = mocks.seedPersistedSchedulerTasks.mock.calls[0][0];
		expect(seederInput).not.toHaveProperty('ownerId');
		expect(seederInput).not.toHaveProperty('claimForMs');
	});

	it('defaults priority, batch size, and dedupe window from the descriptor', async () => {
		fakeWiring();

		await seedTargetedLane(VARIATIONS_LANE, {
			getRepository: mocks.getRepository,
			ids: [7],
			nowMs: 1_000,
		});

		expect(mocks.seedPersistedSchedulerTasks).toHaveBeenCalledWith(
			expect.objectContaining({
				tasks: [
					expect.objectContaining({
						id: 'variations:ids:7:on-demand',
						queryKey: 'variations:ids:7',
						ids: ['woo-variation:7'],
						limit: 50,
						priority: 800,
						mode: 'on-demand',
					}),
				],
				completedDedupeForMs: 20_000,
			})
		);
	});

	it('forwards a non-positive completedDedupeForMs unchanged (disables completed-dedupe)', async () => {
		fakeWiring();

		await seedTargetedLane(VARIATIONS_LANE, {
			getRepository: mocks.getRepository,
			ids: [7],
			completedDedupeForMs: 0,
			nowMs: 1_000,
		});

		expect(mocks.seedPersistedSchedulerTasks).toHaveBeenCalledWith(
			expect.objectContaining({
				completedDedupeForMs: 0,
			})
		);
	});

	it('defaults nowMs to a real clock when omitted', async () => {
		fakeWiring();

		await seedTargetedLane(VARIATIONS_LANE, {
			getRepository: mocks.getRepository,
			ids: [7],
		});

		const seederInput = mocks.seedPersistedSchedulerTasks.mock.calls[0][0];
		expect(typeof seederInput.nowMs).toBe('number');
		expect(seederInput.nowMs).toBeGreaterThan(0);
	});

	it('rejects empty and invalid ids with the descriptor label before queuing work', async () => {
		fakeWiring();

		await expect(
			seedTargetedLane(VARIATIONS_LANE, {
				getRepository: mocks.getRepository,
				ids: [],
			})
		).rejects.toThrow('Targeted variation scheduler task requires at least one variation id');
		await expect(
			seedTargetedLane(VARIATIONS_LANE, {
				getRepository: mocks.getRepository,
				ids: [0],
			})
		).rejects.toThrow('Targeted variation scheduler task requires positive integer variation ids');
		await expect(
			seedTargetedLane(VARIATIONS_LANE, {
				getRepository: mocks.getRepository,
				ids: [1.5],
			})
		).rejects.toThrow('positive integer variation ids');
		await expect(
			seedTargetedLane(VARIATIONS_LANE, {
				getRepository: mocks.getRepository,
				ids: [5],
				batchSize: 0,
			})
		).rejects.toThrow('Targeted variation scheduler task batch size must be a positive integer');
		expect(mocks.getRepository).not.toHaveBeenCalled();
		expect(mocks.seedPersistedSchedulerTasks).not.toHaveBeenCalled();
	});

	it('splits by batch size into ordered chunks covering every id', async () => {
		fakeWiring();

		await seedTargetedLane(VARIATIONS_LANE, {
			getRepository: mocks.getRepository,
			ids: [5, 4, 3, 2, 1],
			batchSize: 2,
			nowMs: 1_000,
		});

		const seederInput = mocks.seedPersistedSchedulerTasks.mock.calls[0][0];
		expect(seederInput.tasks.map((task: { ids?: string[] }) => task.ids)).toEqual([
			['woo-variation:1', 'woo-variation:2'],
			['woo-variation:3', 'woo-variation:4'],
			['woo-variation:5'],
		]);
		for (const task of seederInput.tasks as { limit: number }[]) {
			expect(task.limit).toBe(2);
		}
	});

	it('splits large sets into tasks with schema-safe keys', async () => {
		fakeWiring();

		await seedTargetedLane(VARIATIONS_LANE, {
			getRepository: mocks.getRepository,
			ids: Array.from({ length: 100 }, (_, index) => index + 1),
			batchSize: 100,
			nowMs: 12_000,
		});

		const seederInput = mocks.seedPersistedSchedulerTasks.mock.calls[0][0];
		expect(seederInput.tasks.length).toBeGreaterThan(1);
		expect(seederInput.tasks.flatMap((task: { ids?: string[] }) => task.ids ?? [])).toEqual(
			Array.from({ length: 100 }, (_, index) => `woo-variation:${index + 1}`)
		);
		for (const task of seederInput.tasks as {
			requirementId: string;
			queryKey: string;
			ids?: string[];
			limit: number;
		}[]) {
			expect(task.requirementId.length).toBeLessThanOrEqual(256);
			expect(task.queryKey.length).toBeLessThanOrEqual(256);
			expect(task.ids?.length).toBeLessThanOrEqual(100);
			expect(task.limit).toBe(100);
		}
	});

	it('reproduces the product and order lane shapes from descriptors', async () => {
		const productLane: TargetedLaneDescriptor = {
			collection: 'products',
			idLabel: 'product',
			keyPrefix: 'products',
			requirementPrefix: 'products',
			documentId: (id) => `woo-product:${id}`,
			defaultPriority: 900,
			defaultBatchSize: 100,
			defaultCompletedDedupeForMs: 30_000,
		};
		const orderLane: TargetedLaneDescriptor = {
			collection: 'orders',
			idLabel: 'order',
			keyPrefix: 'orders',
			requirementPrefix: 'orders',
			documentId: (id) => `woo-order:${id}`,
			defaultPriority: 900,
			defaultBatchSize: 100,
			defaultCompletedDedupeForMs: 30_000,
		};

		fakeWiring();
		await seedTargetedLane(productLane, {
			getRepository: mocks.getRepository,
			ids: [456, 123, 123],
			priority: 950,
			batchSize: 50,
			completedDedupeForMs: 30_000,
			nowMs: 12_000,
		});
		expect(mocks.seedPersistedSchedulerTasks.mock.calls[0][0].tasks).toEqual([
			{
				id: 'products:ids:123,456:on-demand',
				requirementId: 'products.targeted.123,456',
				collection: 'products',
				queryKey: 'products:ids:123,456',
				ids: ['woo-product:123', 'woo-product:456'],
				wooIds: [123, 456],
				limit: 50,
				priority: 950,
				mode: 'on-demand',
			},
		]);

		mocks.seedPersistedSchedulerTasks.mockClear();
		await seedTargetedLane(orderLane, {
			getRepository: mocks.getRepository,
			ids: [456, 123, 123],
			priority: 950,
			batchSize: 50,
			completedDedupeForMs: 30_000,
			nowMs: 12_000,
		});
		expect(mocks.seedPersistedSchedulerTasks.mock.calls[0][0].tasks).toEqual([
			{
				id: 'orders:ids:123,456:on-demand',
				requirementId: 'orders.targeted.123,456',
				collection: 'orders',
				queryKey: 'orders:ids:123,456',
				ids: ['woo-order:123', 'woo-order:456'],
				wooIds: [123, 456],
				limit: 50,
				priority: 950,
				mode: 'on-demand',
			},
		]);
	});
});

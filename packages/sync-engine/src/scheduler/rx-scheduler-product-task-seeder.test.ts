// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
	seedProductBrowseWindowSchedulerTask,
	seedTargetedProductSchedulerTask,
} from './rx-scheduler-product-task-seeder';

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

describe('seedTargetedProductSchedulerTask', () => {
	beforeEach(() => {
		mocks.getRepository.mockReset();
		mocks.RxSchedulerTaskStateRepository.mockReset();
		mocks.seedPersistedSchedulerTasks.mockReset();
	});

	it('seeds a deduped targeted product task on the products:ids: lane', async () => {
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

		await expect(
			seedTargetedProductSchedulerTask({
				getRepository: mocks.getRepository,
				productIds: [456, 123, 123],
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
			],
			nowMs: 12_000,
			completedDedupeForMs: 30_000,
			coalesceInFlight: true,
		});
		const seederInput = mocks.seedPersistedSchedulerTasks.mock.calls[0][0];
		expect(seederInput).not.toHaveProperty('ownerId');
		expect(seederInput).not.toHaveProperty('claimForMs');
	});

	it('defaults priority, batch size, and dedupe window', async () => {
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

		await seedTargetedProductSchedulerTask({
			getRepository: mocks.getRepository,
			productIds: [7],
			nowMs: 1_000,
		});

		expect(mocks.seedPersistedSchedulerTasks).toHaveBeenCalledWith(
			expect.objectContaining({
				tasks: [
					expect.objectContaining({
						id: 'products:ids:7:on-demand',
						queryKey: 'products:ids:7',
						ids: ['woo-product:7'],
						limit: 100,
						priority: 900,
						mode: 'on-demand',
					}),
				],
				completedDedupeForMs: 30_000,
				coalesceInFlight: true, // change-signal targeted product seeder opts into #318 coalescing
			})
		);
	});

	it('rejects empty and invalid product ids before queuing work', async () => {
		await expect(
			seedTargetedProductSchedulerTask({ getRepository: mocks.getRepository, productIds: [] })
		).rejects.toThrow('Targeted product scheduler task requires at least one product id');
		await expect(
			seedTargetedProductSchedulerTask({ getRepository: mocks.getRepository, productIds: [0] })
		).rejects.toThrow('positive integer product ids');
		await expect(
			seedTargetedProductSchedulerTask({
				getRepository: mocks.getRepository,
				productIds: [5],
				batchSize: 0,
			})
		).rejects.toThrow('batch size must be a positive integer');
		expect(mocks.getRepository).not.toHaveBeenCalled();
		expect(mocks.seedPersistedSchedulerTasks).not.toHaveBeenCalled();
	});

	it('splits large targeted product sets into tasks with schema-safe keys', async () => {
		const orderRepository = { getDatabase: vi.fn(() => ({ name: 'mock-db' })) };
		const schedulerRepository = { readForTaskIds: vi.fn(), claimNew: vi.fn(), claim: vi.fn() };
		const result = {
			inserted: 2,
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

		await seedTargetedProductSchedulerTask({
			getRepository: mocks.getRepository,
			productIds: Array.from({ length: 100 }, (_, index) => index + 1),
			nowMs: 12_000,
		});

		const seederInput = mocks.seedPersistedSchedulerTasks.mock.calls[0][0];
		expect(seederInput.tasks.length).toBeGreaterThan(1);
		expect(seederInput.tasks.flatMap((task: { ids?: string[] }) => task.ids ?? [])).toEqual(
			Array.from({ length: 100 }, (_, index) => `woo-product:${index + 1}`)
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
});

describe('seedProductBrowseWindowSchedulerTask', () => {
	beforeEach(() => {
		mocks.getRepository.mockReset();
		mocks.RxSchedulerTaskStateRepository.mockReset();
		mocks.seedPersistedSchedulerTasks.mockReset();
	});

	it('seeds a windowed browse-window task at the low browse priority without claiming it', async () => {
		const productRepository = { getDatabase: vi.fn(() => ({ name: 'mock-db' })) };
		const schedulerRepository = { readForTaskIds: vi.fn(), claimNew: vi.fn(), claim: vi.fn() };
		const result = {
			inserted: 1,
			requeued: 0,
			skippedActive: 0,
			skippedCompleted: 0,
			skippedRunnable: 0,
			claimLost: 0,
		};
		mocks.getRepository.mockResolvedValue(productRepository);
		mocks.RxSchedulerTaskStateRepository.mockImplementation(
			function RxSchedulerTaskStateRepositoryMock() {
				return schedulerRepository;
			}
		);
		mocks.seedPersistedSchedulerTasks.mockResolvedValue(result);

		await expect(
			seedProductBrowseWindowSchedulerTask({
				getRepository: mocks.getRepository,
				limit: 100,
				priority: 500,
				nowMs: 20_000,
			})
		).resolves.toBe(result);

		expect(productRepository.getDatabase).toHaveBeenCalledTimes(1);
		expect(mocks.RxSchedulerTaskStateRepository).toHaveBeenCalledWith({ name: 'mock-db' });
		expect(mocks.seedPersistedSchedulerTasks).toHaveBeenCalledWith({
			repository: schedulerRepository,
			tasks: [
				{
					id: 'products:browse-window:limit=100:windowed',
					requirementId: 'products.browse-window.limit.100',
					collection: 'products',
					queryKey: 'products:browse-window:limit=100',
					limit: 100,
					priority: 500,
					mode: 'windowed',
				},
			],
			nowMs: 20_000,
			completedDedupeForMs: 30_000,
		});
		const seederInput = mocks.seedPersistedSchedulerTasks.mock.calls[0][0];
		expect(seederInput).not.toHaveProperty('ownerId');
		expect(seederInput).not.toHaveProperty('claimForMs');
		expect(seederInput).not.toHaveProperty('coalesceInFlight');
	});

	it('defaults the window limit, priority, and dedupe window', async () => {
		const productRepository = { getDatabase: vi.fn(() => ({ name: 'mock-db' })) };
		const schedulerRepository = { readForTaskIds: vi.fn(), claimNew: vi.fn(), claim: vi.fn() };
		mocks.getRepository.mockResolvedValue(productRepository);
		mocks.RxSchedulerTaskStateRepository.mockImplementation(
			function RxSchedulerTaskStateRepositoryMock() {
				return schedulerRepository;
			}
		);
		mocks.seedPersistedSchedulerTasks.mockResolvedValue({ inserted: 1 });

		await seedProductBrowseWindowSchedulerTask({
			getRepository: mocks.getRepository,
			nowMs: 1_000,
		});

		expect(mocks.seedPersistedSchedulerTasks).toHaveBeenCalledWith(
			expect.objectContaining({
				tasks: [
					expect.objectContaining({
						id: 'products:browse-window:limit=100:windowed',
						queryKey: 'products:browse-window:limit=100',
						limit: 100,
						priority: 500,
						mode: 'windowed',
					}),
				],
				completedDedupeForMs: 30_000,
			})
		);
	});

	it('rejects a window past the Woo per-page ceiling before queuing work (no remote pagination)', async () => {
		await expect(
			seedProductBrowseWindowSchedulerTask({ getRepository: mocks.getRepository, limit: 101 })
		).rejects.toThrow('Product browse-window scheduler limit must be a positive integer');
		await expect(
			seedProductBrowseWindowSchedulerTask({ getRepository: mocks.getRepository, limit: 0 })
		).rejects.toThrow('Product browse-window scheduler limit must be a positive integer');
		expect(mocks.getRepository).not.toHaveBeenCalled();
		expect(mocks.seedPersistedSchedulerTasks).not.toHaveBeenCalled();
	});
});

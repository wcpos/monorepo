// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
	seedOrderFilterSchedulerTask,
	seedOrderSchedulerTasks,
	seedTargetedOrderSchedulerTask,
} from './rx-order-scheduler-task-seeder';

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

describe('seedOrderSchedulerTasks', () => {
	beforeEach(() => {
		mocks.getRepository.mockReset();
		mocks.RxSchedulerTaskStateRepository.mockReset();
		mocks.seedPersistedSchedulerTasks.mockReset();
	});

	it('seeds the supported background order custom-pull task without claiming it', async () => {
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
			seedOrderSchedulerTasks({ getRepository: mocks.getRepository, perPage: 100, nowMs: 10_000 })
		).resolves.toBe(result);

		expect(orderRepository.getDatabase).toHaveBeenCalledTimes(1);
		expect(mocks.RxSchedulerTaskStateRepository).toHaveBeenCalledWith({ name: 'mock-db' });
		expect(mocks.seedPersistedSchedulerTasks).toHaveBeenCalledWith({
			repository: schedulerRepository,
			tasks: [
				{
					id: 'orders:custom-pull:greedy',
					requirementId: 'orders.custom-pull.background',
					collection: 'orders',
					queryKey: 'orders:custom-pull',
					limit: 100,
					priority: 100,
					mode: 'greedy',
				},
			],
			nowMs: 10_000,
			completedDedupeForMs: 300_000,
		});
		const seederInput = mocks.seedPersistedSchedulerTasks.mock.calls[0][0];
		expect(seederInput).not.toHaveProperty('ownerId');
		expect(seederInput).not.toHaveProperty('claimForMs');
		expect(seederInput).not.toHaveProperty('ignoreRetryBackoff');
	});

	it('seeds a deduped targeted order task without claiming it', async () => {
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
			seedTargetedOrderSchedulerTask({
				getRepository: mocks.getRepository,
				orderIds: [456, 123, 123],
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
			],
			nowMs: 12_000,
			completedDedupeForMs: 30_000,
			coalesceInFlight: false,
		});
		const seederInput = mocks.seedPersistedSchedulerTasks.mock.calls[0][0];
		expect(seederInput).not.toHaveProperty('ownerId');
		expect(seederInput).not.toHaveProperty('claimForMs');
		expect(seederInput).not.toHaveProperty('ignoreRetryBackoff');
	});

	it('seeds a status-only browser order filter descriptor without claiming it', async () => {
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
			seedOrderFilterSchedulerTask({
				getRepository: mocks.getRepository,
				status: 'processing',
				search: '',
				limit: 50,
				priority: 750,
				completedDedupeForMs: 45_000,
				nowMs: 15_000,
			})
		).resolves.toBe(result);

		expect(orderRepository.getDatabase).toHaveBeenCalledTimes(1);
		expect(mocks.RxSchedulerTaskStateRepository).toHaveBeenCalledWith({ name: 'mock-db' });
		expect(mocks.seedPersistedSchedulerTasks).toHaveBeenCalledWith({
			repository: schedulerRepository,
			tasks: [
				{
					id: 'orders:browser:status=processing:search=:limit=50:windowed',
					requirementId: 'orders.browser.status.processing.limit.50',
					collection: 'orders',
					queryKey: 'orders:browser:status=processing:search=:limit=50',
					limit: 50,
					priority: 750,
					mode: 'windowed',
				},
			],
			nowMs: 15_000,
			completedDedupeForMs: 45_000,
		});
		const seederInput = mocks.seedPersistedSchedulerTasks.mock.calls[0][0];
		expect(seederInput).not.toHaveProperty('ownerId');
		expect(seederInput).not.toHaveProperty('claimForMs');
		expect(seederInput).not.toHaveProperty('ignoreRetryBackoff');
	});

	it('seeds a browser order search descriptor without claiming it', async () => {
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
			seedOrderFilterSchedulerTask({
				getRepository: mocks.getRepository,
				status: 'processing',
				search: 'hat',
				limit: 50,
				nowMs: 15_500,
			})
		).resolves.toBe(result);

		expect(mocks.seedPersistedSchedulerTasks).toHaveBeenCalledWith(
			expect.objectContaining({
				repository: schedulerRepository,
				tasks: [
					{
						id: 'orders:browser:status=processing:search=hat:limit=50:windowed',
						requirementId: 'orders.browser.status.processing.search.hat.limit.50',
						collection: 'orders',
						queryKey: 'orders:browser:status=processing:search=hat:limit=50',
						limit: 50,
						priority: 700,
						mode: 'windowed',
					},
				],
				nowMs: 15_500,
			})
		);
	});

	it('seeds a bounded multi-page status-only browser order filter descriptor without claiming it', async () => {
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
			seedOrderFilterSchedulerTask({
				getRepository: mocks.getRepository,
				status: 'processing',
				search: '',
				limit: 150,
				nowMs: 16_000,
			})
		).resolves.toBe(result);

		expect(mocks.seedPersistedSchedulerTasks).toHaveBeenCalledWith(
			expect.objectContaining({
				repository: schedulerRepository,
				tasks: [
					{
						id: 'orders:browser:status=processing:search=:limit=150:windowed',
						requirementId: 'orders.browser.status.processing.limit.150',
						collection: 'orders',
						queryKey: 'orders:browser:status=processing:search=:limit=150',
						limit: 150,
						priority: 700,
						mode: 'windowed',
					},
				],
				nowMs: 16_000,
			})
		);
	});

	it('rejects unsupported browser order filter descriptors before queuing work', async () => {
		await expect(
			seedOrderFilterSchedulerTask({
				getRepository: mocks.getRepository,
				status: 'processing',
				search: '',
				limit: 201,
			})
		).rejects.toThrow('Browser order scheduler descriptors cannot exceed 200 records');
		await expect(
			seedOrderFilterSchedulerTask({
				getRepository: mocks.getRepository,
				status: 'x'.repeat(240),
				search: '',
				limit: 50,
			})
		).rejects.toThrow('Browser order scheduler descriptor queryKey exceeds schema limit');

		expect(mocks.getRepository).not.toHaveBeenCalled();
		expect(mocks.seedPersistedSchedulerTasks).not.toHaveBeenCalled();
	});

	it('rejects invalid targeted batch sizes before queuing work', async () => {
		await expect(
			seedTargetedOrderSchedulerTask({
				getRepository: mocks.getRepository,
				orderIds: [123],
				batchSize: 0,
			})
		).rejects.toThrow('Targeted order scheduler task batch size must be a positive integer');

		expect(mocks.getRepository).not.toHaveBeenCalled();
		expect(mocks.seedPersistedSchedulerTasks).not.toHaveBeenCalled();
	});

	it('splits large targeted order sets into tasks with schema-safe keys', async () => {
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

		await expect(
			seedTargetedOrderSchedulerTask({
				getRepository: mocks.getRepository,
				orderIds: Array.from({ length: 100 }, (_, index) => index + 1),
				nowMs: 12_000,
			})
		).resolves.toBe(result);

		const seederInput = mocks.seedPersistedSchedulerTasks.mock.calls[0][0];
		expect(seederInput.tasks.length).toBeGreaterThan(1);
		expect(seederInput.tasks.flatMap((task: { ids?: string[] }) => task.ids ?? [])).toEqual(
			Array.from({ length: 100 }, (_, index) => `woo-order:${index + 1}`)
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

// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { remoteId } from '../testing';
import {
	seedProductBrowseWindowSchedulerTask,
	seedTargetedProductSchedulerTask,
} from './rx-scheduler-product-task-seeder';

const mocks = vi.hoisted(() => ({
	RxSchedulerTaskStateRepository: vi.fn(),
	seedPersistedSchedulerTasks: vi.fn(),
}));

const MOCK_DATABASE = { name: 'mock-db' };

vi.mock('./rx-scheduler-task-state-repository', () => ({
	RxSchedulerTaskStateRepository: mocks.RxSchedulerTaskStateRepository,
}));

// Keep the real module's other exports (the neutral empty-seed result the ledger
// recovery seam hands back on an aborted tick) and mock only the seed call.
vi.mock('./rx-scheduler-task-seeder', async (importOriginal) => ({
	...(await importOriginal<typeof import('./rx-scheduler-task-seeder')>()),
	seedPersistedSchedulerTasks: mocks.seedPersistedSchedulerTasks,
}));

describe('seedTargetedProductSchedulerTask', () => {
	beforeEach(() => {
		mocks.RxSchedulerTaskStateRepository.mockReset();
		mocks.seedPersistedSchedulerTasks.mockReset();
	});

	it('seeds a deduped targeted product task on the products:ids: lane', async () => {
		const schedulerRepository = { readForTaskIds: vi.fn(), claimNew: vi.fn(), claim: vi.fn() };
		const result = {
			inserted: 1,
			requeued: 0,
			skippedActive: 0,
			skippedCompleted: 0,
			skippedRunnable: 0,
			claimLost: 0,
		};
		mocks.RxSchedulerTaskStateRepository.mockImplementation(
			function RxSchedulerTaskStateRepositoryMock() {
				return schedulerRepository;
			}
		);
		mocks.seedPersistedSchedulerTasks.mockResolvedValue(result);

		await expect(
			seedTargetedProductSchedulerTask({
				database: MOCK_DATABASE,
				remoteIds: [456, 123, 123].map(remoteId),
				priority: 950,
				batchSize: 50,
				completedDedupeForMs: 30_000,
				nowMs: 12_000,
			})
		).resolves.toBe(result);

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
					remoteIds: [123, 456].map(remoteId),
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
		const schedulerRepository = { readForTaskIds: vi.fn(), claimNew: vi.fn(), claim: vi.fn() };
		const result = {
			inserted: 1,
			requeued: 0,
			skippedActive: 0,
			skippedCompleted: 0,
			skippedRunnable: 0,
			claimLost: 0,
		};
		mocks.RxSchedulerTaskStateRepository.mockImplementation(
			function RxSchedulerTaskStateRepositoryMock() {
				return schedulerRepository;
			}
		);
		mocks.seedPersistedSchedulerTasks.mockResolvedValue(result);

		await seedTargetedProductSchedulerTask({
			database: MOCK_DATABASE,
			remoteIds: [7].map(remoteId),
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
			seedTargetedProductSchedulerTask({ database: MOCK_DATABASE, remoteIds: [] })
		).rejects.toThrow('Targeted product scheduler task requires at least one product id');
		await expect(
			seedTargetedProductSchedulerTask({ database: MOCK_DATABASE, remoteIds: ['0' as never] })
		).rejects.toThrow('Remote id is non-numeric: 0');
		await expect(
			seedTargetedProductSchedulerTask({
				database: MOCK_DATABASE,
				remoteIds: [5].map(remoteId),
				batchSize: 0,
			})
		).rejects.toThrow('batch size must be a positive integer');
		expect(mocks.RxSchedulerTaskStateRepository).not.toHaveBeenCalled();
		expect(mocks.seedPersistedSchedulerTasks).not.toHaveBeenCalled();
	});

	it('splits large targeted product sets into tasks with schema-safe keys', async () => {
		const schedulerRepository = { readForTaskIds: vi.fn(), claimNew: vi.fn(), claim: vi.fn() };
		const result = {
			inserted: 2,
			requeued: 0,
			skippedActive: 0,
			skippedCompleted: 0,
			skippedRunnable: 0,
			claimLost: 0,
		};
		mocks.RxSchedulerTaskStateRepository.mockImplementation(
			function RxSchedulerTaskStateRepositoryMock() {
				return schedulerRepository;
			}
		);
		mocks.seedPersistedSchedulerTasks.mockResolvedValue(result);

		await seedTargetedProductSchedulerTask({
			database: MOCK_DATABASE,
			remoteIds: Array.from({ length: 100 }, (_, index) => index + 1).map(remoteId),
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
		mocks.RxSchedulerTaskStateRepository.mockReset();
		mocks.seedPersistedSchedulerTasks.mockReset();
	});

	it('seeds a windowed browse-window task at the low browse priority without claiming it', async () => {
		const schedulerRepository = { readForTaskIds: vi.fn(), claimNew: vi.fn(), claim: vi.fn() };
		const result = {
			inserted: 1,
			requeued: 0,
			skippedActive: 0,
			skippedCompleted: 0,
			skippedRunnable: 0,
			claimLost: 0,
		};
		mocks.RxSchedulerTaskStateRepository.mockImplementation(
			function RxSchedulerTaskStateRepositoryMock() {
				return schedulerRepository;
			}
		);
		mocks.seedPersistedSchedulerTasks.mockResolvedValue(result);

		await expect(
			seedProductBrowseWindowSchedulerTask({
				database: MOCK_DATABASE,
				limit: 100,
				priority: 500,
				nowMs: 20_000,
			})
		).resolves.toBe(result);

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
		const schedulerRepository = { readForTaskIds: vi.fn(), claimNew: vi.fn(), claim: vi.fn() };
		mocks.RxSchedulerTaskStateRepository.mockImplementation(
			function RxSchedulerTaskStateRepositoryMock() {
				return schedulerRepository;
			}
		);
		mocks.seedPersistedSchedulerTasks.mockResolvedValue({ inserted: 1 });

		await seedProductBrowseWindowSchedulerTask({
			database: MOCK_DATABASE,
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

	it('accepts any scrolled-to window, rejecting only past the runaway backstop', async () => {
		// #948 flips this pin deliberately. A window may exceed one Woo page (#909) — the
		// fetcher walks it in dial-sized pages (#908) and resumes it from its covered prefix
		// — and it is no longer bounded by a product ceiling: 1,001 rows is an ordinary
		// window now. Only the runaway backstop refuses.
		await expect(
			seedProductBrowseWindowSchedulerTask({ database: MOCK_DATABASE, limit: 100_001 })
		).rejects.toThrow('Product browse-window scheduler limit must be a positive integer');
		await expect(
			seedProductBrowseWindowSchedulerTask({ database: MOCK_DATABASE, limit: 0 })
		).rejects.toThrow('Product browse-window scheduler limit must be a positive integer');
		expect(mocks.RxSchedulerTaskStateRepository).not.toHaveBeenCalled();
		expect(mocks.seedPersistedSchedulerTasks).not.toHaveBeenCalled();
	});

	it('keys a non-default sort into the task id, queryKey and requirementId', async () => {
		mocks.RxSchedulerTaskStateRepository.mockImplementation(
			function RxSchedulerTaskStateRepositoryMock() {
				return { readForTaskIds: vi.fn(), claimNew: vi.fn(), claim: vi.fn() };
			}
		);
		mocks.seedPersistedSchedulerTasks.mockResolvedValue({
			inserted: 1,
			requeued: 0,
			skippedActive: 0,
			skippedCompleted: 0,
			skippedRunnable: 0,
			claimLost: 0,
		});

		await seedProductBrowseWindowSchedulerTask({
			database: MOCK_DATABASE,
			limit: 200,
			orderby: 'price',
			order: 'desc',
		});

		expect(mocks.seedPersistedSchedulerTasks).toHaveBeenCalledWith(
			expect.objectContaining({
				tasks: [
					expect.objectContaining({
						id: 'products:browse-window:limit=200:orderby=price:order=desc:windowed',
						requirementId: 'products.browse-window.limit.200.price.desc',
						queryKey: 'products:browse-window:limit=200:orderby=price:order=desc',
						limit: 200,
						mode: 'windowed',
					}),
				],
			})
		);
	});
});

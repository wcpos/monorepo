// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { remoteId } from '../testing';
import {
	seedOrderFilterSchedulerTask,
	seedOrderSchedulerTasks,
	seedTargetedOrderSchedulerTask,
} from './rx-order-scheduler-task-seeder';

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

describe('seedOrderSchedulerTasks', () => {
	beforeEach(() => {
		mocks.RxSchedulerTaskStateRepository.mockReset();
		mocks.seedPersistedSchedulerTasks.mockReset();
	});

	it('seeds the supported background order custom-pull task without claiming it', async () => {
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
			seedOrderSchedulerTasks({ database: MOCK_DATABASE, perPage: 100, nowMs: 10_000 })
		).resolves.toBe(result);

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
			seedTargetedOrderSchedulerTask({
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
					id: 'orders:ids:123,456:on-demand',
					requirementId: 'orders.targeted.123,456',
					collection: 'orders',
					queryKey: 'orders:ids:123,456',
					ids: ['woo-order:123', 'woo-order:456'],
					remoteIds: [123, 456].map(remoteId),
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
			seedOrderFilterSchedulerTask({
				database: MOCK_DATABASE,
				status: 'processing',
				search: '',
				limit: 50,
				priority: 750,
				completedDedupeForMs: 45_000,
				nowMs: 15_000,
			})
		).resolves.toBe(result);

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

	// #954: a windowed task gets exactly ONE fetch invocation from the runner
	// (`taskCompleted = task.mode !== 'greedy' || fetchResult.completed`), and `useDemand`
	// declares a requirement once — so a fetch-to-completion range left windowed would stop
	// after its first bounded pass and the persisted cursor would never be read again.
	it('seeds a fetch-to-completion range as a GREEDY task so the runner drives it to the end', async () => {
		const { schedulerRepository } = arrangeBrowserOrderSeed();

		await seedOrderFilterSchedulerTask({
			database: MOCK_DATABASE,
			status: 'completed',
			search: '',
			limit: 200,
			afterSeconds: 1_782_864_000,
			beforeSeconds: 1_784_073_599,
			complete: true,
			nowMs: 15_000,
		});

		expect(mocks.seedPersistedSchedulerTasks).toHaveBeenCalledWith(
			expect.objectContaining({
				repository: schedulerRepository,
				tasks: [
					expect.objectContaining({
						queryKey:
							'orders:browser:status=completed:after=1782864000:before=1784073599:search=:limit=all',
						mode: 'greedy',
					}),
				],
			})
		);
	});

	it('keeps an ordinary windowed browse windowed', async () => {
		arrangeBrowserOrderSeed();

		await seedOrderFilterSchedulerTask({
			database: MOCK_DATABASE,
			status: 'completed',
			search: '',
			limit: 200,
			afterSeconds: 1_782_864_000,
			nowMs: 15_000,
		});

		expect(mocks.seedPersistedSchedulerTasks).toHaveBeenCalledWith(
			expect.objectContaining({
				tasks: [expect.objectContaining({ mode: 'windowed' })],
			})
		);
	});

	// Same normalization as orderBrowserQueryKey — see the sortPart note in the descriptor.
	it('omits the default id-desc sort so both key doors agree', async () => {
		arrangeBrowserOrderSeed();

		await seedOrderFilterSchedulerTask({
			database: MOCK_DATABASE,
			status: 'processing',
			search: '',
			limit: 50,
			orderby: 'id',
			order: 'desc',
			nowMs: 15_000,
		});

		expect(mocks.seedPersistedSchedulerTasks).toHaveBeenCalledWith(
			expect.objectContaining({
				tasks: [
					expect.objectContaining({
						queryKey: 'orders:browser:status=processing:search=:limit=50',
					}),
				],
			})
		);
	});

	function arrangeBrowserOrderSeed() {
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
		return { schedulerRepository, result };
	}

	it('round-trips a customer through a browser order search descriptor', async () => {
		const { schedulerRepository, result } = arrangeBrowserOrderSeed();

		await expect(
			seedOrderFilterSchedulerTask({
				database: MOCK_DATABASE,
				status: 'processing',
				search: 'hat',
				customerId: 42,
				limit: 50,
				nowMs: 15_500,
			})
		).resolves.toBe(result);

		expect(mocks.seedPersistedSchedulerTasks).toHaveBeenCalledWith(
			expect.objectContaining({
				repository: schedulerRepository,
				tasks: [
					{
						id: 'orders:browser:status=processing:customer=42:search=hat:limit=50:windowed',
						requirementId: 'orders.browser.status=processing.customer=42.search=hat.limit=50',
						collection: 'orders',
						queryKey: 'orders:browser:status=processing:customer=42:search=hat:limit=50',
						limit: 50,
						priority: 700,
						mode: 'windowed',
					},
				],
				nowMs: 15_500,
			})
		);
	});

	it('round-trips all order dimensions through a browser order search descriptor', async () => {
		const { schedulerRepository, result } = arrangeBrowserOrderSeed();

		await expect(
			seedOrderFilterSchedulerTask({
				database: MOCK_DATABASE,
				status: 'processing',
				search: 'hat',
				customerId: 42,
				cashierId: 7,
				store: '12',
				orderby: 'date',
				order: 'asc',
				limit: 50,
				nowMs: 15_500,
			})
		).resolves.toBe(result);

		expect(mocks.seedPersistedSchedulerTasks).toHaveBeenCalledWith(
			expect.objectContaining({
				repository: schedulerRepository,
				tasks: [
					{
						id: 'orders:browser:status=processing:customer=42:cashier=7:store=12:orderby=date:order=asc:search=hat:limit=50:windowed',
						requirementId:
							'orders.browser.status=processing.customer=42.cashier=7.store=12.orderby=date.order=asc.search=hat.limit=50',
						collection: 'orders',
						queryKey:
							'orders:browser:status=processing:customer=42:cashier=7:store=12:orderby=date:order=asc:search=hat:limit=50',
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
			seedOrderFilterSchedulerTask({
				database: MOCK_DATABASE,
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
				database: MOCK_DATABASE,
				status: 'processing',
				search: '',
				// #957 flips this pin deliberately: 201 is an ordinary window now, and only
				// the runaway backstop refuses.
				limit: 100_001,
			})
		).rejects.toThrow('Browser order scheduler descriptors cannot exceed 100000 records');
		await expect(
			seedOrderFilterSchedulerTask({
				database: MOCK_DATABASE,
				status: 'x'.repeat(240),
				search: '',
				limit: 50,
			})
		).rejects.toThrow('Browser order scheduler descriptor queryKey exceeds schema limit');

		expect(mocks.RxSchedulerTaskStateRepository).not.toHaveBeenCalled();
		expect(mocks.seedPersistedSchedulerTasks).not.toHaveBeenCalled();
	});

	it('rejects invalid targeted batch sizes before queuing work', async () => {
		await expect(
			seedTargetedOrderSchedulerTask({
				database: MOCK_DATABASE,
				remoteIds: [123].map(remoteId),
				batchSize: 0,
			})
		).rejects.toThrow('Targeted order scheduler task batch size must be a positive integer');

		expect(mocks.RxSchedulerTaskStateRepository).not.toHaveBeenCalled();
		expect(mocks.seedPersistedSchedulerTasks).not.toHaveBeenCalled();
	});

	it('splits large targeted order sets into tasks with schema-safe keys', async () => {
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

		await expect(
			seedTargetedOrderSchedulerTask({
				database: MOCK_DATABASE,
				remoteIds: Array.from({ length: 100 }, (_, index) => index + 1).map(remoteId),
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

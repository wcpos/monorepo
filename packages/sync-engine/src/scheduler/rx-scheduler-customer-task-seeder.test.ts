// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { seedCustomerBrowseWindowSchedulerTask } from './rx-scheduler-customer-task-seeder';

const mocks = vi.hoisted(() => ({
	RxSchedulerTaskStateRepository: vi.fn(),
	seedPersistedSchedulerTasks: vi.fn(),
}));

const MOCK_DATABASE = { name: 'mock-db' };

vi.mock('./rx-scheduler-task-state-repository', () => ({
	RxSchedulerTaskStateRepository: mocks.RxSchedulerTaskStateRepository,
}));

// Keep the real module's other exports (the neutral empty-seed result the ledger recovery
// seam hands back on an aborted tick) and mock only the seed call.
vi.mock('./rx-scheduler-task-seeder', async (importOriginal) => ({
	...(await importOriginal<typeof import('./rx-scheduler-task-seeder')>()),
	seedPersistedSchedulerTasks: mocks.seedPersistedSchedulerTasks,
}));

describe('seedCustomerBrowseWindowSchedulerTask', () => {
	beforeEach(() => {
		mocks.RxSchedulerTaskStateRepository.mockReset();
		mocks.seedPersistedSchedulerTasks.mockReset();
	});

	function arrangeSeed() {
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

	it('seeds a windowed browse-window task at the interactive priority without claiming it', async () => {
		const { schedulerRepository, result } = arrangeSeed();

		await expect(
			seedCustomerBrowseWindowSchedulerTask({
				database: MOCK_DATABASE,
				limit: 100,
				priority: 500,
				completedDedupeForMs: 30_000,
				nowMs: 20_000,
			})
		).resolves.toBe(result);

		expect(mocks.RxSchedulerTaskStateRepository).toHaveBeenCalledWith({ name: 'mock-db' });
		expect(mocks.seedPersistedSchedulerTasks).toHaveBeenCalledWith({
			repository: schedulerRepository,
			tasks: [
				{
					id: 'customers:browse-window:limit=100:windowed',
					requirementId: 'customers.browse-window.limit.100',
					collection: 'customers',
					queryKey: 'customers:browse-window:limit=100',
					limit: 100,
					priority: 500,
					mode: 'windowed',
				},
			],
			nowMs: 20_000,
			completedDedupeForMs: 30_000,
		});
		// Seeding is not claiming: the drain claims, and a seeder that claimed would hand the
		// task to whichever surface declared it rather than to the scheduler.
		const seederInput = mocks.seedPersistedSchedulerTasks.mock.calls[0][0];
		expect(seederInput).not.toHaveProperty('ownerId');
		expect(seederInput).not.toHaveProperty('claimForMs');
		expect(seederInput).not.toHaveProperty('coalesceInFlight');
	});

	it('defaults the window limit, priority and dedupe window', async () => {
		arrangeSeed();

		await seedCustomerBrowseWindowSchedulerTask({ database: MOCK_DATABASE, nowMs: 1_000 });

		expect(mocks.seedPersistedSchedulerTasks).toHaveBeenCalledWith(
			expect.objectContaining({
				tasks: [
					expect.objectContaining({
						id: 'customers:browse-window:limit=100:windowed',
						queryKey: 'customers:browse-window:limit=100',
						limit: 100,
						priority: 500,
						mode: 'windowed',
					}),
				],
				completedDedupeForMs: 30_000,
			})
		);
	});

	/**
	 * The sort is part of the task's IDENTITY, not decoration: the fetcher re-parses this key
	 * to build the wire request, so a `registered_date desc` window served out of the `id asc`
	 * window's coverage is exactly the "locally sorted slice of the wrong window" bug #951
	 * reported.
	 */
	it('keys a non-default sort into the task id, queryKey and requirementId', async () => {
		arrangeSeed();

		await seedCustomerBrowseWindowSchedulerTask({
			database: MOCK_DATABASE,
			limit: 1_600,
			orderby: 'registered_date',
			order: 'desc',
		});

		expect(mocks.seedPersistedSchedulerTasks).toHaveBeenCalledWith(
			expect.objectContaining({
				tasks: [
					expect.objectContaining({
						id: 'customers:browse-window:limit=1600:orderby=registered_date:order=desc:windowed',
						requirementId: 'customers.browse-window.limit.1600.registered_date.desc',
						queryKey: 'customers:browse-window:limit=1600:orderby=registered_date:order=desc',
						limit: 1_600,
						mode: 'windowed',
					}),
				],
			})
		);
	});

	// The default sort has exactly one spelling — the bare `limit=N` key — so a caller that
	// states it explicitly must not fork the lane in two.
	it('keeps the bare key when the caller restates the default trickle-aligned sort', async () => {
		arrangeSeed();

		await seedCustomerBrowseWindowSchedulerTask({
			database: MOCK_DATABASE,
			limit: 200,
			orderby: 'id',
			order: 'asc',
		});

		expect(mocks.seedPersistedSchedulerTasks).toHaveBeenCalledWith(
			expect.objectContaining({
				tasks: [
					expect.objectContaining({
						queryKey: 'customers:browse-window:limit=200',
						requirementId: 'customers.browse-window.limit.200',
					}),
				],
			})
		);
	});

	// R8: there is deliberately no ceiling — the window grows with the grid for as long as the
	// cashier scrolls. Only a degenerate limit is a programming error worth refusing.
	it('accepts any scrolled-to window and refuses only a degenerate limit', async () => {
		arrangeSeed();

		await seedCustomerBrowseWindowSchedulerTask({ database: MOCK_DATABASE, limit: 25_600 });
		expect(mocks.seedPersistedSchedulerTasks).toHaveBeenCalledWith(
			expect.objectContaining({
				tasks: [expect.objectContaining({ queryKey: 'customers:browse-window:limit=25600' })],
			})
		);

		mocks.RxSchedulerTaskStateRepository.mockReset();
		mocks.seedPersistedSchedulerTasks.mockReset();
		for (const limit of [0, -1, 10.5]) {
			await expect(
				seedCustomerBrowseWindowSchedulerTask({ database: MOCK_DATABASE, limit })
			).rejects.toThrow('Customer browse-window scheduler limit must be a positive integer');
		}
		expect(mocks.RxSchedulerTaskStateRepository).not.toHaveBeenCalled();
		expect(mocks.seedPersistedSchedulerTasks).not.toHaveBeenCalled();
	});

	// An out-of-enum sort forced past the types must never reach the wire: the fetcher builds
	// its request from this key, so a key the parser refuses is the one route it could take.
	it('refuses a sort outside the supported customers orderby enum', async () => {
		arrangeSeed();

		await expect(
			seedCustomerBrowseWindowSchedulerTask({
				database: MOCK_DATABASE,
				limit: 100,
				orderby: 'date_modified_gmt' as never,
				order: 'asc',
			})
		).rejects.toThrow(/unsupported customer browse orderby/);

		expect(mocks.seedPersistedSchedulerTasks).not.toHaveBeenCalled();
	});
});

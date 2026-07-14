// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { seedSearchSchedulerTask } from './rx-scheduler-search-task-seeder';
import {
	isSupportedCustomerSchedulerTask,
	isSupportedProductSchedulerTask,
} from './engine-scheduler-drain';

import type { FetchTask } from './replication-policy';

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

/** The single task the seeder handed to seedPersistedSchedulerTasks. */
function seededTask(): FetchTask {
	const [call] = mocks.seedPersistedSchedulerTasks.mock.calls as unknown as [
		{ tasks: FetchTask[] },
	][];
	const task = call?.[0]?.tasks?.[0];
	if (!task) throw new Error('no task seeded');
	return task;
}

describe('seedSearchSchedulerTask', () => {
	beforeEach(() => {
		mocks.getRepository.mockReset();
		mocks.RxSchedulerTaskStateRepository.mockReset();
		mocks.seedPersistedSchedulerTasks.mockReset();
		mocks.getRepository.mockResolvedValue({ getDatabase: vi.fn(() => ({ name: 'mock-db' })) });
		mocks.RxSchedulerTaskStateRepository.mockImplementation(function Mock() {
			return { readForTaskIds: vi.fn(), claimNew: vi.fn(), claim: vi.fn() };
		});
		mocks.seedPersistedSchedulerTasks.mockResolvedValue({ inserted: 1 });
	});

	it('mints a products:search: lane task the drain predicate accepts', async () => {
		await seedSearchSchedulerTask({
			collection: 'products',
			term: 'keyboard',
			priority: 500,
			nowMs: 12_000,
			getRepository: mocks.getRepository,
		});

		const task = seededTask();
		expect(task).toMatchObject({
			id: 'products:search:keyboard:windowed',
			requirementId: 'products.search.keyboard',
			collection: 'products',
			queryKey: 'products:search:keyboard',
			limit: 25,
			priority: 500,
			mode: 'windowed',
		});
		expect(isSupportedProductSchedulerTask({ ...task })).toBe(true);
		expect(mocks.seedPersistedSchedulerTasks).toHaveBeenCalledWith(
			expect.objectContaining({ nowMs: 12_000, completedDedupeForMs: 30_000 })
		);
	});

	it('mints a customers:search=…:limit= lane task whose limit matches the key', async () => {
		await seedSearchSchedulerTask({
			collection: 'customers',
			term: 'ada',
			limit: 10,
			getRepository: mocks.getRepository,
		});

		const task = seededTask();
		expect(task).toMatchObject({
			id: 'customers:search=ada:limit=10:windowed',
			requirementId: 'customers.search.ada.limit.10',
			collection: 'customers',
			queryKey: 'customers:search=ada:limit=10',
			limit: 10,
			mode: 'windowed',
		});
		// The customer support predicate requires task.limit === the key's limit — proven here.
		expect(isSupportedCustomerSchedulerTask({ ...task })).toBe(true);
	});

	it('url-encodes the term into the queryKey (colon-safe for the customer grammar)', async () => {
		await seedSearchSchedulerTask({
			collection: 'customers',
			term: 'a:b c',
			limit: 25,
			getRepository: mocks.getRepository,
		});

		const task = seededTask();
		expect(task.queryKey).toBe('customers:search=a%3Ab%20c:limit=25');
		expect(isSupportedCustomerSchedulerTask({ ...task })).toBe(true);
	});

	it('trims and rejects an empty term', async () => {
		await expect(
			seedSearchSchedulerTask({
				collection: 'products',
				term: '   ',
				getRepository: mocks.getRepository,
			})
		).rejects.toThrow(/non-empty term/i);
		expect(mocks.seedPersistedSchedulerTasks).not.toHaveBeenCalled();
	});

	it('disables completed-dedupe when the caller passes a non-positive window', async () => {
		await seedSearchSchedulerTask({
			collection: 'products',
			term: 'keyboard',
			completedDedupeForMs: 0,
			getRepository: mocks.getRepository,
		});

		expect(mocks.seedPersistedSchedulerTasks).toHaveBeenCalledWith(
			expect.objectContaining({ completedDedupeForMs: 0 })
		);
	});
});

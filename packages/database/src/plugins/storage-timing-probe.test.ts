import { takeStorageTimingSnapshot, withStorageTimingProbe } from './storage-timing-probe';

import type { RxStorage } from 'rxdb';

describe('storage timing probe', () => {
	afterEach(() => {
		jest.restoreAllMocks();
		takeStorageTimingSnapshot();
	});

	it('passes results through and records rows, errors, and reset snapshots', async () => {
		const bulkResult = { error: [] };
		const queryResult = { documents: [{ id: 'one' }, { id: 'two' }] };
		const findResult = [{ id: 'one' }];
		const countResult = { count: 2, mode: 'fast' as const };
		const thrown = new Error('write failed');
		const instance = {
			internals: { taskQueue: 'preserved' },
			bulkWrite: jest.fn().mockResolvedValueOnce(bulkResult).mockRejectedValueOnce(thrown),
			query: jest.fn().mockResolvedValue(queryResult),
			findDocumentsById: jest.fn().mockResolvedValue(findResult),
			count: jest.fn().mockResolvedValue(countResult),
		};
		const storage = {
			name: 'fake',
			rxdbVersion: 'test',
			createStorageInstance: jest.fn().mockResolvedValue(instance),
		} as unknown as RxStorage<unknown, unknown>;
		const durations = [20, 5, 4, 3, 18];
		let now = 0;
		let readingStart = true;
		jest.spyOn(performance, 'now').mockImplementation(() => {
			if (readingStart) {
				readingStart = false;
				return now;
			}
			readingStart = true;
			now += durations.shift() ?? 0;
			return now;
		});

		const wrapped = withStorageTimingProbe(storage, 'raw');
		const wrappedInstance = await wrapped.createStorageInstance({
			collectionName: 'orders',
		} as never);

		expect(wrappedInstance).toBe(instance);
		expect(wrappedInstance.internals).toBe(instance.internals);
		await expect(wrappedInstance.bulkWrite([{}, {}] as never, 'test')).resolves.toBe(bulkResult);
		await expect(wrappedInstance.query({} as never)).resolves.toBe(queryResult);
		await expect(wrappedInstance.findDocumentsById(['one', 'two', 'three'], false)).resolves.toBe(
			findResult
		);
		await expect(wrappedInstance.count({} as never)).resolves.toBe(countResult);
		await expect(wrappedInstance.bulkWrite([{}] as never, 'test')).rejects.toBe(thrown);

		expect(takeStorageTimingSnapshot()).toEqual([
			{
				layer: 'raw',
				collectionName: 'orders',
				method: 'bulkWrite',
				calls: 2,
				totalMs: 38,
				maxMs: 20,
				rows: 3,
				slow: [
					{ ms: 20, rows: 2 },
					{ ms: 18, rows: 1 },
				],
			},
			{
				layer: 'raw',
				collectionName: 'orders',
				method: 'query',
				calls: 1,
				totalMs: 5,
				maxMs: 5,
				rows: 2,
				slow: [],
			},
			{
				layer: 'raw',
				collectionName: 'orders',
				method: 'findDocumentsById',
				calls: 1,
				totalMs: 4,
				maxMs: 4,
				rows: 3,
				slow: [],
			},
			{
				layer: 'raw',
				collectionName: 'orders',
				method: 'count',
				calls: 1,
				totalMs: 3,
				maxMs: 3,
				rows: 1,
				slow: [],
			},
		]);
		expect(takeStorageTimingSnapshot()).toEqual([]);
	});
});

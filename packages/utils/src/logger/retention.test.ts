import { sweepLogRetention } from './retention';

const DAY_MS = 24 * 60 * 60 * 1000;
const MIB = 1024 * 1024;

function collectionWithRows(rows: { logId: string; timestamp: number; sizeBytes?: number }[]) {
	return {
		find: jest.fn(() => ({ getPreparedQuery: () => ({}) })),
		storageInstance: {
			query: jest
				.fn()
				.mockResolvedValueOnce({ documents: rows })
				.mockResolvedValue({ documents: [] }),
		},
		bulkRemove: jest.fn().mockResolvedValue(undefined),
	};
}

describe('log retention', () => {
	it('removes rows older than 30 days in bulk', async () => {
		const collection = collectionWithRows([
			{ logId: 'expired', timestamp: DAY_MS, sizeBytes: 100 },
		]);

		await sweepLogRetention(collection, 40 * DAY_MS);

		expect(collection.bulkRemove).toHaveBeenCalledWith(['expired']);
	});

	it('bulk-removes the oldest rows until the byte cap is met', async () => {
		const remaining = [
			{ logId: 'oldest', timestamp: 30 * DAY_MS, sizeBytes: 10 * MIB },
			{ logId: 'middle', timestamp: 31 * DAY_MS, sizeBytes: 10 * MIB },
			{ logId: 'newest', timestamp: 32 * DAY_MS, sizeBytes: 10 * MIB },
		];
		const collection = collectionWithRows(remaining);

		await sweepLogRetention(collection, 40 * DAY_MS);

		expect(collection.bulkRemove).toHaveBeenCalledWith(['oldest']);
	});
});

describe('rows without sizeBytes (review fix, PR #851)', () => {
	it('serializes unsized rows instead of charging the 512-byte fallback', async () => {
		const bigPayload = 'x'.repeat(24 * 1024 * 1024);
		const rows = [
			{ logId: 'legacy-1', timestamp: Date.now(), context: bigPayload },
			{ logId: 'recent-1', timestamp: Date.now() + 1, sizeBytes: 2 * 1024 * 1024 },
		];
		const collection = collectionWithRows(rows);

		await sweepLogRetention(collection, Date.now());

		// 24 MiB (serialized legacy row) + 2 MiB > 25 MiB cap → oldest row removed.
		expect(collection.bulkRemove).toHaveBeenCalledWith(['legacy-1']);
	});
});

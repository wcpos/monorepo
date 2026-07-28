import { sweepLogRetention } from './retention';

const DAY_MS = 24 * 60 * 60 * 1000;
const MIB = 1024 * 1024;

describe('log retention', () => {
	it('removes rows older than 30 days in bulk', async () => {
		const remove = jest.fn().mockResolvedValue([]);
		const find = jest
			.fn()
			.mockReturnValueOnce({ remove })
			.mockReturnValueOnce({ exec: jest.fn().mockResolvedValue([]) });
		const collection = { find, bulkRemove: jest.fn() };

		await sweepLogRetention(collection, 40 * DAY_MS);

		expect(find).toHaveBeenNthCalledWith(1, {
			selector: { timestamp: { $lt: 10 * DAY_MS } },
		});
		expect(remove).toHaveBeenCalledTimes(1);
		expect(collection.bulkRemove).not.toHaveBeenCalled();
	});

	it('bulk-removes the oldest rows until the byte cap is met', async () => {
		const remaining = [
			{ primary: 'oldest', sizeBytes: 10 * MIB },
			{ primary: 'middle', sizeBytes: 10 * MIB },
			{ primary: 'newest', sizeBytes: 10 * MIB },
		];
		const find = jest
			.fn()
			.mockReturnValueOnce({ remove: jest.fn().mockResolvedValue([]) })
			.mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(remaining) });
		const collection = { find, bulkRemove: jest.fn().mockResolvedValue(undefined) };

		await sweepLogRetention(collection, 40 * DAY_MS);

		expect(find).toHaveBeenNthCalledWith(2, { sort: [{ timestamp: 'asc' }] });
		expect(collection.bulkRemove).toHaveBeenCalledWith(['oldest']);
	});
});

describe('rows without sizeBytes (review fix, PR #851)', () => {
	it('serializes unsized rows instead of charging the 512-byte fallback', async () => {
		const bigPayload = 'x'.repeat(24 * 1024 * 1024);
		const rows = [
			{ primary: 'legacy-1', toJSON: () => ({ context: bigPayload }) },
			{ primary: 'recent-1', sizeBytes: 2 * 1024 * 1024, toJSON: () => ({}) },
		];
		const collection = {
			find: jest.fn((query: Record<string, unknown>) => {
				if (query.selector) return { remove: jest.fn().mockResolvedValue([]) };
				return { exec: jest.fn().mockResolvedValue(rows) };
			}),
			bulkRemove: jest.fn().mockResolvedValue(undefined),
		};

		await sweepLogRetention(collection as any, Date.now());

		// 24 MiB (serialized legacy row) + 2 MiB > 25 MiB cap → oldest row removed.
		expect(collection.bulkRemove).toHaveBeenCalledWith(['legacy-1']);
	});
});

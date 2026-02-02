import { mergeStoresWithResponse } from './merge-stores';

// Mock expo-crypto
jest.mock('expo-crypto', () => ({
	digestStringAsync: jest.fn().mockImplementation(async (_algo, dataString) => {
		// Simple deterministic hash for testing
		let hash = 0;
		for (let i = 0; i < dataString.length; i++) {
			hash = ((hash << 5) - hash + dataString.charCodeAt(i)) | 0;
		}
		return Math.abs(hash).toString(16).padStart(10, '0');
	}),
	CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
	CryptoEncoding: { HEX: 'hex' },
}));

jest.mock('@wcpos/utils/logger', () => ({
	getLogger: () => ({
		debug: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
	}),
}));

const makeWpUser = (stores: any[] = []) => ({
	uuid: 'wp-user-uuid',
	populate: jest.fn().mockResolvedValue(stores),
	incrementalPatch: jest.fn().mockResolvedValue(undefined),
});

const makeUserDB = () => ({
	stores: {
		bulkInsert: jest.fn().mockResolvedValue(undefined),
		bulkRemove: jest.fn().mockResolvedValue(undefined),
	},
});

describe('mergeStoresWithResponse', () => {
	it('should insert new stores and update wpUser', async () => {
		const userDB = makeUserDB();
		const wpUser = makeWpUser([]);
		const remoteStores = [{ id: 1, name: 'Store 1' }];

		const result = await mergeStoresWithResponse({
			userDB: userDB as any,
			wpUser: wpUser as any,
			remoteStores,
			user: { uuid: 'user-uuid' },
			siteID: 'site-1',
		});

		expect(userDB.stores.bulkInsert).toHaveBeenCalledWith(
			expect.arrayContaining([expect.objectContaining({ id: 1, name: 'Store 1', localID: expect.any(String) })])
		);
		expect(wpUser.incrementalPatch).toHaveBeenCalledWith({
			stores: expect.arrayContaining([expect.any(String)]),
		});
		expect(result).toHaveLength(1);
	});

	it('should remove stores not in remote response', async () => {
		const userDB = makeUserDB();
		const existingStores = [{ id: 99, localID: 'old-local-id' }];
		const wpUser = makeWpUser(existingStores);
		const remoteStores = [{ id: 1, name: 'New Store' }];

		await mergeStoresWithResponse({
			userDB: userDB as any,
			wpUser: wpUser as any,
			remoteStores,
			user: { uuid: 'user-uuid' },
			siteID: 'site-1',
		});

		expect(userDB.stores.bulkRemove).toHaveBeenCalledWith(['old-local-id']);
	});

	it('should not call bulkRemove if no stores to remove', async () => {
		const userDB = makeUserDB();
		const wpUser = makeWpUser([]);

		await mergeStoresWithResponse({
			userDB: userDB as any,
			wpUser: wpUser as any,
			remoteStores: [{ id: 1 }],
			user: { uuid: 'user-uuid' },
			siteID: 'site-1',
		});

		expect(userDB.stores.bulkRemove).not.toHaveBeenCalled();
	});

	it('should handle empty remote stores', async () => {
		const userDB = makeUserDB();
		const existingStores = [{ id: 1, localID: 'existing-id' }];
		const wpUser = makeWpUser(existingStores);

		const result = await mergeStoresWithResponse({
			userDB: userDB as any,
			wpUser: wpUser as any,
			remoteStores: [],
			user: { uuid: 'user-uuid' },
			siteID: 'site-1',
		});

		expect(userDB.stores.bulkRemove).toHaveBeenCalledWith(['existing-id']);
		expect(userDB.stores.bulkInsert).not.toHaveBeenCalled();
		expect(result).toEqual([]);
	});

	it('should generate deterministic localIDs', async () => {
		const userDB = makeUserDB();
		const wpUser = makeWpUser([]);
		const remoteStores = [{ id: 1 }, { id: 2 }];

		const result1 = await mergeStoresWithResponse({
			userDB: userDB as any,
			wpUser: wpUser as any,
			remoteStores,
			user: { uuid: 'user-uuid' },
			siteID: 'site-1',
		});

		jest.clearAllMocks();
		const userDB2 = makeUserDB();
		const wpUser2 = makeWpUser([]);

		const result2 = await mergeStoresWithResponse({
			userDB: userDB2 as any,
			wpUser: wpUser2 as any,
			remoteStores,
			user: { uuid: 'user-uuid' },
			siteID: 'site-1',
		});

		expect(result1).toEqual(result2);
	});

	it('should throw and log on error', async () => {
		const userDB = makeUserDB();
		const wpUser = makeWpUser([]);
		wpUser.populate.mockRejectedValue(new Error('DB error'));

		await expect(
			mergeStoresWithResponse({
				userDB: userDB as any,
				wpUser: wpUser as any,
				remoteStores: [{ id: 1 }],
				user: { uuid: 'user-uuid' },
				siteID: 'site-1',
			})
		).rejects.toThrow('DB error');
	});
});

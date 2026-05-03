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

const makeWpUser = (stores: any[] = []) => {
	const wpUser: any = {
		uuid: 'wp-user-uuid',
		stores: [],
		populate: jest.fn().mockResolvedValue(stores),
		incrementalPatch: jest.fn().mockResolvedValue(undefined),
	};
	// RxDocument#getLatest returns the latest doc revision; tests reuse the
	// same mock instance so a self-reference is a faithful stand-in.
	wpUser.getLatest = jest.fn(() => wpUser);
	return wpUser;
};

const makeUserDB = () => ({
	stores: {
		bulkInsert: jest.fn().mockResolvedValue(undefined),
		bulkRemove: jest.fn().mockResolvedValue(undefined),
		findOne: jest.fn().mockReturnValue({
			exec: jest.fn().mockResolvedValue({
				incrementalPatch: jest.fn().mockResolvedValue(undefined),
			}),
		}),
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
			expect.arrayContaining([
				expect.objectContaining({ id: 1, name: 'Store 1', localID: expect.any(String) }),
			])
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

	it('should exclude non-409 failed doc IDs from wpUser.stores', async () => {
		const userDB = makeUserDB();
		// Echo: persist the first store, fail the second with a 422.
		userDB.stores.bulkInsert.mockImplementation(async (docs: any[]) => ({
			success: [docs[0]],
			error: [
				{
					documentId: docs[1].localID,
					status: 422,
					message: 'Validation failed',
				},
			],
		}));
		const wpUser = makeWpUser([]);

		await mergeStoresWithResponse({
			userDB: userDB as any,
			wpUser: wpUser as any,
			remoteStores: [{ id: 1 }, { id: 2 }],
			user: { uuid: 'user-uuid' },
			siteID: 'site-1',
		});

		const insertedDocs = userDB.stores.bulkInsert.mock.calls[0][0];
		const goodLocalID = insertedDocs[0].localID;
		const badLocalID = insertedDocs[1].localID;
		const patchCall = wpUser.incrementalPatch.mock.calls[0][0];
		expect(patchCall.stores).toContain(goodLocalID);
		expect(patchCall.stores).not.toContain(badLocalID);
	});

	it('should default tax_ids to [] when field is missing from server payload', async () => {
		const userDB = makeUserDB();
		const wpUser = makeWpUser([]);
		// Payload from an older plugin that does not emit tax_ids at all.
		const remoteStores = [{ id: 1, name: 'Store 1' }];

		await mergeStoresWithResponse({
			userDB: userDB as any,
			wpUser: wpUser as any,
			remoteStores,
			user: { uuid: 'user-uuid' },
			siteID: 'site-1',
		});

		const insertedDocs = userDB.stores.bulkInsert.mock.calls[0][0];
		expect(insertedDocs[0]).toEqual(
			expect.objectContaining({
				id: 1,
				tax_ids: [],
			})
		);
	});

	it('should default tax_ids to [] when the field is a non-array value', async () => {
		const userDB = makeUserDB();
		const wpUser = makeWpUser([]);
		// Defensive: server emits an unexpected non-array shape.
		const remoteStores = [{ id: 1, name: 'Store 1', tax_ids: 'invalid' }];

		await mergeStoresWithResponse({
			userDB: userDB as any,
			wpUser: wpUser as any,
			remoteStores,
			user: { uuid: 'user-uuid' },
			siteID: 'site-1',
		});

		const insertedDocs = userDB.stores.bulkInsert.mock.calls[0][0];
		expect(insertedDocs[0]).toEqual(
			expect.objectContaining({
				id: 1,
				tax_ids: [],
			})
		);
	});

	it('should preserve tax_ids array when server emits valid entries', async () => {
		const userDB = makeUserDB();
		const wpUser = makeWpUser([]);
		const taxIds = [
			{ type: 'VAT', value: 'DE123456789' },
			{ type: 'ABN', value: '12345678901', country: 'AU', label: 'Australian Business Number' },
		];
		const remoteStores = [{ id: 1, name: 'Store 1', tax_ids: taxIds }];

		await mergeStoresWithResponse({
			userDB: userDB as any,
			wpUser: wpUser as any,
			remoteStores,
			user: { uuid: 'user-uuid' },
			siteID: 'site-1',
		});

		const insertedDocs = userDB.stores.bulkInsert.mock.calls[0][0];
		expect(insertedDocs[0]).toEqual(
			expect.objectContaining({
				id: 1,
				tax_ids: taxIds,
			})
		);
	});

	it('should coerce empty tax_based_on from legacy Pro stores to base', async () => {
		const userDB = makeUserDB();
		const wpUser = makeWpUser([]);
		const remoteStores = [{ id: 1, name: 'Store 1', tax_based_on: '' }];

		await mergeStoresWithResponse({
			userDB: userDB as any,
			wpUser: wpUser as any,
			remoteStores,
			user: { uuid: 'user-uuid' },
			siteID: 'site-1',
		});

		const insertedDocs = userDB.stores.bulkInsert.mock.calls[0][0];
		expect(insertedDocs[0]).toEqual(
			expect.objectContaining({
				id: 1,
				tax_based_on: 'base',
			})
		);
	});

	it('should preserve 409 conflicts (already-exists) in wpUser.stores', async () => {
		const userDB = makeUserDB();
		// All inserts fail with 409 — doc already exists on re-sync.
		userDB.stores.bulkInsert.mockImplementation(async (docs: any[]) => ({
			success: [],
			error: docs.map((d: any) => ({ documentId: d.localID, status: 409 })),
		}));
		const wpUser = makeWpUser([]);

		await mergeStoresWithResponse({
			userDB: userDB as any,
			wpUser: wpUser as any,
			remoteStores: [{ id: 1 }],
			user: { uuid: 'user-uuid' },
			siteID: 'site-1',
		});

		const insertedDocs = userDB.stores.bulkInsert.mock.calls[0][0];
		const localID = insertedDocs[0].localID;
		const patchCall = wpUser.incrementalPatch.mock.calls[0][0];
		expect(patchCall.stores).toContain(localID);
	});

	it('should fall back to document.localID when the error omits documentId', async () => {
		const userDB = makeUserDB();
		// Some failure modes surface the raw doc rather than documentId.
		userDB.stores.bulkInsert.mockImplementation(async (docs: any[]) => ({
			success: [docs[0]],
			error: [
				{
					status: 500,
					message: 'Storage error',
					document: { localID: docs[1].localID },
				},
			],
		}));
		const wpUser = makeWpUser([]);

		await mergeStoresWithResponse({
			userDB: userDB as any,
			wpUser: wpUser as any,
			remoteStores: [{ id: 1 }, { id: 2 }],
			user: { uuid: 'user-uuid' },
			siteID: 'site-1',
		});

		const insertedDocs = userDB.stores.bulkInsert.mock.calls[0][0];
		const goodLocalID = insertedDocs[0].localID;
		const badLocalID = insertedDocs[1].localID;
		const patchCall = wpUser.incrementalPatch.mock.calls[0][0];
		expect(patchCall.stores).toContain(goodLocalID);
		expect(patchCall.stores).not.toContain(badLocalID);
	});
});

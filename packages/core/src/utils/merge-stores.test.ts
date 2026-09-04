import {
	getServerOwnedStorePatch,
	mergeServerOwnedStoreFields,
	mergeStoresWithResponse,
	normalizeStorePayload,
} from './merge-stores';

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
	getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
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
		findOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
	},
});

const getLocalID = (storeID: number) => {
	const dataString = JSON.stringify({
		user: 'user-uuid',
		siteID: 'site-1',
		wpCredentialsID: 'wp-user-uuid',
		storeID,
	});
	let hash = 0;
	for (let i = 0; i < dataString.length; i++) {
		hash = ((hash << 5) - hash + dataString.charCodeAt(i)) | 0;
	}
	return Math.abs(hash).toString(16).padStart(10, '0').substring(0, 10);
};

const makeStoreDocument = (data: Record<string, unknown>) => {
	const document: any = {
		...data,
		incrementalPatch: jest.fn(async (patch: Record<string, unknown>) => {
			Object.assign(document, patch);
		}),
		incrementalModify: jest.fn(
			async (modify: (data: Record<string, unknown>) => Record<string, unknown>) => modify(document)
		),
	};
	document.getLatest = jest.fn(() => document);
	document.toJSON = jest.fn(() => document);
	return document;
};

describe('normalizeStorePayload', () => {
	it('keeps a valid customer-display advertisement', () => {
		expect(
			normalizeStorePayload({
				id: 1,
				display: { contract: 1, signaling: '/wcpos/v2/display' },
			}).display
		).toEqual({ contract: 1, signaling: '/wcpos/v2/display' });
	});

	it.each([null, 'display', { contract: '1', signaling: '/wcpos/v2/display' }])(
		'drops a malformed customer-display advertisement: %p',
		(display) => {
			expect(normalizeStorePayload({ id: 1, display })).not.toHaveProperty('display');
		}
	);

	it('defaults absent receipt_i18n to an empty object', () => {
		expect(normalizeStorePayload({ id: 1 }).receipt_i18n).toEqual({});
	});

	it.each([[], 'invalid', null])('defaults malformed receipt_i18n to an empty object', (value) => {
		expect(normalizeStorePayload({ id: 1, receipt_i18n: value }).receipt_i18n).toEqual({});
	});

	it('drops blank and whitespace-only receipt_i18n values', () => {
		expect(
			normalizeStorePayload({
				id: 1,
				receipt_i18n: { order: 'Bestelling', total: '', subtotal: '   ', tax: '\n' },
			}).receipt_i18n
		).toEqual({ order: 'Bestelling' });
	});

	it('keeps only string-valued receipt_i18n entries', () => {
		expect(
			normalizeStorePayload({
				id: 1,
				receipt_i18n: { order: 'Bestelling', total: 'Totaal', junk: 5, empty: null },
			}).receipt_i18n
		).toEqual({ order: 'Bestelling', total: 'Totaal' });
	});
});

describe('mergeStoresWithResponse', () => {
	it('updates changed server-owned fields on an existing store and preserves local preferences', async () => {
		const existingStore = makeStoreDocument({
			id: 1,
			localID: getLocalID(1),
			currency: 'USD',
			calc_taxes: 'no',
			price_num_decimals: 2,
			wc_price_decimals: 2,
			prevent_overselling: false,
			display: undefined,
			theme: 'dark',
			barcode_scanning_prefix: 'LOCAL-',
			sync_pull_batch_size: 75,
		});
		const userDB = makeUserDB();
		const wpUser = makeWpUser([existingStore]);

		await mergeStoresWithResponse({
			userDB: userDB as any,
			wpUser: wpUser as any,
			remoteStores: [
				{
					id: 1,
					currency: 'EUR',
					calc_taxes: 'yes',
					price_num_decimals: 3,
					prevent_overselling: true,
					display: { contract: 1, signaling: '/wcpos/v2/display' },
					theme: 'light',
					barcode_scanning_prefix: 'SERVER-',
					sync_pull_batch_size: 10,
				},
			],
			user: { uuid: 'user-uuid' },
			siteID: 'site-1',
		});

		// currency and price_num_decimals are app-editable → manual restore only;
		// wc_price_decimals is the server-authoritative copy and still auto-syncs.
		expect(existingStore.incrementalPatch).toHaveBeenCalledWith({
			calc_taxes: 'yes',
			display: { contract: 1, signaling: '/wcpos/v2/display' },
			wc_price_decimals: 3,
			prevent_overselling: true,
		});
		expect(existingStore).toMatchObject({
			theme: 'dark',
			barcode_scanning_prefix: 'LOCAL-',
			sync_pull_batch_size: 75,
		});
		expect(userDB.stores.bulkInsert).not.toHaveBeenCalled();
	});

	it('leaves existing values unchanged when server-owned fields are absent', async () => {
		const existingStore = makeStoreDocument({
			id: 1,
			localID: getLocalID(1),
			name: 'Store 1',
			currency: 'GBP',
			prevent_overselling: true,
			tax_ids: [{ type: 'VAT', value: 'GB123' }],
		});
		const userDB = makeUserDB();
		const wpUser = makeWpUser([existingStore]);

		await mergeStoresWithResponse({
			userDB: userDB as any,
			wpUser: wpUser as any,
			remoteStores: [{ id: 1, name: 'Store 1' }],
			user: { uuid: 'user-uuid' },
			siteID: 'site-1',
		});

		expect(existingStore.incrementalPatch).not.toHaveBeenCalled();
		expect(existingStore).toMatchObject({
			currency: 'GBP',
			prevent_overselling: true,
			tax_ids: [{ type: 'VAT', value: 'GB123' }],
		});
	});

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
				expect.objectContaining({
					id: 1,
					name: 'Store 1',
					localID: expect.any(String),
					prevent_overselling: false,
				}),
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

	it('should drop malformed tax_ids entries and keep valid ones', async () => {
		const userDB = makeUserDB();
		const wpUser = makeWpUser([]);
		const remoteStores = [
			{
				id: 1,
				name: 'Store 1',
				tax_ids: [
					{ type: 'VAT', value: 'DE123456789' },
					{}, // missing type/value
					null, // not an object
					{ type: 'eu_vat' }, // missing value
					{ type: 'gb_vat', value: 'GB123', country: 'GB', label: 'VAT', extra: 'drop' },
				],
			},
		];

		await mergeStoresWithResponse({
			userDB: userDB as any,
			wpUser: wpUser as any,
			remoteStores,
			user: { uuid: 'user-uuid' },
			siteID: 'site-1',
		});

		const insertedDocs = userDB.stores.bulkInsert.mock.calls[0][0];
		expect(insertedDocs[0].tax_ids).toEqual([
			{ type: 'VAT', value: 'DE123456789' },
			{ type: 'gb_vat', value: 'GB123', country: 'GB', label: 'VAT' },
		]);
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

describe('getServerOwnedStorePatch', () => {
	it('deletes a withdrawn display advertisement without patching undefined', async () => {
		const store = makeStoreDocument({
			id: 1,
			display: { contract: 1, signaling: '/wcpos/v2/display' },
		});

		const patch = await mergeServerOwnedStoreFields(store, { id: 1 });

		expect(patch).toEqual({});
		expect(Object.values(patch)).not.toContain(undefined);
		expect(store).not.toHaveProperty('display');
		expect(store.incrementalPatch).not.toHaveBeenCalled();
		expect(store.incrementalModify).toHaveBeenCalledTimes(1);
	});

	it('keeps the display advertisement when the caller opts out of revocation', async () => {
		const store = makeStoreDocument({
			id: 1,
			display: { contract: 1, signaling: '/wcpos/v2/display' },
		});
		const patch = await mergeServerOwnedStoreFields(
			store,
			{ id: 1 },
			{ revokeDisplayOnAbsence: false }
		);
		expect(patch).toEqual({});
		expect(store).toHaveProperty('display', { contract: 1, signaling: '/wcpos/v2/display' });
		expect(store.incrementalModify).not.toHaveBeenCalled();
	});

	it('compares plain toJSON data, never RxDocument property proxies', () => {
		// Object-valued fields read directly off an RxDocument are Proxies
		// (rxdb getDocumentProperty). On Electron, lodash isEqual hands such a
		// Proxy to the contextBridge-wrapped Buffer.isBuffer, whose arguments
		// must survive structured clone — Proxies don't, so the comparison
		// throws "An object could not be cloned". Direct field access is
		// poisoned here to prove only toJSON() data is ever compared.
		const plainData = {
			id: 1,
			tax_address: { country: 'GB', state: '', postcode: '', city: '' },
			calc_taxes: 'no',
		};
		const rxDocumentLike = new Proxy({} as Record<string, unknown>, {
			get(_target, prop) {
				if (prop === 'toJSON') return () => plainData;
				throw new Error(`direct access to ${String(prop)} — must use toJSON()`);
			},
		});

		const patch = getServerOwnedStorePatch(rxDocumentLike, {
			id: 1,
			tax_address: { country: 'GB', state: '', postcode: '', city: '' },
			calc_taxes: 'yes',
		});

		expect(patch).toEqual({ calc_taxes: 'yes' });
	});
});

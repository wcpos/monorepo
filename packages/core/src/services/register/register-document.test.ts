import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBLocalDocumentsPlugin } from 'rxdb/plugins/local-documents';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';

import type { UserDatabase } from '@wcpos/database';

import { ensureRegister, nextSaleCounter, readRegister, renameRegister } from './register-document';

jest.mock('uuid', () => ({ v4: () => 'ABCDEF00-0000-4000-8000-00000000ABCD' }));
addRxPlugin(RxDBLocalDocumentsPlugin);
let db: UserDatabase;
beforeEach(async () => {
	db = await createRxDatabase({
		name: `register${Math.random().toString(36).slice(2)}`,
		storage: getRxStorageMemory(),
		localDocuments: true,
		multiInstance: false,
	});
});
afterEach(async () => {
	await db.remove();
});
it('mints once, including concurrent hydration, and reuses the document', async () => {
	const [first, second] = await Promise.all([ensureRegister(db), ensureRegister(db)]);
	expect(first).toEqual(second);
	expect(await ensureRegister(db)).toEqual(first);
	expect(first.id).toBe(first.id.toLowerCase());
	expect(first.name).toBe('Register ABCD');
	expect(first.sites).toEqual({});
});
it('increments atomically without duplicate counters', async () => {
	await ensureRegister(db);
	for (const counter of [1, 2, 3]) expect(await nextSaleCounter(db, 'site')).toBe(counter);
	expect(
		(await Promise.all([nextSaleCounter(db, 'site'), nextSaleCounter(db, 'site')])).sort()
	).toEqual([4, 5]);
});
it('trims names and ignores invalid names', async () => {
	await ensureRegister(db);
	await renameRegister(db, '  Front till  ');
	for (const name of ['', '   ', 'x'.repeat(192)]) await renameRegister(db, name);
	expect((await readRegister(db))?.name).toBe('Front till');
	await renameRegister(db, 'x'.repeat(191));
	expect((await readRegister(db))?.name).toHaveLength(191);
});

it('registers each site snapshot once and retries failures only when called again', async () => {
	const { registerWithServer } = await import('./register-with-server');
	const register = await ensureRegister(db);
	const http = { post: jest.fn(async () => ({ status: 201 })) };
	const input = { userDB: db, http, siteUuid: 'site' };
	await registerWithServer(input);
	await registerWithServer(input);
	// Each sign-in registers again (per-session dedupe lives in the hook).
	expect(http.post).toHaveBeenCalledTimes(2);
	expect(http.post).toHaveBeenCalledWith(
		'registers',
		expect.objectContaining({ id: register.id, name: register.name, platform: register.platform })
	);
	await renameRegister(db, 'Front');
	http.post.mockRejectedValueOnce(new Error('offline'));
	await expect(registerWithServer(input)).resolves.toBeUndefined();
	expect((await readRegister(db))?.sites.site.registration?.name).toBe(register.name);
	await registerWithServer(input);
	expect((await readRegister(db))?.sites.site.registration?.name).toBe('Front');
	await registerWithServer({ ...input, siteUuid: 'other' });
	expect(Object.keys((await readRegister(db))!.sites)).toEqual(['site', 'other']);
});

it('completion metadata is retained on retry without incrementing the counter', async () => {
	const { completionMeta } =
		await import('../../screens/main/pos/checkout/provenance/stamp-completion');
	await ensureRegister(db);
	const first = await completionMeta(
		{ meta_data: [{ key: 'custom', value: 'keep' }] },
		{ userDB: db, siteUuid: 'site' }
	);
	expect(first).toContainEqual({ key: '_wcpos_sale_counter', value: '1' });
	expect(await completionMeta({ meta_data: first }, { userDB: db, siteUuid: 'site' })).toBe(first);
	expect((await readRegister(db))?.sites.site.sale_counter).toBe(1);
});

it('returns each assigned counter even when RxDB batches concurrent modifiers', async () => {
	await ensureRegister(db);
	const counters = await Promise.all(Array.from({ length: 10 }, () => nextSaleCounter(db, 'site')));
	expect(counters.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

it('counts sites independently without changing the global identity', async () => {
	const register = await ensureRegister(db);
	for (const counter of [1, 2, 3]) {
		expect(await nextSaleCounter(db, 'site')).toBe(counter);
		expect(await nextSaleCounter(db, 'other')).toBe(counter);
	}
	expect(await readRegister(db)).toMatchObject({
		id: register.id,
		sites: { site: { sale_counter: 3 }, other: { sale_counter: 3 } },
	});
});

beforeEach(() => {
	jest
		.spyOn(globalThis.crypto, 'randomUUID')
		.mockReturnValue('abcdef00-0000-4000-8000-00000000abcd');
});
afterEach(() => jest.restoreAllMocks());
it('caches the register identity and mints v4 with random bytes when randomUUID is absent', async () => {
	const { getRegisterId } = await import('./register-document');
	jest.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(undefined as never);
	const register = await ensureRegister(db);
	expect(register.id).toMatch(
		/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
	);
	expect(getRegisterId()).toBe(register.id);
	expect(await readRegister(db)).toEqual(register);
	expect(getRegisterId()).toBe(register.id);
});

it('persists store bindings per site through counter writes and a collection reset', async () => {
	const { registerWithServer } = await import('./register-with-server');
	const collections = {
		resettable: {
			schema: {
				version: 0,
				primaryKey: 'id',
				type: 'object',
				properties: { id: { type: 'string', maxLength: 100 } },
				required: ['id'],
			},
		},
	};
	const { resettable } = await db.addCollections(collections);
	await resettable.insert({ id: 'discarded' });
	const register = await ensureRegister(db);
	await nextSaleCounter(db, 'site');
	await registerWithServer({
		userDB: db,
		siteUuid: 'site',
		http: { post: async () => ({ status: 201, data: { store_id: 2 } }) },
	});
	await registerWithServer({
		userDB: db,
		siteUuid: 'other',
		http: { post: async () => ({ status: 201, data: { store_id: 3 } }) },
	});
	await nextSaleCounter(db, 'site');
	await resettable.remove();
	await db.addCollections(collections);
	expect(await readRegister(db)).toMatchObject({
		id: register.id,
		sites: { site: { store_id: 2, sale_counter: 2 }, other: { store_id: 3, sale_counter: 0 } },
	});
});

it.each([{}, { store_id: null }])(
	'leaves a binding unset or unchanged for response %j',
	async (data) => {
		const { registerWithServer } = await import('./register-with-server');
		await ensureRegister(db);
		const input = {
			userDB: db,
			siteUuid: 'site',
			http: { post: async () => ({ status: 201, data }) },
		};
		await registerWithServer(input);
		expect((await readRegister(db))?.sites.site).not.toEqual(
			expect.objectContaining({ store_id: expect.any(Number) })
		);
		await renameRegister(db, 'Bound');
		await registerWithServer({
			...input,
			http: { post: async () => ({ status: 201, data: { store_id: 2 } }) },
		});
		await renameRegister(db, 'Renamed');
		await registerWithServer(input);
		expect(await readRegister(db)).toMatchObject({ sites: { site: { store_id: 2 } } });
	}
);

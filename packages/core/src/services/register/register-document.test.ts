import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBLocalDocumentsPlugin } from 'rxdb/plugins/local-documents';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';

import type { UserDatabase } from '@wcpos/database';

import {
	adoptCounters,
	advancePerpetual,
	bindRegister,
	ensureRegister,
	getBoundRegisterId,
	getCurrentBoundRegisterId,
	mintClosureNumber,
	nextSaleCounter,
	readBoundRegister,
	readRegister,
	unbindRegister,
} from './register-document';

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

it('binds and unbinds independently per site without changing counters or the till', async () => {
	const till = await ensureRegister(db);
	expect(await readBoundRegister(db, 'site', 1)).toBeNull();
	await bindRegister(db, 'site', { id: 'drawer-a', name: 'Front' }, 1);
	await bindRegister(db, 'other', { id: 'drawer-b', name: 'Back' }, 1);
	expect(await nextSaleCounter(db, 'site')).toBe(1);
	expect(await nextSaleCounter(db, 'site')).toBe(2);
	expect(await nextSaleCounter(db, 'other')).toBe(1);
	expect(await readBoundRegister(db, 'site', 1)).toEqual({ id: 'drawer-a', name: 'Front' });
	expect(await readBoundRegister(db, 'other', 1)).toEqual({ id: 'drawer-b', name: 'Back' });
	expect(getBoundRegisterId('site')).toBe('drawer-a');
	await unbindRegister(db, 'site', 1);
	expect(await readBoundRegister(db, 'site', 1)).toBeNull();
	expect(getBoundRegisterId('site')).toBeNull();
	expect(getBoundRegisterId('other')).toBe('drawer-b');
	expect(await nextSaleCounter(db, 'site')).toBe(3);
	expect((await readRegister(db))?.id).toBe(till.id);
});

it.each([null, { id: 'server-register', name: 'Front' }])(
	'completion uses the bound register, not the till: %j',
	async (bound) => {
		const { completionMeta } =
			await import('../../screens/main/pos/checkout/provenance/stamp-completion');
		await ensureRegister(db);
		if (bound) await bindRegister(db, 'site', bound, 1);
		const meta = await completionMeta({}, { userDB: db, siteUuid: 'site' });
		expect(meta.find(({ key }) => key === '_wcpos_register')?.value).toBe(bound?.id);
		expect(meta).toContainEqual({ key: '_wcpos_sale_counter', value: '1' });
	}
);

it('rejects another store pointer after hydration without resetting the site counter', async () => {
	await ensureRegister(db);
	await bindRegister(db, 'site', { id: 'a', name: 'A' }, 1);
	await nextSaleCounter(db, 'site');
	await bindRegister(db, 'site', { id: 'b', name: 'B' }, 2);
	expect(getCurrentBoundRegisterId()).toBe('b');
	expect(await readBoundRegister(db, 'site', 1)).toBeNull();
	expect(getCurrentBoundRegisterId()).toBeNull();
	expect(await readBoundRegister(db, 'site', 2)).toEqual({ id: 'b', name: 'B' });
	expect(getCurrentBoundRegisterId()).toBe('b');
	expect(await nextSaleCounter(db, 'site')).toBe(2);
});
it('does not unbind a pointer another store of the site has written', async () => {
	await ensureRegister(db);
	await bindRegister(db, 'site', { id: 'drawer-a', name: 'Front' }, 1);
	await bindRegister(db, 'site', { id: 'drawer-b', name: 'Back' }, 2);
	await unbindRegister(db, 'site', 1);
	expect(await readBoundRegister(db, 'site', 2)).toEqual({ id: 'drawer-b', name: 'Back' });
	await unbindRegister(db, 'site', 2);
	expect(await readBoundRegister(db, 'site', 2)).toBeNull();
});
it('accepts a legacy pointer until the next bind records its store', async () => {
	await ensureRegister(db);
	const doc = await db.getLocal('register');
	await doc!.incrementalPatch({ sites: { site: { sale_counter: 4, register_id: 'old' } } });
	expect(await readBoundRegister(db, 'site', 0)).toEqual({ id: 'old', name: '' });
	await bindRegister(db, 'site', { id: 'old', name: 'Legacy' }, 0);
	expect((await readRegister(db))?.sites.site).toMatchObject({
		register_store_id: 0,
		sale_counter: 4,
	});
	expect(await readBoundRegister(db, 'site', 1)).toBeNull();
});

it('mints unique closure numbers after the adopted floor, independently by site', async () => {
	await ensureRegister(db);
	await adoptCounters(db, 'site', {
		last_closure_number: 12,
		perpetual_sales_total: '100.01',
		perpetual_refunds_total: '10.02',
	});
	expect(
		(await Promise.all(Array.from({ length: 10 }, () => mintClosureNumber(db, 'site')))).sort(
			(a, b) => a - b
		)
	).toEqual([13, 14, 15, 16, 17, 18, 19, 20, 21, 22]);
	expect(await mintClosureNumber(db, 'other')).toBe(1);
});
it('only raises each counter and adds perpetual amounts in minor units', async () => {
	await ensureRegister(db);
	await adoptCounters(db, 'site', {
		last_closure_number: 3,
		perpetual_sales_total: '0.1',
		perpetual_refunds_total: '0.2',
	});
	await adoptCounters(db, 'site', {
		last_closure_number: 1,
		perpetual_sales_total: '0.01',
		perpetual_refunds_total: '0.3',
	});
	await advancePerpetual(db, 'site', { sales: '0.2', refunds: '0.0001' });
	expect((await readRegister(db))?.sites.site).toMatchObject({
		last_closure_number: 3,
		perpetual_sales_total: '0.3000',
		perpetual_refunds_total: '0.3001',
	});
});

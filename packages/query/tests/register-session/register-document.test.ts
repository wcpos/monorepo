import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBLocalDocumentsPlugin } from 'rxdb/plugins/local-documents';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';

import type { UserDatabase } from '@wcpos/database';
import { getLogger } from '@wcpos/utils/logger';

import {
	adoptCounters,
	advancePerpetual,
	bindRegister,
	bindStoreRegister,
	getBoundRegisterId,
	getCurrentBoundRegisterId,
	getRegisterSnapshot,
	markAnchored,
	markCountingHere,
	markSeededIn,
	mintClosureNumber,
	nextSaleCounter,
	readBoundRegister,
	readCarriedFrom,
	readClosedElsewhere,
	readCounters,
	readLiveSession,
	readRegister,
	recordCarriedFrom,
	recordLiveSession,
	remintRegister,
	settleRegister,
	unbindRegister,
} from '../../src/register-session/register-document';

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
	const [first, second] = await Promise.all([settleRegister(db), settleRegister(db)]);
	expect(first).toEqual(second);
	expect(await settleRegister(db)).toEqual(first);
	expect(first.id).toBe(first.id.toLowerCase());
	expect(first.name).toBe('Register ABCD');
	expect(first.sites).toEqual({});
});
it('increments atomically without duplicate counters', async () => {
	await remintRegister(db);
	for (const counter of [1, 2, 3]) expect(await nextSaleCounter(db, 'site')).toBe(counter);
	expect(
		(await Promise.all([nextSaleCounter(db, 'site'), nextSaleCounter(db, 'site')])).sort()
	).toEqual([4, 5]);
});
it('completion metadata is retained on retry without incrementing the counter', async () => {
	const { completionMeta } =
		await import('../../../core/src/screens/main/pos/checkout/provenance/stamp-completion');
	await remintRegister(db);
	const first = await completionMeta(
		{ meta_data: [{ key: 'custom', value: 'keep' }] },
		{ userDB: db, siteUuid: 'site' }
	);
	expect(first).toContainEqual({ key: '_wcpos_sale_counter', value: '1' });
	expect(await completionMeta({ meta_data: first }, { userDB: db, siteUuid: 'site' })).toBe(first);
	expect((await readRegister(db))?.sites.site.sale_counter).toBe(1);
});

it('returns each assigned counter even when RxDB batches concurrent modifiers', async () => {
	await remintRegister(db);
	const counters = await Promise.all(Array.from({ length: 10 }, () => nextSaleCounter(db, 'site')));
	expect(counters.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

it('counts sites independently without changing the global identity', async () => {
	const register = await remintRegister(db);
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
	const { getRegisterId } = await import('../../src/register-session/register-document');
	jest.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(undefined as never);
	const register = await remintRegister(db);
	expect(register.id).toMatch(
		/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
	);
	expect(getRegisterId()).toBe(register.id);
	expect(await readRegister(db)).toEqual(register);
	expect(getRegisterId()).toBe(register.id);
});

it('binds and unbinds independently per site without changing counters or the till', async () => {
	const till = await remintRegister(db);
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
			await import('../../../core/src/screens/main/pos/checkout/provenance/stamp-completion');
		await remintRegister(db);
		if (bound) await bindRegister(db, 'site', bound, 1);
		const meta = await completionMeta({}, { userDB: db, siteUuid: 'site' });
		expect(meta.find(({ key }) => key === '_wcpos_register')?.value).toBe(bound?.id);
		expect(meta).toContainEqual({ key: '_wcpos_sale_counter', value: '1' });
	}
);

it("keeps each store's pointer after a bind for another store, without resetting the site counter", async () => {
	await remintRegister(db);
	await bindRegister(db, 'site', { id: 'a', name: 'A' }, 1);
	await nextSaleCounter(db, 'site');
	await bindRegister(db, 'site', { id: 'b', name: 'B' }, 2);
	expect(getCurrentBoundRegisterId()).toBe('b');
	expect(await readBoundRegister(db, 'site', 1)).toEqual({ id: 'a', name: 'A' });
	expect(getCurrentBoundRegisterId()).toBe('a');
	expect(await readBoundRegister(db, 'site', 2)).toEqual({ id: 'b', name: 'B' });
	expect(getCurrentBoundRegisterId()).toBe('b');
	expect(await nextSaleCounter(db, 'site')).toBe(2);
	await unbindRegister(db, 'site', 2);
	expect(await readBoundRegister(db, 'site', 1)).toEqual({ id: 'a', name: 'A' });
});
it('does not unbind a pointer another store of the site has written', async () => {
	await remintRegister(db);
	await bindRegister(db, 'site', { id: 'drawer-a', name: 'Front' }, 1);
	await bindRegister(db, 'site', { id: 'drawer-b', name: 'Back' }, 2);
	await unbindRegister(db, 'site', 1);
	expect(await readBoundRegister(db, 'site', 2)).toEqual({ id: 'drawer-b', name: 'Back' });
	await unbindRegister(db, 'site', 2);
	expect(await readBoundRegister(db, 'site', 2)).toBeNull();
});
it('accepts a legacy pointer until the next bind records its store', async () => {
	await remintRegister(db);
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
	await remintRegister(db);
	await adoptCounters(db, 'site', 'a', {
		last_closure_number: 12,
		perpetual_sales_total: '100.01',
		perpetual_refunds_total: '10.02',
	});
	expect(
		(await Promise.all(Array.from({ length: 10 }, () => mintClosureNumber(db, 'site', 'a')))).sort(
			(a, b) => a - b
		)
	).toEqual([13, 14, 15, 16, 17, 18, 19, 20, 21, 22]);
	expect(await mintClosureNumber(db, 'other', 'a')).toBe(1);
});
it('only raises each counter and adds perpetual amounts in minor units', async () => {
	await remintRegister(db);
	await adoptCounters(db, 'site', 'a', {
		last_closure_number: 3,
		perpetual_sales_total: '0.1',
		perpetual_refunds_total: '0.2',
	});
	await adoptCounters(db, 'site', 'a', {
		last_closure_number: 1,
		perpetual_sales_total: '0.01',
		perpetual_refunds_total: '0.3',
	});
	await advancePerpetual(db, 'site', 'a', { sales: '0.2', refunds: '0.0001' });
	expect((await readRegister(db))?.sites.site.registers?.a).toMatchObject({
		last_closure_number: 3,
		perpetual_sales_total: '0.3000',
		perpetual_refunds_total: '0.3001',
	});
});

it('keeps register B independent of A and ignores legacy site counters', async () => {
	await remintRegister(db);
	await (await db.getLocal('register'))!.incrementalPatch({
		sites: { site: { sale_counter: 7, last_closure_number: 99, perpetual_sales_total: '999' } },
	});
	await bindRegister(db, 'site', { id: 'a', name: 'A' });
	await adoptCounters(db, 'site', 'a', {
		last_closure_number: 12,
		perpetual_sales_total: '100',
		perpetual_refunds_total: '10',
	});
	await bindRegister(db, 'site', { id: 'b', name: 'B' });
	const floor = {
		last_closure_number: 0,
		perpetual_sales_total: '0',
		perpetual_refunds_total: '0',
	};
	await adoptCounters(db, 'site', 'b', floor);
	expect(await mintClosureNumber(db, 'site', 'b')).toBe(1);
	await advancePerpetual(db, 'site', 'b', { sales: '2', refunds: '1' });
	await adoptCounters(db, 'site', 'b', floor);
	expect((await readRegister(db))?.sites.site.registers).toMatchObject({
		a: { last_closure_number: 12, perpetual_sales_total: '100.0000' },
		b: {
			last_closure_number: 1,
			perpetual_sales_total: '2.0000',
			perpetual_refunds_total: '1.0000',
		},
	});
	expect(await nextSaleCounter(db, 'site')).toBe(8);
});

it('a re-mint after adopting a newer server floor carries the period exactly once', async () => {
	await remintRegister(db);
	const closure = {
		id: 'c1',
		period_sales_total: '20',
		period_refunds_total: '5',
	} as Parameters<typeof mintClosureNumber>[3] & object;
	expect(await mintClosureNumber(db, 'site', 'a', closure)).toBe(1);
	await advancePerpetual(db, 'site', 'a', { sales: '20', refunds: '5', closureId: 'c1' });
	// Another till closed on the server meanwhile: floor 3, totals 100/10 (without our period).
	await adoptCounters(db, 'site', 'a', {
		last_closure_number: 3,
		perpetual_sales_total: '100',
		perpetual_refunds_total: '10',
	});
	const bucket = () => (getRegisterSnapshot()!.sites.site.registers ?? {})['a'];
	expect(Number(bucket().perpetual_sales_total)).toBe(120);
	expect(Number(bucket().perpetual_refunds_total)).toBe(15);
	expect(await mintClosureNumber(db, 'site', 'a', { ...closure, number_retried: true })).toBe(4);
	expect(Number(bucket().closure_reservation?.row.perpetual_sales_total)).toBe(120);
	expect(Number(bucket().closure_reservation?.row.perpetual_refunds_total)).toBe(15);
});
it('readCounters refuses payloads that cannot serve as a floor', () => {
	expect(readCounters(null)).toBeNull();
	expect(readCounters({})).toBeNull();
	expect(
		readCounters({
			last_closure_number: 'x',
			perpetual_sales_total: '1',
			perpetual_refunds_total: '0',
		})
	).toBeNull();
	expect(
		readCounters({
			last_closure_number: 2,
			perpetual_sales_total: '1.5',
			perpetual_refunds_total: 0,
		})
	).toEqual({
		last_closure_number: 2,
		perpetual_sales_total: '1.5',
		perpetual_refunds_total: '0',
		counters_started_at: null,
	});
});

it('re-mints a cloned till: new id, counters back at zero, store bindings and floors kept', async () => {
	const { remintRegister } = await import('../../src/register-session/register-document');
	const cloned = await remintRegister(db);
	await bindRegister(db, 'site', { id: 'server-register', name: 'Front' }, 1);
	await adoptCounters(db, 'site', 'server-register', {
		last_closure_number: 4,
		perpetual_sales_total: '10.00',
		perpetual_refunds_total: '0.00',
	});
	for (const counter of [1, 2, 3]) expect(await nextSaleCounter(db, 'site')).toBe(counter);
	expect(await nextSaleCounter(db, 'other')).toBe(1);
	const live = {
		session_id: 's1',
		status: 'open',
		opened_at_gmt: '2026-10-28T13:05:00Z',
		opened_by: { id: 7, name: 'Demo Cashier' },
		acknowledged: true,
		expected_float: null,
		counted_float: null,
		business_day: null,
		seeded_in: ['db-a'],
		counting_here: true,
		at: '2026-10-28T13:05:00Z',
	};
	// A closure the source till has in flight is the source's, not the clone's.
	const doc = await db.getLocal<{ sites: Record<string, { registers?: Record<string, unknown> }> }>(
		'register'
	);
	await doc!.incrementalModify((data) => ({
		...data,
		sites: {
			...data.sites,
			site: {
				...data.sites.site,
				registers: {
					'server-register': {
						...data.sites.site.registers?.['server-register'],
						live,
						closure_reservation: { row: { id: 'closure-1', number: 5 }, applied: false },
					},
				},
			},
		},
	}));

	// The suite pins uuid v4 to one value; the re-mint must draw a different one.
	jest
		.spyOn(globalThis.crypto, 'randomUUID')
		.mockReturnValueOnce('FRESH000-1111-4222-8333-444444444444');
	const fresh = await remintRegister(db);
	expect(fresh.id).toBe('fresh000-1111-4222-8333-444444444444');
	expect(fresh.id).not.toBe(cloned.id);
	expect(fresh.name).toBe(`Register ${fresh.id.slice(-4).toUpperCase()}`);
	expect(fresh.sites.site).toMatchObject({
		sale_counter: 0,
		register_id: 'server-register',
		register_name: 'Front',
		register_store_id: 1,
		registers: { 'server-register': { last_closure_number: 4, perpetual_sales_total: '10.0000' } },
	});
	expect(fresh.sites.site.registers?.['server-register']?.live).toEqual({
		...live,
		seeded_in: [],
		counting_here: false,
	});
	expect(fresh.sites.site.registers?.['server-register']).not.toHaveProperty('closure_reservation');
	expect(fresh.sites.other.sale_counter).toBe(0);
	// The next sale starts the new till's own run, and the cached identity moved with it.
	expect(await nextSaleCounter(db, 'site')).toBe(1);
	expect(getRegisterSnapshot()?.id).toBe(fresh.id);
	expect(getBoundRegisterId('site', 1)).toBe('server-register');
	expect((await readRegister(db))?.id).toBe(fresh.id);
});

it('re-minting without a document is a plain mint', async () => {
	const { remintRegister } = await import('../../src/register-session/register-document');
	const minted = await remintRegister(db);
	expect(await readRegister(db)).toEqual(minted);
	expect(minted.sites).toEqual({});
});

it('markAnchored sets the flag and a re-mint keeps it', async () => {
	await remintRegister(db);
	expect((await readRegister(db))?.anchored).toBeUndefined();
	expect((await markAnchored(db)).anchored).toBe(true);
	expect(getRegisterSnapshot()?.anchored).toBe(true);
	expect((await remintRegister(db)).anchored).toBe(true);
	expect((await readRegister(db))?.anchored).toBe(true);
});

describe('settleRegister: the till anchor', () => {
	const ANCHOR = 'wcpos.tillId';
	const UNWRITABLE = 'Till anchor cannot be written; clone detection is off on this device';
	const REMINTED = 'Till re-minted: the local database came from another installation';
	const logger = () => getLogger(['wcpos', 'app', 'hydration']);
	const nextUuids = (...ids: string[]) => {
		const spy = jest.spyOn(globalThis.crypto, 'randomUUID');
		for (const id of ids) spy.mockReturnValueOnce(id as never);
	};
	const anchoredTill = async () => {
		nextUuids('aaaaaaaa-0000-4000-8000-00000000000a');
		await remintRegister(db);
		await nextSaleCounter(db, 'site');
		return markAnchored(db);
	};
	beforeEach(() => {
		jest.clearAllMocks();
		localStorage.removeItem(ANCHOR);
	});
	afterEach(() => {
		jest.restoreAllMocks();
		localStorage.removeItem(ANCHOR);
	});

	it('anchors a till minted this boot', async () => {
		const till = await settleRegister(db);
		expect(localStorage.getItem(ANCHOR)).toBe(till.id);
		expect((await readRegister(db))?.anchored).toBe(true);
		expect(logger().info).not.toHaveBeenCalled();
	});

	it('leaves an anchored till whose anchor matches alone', async () => {
		const till = await anchoredTill();
		localStorage.setItem(ANCHOR, till.id);
		const setItem = jest.spyOn(Storage.prototype, 'setItem');
		expect(await settleRegister(db)).toEqual(till);
		expect(setItem).not.toHaveBeenCalled();
		expect(logger().info).not.toHaveBeenCalled();
	});

	it('marks a matching till that lacks the flag', async () => {
		const till = await remintRegister(db);
		localStorage.setItem(ANCHOR, till.id);
		const settled = await settleRegister(db);
		expect(settled).toMatchObject({ id: till.id, anchored: true });
		expect(logger().info).not.toHaveBeenCalled();
	});

	it.each([
		['no anchor', null],
		['a stale foreign anchor', 'other-till'],
	])('adopts a till from before the anchor (%s), without re-minting', async (_, anchor) => {
		const till = await remintRegister(db);
		await nextSaleCounter(db, 'site');
		if (anchor) localStorage.setItem(ANCHOR, anchor);
		const settled = await settleRegister(db);
		expect(settled).toMatchObject({ id: till.id, anchored: true });
		expect(settled.sites.site.sale_counter).toBe(1);
		expect(localStorage.getItem(ANCHOR)).toBe(till.id);
		expect(logger().info).toHaveBeenCalledWith('Till anchored', {
			context: { till: till.id, previous: anchor },
		});
	});

	it.each([
		['absent', null],
		['another till', 'other-till'],
	])('re-mints an anchored till whose anchor is %s', async (_, anchor) => {
		const till = await anchoredTill();
		if (anchor) localStorage.setItem(ANCHOR, anchor);
		nextUuids('bbbbbbbb-0000-4000-8000-00000000000b');
		const fresh = await settleRegister(db);
		expect(fresh.id).toBe('bbbbbbbb-0000-4000-8000-00000000000b');
		expect(fresh).toMatchObject({ anchored: true, sites: { site: { sale_counter: 0 } } });
		expect(await readRegister(db)).toEqual(fresh);
		expect(localStorage.getItem(ANCHOR)).toBe(fresh.id);
		expect(logger().info).toHaveBeenCalledWith(REMINTED, {
			context: { previous: till.id, next: fresh.id, anchor },
		});
	});

	it.each([true, false])(
		'keeps the till as it is when the anchor cannot be written (anchored=%s)',
		async (anchored) => {
			const till = anchored ? await anchoredTill() : await remintRegister(db);
			jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
				throw new DOMException('quota exceeded', 'QuotaExceededError');
			});
			expect(await settleRegister(db)).toEqual(till);
			expect(await readRegister(db)).toEqual(till);
			expect(logger().info).toHaveBeenCalledTimes(1);
			expect(logger().info).toHaveBeenCalledWith(UNWRITABLE, {
				context: { anchor: null, till: till.id },
			});
		}
	);

	it('touches nothing when the anchor cannot be read', async () => {
		const till = await anchoredTill();
		jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
			throw new DOMException('denied', 'SecurityError');
		});
		const setItem = jest.spyOn(Storage.prototype, 'setItem');
		expect(await settleRegister(db)).toEqual(till);
		expect(setItem).not.toHaveBeenCalled();
	});

	it('does not re-mint a till another tab already re-minted, and anchors that id', async () => {
		await anchoredTill();
		const getLocal = db.getLocal.bind(db);
		let reads = 0;
		jest.spyOn(db, 'getLocal').mockImplementation((async (id: string) => {
			const doc = await getLocal(id);
			// The other tab's re-mint lands between this tab's read and its own re-mint.
			if (++reads === 2 && doc) {
				await doc.incrementalModify((data) => ({
					...data,
					id: 'eeeeeeee-0000-4000-8000-00000000000e',
				}));
			}
			return doc;
		}) as never);
		nextUuids('bbbbbbbb-0000-4000-8000-00000000000b');
		const settled = await settleRegister(db);
		expect(settled.id).toBe('eeeeeeee-0000-4000-8000-00000000000e');
		expect(settled.sites.site.sale_counter).toBe(1);
		expect(localStorage.getItem(ANCHOR)).toBe('eeeeeeee-0000-4000-8000-00000000000e');
		expect(logger().info).not.toHaveBeenCalledWith(REMINTED, expect.anything());
	});

	it('a re-mint that fails after the anchor write is retried on the next boot, never accepted', async () => {
		const till = await anchoredTill();
		const getLocal = db.getLocal.bind(db);
		let reads = 0;
		jest.spyOn(db, 'getLocal').mockImplementation((async (id: string) => {
			const doc = await getLocal(id);
			if (++reads === 1 || !doc) return doc;
			return new Proxy(doc, {
				get: (target, key, receiver) =>
					key === 'incrementalModify'
						? async () => {
								throw new Error('storage closed');
							}
						: Reflect.get(target, key, receiver),
			});
		}) as never);
		nextUuids('cccccccc-0000-4000-8000-00000000000c');
		await expect(settleRegister(db)).rejects.toThrow('storage closed');
		expect(localStorage.getItem(ANCHOR)).toBe('cccccccc-0000-4000-8000-00000000000c');
		jest.mocked(db.getLocal).mockRestore();
		expect(await readRegister(db)).toEqual(till);

		nextUuids('dddddddd-0000-4000-8000-00000000000d');
		const fresh = await settleRegister(db);
		expect(fresh.id).toBe('dddddddd-0000-4000-8000-00000000000d');
		expect(localStorage.getItem(ANCHOR)).toBe(fresh.id);
	});
});

it('still reads a legacy single pointer for its store and nothing for another', async () => {
	await remintRegister(db);
	const doc = await db.getLocal('register');
	await doc!.incrementalModify((data) => ({
		...data,
		sites: {
			site: { sale_counter: 0, register_id: 'L', register_name: 'Legacy', register_store_id: 1 },
		},
	}));
	expect(await readBoundRegister(db, 'site', 1)).toEqual({ id: 'L', name: 'Legacy' });
	expect(await readBoundRegister(db, 'site', 2)).toBeNull();
});

it("caches a register's live session on the device and clears it", async () => {
	await remintRegister(db);
	const base = {
		opened_at_gmt: '2026-10-28T13:05:00Z',
		opened_by: { id: 7, name: 'Demo Cashier' },
		acknowledged: true,
		expected_float: null,
		counted_float: null,
		business_day: null,
	};
	await recordLiveSession(db, 'site', 'A', { ...base, session_id: 's1', status: 'open' });
	expect(readLiveSession('site', 'A')).toMatchObject({
		session_id: 's1',
		status: 'open',
		counting_here: false,
	});
	await recordLiveSession(db, 'site', 'A', { ...base, session_id: 's1', status: 'counting' });
	expect(readLiveSession('site', 'A')?.counting_here).toBe(false);
	await markCountingHere(db, 'site', 'A', true);
	await recordLiveSession(db, 'site', 'A', { ...base, session_id: 's1', status: 'counting' });
	expect(readLiveSession('site', 'A')?.counting_here).toBe(true);
	await markCountingHere(db, 'site', 'A', false);
	expect(readLiveSession('site', 'A')?.counting_here).toBe(false);
	await markCountingHere(db, 'site', 'A', true);
	await recordLiveSession(db, 'site', 'A', { ...base, session_id: 's1', status: 'open' });
	expect(readLiveSession('site', 'A')?.counting_here).toBe(false);
	await markCountingHere(db, 'site', 'A', true);
	await recordLiveSession(db, 'site', 'A', {
		...base,
		session_id: 's2',
		status: 'counting',
		opened_by: null,
	});
	expect(readLiveSession('site', 'A')?.counting_here).toBe(false);
	await recordLiveSession(db, 'site', 'A', null);
	await markCountingHere(db, 'site', 'A', true);
	expect(readLiveSession('site', 'A')).toBeNull();
});
it('keeps seed destinations once per database for the same session and resets them for a new session', async () => {
	await remintRegister(db);
	const live = {
		session_id: 's1',
		status: 'open' as const,
		opened_at_gmt: '2026-10-28T13:05:00Z',
		opened_by: null,
		acknowledged: true,
		expected_float: null,
		counted_float: null,
		business_day: null,
	};
	await recordLiveSession(db, 'site', 'A', live);
	expect(readLiveSession('site', 'A')?.seeded_in).toEqual([]);
	await markSeededIn(db, 'site', 'A', 'db-a');
	await markSeededIn(db, 'site', 'A', 'db-a');
	await markSeededIn(db, 'site', 'A', 'db-b');
	await recordLiveSession(db, 'site', 'A', { ...live, status: 'counting' });
	expect(readLiveSession('site', 'A')?.seeded_in).toEqual(['db-a', 'db-b']);
	await recordLiveSession(db, 'site', 'A', { ...live, session_id: 's2' });
	expect(readLiveSession('site', 'A')?.seeded_in).toEqual([]);
});

it.each([false, true])(
	'records a remote close only without this device’s count mark (counting_here=%s)',
	async (here) => {
		await remintRegister(db);
		const live = {
			session_id: 's1',
			status: 'counting' as const,
			opened_at_gmt: '2026-10-28T13:05:00Z',
			opened_by: null,
			acknowledged: true,
			expected_float: null,
			counted_float: null,
			business_day: null,
		};
		expect(readClosedElsewhere('site', 'A')).toBeNull();
		await recordLiveSession(db, 'site', 'A', live);
		if (here) await markCountingHere(db, 'site', 'A', true);
		const before = Date.now();
		await recordLiveSession(db, 'site', 'A', null);
		const after = Date.now();
		expect(readLiveSession('site', 'A')).toBeNull();
		const register = (await readRegister(db))?.sites.site.registers?.A;
		if (here) {
			expect(register).not.toHaveProperty('closed_elsewhere');
			expect(readClosedElsewhere('site', 'A')).toBeNull();
		} else {
			expect(register?.closed_elsewhere).toEqual({ session_id: 's1', at: expect.any(String) });
			const marker = readClosedElsewhere('site', 'A');
			expect(marker).toEqual(register?.closed_elsewhere);
			expect(Date.parse(marker!.at)).toBeGreaterThanOrEqual(before);
			expect(Date.parse(marker!.at)).toBeLessThanOrEqual(after);
		}
		await recordLiveSession(db, 'site', 'A', { ...live, session_id: 's2', status: 'open' });
		expect((await readRegister(db))?.sites.site.registers?.A).not.toHaveProperty(
			'closed_elsewhere'
		);
		expect(readClosedElsewhere('site', 'A')).toBeNull();
		expect(readLiveSession('site', 'A')?.session_id).toBe('s2');
	}
);

// Reverting session-scoped metadata would label a later, unrelated float as carried.
it('remembers a carried source only for its session, across live record writes and clearing', async () => {
	await remintRegister(db);
	const note = {
		session_id: 'carried',
		closure_id: 'closure',
		store_id: 1,
		store_name: 'UK Store',
		register_id: 'A',
	};
	expect(readCarriedFrom('site', 'B', 'carried')).toBeNull();
	await recordCarriedFrom(db, 'site', 'B', note);
	const live = {
		session_id: 'carried',
		status: 'open' as const,
		opened_at_gmt: '2026-10-28T13:05:00Z',
		opened_by: null,
		acknowledged: true,
		expected_float: null,
		counted_float: null,
		business_day: null,
	};
	await recordLiveSession(db, 'site', 'B', live);
	const { session_id: _, ...source } = note;
	expect(readCarriedFrom('site', 'B', 'carried')).toEqual(source);
	expect(readCarriedFrom('site', 'B', 'later')).toBeNull();
	await recordLiveSession(db, 'site', 'B', null);
	expect(readCarriedFrom('site', 'B', 'carried')).toEqual(source);
	expect((await readRegister(db))?.sites.site.registers?.B.carried_from).toEqual(note);
});

// A target binding must not move the current register before the store switch succeeds.
it('binds a target store without moving the current register or its counters', async () => {
	await remintRegister(db);
	await bindRegister(db, 'site', { id: 'A', name: 'Front' }, 1);
	await nextSaleCounter(db, 'site');
	await bindStoreRegister(db, 'site', 2, { id: 'B', name: 'Back' });
	expect(getCurrentBoundRegisterId()).toBe('A');
	expect(getBoundRegisterId('site', 2)).toBe('B');
	expect((await readRegister(db))?.sites.site).toMatchObject({
		register_id: 'A',
		register_name: 'Front',
		register_store_id: 1,
		sale_counter: 1,
		bindings: {
			'1': { register_id: 'A', register_name: 'Front' },
			'2': { register_id: 'B', register_name: 'Back' },
		},
	});
});

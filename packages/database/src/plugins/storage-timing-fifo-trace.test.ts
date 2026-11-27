import {
	STORAGE_WAIT_PREFIX,
	takeStorageTimingSnapshot,
	withStorageTimingProbe,
} from './storage-timing-probe';

import type { RxStorage } from 'rxdb';

type Deferred = { resolve: (value: unknown) => void; reject: (error: unknown) => void };
type NativeLoggingGlobal = typeof globalThis & { nativeLoggingHook?: unknown };

let now = 0;
let hook: jest.Mock;

async function makeInstance(
	databaseName: string,
	collectionName: string,
	layer: 'raw' | 'wrapped' = 'raw'
) {
	const pending: Deferred[] = [];
	const call = () =>
		new Promise((resolve, reject) => {
			pending.push({ resolve, reject });
		});
	const instance = {
		bulkWrite: jest.fn(call),
		query: jest.fn(call),
		findDocumentsById: jest.fn(call),
		count: jest.fn(call),
	};
	const storage = {
		name: 'fake',
		rxdbVersion: 'test',
		createStorageInstance: jest.fn().mockResolvedValue(instance),
	} as unknown as RxStorage<unknown, unknown>;
	const wrapped = await withStorageTimingProbe(storage, layer).createStorageInstance({
		databaseName,
		collectionName,
	} as never);
	return { wrapped, pending };
}

const lines = () =>
	hook.mock.calls.map(([line, level]: [string, number]) => {
		expect(level).toBe(1);
		expect(line.startsWith(STORAGE_WAIT_PREFIX)).toBe(true);
		return JSON.parse(line.slice(STORAGE_WAIT_PREFIX.length));
	});

describe('storage timing FIFO trace', () => {
	beforeEach(() => {
		now = 0;
		jest.spyOn(Date, 'now').mockImplementation(() => now);
		hook = jest.fn();
		(globalThis as NativeLoggingGlobal).nativeLoggingHook = hook;
	});

	afterEach(() => {
		delete (globalThis as NativeLoggingGlobal).nativeLoggingHook;
		jest.restoreAllMocks();
		takeStorageTimingSnapshot();
	});

	it('names the writes ahead of a write that waited', async () => {
		const orders = await makeInstance('db-ahead', 'orders');
		const queue = await makeInstance('db-ahead', 'mutation-queue');
		now = 1000;
		const a = orders.wrapped.bulkWrite([{}, {}] as never, 'orders-write');
		now = 1010;
		const b = queue.wrapped.bulkWrite([{}] as never, 'cart-add');
		now = 1600;
		orders.pending[0].resolve({ error: [] });
		await a;
		now = 1700;
		queue.pending[0].resolve({ error: [] });
		await b;

		const [lineA, lineB] = lines();
		expect(lines()).toHaveLength(2);
		expect(lineA).toMatchObject({
			op: 'bulkWrite',
			collection: 'orders',
			rows: 2,
			totalMs: 600,
			waitMs: 0,
			aheadCount: 0,
		});
		expect(lineB).toEqual({
			db: lineA.db,
			seq: lineA.seq + 1,
			op: 'bulkWrite',
			collection: 'mutation-queue',
			rows: 1,
			ctx: 'cart-add',
			enqueuedAt: 1010,
			waitMs: 590,
			runMs: 100,
			totalMs: 690,
			aheadCount: 1,
			ahead: [
				{
					seq: lineA.seq,
					collection: 'orders',
					rows: 2,
					ctx: 'orders-write',
					enqueuedAt: 1000,
					endedAt: 1600,
				},
			],
			aheadMore: 0,
			aheadByCollection: { orders: [1, 2] },
		});
		expect(Object.keys(lineB)).toEqual([
			'db',
			'seq',
			'op',
			'collection',
			'rows',
			'ctx',
			'enqueuedAt',
			'waitMs',
			'runMs',
			'totalMs',
			'aheadCount',
			'ahead',
			'aheadMore',
			'aheadByCollection',
		]);
	});

	it('keeps databases apart', async () => {
		const one = await makeInstance('secret-db-one', 'orders');
		const two = await makeInstance('secret-db-two', 'orders');
		const a = one.wrapped.bulkWrite([{}] as never, 'one');
		now = 10;
		const b = two.wrapped.bulkWrite([{}] as never, 'two');
		now = 400;
		one.pending[0].resolve({ error: [] });
		await a;
		two.pending[0].resolve({ error: [] });
		await b;

		const [lineA, lineB] = lines();
		expect(lineB.aheadCount).toBe(0);
		expect(lineB.waitMs).toBe(0);
		expect(lineB.db).not.toBe(lineA.db);
		for (const [line] of hook.mock.calls) expect(line).not.toContain('secret-db');
	});

	it('stays silent under the threshold', async () => {
		const { wrapped, pending } = await makeInstance('db-quiet', 'orders');
		const write = wrapped.bulkWrite([{}] as never, 'quiet');
		now = 249;
		pending[0].resolve({ error: [] });
		await write;

		expect(hook).not.toHaveBeenCalled();
	});

	it('lists in-flight writes for a slow read', async () => {
		const { wrapped, pending } = await makeInstance('db-read', 'products');
		const write = wrapped.bulkWrite([{}, {}, {}] as never, 'held');
		now = 10;
		const read = wrapped.query({} as never);
		now = 310;
		pending[1].resolve({ documents: [{}, {}] });
		await read;

		expect(lines()).toEqual([
			expect.objectContaining({
				op: 'query',
				collection: 'products',
				rows: 2,
				ctx: null,
				enqueuedAt: 10,
				waitMs: null,
				runMs: null,
				totalMs: 300,
				aheadCount: 1,
				aheadByCollection: { products: [1, 3] },
			}),
		]);
		pending[0].resolve({ error: [] });
		await write;
	});

	it('passes results and errors through', async () => {
		const { wrapped, pending } = await makeInstance('db-errors', 'orders');
		const thrown = new Error('write failed');
		const result = { error: [] };
		const failing = wrapped.bulkWrite([{}] as never, 'fails');
		now = 500;
		pending[0].reject(thrown);
		await expect(failing).rejects.toBe(thrown);

		const later = wrapped.bulkWrite([{}] as never, 'later');
		now = 900;
		pending[1].resolve(result);
		await expect(later).resolves.toBe(result);

		const [failedLine, laterLine] = lines();
		expect(failedLine).toMatchObject({ ctx: 'fails', totalMs: 500 });
		expect(laterLine).toMatchObject({ ctx: 'later', aheadCount: 0, ahead: [] });
	});

	it('caps the ahead list', async () => {
		const { wrapped, pending } = await makeInstance('db-cap', 'orders');
		const held = Array.from({ length: 12 }, (_, i) =>
			wrapped.bulkWrite([{}] as never, `held-${i}`)
		);
		const last = wrapped.bulkWrite([{}, {}] as never, 'last');
		now = 300;
		pending[12].resolve({ error: [] });
		await last;

		const [line] = lines();
		expect(line.ctx).toBe('last');
		expect(line.aheadCount).toBe(12);
		expect(line.ahead).toHaveLength(10);
		expect(line.ahead.map((a: { ctx: string }) => a.ctx)).toEqual(
			Array.from({ length: 10 }, (_, i) => `held-${i}`)
		);
		expect(line.aheadMore).toBe(2);
		expect(line.aheadByCollection).toEqual({ orders: [12, 12] });
		pending.slice(0, 12).forEach((d) => d.resolve({ error: [] }));
		await Promise.all(held);
	});

	it('does not trace the wrapped layer', async () => {
		const { wrapped, pending } = await makeInstance('db-wrapped', 'orders', 'wrapped');
		const write = wrapped.bulkWrite([{}] as never, 'wrapped');
		now = 1000;
		pending[0].resolve({ error: [] });
		await write;

		expect(hook).not.toHaveBeenCalled();
	});
});

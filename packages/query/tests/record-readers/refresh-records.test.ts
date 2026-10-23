import type { RxdbSyncEngine } from '@wcpos/sync-engine';

import {
	demandRecordsByWooId,
	refreshCollection,
	refreshOrderRecord,
	refreshOrderRefunds,
	refreshRecordByWooId,
	refreshStockRecords,
} from '../../src/record-readers';

describe('refreshCollection', () => {
	it('forces a whole-collection refresh and holds its handle until ready', async () => {
		let finish!: () => void;
		const ready = new Promise<void>((resolve) => {
			finish = resolve;
		});
		const release = jest.fn();
		const require = jest.fn(() => ({ ready, release }));
		const engine = { require } as unknown as RxdbSyncEngine;

		const refresh = refreshCollection(engine, {
			id: 'coupon-actions:refresh',
			collection: 'coupons',
		});
		expect(require).toHaveBeenCalledWith({
			id: 'coupon-actions:refresh',
			collection: 'coupons',
			kind: 'refresh',
			forceRefresh: true,
		});
		expect(release).not.toHaveBeenCalled();
		finish();
		await expect(refresh).resolves.toBeUndefined();
		expect(release).toHaveBeenCalledTimes(1);
	});

	it('releases the handle and rejects when readiness fails', async () => {
		const error = new Error('refresh failed');
		const release = jest.fn();
		const engine = {
			require: () => ({ ready: Promise.reject(error), release }),
		} as unknown as RxdbSyncEngine;
		await expect(refreshCollection(engine, { id: 'refresh', collection: 'coupons' })).rejects.toBe(
			error
		);
		expect(release).toHaveBeenCalledTimes(1);
	});

	it('returns a rejected promise when require throws synchronously', async () => {
		const error = new Error('engine unavailable');
		const engine = {
			require: () => {
				throw error;
			},
		} as unknown as RxdbSyncEngine;
		await expect(refreshCollection(engine, { id: 'refresh', collection: 'coupons' })).rejects.toBe(
			error
		);
	});
});

describe('refreshRecordByWooId', () => {
	it.each(['customers', 'orders', 'products', 'variations'] as const)(
		'forces one %s record refresh and holds the handle until ready',
		async (collection) => {
			let finish!: () => void;
			const ready = new Promise<void>((resolve) => {
				finish = resolve;
			});
			const release = jest.fn();
			const require = jest.fn(() => ({ ready, release }));
			const engine = { require } as unknown as RxdbSyncEngine;
			const pending = refreshRecordByWooId(engine, {
				id: 'record-refresh:37',
				collection,
				wooId: 37,
			});
			expect(require).toHaveBeenCalledWith({
				id: 'record-refresh:37',
				collection,
				kind: 'targeted-records',
				remoteIds: ['37'],
				forceRefresh: true,
			});
			expect(release).not.toHaveBeenCalled();
			finish();
			await expect(pending).resolves.toBeUndefined();
			expect(release).toHaveBeenCalledTimes(1);
		}
	);

	it('releases the handle and forwards readiness failure', async () => {
		const error = new Error('refresh failed');
		const release = jest.fn();
		const engine = {
			require: () => ({ ready: Promise.reject(error), release }),
		} as unknown as RxdbSyncEngine;
		await expect(
			refreshRecordByWooId(engine, { id: 'refresh', collection: 'customers', wooId: 37 })
		).rejects.toBe(error);
		expect(release).toHaveBeenCalledTimes(1);
	});

	it('rejects asynchronously when require throws', async () => {
		const error = new Error('engine unavailable');
		const engine = {
			require: () => {
				throw error;
			},
		} as unknown as RxdbSyncEngine;
		await expect(
			refreshRecordByWooId(engine, { id: 'refresh', collection: 'customers', wooId: 37 })
		).rejects.toBe(error);
	});
});

describe('refreshOrderRefunds', () => {
	it.each([
		[undefined, 'settled'],
		[{ action: 'fetched' }, 'settled'],
		[{ action: 'serve-local' }, 'settled'],
		[{ action: 'released' }, 'released'],
	] as const)('returns %j as %s and releases only after readiness', async (result, expected) => {
		let finish!: () => void;
		const ready = new Promise<typeof result>((resolve) => {
			finish = () => resolve(result);
		});
		const release = jest.fn();
		const require = jest.fn(() => ({ ready, release }));
		const engine = { require } as unknown as RxdbSyncEngine;
		const pending = refreshOrderRefunds(engine, { id: 'refund:record-refresh:37', orderId: 37 });
		expect(require).toHaveBeenCalledWith({
			id: 'refund:record-refresh:37',
			kind: 'refunds-by-parent',
			collection: 'refunds',
			parentRemoteId: '37',
			forceRefresh: true,
		});
		expect(release).not.toHaveBeenCalled();
		finish();
		await expect(pending).resolves.toBe(expected);
		expect(release).toHaveBeenCalledTimes(1);
	});

	it('releases on readiness rejection', async () => {
		const error = new Error('offline');
		const release = jest.fn();
		const engine = {
			require: () => ({ ready: Promise.reject(error), release }),
		} as unknown as RxdbSyncEngine;
		await expect(refreshOrderRefunds(engine, { id: 'refresh', orderId: 37 })).rejects.toBe(error);
		expect(release).toHaveBeenCalledTimes(1);
	});

	it('returns a rejected promise when require throws synchronously', async () => {
		const error = new Error('engine unavailable');
		const engine = {
			require: () => {
				throw error;
			},
		} as unknown as RxdbSyncEngine;
		await expect(refreshOrderRefunds(engine, { id: 'refresh', orderId: 37 })).rejects.toBe(error);
	});
});

describe('refreshOrderRecord', () => {
	beforeEach(() => jest.useFakeTimers());
	afterEach(() => jest.useRealTimers());

	it.each([
		[{ action: 'fetched', appliedRecordIds: ['42'] }, 'refreshed'],
		[{ action: 'fetched', appliedRecordIds: ['43'] }, 'failed'],
		[{ action: 'fetched' }, 'failed'],
		[{ action: 'serve-local', appliedRecordIds: ['42'] }, 'failed'],
	])('classifies %j as %s and releases its forced order demand', async (result, expected) => {
		const release = jest.fn();
		const require = jest.fn(() => ({ ready: Promise.resolve(result), release }));
		const pending = refreshOrderRecord({ require } as unknown as RxdbSyncEngine, 42);
		expect(require).toHaveBeenCalledWith({
			id: 'checkout:order-refresh:42',
			collection: 'orders',
			kind: 'targeted-records',
			remoteIds: ['42'],
			forceRefresh: true,
		});
		expect(release).not.toHaveBeenCalled();
		await expect(pending).resolves.toBe(expected);
		expect(release).toHaveBeenCalledTimes(1);
		expect(jest.getTimerCount()).toBe(0);
	});

	it('releases a stalled demand at ten seconds', async () => {
		const release = jest.fn();
		const engine = {
			require: () => ({ ready: new Promise(() => {}), release }),
		} as unknown as RxdbSyncEngine;
		const pending = refreshOrderRecord(engine, 42);
		await jest.advanceTimersByTimeAsync(9_999);
		expect(release).not.toHaveBeenCalled();
		await jest.advanceTimersByTimeAsync(1);
		await expect(pending).resolves.toBe('timed-out');
		expect(release).toHaveBeenCalledTimes(1);
		expect(jest.getTimerCount()).toBe(0);
	});

	it('releases and forwards readiness rejection', async () => {
		const error = new Error('offline');
		const release = jest.fn();
		const engine = {
			require: () => ({ ready: Promise.reject(error), release }),
		} as unknown as RxdbSyncEngine;
		await expect(refreshOrderRecord(engine, 42)).rejects.toBe(error);
		expect(release).toHaveBeenCalledTimes(1);
		expect(jest.getTimerCount()).toBe(0);
	});

	it('throws synchronously when admission fails, without starting a timer', () => {
		const error = new Error('engine disposed');
		const engine = {
			require: () => {
				throw error;
			},
		} as unknown as RxdbSyncEngine;
		expect(() => refreshOrderRecord(engine, 42)).toThrow(error);
		expect(jest.getTimerCount()).toBe(0);
	});
});

describe('refreshStockRecords', () => {
	it('admits both collections synchronously and releases each when its own wait settles', async () => {
		let finishProduct!: () => void;
		let failVariation!: (error: Error) => void;
		const products = {
			ready: new Promise<void>((resolve) => {
				finishProduct = resolve;
			}),
			release: jest.fn(),
		};
		const variations = {
			ready: new Promise<void>((_resolve, reject) => {
				failVariation = reject;
			}),
			release: jest.fn(),
		};
		const require = jest.fn().mockReturnValueOnce(products).mockReturnValueOnce(variations);
		const pending = refreshStockRecords({ require } as unknown as RxdbSyncEngine, {
			id: 42,
			productIds: [10],
			variationIds: [11],
		});
		expect(require.mock.calls).toEqual([
			[
				{
					id: 'checkout:stock-rejection:products:42',
					collection: 'products',
					kind: 'targeted-records',
					remoteIds: ['10'],
					forceRefresh: true,
				},
			],
			[
				{
					id: 'checkout:stock-rejection:variations:42',
					collection: 'variations',
					kind: 'targeted-records',
					remoteIds: ['11'],
					forceRefresh: true,
				},
			],
		]);
		expect(products.release).not.toHaveBeenCalled();
		finishProduct();
		await products.ready;
		await Promise.resolve();
		expect(products.release).toHaveBeenCalledTimes(1);
		expect(variations.release).not.toHaveBeenCalled();
		failVariation(new Error('offline'));
		await expect(pending).resolves.toBeUndefined();
		expect(variations.release).toHaveBeenCalledTimes(1);
	});

	it.each(['products', 'variations'])(
		'contains synchronous %s admission failure and releases the other handle',
		async (failedCollection) => {
			const release = jest.fn();
			const require = jest.fn(({ collection }) => {
				if (collection === failedCollection) throw new Error('admission failed');
				return { ready: Promise.resolve(), release };
			});
			await expect(
				refreshStockRecords({ require } as unknown as RxdbSyncEngine, {
					id: 42,
					productIds: [10],
					variationIds: [11],
				})
			).resolves.toBeUndefined();
			expect(require).toHaveBeenCalledTimes(2);
			expect(release).toHaveBeenCalledTimes(1);
		}
	);

	it('does not admit empty collections', async () => {
		const require = jest.fn();
		await expect(
			refreshStockRecords({ require } as unknown as RxdbSyncEngine, {
				id: 42,
				productIds: [],
				variationIds: [],
			})
		).resolves.toBeUndefined();
		expect(require).not.toHaveBeenCalled();
	});
});

describe('demandRecordsByWooId', () => {
	it.each(['fetched', 'released'] as const)(
		'preserves %s readiness and caller-owned release',
		async (action) => {
			const release = jest.fn();
			const require = jest.fn(() => ({ ready: Promise.resolve({ action }), release }));
			const handle = demandRecordsByWooId({ require } as unknown as RxdbSyncEngine, {
				id: 'referenced',
				collection: 'customers',
				wooIds: [5, 7, 0, -1, Number.NaN],
			});
			expect(require).toHaveBeenCalledWith({
				id: 'referenced',
				collection: 'customers',
				kind: 'targeted-records',
				remoteIds: ['5', '7'],
			});
			await expect(handle.ready).resolves.toBe(action === 'released' ? 'released' : 'settled');
			expect(release).not.toHaveBeenCalled();
			handle.release();
			expect(release).toHaveBeenCalledTimes(1);
		}
	);

	it('returns a settled no-op for an empty request', async () => {
		const require = jest.fn();
		const handle = demandRecordsByWooId({ require } as unknown as RxdbSyncEngine, {
			id: 'empty',
			collection: 'customers',
			wooIds: [],
		});
		await expect(handle.ready).resolves.toBe('settled');
		handle.release();
		expect(require).not.toHaveBeenCalled();
	});

	it('forwards rejection without releasing the caller-owned demand', async () => {
		const error = new Error('pull failed');
		const release = jest.fn();
		const require = jest.fn(() => ({ ready: Promise.reject(error), release }));
		const handle = demandRecordsByWooId({ require } as unknown as RxdbSyncEngine, {
			id: 'failed',
			collection: 'customers',
			wooIds: [5],
		});
		await expect(handle.ready).rejects.toBe(error);
		expect(release).not.toHaveBeenCalled();
		handle.release();
		expect(release).toHaveBeenCalledTimes(1);
	});
});

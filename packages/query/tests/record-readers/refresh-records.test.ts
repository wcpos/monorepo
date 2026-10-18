import type { RxdbSyncEngine } from '@wcpos/sync-engine';

import {
	refreshCollection,
	refreshOrderRefunds,
	refreshRecordByWooId,
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

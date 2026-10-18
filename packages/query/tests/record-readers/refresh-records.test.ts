import type { RxdbSyncEngine } from '@wcpos/sync-engine';

import { refreshCollection } from '../../src/record-readers';

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

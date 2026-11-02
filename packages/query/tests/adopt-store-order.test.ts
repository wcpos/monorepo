import type { RxdbSyncEngine } from '@wcpos/sync-engine';

import { adoptStoreOrderSnapshot } from '../src/commands/adopt-store-order';

const snapshot = { id: 42, status: 'completed' };

function engineWith(adopt: () => Promise<unknown>, ready: Promise<unknown> = fetched()) {
	const release = jest.fn();
	const engine = {
		adoptOrderSnapshot: jest.fn(adopt),
		require: jest.fn(() => ({ ready, release })),
	};
	return { engine, typed: engine as unknown as RxdbSyncEngine, release };
}

function fetched() {
	return Promise.resolve({ action: 'fetched', appliedRecordIds: ['42'] });
}

describe('adoptStoreOrderSnapshot', () => {
	it('an applied snapshot needs no refresh', async () => {
		const { engine, typed } = engineWith(async () => 'applied');
		await expect(adoptStoreOrderSnapshot(typed, snapshot, 42)).resolves.toEqual({
			adoption: 'applied',
		});
		expect(engine.adoptOrderSnapshot).toHaveBeenCalledWith(snapshot);
		expect(engine.require).not.toHaveBeenCalled();
	});

	it.each(['protected', 'invalid'] as const)(
		'a %s snapshot falls back to the refresh',
		async (outcome) => {
			const { engine, typed, release } = engineWith(async () => outcome);
			await expect(adoptStoreOrderSnapshot(typed, snapshot, 42)).resolves.toEqual({
				adoption: outcome,
			});
			expect(engine.require).toHaveBeenCalledWith({
				id: 'checkout:order-refresh:42',
				collection: 'orders',
				kind: 'targeted-records',
				remoteIds: ['42'],
				forceRefresh: true,
			});
			expect(release).toHaveBeenCalled();
		}
	);

	it('an adoption the engine rejects is `rejected` and still refreshes', async () => {
		const { engine, typed } = engineWith(async () => {
			throw new Error('closed');
		});
		await expect(adoptStoreOrderSnapshot(typed, snapshot, 42)).resolves.toEqual({
			adoption: 'rejected',
		});
		expect(engine.require).toHaveBeenCalledTimes(1);
	});

	it('records a refresh that throws, and never rejects', async () => {
		const { engine, typed } = engineWith(async () => 'protected');
		const error = new Error('engine is gone');
		engine.require.mockImplementation(() => {
			throw error;
		});
		await expect(adoptStoreOrderSnapshot(typed, snapshot, 42)).resolves.toEqual({
			adoption: 'protected',
			refreshError: error,
		});
	});

	it('an order with no store id cannot be refreshed: the refresh error says so', async () => {
		const { engine, typed } = engineWith(async () => 'protected');
		const result = await adoptStoreOrderSnapshot(typed, snapshot, undefined);
		expect(result.adoption).toBe('protected');
		expect((result.refreshError as Error).message).toBe('payment_refresh_requires_persisted_order');
		expect(engine.require).not.toHaveBeenCalled();
	});
});

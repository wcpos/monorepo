import type { EngineRecord } from '@wcpos/query';
import { getLogger } from '@wcpos/utils/logger';

import { reconcileCompletedOrder } from './reconcile-completed-order';

type QueryRuntime = ReturnType<typeof import('@wcpos/query').useQueryRuntime>;

jest.mock('@wcpos/query', () => ({}));

const reduced = {
	product_id: 12,
	variation_id: 0,
	meta_data: [{ key: '_reduced_stock', value: '1' }],
};
const variation = {
	product_id: 13,
	variation_id: 14,
	meta_data: [{ key: '_reduced_stock', value: '2' }],
};
const untouched = { product_id: 15, variation_id: 0, meta_data: [{ key: 'other' }] };

function setup(id: number | null = 42) {
	const release = jest.fn();
	const stockRelease = jest.fn();
	const requireRefresh = jest
		.fn()
		.mockReturnValue({ ready: Promise.resolve(), release: stockRelease });
	const orderHandle = { ready: Promise.resolve(), release };
	requireRefresh.mockReturnValueOnce(orderHandle);
	const runtime = { engine: { require: requireRefresh } } as unknown as QueryRuntime;
	const order = {
		uuid: 'order-42',
		payload: { id, line_items: [] },
		getLatest: jest.fn(() => ({
			payload: {
				id,
				line_items: [reduced, variation, untouched, { product_id: 16, variation_id: 0 }],
			},
		})),
	};
	return {
		runtime,
		order: order as unknown as EngineRecord<'orders'>,
		requireRefresh,
		orderHandle,
		release,
		stockRelease,
	};
}

beforeEach(() => {
	jest.clearAllMocks();
	jest.useFakeTimers();
});
afterEach(() => {
	jest.clearAllTimers();
	jest.useRealTimers();
});

it('force-refreshes and releases the order before refreshing only reduced products and variations', async () => {
	const c = setup();
	let ready!: () => void;
	c.orderHandle.ready = new Promise<void>((resolve) => {
		ready = resolve;
	});
	const completion = reconcileCompletedOrder(c.runtime, c.order);
	expect(c.requireRefresh.mock.calls).toEqual([
		[
			{
				id: 'checkout:order-refresh:42',
				collection: 'orders',
				kind: 'targeted-records',
				remoteIds: ['42'],
				forceRefresh: true,
			},
		],
	]);
	expect(c.order.getLatest).toHaveBeenCalledTimes(1);
	ready();
	await completion;
	expect(c.order.getLatest).toHaveBeenCalledTimes(2);
	expect(c.release).toHaveBeenCalledTimes(1);
	expect(c.release.mock.invocationCallOrder[0]).toBeLessThan(
		c.requireRefresh.mock.invocationCallOrder[1]
	);
	expect(c.requireRefresh.mock.calls.slice(1)).toEqual([
		[
			{
				id: 'stock-adjustment:products:12',
				collection: 'products',
				kind: 'targeted-records',
				remoteIds: ['12'],
				forceRefresh: true,
			},
		],
		[
			{
				id: 'stock-adjustment:variations:14',
				collection: 'variations',
				kind: 'targeted-records',
				remoteIds: ['14'],
				forceRefresh: true,
			},
		],
	]);
	expect(c.stockRelease).toHaveBeenCalledTimes(2);
	expect(jest.getTimerCount()).toBe(0);
});

it('degrades after ten seconds and still refreshes reduced stock from the local record', async () => {
	const c = setup();
	c.orderHandle.ready = new Promise<void>(() => undefined);
	const completion = reconcileCompletedOrder(c.runtime, c.order);
	await jest.advanceTimersByTimeAsync(9_999);
	expect(c.requireRefresh).toHaveBeenCalledTimes(1);
	await jest.advanceTimersByTimeAsync(1);
	await completion;
	expect(c.release).toHaveBeenCalledTimes(1);
	expect(c.requireRefresh).toHaveBeenCalledTimes(3);
	expect(c.stockRelease).toHaveBeenCalledTimes(2);
});

it('warns on rejected readiness and still refreshes reduced stock', async () => {
	const c = setup();
	c.orderHandle.ready = Promise.reject(new Error('network unavailable'));
	await reconcileCompletedOrder(c.runtime, c.order);
	expect(getLogger(['wcpos', 'pos', 'checkout']).warn).toHaveBeenCalledWith(
		'Post-payment order refresh failed; completing from the local record',
		{ context: { orderId: 'order-42', error: 'network unavailable' } }
	);
	expect(c.release).toHaveBeenCalledTimes(1);
	expect(c.requireRefresh).toHaveBeenCalledTimes(3);
	expect(c.stockRelease).toHaveBeenCalledTimes(2);
	expect(jest.getTimerCount()).toBe(0);
});

it('rejects refresh for an unpersisted order without adjusting stock', async () => {
	const c = setup(null);
	await expect(reconcileCompletedOrder(c.runtime, c.order)).rejects.toThrow(
		'checkout_refresh_requires_persisted_order'
	);
	expect(c.requireRefresh).not.toHaveBeenCalled();
});

it('skips the order refresh but still adjusts local stock when refresh is false', async () => {
	const c = setup(null);
	await reconcileCompletedOrder(c.runtime, c.order, false);
	expect(c.requireRefresh.mock.calls.map(([requirement]) => requirement.collection)).toEqual([
		'products',
		'variations',
	]);
});

it('uses the persisted id from the latest resident rather than an old unpersisted snapshot', async () => {
	const c = setup();
	const stale = {
		...c.order,
		payload: { ...c.order.payload, id: undefined },
	} as EngineRecord<'orders'>;
	await reconcileCompletedOrder(c.runtime, stale);
	expect(c.requireRefresh.mock.calls[0][0].remoteIds).toEqual(['42']);
});

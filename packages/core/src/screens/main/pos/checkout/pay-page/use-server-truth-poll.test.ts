/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';

import { type JudgedGatewaySnapshot, judgeGatewaySnapshot } from './gateway-snapshot';
import { useServerTruthPoll } from './use-server-truth-poll';

const ORDER_UUID = '5b8e1a3c-2f4d-4a6b-9c8e-000000000042';
const ORDER_READ = ['orders', { params: { include: 42, per_page: 1 } }];

const get = jest.fn();
// The real settle latches; `isSettled` reads the latch.
let settled = false;
const settle = jest.fn<Promise<void>, [JudgedGatewaySnapshot, string]>(async () => {
	settled = true;
});
const isSettled = jest.fn(() => settled);
const setLoading = jest.fn();
const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };

const makeOrder = (payload: Record<string, unknown> = {}) => {
	const order = {
		uuid: 'uuid-42',
		payload: { id: 42, number: '42', status: 'pos-open', line_items: [], ...payload },
		getLatest: () => order,
	};
	return order;
};

const serverOrder = (status: string, extra: Record<string, unknown> = {}) => ({
	id: 42,
	status,
	number: '42',
	meta_data: [{ key: '_woocommerce_pos_uuid', value: ORDER_UUID }],
	line_items: [],
	...extra,
});

function renderPoll({
	order = makeOrder(),
	catalog = {},
}: { order?: ReturnType<typeof makeOrder>; catalog?: Record<string, string | null> } = {}) {
	const settledRef = { current: catalog };
	const view = renderHook(() =>
		useServerTruthPoll({
			http: { get } as never,
			order: order as never,
			orderId: 42,
			settledRef,
			dp: 2,
			settle,
			isSettled,
			setLoading,
			logger: logger as never,
		})
	);
	return { ...view, settledRef };
}

/** Advance fake time and flush the read's awaits. */
const tick = (ms: number) => act(() => jest.advanceTimersByTimeAsync(ms));

describe('useServerTruthPoll', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		jest.useFakeTimers();
		settled = false;
	});
	afterEach(() => {
		jest.useRealTimers();
	});

	it('a later document: poll(1000) reads nothing for a second, then reads server truth', async () => {
		get.mockResolvedValue({ data: [serverOrder('completed')] });
		const { result } = renderPoll();
		act(() => result.current.poll(1000));
		await tick(999);
		expect(get).not.toHaveBeenCalled();
		await tick(1);
		expect(get).toHaveBeenCalledWith(...ORDER_READ);
		expect(logger.debug).toHaveBeenCalledWith(
			'No postMessage received, checking server order status',
			{ context: { orderId: 42 } }
		);
	});

	it('a second delayed start replaces the pending one: one read, a second after the last', async () => {
		get.mockResolvedValue({ data: [serverOrder('completed')] });
		const { result } = renderPoll();
		act(() => result.current.poll(1000));
		await tick(500);
		act(() => result.current.poll(1000));
		await tick(999);
		expect(get).not.toHaveBeenCalled();
		await tick(1);
		expect(get).toHaveBeenCalledTimes(1);
	});

	it('stop() disarms a pending delayed start (the message settles instead)', async () => {
		const { result } = renderPoll();
		act(() => result.current.poll(1000));
		act(() => result.current.stop());
		await tick(10_000);
		expect(get).not.toHaveBeenCalled();
	});

	it.each(['on-hold', 'processing', 'completed', 'custom-gateway-status'])(
		'settles a paid server answer once, with fallback-refresh: %s',
		async (status) => {
			// A cheque/BACS gateway configured through POS settings lands on on-hold, and
			// a gateway can be configured to land on any custom status. The paid check is a
			// blocklist of unpaid statuses (mirroring the store's needs_payment() gate) —
			// an allowlist of processing/completed would strand these sales as open carts.
			const order = serverOrder(status);
			get.mockResolvedValue({ data: [order] });
			const { result } = renderPoll();
			act(() => result.current.poll());
			await tick(0);
			expect(settle).toHaveBeenCalledTimes(1);
			expect(settle).toHaveBeenCalledWith(judgeGatewaySnapshot(order, {}, 2), 'fallback-refresh');
			expect(setLoading).toHaveBeenCalledWith(false);
			expect(logger.error).not.toHaveBeenCalled();
			// Settled: no further reads.
			await tick(30_000);
			expect(get).toHaveBeenCalledTimes(1);
		}
	);

	it.each(['completed', 'processing'])(
		'settles on %s SERVER truth while the local document stays pos-open',
		async (status) => {
			// The review scenario: an engine require can settle without applying a
			// newer revision (skip-coalesced resident task, dirty-row protection) —
			// the local doc stays pos-open forever. The decision comes from the
			// direct server read; the engine refresh inside `settle` is catch-up.
			const order = makeOrder();
			get.mockResolvedValue({ data: [serverOrder(status)] });
			const { result } = renderPoll({ order });
			act(() => result.current.poll(1000));
			await tick(1000);
			expect(get).toHaveBeenCalledWith(...ORDER_READ);
			expect(order.getLatest().payload.status).toBe('pos-open');
			expect(settle).toHaveBeenCalledWith(
				expect.objectContaining({ complete: true, outcome: expect.anything() }),
				'fallback-refresh'
			);
			expect(settle.mock.calls[0][0].outcome.snapshot).toEqual(serverOrder(status));
		}
	);

	it('a failed read is a debug row, never an error, and the poll re-arms', async () => {
		get.mockRejectedValue(new Error('Request failed with status code 404'));
		const { result } = renderPoll();
		act(() => result.current.poll(1000));
		await tick(1000);
		expect(get).toHaveBeenCalledTimes(1);
		expect(settle).not.toHaveBeenCalled();
		// The regression: a failed safety-net poll must NOT be raised as an error
		// (which is what surfaced the spurious PY02001 payment-gateway error).
		expect(logger.error).not.toHaveBeenCalled();
		expect(logger.warn).not.toHaveBeenCalled();
		expect(logger.debug).toHaveBeenCalledWith('Fallback order status refresh did not complete', {
			context: { error: 'Request failed with status code 404', source: 'fallback-refresh' },
		});
		expect(setLoading).toHaveBeenCalledWith(false);
		await tick(3_000);
		expect(get).toHaveBeenCalledTimes(2);
	});

	it('a settle that throws lands in the same debug row (the poll path warns nothing)', async () => {
		get.mockResolvedValue({ data: [serverOrder('completed')] });
		settle.mockRejectedValueOnce(new Error('stock adjust broke'));
		const { result } = renderPoll();
		act(() => result.current.poll());
		await tick(0);
		expect(logger.warn).not.toHaveBeenCalled();
		expect(logger.error).not.toHaveBeenCalled();
		expect(logger.debug).toHaveBeenCalledWith('Fallback order status refresh did not complete', {
			context: { error: 'stock adjust broke', source: 'fallback-refresh' },
		});
	});

	it('stays quiet when the server status still matches the local status', async () => {
		get.mockResolvedValue({ data: [{ status: 'pos-open', number: '42', line_items: [] }] });
		const { result } = renderPoll();
		act(() => result.current.poll(1000));
		await tick(1000);
		expect(get).toHaveBeenCalledWith(...ORDER_READ);
		expect(settle).not.toHaveBeenCalled();
		expect(logger.debug).toHaveBeenCalledTimes(1);
		expect(logger.error).not.toHaveBeenCalled();
		await tick(3_000);
		expect(get).toHaveBeenCalledTimes(2);
	});

	it.each(['pending', 'failed', 'cancelled'])(
		'an unpaid server status %s leaves the cart open and keeps polling',
		async (status) => {
			get.mockResolvedValue({ data: [serverOrder(status)] });
			const { result } = renderPoll();
			act(() => result.current.poll(1000));
			await tick(1000);
			expect(settle).not.toHaveBeenCalled();
			expect(logger.debug).toHaveBeenCalledWith(
				'Server order status changed but is not paid; leaving the cart open',
				{ context: { serverStatus: status, settledOrderStatus: null, source: 'fallback-refresh' } }
			);
			await tick(3_000);
			expect(get).toHaveBeenCalledTimes(2);
		}
	);

	it('keeps polling after an early unpaid answer and settles when the webhook lands', async () => {
		// The reviewer scenario: a pre-hardening store posts `pending`, the one-shot
		// poll sees "still unpaid", and the provider's webhook confirms a minute
		// later. Without a re-poll nothing ever noticed — the paid order stayed an
		// open cart, the original bug through a new door.
		const paid = serverOrder('completed');
		get
			.mockResolvedValueOnce({ data: [{ ...paid, status: 'pending' }] })
			.mockResolvedValueOnce({ data: [{ ...paid, status: 'pending' }] })
			.mockResolvedValue({ data: [paid] });
		const { result } = renderPoll();
		act(() => result.current.poll());
		await tick(0);
		expect(get).toHaveBeenCalledTimes(1);
		await tick(3_000);
		expect(get).toHaveBeenCalledTimes(2);
		expect(settle).not.toHaveBeenCalled();
		await tick(3_000);
		expect(get).toHaveBeenCalledTimes(3);
		expect(settle).toHaveBeenCalledWith(judgeGatewaySnapshot(paid, {}, 2), 'fallback-refresh');
		await tick(30_000);
		expect(get).toHaveBeenCalledTimes(3);
	});

	it('stops re-polling at the 120 s window and leaves the cart open', async () => {
		get.mockResolvedValue({ data: [serverOrder('pending')] });
		const { result } = renderPoll();
		act(() => result.current.poll(1000));
		await tick(1000);
		expect(get).toHaveBeenCalledTimes(1);
		await tick(300_000);
		const readsAtBound = get.mock.calls.length;
		expect(readsAtBound).toBeGreaterThan(1);
		expect(readsAtBound).toBeLessThanOrEqual(1 + 120_000 / 3_000);
		await tick(60_000);
		expect(get).toHaveBeenCalledTimes(readsAtBound);
		expect(settle).not.toHaveBeenCalled();
	});

	it('a sale already settled reads nothing', async () => {
		settled = true;
		const { result } = renderPoll();
		act(() => result.current.poll());
		await tick(10_000);
		expect(get).not.toHaveBeenCalled();
	});

	it('a message that settles while the read is in flight: the answer settles nothing, nothing re-arms', async () => {
		let answer!: (value: unknown) => void;
		get.mockReturnValue(new Promise((resolve) => (answer = resolve)));
		const { result } = renderPoll();
		act(() => result.current.poll());
		settled = true;
		await act(async () => answer({ data: [serverOrder('completed')] }));
		await tick(10_000);
		expect(settle).not.toHaveBeenCalled();
		expect(get).toHaveBeenCalledTimes(1);
	});

	it('an answer that arrives after unmount neither settles nor re-arms', async () => {
		let answer!: (value: unknown) => void;
		get.mockReturnValue(new Promise((resolve) => (answer = resolve)));
		const { result, unmount } = renderPoll({ catalog: { bacs: 'pending' } });
		act(() => result.current.poll());
		expect(get).toHaveBeenCalledTimes(1);
		unmount();
		await act(async () => answer({ data: [serverOrder('pending', { payment_method: 'bacs' })] }));
		await tick(10_000);
		expect(settle).not.toHaveBeenCalled();
		expect(get).toHaveBeenCalledTimes(1);
	});

	it('unmounting disarms a pending delayed start', async () => {
		const { result, unmount } = renderPoll();
		act(() => result.current.poll(1000));
		unmount();
		await tick(10_000);
		expect(get).not.toHaveBeenCalled();
	});

	it('ignores a local order that is neither open nor settled (a partial tender)', async () => {
		get.mockResolvedValue({ data: [serverOrder('pos-partial')] });
		const { result } = renderPoll({
			order: makeOrder({ status: 'pos-partial' }),
			catalog: { bacs: 'pending' },
		});
		act(() => result.current.poll());
		await tick(10_000);
		expect(get).not.toHaveBeenCalled();
		expect(settle).not.toHaveBeenCalled();
	});

	/**
	 * A merchant's "pay by invoice" workflow: BACS configured through POS settings to land
	 * on `pending`. Reaching the gateway's stored status is the sale finishing.
	 */
	describe('the stored order status', () => {
		const pendingBacs = serverOrder('pending', { payment_method: 'bacs', total: '75.00' });

		it("settles a pending answer when pending is the gateway's stored status", async () => {
			// A hardened store emits nothing it does not call paid, so the only signal is
			// the poll: server truth says pending, and pending is what the merchant chose.
			get.mockResolvedValue({ data: [pendingBacs] });
			const { result } = renderPoll({ catalog: { bacs: 'pending' } });
			act(() => result.current.poll());
			await tick(0);
			expect(get).toHaveBeenCalledTimes(1);
			expect(settle).toHaveBeenCalledWith(
				expect.objectContaining({ complete: true, storedStatus: 'pending' }),
				'fallback-refresh'
			);
		});

		it("hands settle the judge's verdict unchanged: the stored status travels on the outcome", async () => {
			// completeSale re-gates the outcome with the same isSaleComplete, so the stored
			// status has to travel on it, or finishSale reports not-completed (no receipt on
			// the stage host, no stock adjustment) after the cashier was routed off.
			const catalog = { bacs: 'pending' };
			get.mockResolvedValue({ data: [pendingBacs] });
			const { result } = renderPoll({ catalog });
			act(() => result.current.poll(1000));
			await tick(1000);
			expect(settle).toHaveBeenCalledWith(
				judgeGatewaySnapshot(pendingBacs, catalog, 2),
				'fallback-refresh'
			);
			expect(settle.mock.calls[0][0].outcome.settledOrderStatus).toBe('pending');
		});

		it('reads and settles when background sync already moved the local order to the stored status', async () => {
			// Sync can apply the server's `pending` to the local document before the poll
			// runs. The order is settled, but nothing has routed the cashier off the pay
			// window; the poll must still read server truth and close the sale rather than
			// bail on "local status is not pos-open".
			get.mockResolvedValue({ data: [pendingBacs] });
			const { result } = renderPoll({
				order: makeOrder({ status: 'pending', payment_method: 'bacs' }),
				catalog: { bacs: 'pending' },
			});
			act(() => result.current.poll());
			await tick(0);
			expect(get).toHaveBeenCalledTimes(1);
			expect(settle).toHaveBeenCalledWith(
				judgeGatewaySnapshot(pendingBacs, { bacs: 'pending' }, 2),
				'fallback-refresh'
			);
		});

		it('sees a gateway catalog that arrives after the poll has started', async () => {
			// The poll re-arms itself from the closure it started in. The catalog can
			// still be loading at that moment; a later tick must read the status that
			// arrived, or a pay-by-invoice sale never closes.
			get.mockResolvedValue({ data: [pendingBacs] });
			const { result, settledRef } = renderPoll({ catalog: {} });
			act(() => result.current.poll());
			await tick(0);
			expect(get).toHaveBeenCalledTimes(1);
			expect(settle).not.toHaveBeenCalled();
			settledRef.current = { bacs: 'pending' };
			await tick(3_000);
			expect(get).toHaveBeenCalledTimes(2);
			expect(settle).toHaveBeenCalledTimes(1);
		});

		it('keeps polling a local pending order until the gateway catalog arrives, then settles', async () => {
			// Sync landed `pending` locally before the catalog loaded. Without a catalog
			// nothing says it is settled, but bailing would skip the re-arm, and the
			// catalog arriving later would find no poll to close the pay window.
			get.mockResolvedValue({ data: [pendingBacs] });
			const { result, settledRef } = renderPoll({
				order: makeOrder({ status: 'pending', payment_method: 'bacs' }),
				catalog: {},
			});
			act(() => result.current.poll());
			await tick(0);
			expect(get).toHaveBeenCalledTimes(1);
			await tick(3_000);
			expect(get).toHaveBeenCalledTimes(2);
			expect(settle).not.toHaveBeenCalled();
			settledRef.current = { bacs: 'pending' };
			await tick(3_000);
			expect(get).toHaveBeenCalledTimes(3);
			expect(settle).toHaveBeenCalledTimes(1);
		});
	});
});

import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';
import type { PaymentRow } from '@wcpos/order-math';

import * as checkoutMode from '../../screens/main/pos/checkout/checkout-mode';
import { createDeviceLeg } from '../../screens/main/pos/checkout/payments/device/device-leg';
import {
	method as deviceMethod,
	row as deviceRow,
} from '../../screens/main/pos/checkout/payments/device/fixtures.test-utils';
import { registerDriver } from '../payment-drivers/registry';
import { createSimulatedDriver } from '../payment-drivers/simulated-driver';
import { TerminalPaymentsService } from './service';
import {
	getTerminalPaymentsService,
	getTerminalPaymentsServiceStartVersion,
	startTerminalPaymentsService,
	stopTerminalPaymentsService,
	subscribeTerminalPaymentsServiceStart,
} from './index';

const row: PaymentRow = {
	id: 'leg',
	source: 'app',
	order_id: 42,
	method_id: 'terminal',
	provider: 'square',
	kind: 'card',
	capture_mode: 'server',
	transport: null,
	recorded_offline: false,
	amount: '10.00',
	currency: 'USD',
	tendered: null,
	change: null,
	tip: null,
	status: 'pending',
	failure_reason: null,
	refunded_amount: '0.00',
	refunds: [],
	provider_refs: {},
	receipt: {},
	cashier_id: 1,
	store_id: 1,
	created_at_gmt: '2026-01-01T00:00:00Z',
	captured_at_gmt: null,
	updated_at_gmt: '2026-01-01T00:00:00Z',
};
const input = { dp: 3, orderUuid: 'order', orderId: 42, orderNumber: '42', row, reader: 'reader' };
function setup() {
	const summary = {
		status: 'completed',
		total: '10',
		paid: '10',
		balance: '0',
		payment_method: 'terminal',
		payment_method_title: 'Terminal',
	};
	const http = {
		get: jest.fn(async (_url: string) => ({ data: { payment: row, order: summary } })),
		post: jest.fn(async (_url: string, _body: unknown) => ({ data: { payment: row } })),
	};
	const mirror = jest.fn(async (_uuid: string, _response: unknown) => {});
	const completeOrder = jest.fn(async () => {});
	const options = { http, mirror, completeOrder };
	return {
		service: new TerminalPaymentsService(options),
		options,
		http,
		mirror,
		completeOrder,
		summary,
	};
}
beforeEach(() => {
	jest.useFakeTimers();
	jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
});
afterEach(() => {
	stopTerminalPaymentsService();
	jest.clearAllTimers();
	jest.useRealTimers();
});
it('begin starts one intent and refuses another live leg for the order', async () => {
	const c = setup();
	const leg = c.service.begin(input);
	expect(c.service.get('order')).toMatchObject({
		phase: 'creating',
		orderNumber: '42',
		reader: 'reader',
	});
	expect(() => c.service.begin(input)).toThrow();
	expect(c.service.resume(input)).toBe(leg);
	expect(() => c.service.resume({ ...input, row: { ...row, id: 'another' } })).toThrow();
	await jest.advanceTimersByTimeAsync(0);
	expect(c.http.post).toHaveBeenCalledTimes(1);
	expect(c.mirror).toHaveBeenCalledWith('order', { payment: row });
});
it('resume is idempotent for the row, polls without intent and leaves unknown reader unclaimed', async () => {
	const c = setup();
	const leg = c.service.resume(input)!;
	expect(c.service.resume(input)).toBe(leg);
	await jest.advanceTimersByTimeAsync(0);
	expect(c.http.post).not.toHaveBeenCalled();
	expect(c.http.get).toHaveBeenCalledTimes(1);
	expect(c.service.readersInUse().size).toBe(0);
});
it('readers only include live legs, and dismiss only removes final legs', async () => {
	const c = setup();
	c.service.begin(input);
	expect(c.service.readersInUse()).toEqual(
		new Map([['reader', { orderUuid: 'order', orderNumber: '42' }]])
	);
	c.service.dismiss('order');
	expect(c.service.get('order')).not.toBeNull();
	c.http.get.mockResolvedValue({
		data: { payment: { ...row, status: 'captured' }, order: c.summary },
	});
	await jest.advanceTimersByTimeAsync(0);
	expect(c.service.readersInUse().size).toBe(0);
	c.service.dismiss('order');
	expect(c.service.get('order')).toBeNull();
});
it('publishes final state and releases the reader when a dismissed settlement is resumed', async () => {
	const c = setup();
	const pending = { ...row, provider_refs: { reader: 'reader' } };
	c.mirror.mockRejectedValue(new Error('local write failed'));
	c.http.get.mockResolvedValue({
		data: { payment: { ...pending, status: 'captured' }, order: c.summary },
	});
	const info = getLogger([]).info as jest.Mock;
	info.mockClear();
	c.service.resume({ ...input, row: pending });
	await jest.advanceTimersByTimeAsync(0);
	c.service.dismiss('order');
	expect(c.service.get('order')).toBeNull();
	const resumed = c.service.resume({ ...input, row: pending })!;
	expect(c.service.readersInUse().has('reader')).toBe(true);
	await jest.advanceTimersByTimeAsync(0);
	expect(resumed.getState().phase).toBe('final');
	expect(c.service.get('order')?.phase).toBe('final');
	expect(c.service.readersInUse().has('reader')).toBe(false);
	expect(c.completeOrder).toHaveBeenCalledTimes(1);
	expect(
		info.mock.calls.filter(([, options]) => options.context?.type === 'payment.captured')
	).toHaveLength(1);
	c.service.stop();
});
it('a resumed leg names the reader the server recorded on the row', () => {
	const c = setup();
	c.service.resume({
		...input,
		row: { ...row, provider_refs: { reader: 'till-two', action: 'act_1' } },
	});
	expect(c.service.readersInUse()).toEqual(
		new Map([['till-two', { orderUuid: 'order', orderNumber: '42' }]])
	);
});
it('snapshot and per-order state keep identity until a change; subscriptions unsubscribe', async () => {
	const c = setup();
	const listener = jest.fn();
	const unsubscribe = c.service.subscribe(listener);
	const empty = c.service.getSnapshot();
	expect(c.service.getSnapshot()).toBe(empty);
	const leg = c.service.begin(input);
	const creating = c.service.getSnapshot();
	expect(creating).not.toBe(empty);
	expect(c.service.getSnapshot()).toBe(creating);
	expect(c.service.get('order')).toBe(c.service.get('order'));
	await jest.advanceTimersByTimeAsync(0);
	expect(c.service.getSnapshot()).not.toBe(creating);
	unsubscribe();
	const count = listener.mock.calls.length;
	await leg.checkNow();
	expect(listener).toHaveBeenCalledTimes(count);
});
it('captured callback fires once with authoritative summary and a final leg can be replaced', async () => {
	const c = setup();
	c.http.get.mockResolvedValue({
		data: { payment: { ...row, status: 'captured' }, order: c.summary },
	});
	const leg = c.service.resume(input)!;
	await jest.advanceTimersByTimeAsync(0);
	await leg.checkNow();
	expect(c.completeOrder).toHaveBeenCalledTimes(1);
	expect(c.completeOrder).toHaveBeenCalledWith('order', undefined, true);
	expect(c.service.get('order')).toBeNull();
	expect(c.service.begin({ ...input, row: { ...row, id: 'new-leg' } })).not.toBe(leg);
});
it('retires a completed capture after receipt entry without forgetting its narration', async () => {
	const c = setup();
	const info = getLogger([]).info as jest.Mock;
	info.mockClear();
	let finish!: () => void;
	c.completeOrder.mockImplementation(
		() =>
			new Promise<void>((resolve) => {
				finish = resolve;
			})
	);
	const enterReceipt = jest.spyOn(checkoutMode, 'enterReceipt');
	c.http.get.mockResolvedValue({
		data: { payment: { ...row, status: 'captured' }, order: c.summary },
	});
	try {
		c.service.begin(input);
		expect(c.service.readersInUse().has('reader')).toBe(true);
		await jest.advanceTimersByTimeAsync(0);
		expect(enterReceipt).toHaveBeenCalledTimes(1);
		expect(enterReceipt).toHaveBeenCalledWith('order', { select: false });
		expect(c.service.get('order')?.settlement?.saleComplete).toBe(true);
		finish();
		await jest.advanceTimersByTimeAsync(0);
		expect(c.service.get('order')).toBeNull();
		expect(c.service.readersInUse().has('reader')).toBe(false);
		c.service.resume(input);
		await jest.advanceTimersByTimeAsync(0);
		expect(c.completeOrder).toHaveBeenCalledTimes(1);
		expect(enterReceipt).toHaveBeenCalledTimes(1);
		expect(
			info.mock.calls.filter(([, options]) => options.context?.type === 'payment.captured')
		).toHaveLength(1);
	} finally {
		enterReceipt.mockRestore();
		c.service.stop();
	}
});
it('stop clears every timer but does not void or alter live rows', async () => {
	const c = setup();
	c.service.resume(input);
	c.service.resume({ ...input, orderUuid: 'other' });
	c.service.stop();
	await jest.advanceTimersByTimeAsync(600000);
	expect(c.http.get).not.toHaveBeenCalled();
	expect(c.http.post).not.toHaveBeenCalled();
	expect(c.service.get('order')).toMatchObject({ phase: 'polling', row: { status: 'pending' } });
});
it('singleton start/replacement/stop all notify, with a monotonic version', () => {
	const c = setup();
	const listener = jest.fn();
	const unsubscribe = subscribeTerminalPaymentsServiceStart(listener);
	const version = getTerminalPaymentsServiceStartVersion();
	const first = startTerminalPaymentsService(c.options);
	first.resume(input);
	expect(getTerminalPaymentsService()).toBe(first);
	const next = startTerminalPaymentsService(c.options);
	expect(next).not.toBe(first);
	expect(jest.getTimerCount()).toBe(0);
	stopTerminalPaymentsService();
	expect(getTerminalPaymentsService()).toBeNull();
	expect(getTerminalPaymentsServiceStartVersion()).toBe(version + 3);
	expect(listener).toHaveBeenCalledTimes(3);
	unsubscribe();
});

it('selects the device factory and reserves its method, not a server reader', async () => {
	const c = setup();
	registerDriver(createSimulatedDriver());
	const factory = jest.fn(createDeviceLeg);
	const service = new TerminalPaymentsService({ ...c.options, factories: { device: factory } });
	service.resume({ ...input, row: deviceRow });
	await jest.advanceTimersByTimeAsync(0);
	expect(factory).toHaveBeenCalledTimes(1);
	expect(factory.mock.calls[0][1]).toMatchObject({ dp: 3 });
	expect(service.get('order')).toMatchObject({
		outcome: 'failed',
		row: { failure_reason: 'reader_session_lost' },
	});
	expect(c.http.post).not.toHaveBeenCalled();
	expect(service.readersInUse().size).toBe(0);
});
it('online device capture notifies once without tracking or writing an offline settlement', async () => {
	const c = setup();
	registerDriver({
		...createSimulatedDriver(),
		collect: async () => ({
			outcome: 'captured',
			provider_refs: { payment_intent: 'pi' },
			receipt: {},
			amount: '10.00',
			transport: 'bluetooth',
		}),
	});
	const patchAndEnqueue = jest.fn();
	const service = new TerminalPaymentsService({
		...c.options,
		patchAndEnqueue,
		isOnline: () => true,
	});
	const trackOffline = jest.spyOn(service, 'trackOffline');
	c.http.post.mockImplementation(async (url) => ({
		data: {
			payment: { ...deviceRow, status: url.endsWith('/capture') ? 'captured' : 'pending' },
			order: c.summary,
		},
	}));
	service.subscribe(() => {
		if (service.get('order')?.outcome === 'captured') service.dismiss('order');
	});
	service.begin({
		...input,
		row: deviceRow,
		method: deviceMethod,
		transport: 'bluetooth',
		offline: false,
	});
	await jest.advanceTimersByTimeAsync(0);
	await service.flushOffline();
	expect(service.get('order')).toBeNull();
	expect(c.completeOrder).toHaveBeenCalledTimes(1);
	expect(c.completeOrder).toHaveBeenCalledWith('order', undefined, true);
	expect(trackOffline).not.toHaveBeenCalled();
	expect(patchAndEnqueue).not.toHaveBeenCalled();
	expect(c.http.post.mock.calls.map(([url]) => url)).toEqual([
		'orders/42/payments/leg/intent',
		'orders/42/payments/leg/capture',
	]);
	service.stop();
});
it('tracks offline settlement after dismissal and only sends it while online', async () => {
	let online = false;
	const driver = createSimulatedDriver();
	registerDriver(driver);
	const c = setup();
	const patchAndEnqueue = jest.fn(async (_uuid: string, _row: PaymentRow) => {});
	const service = new TerminalPaymentsService({
		...c.options,
		patchAndEnqueue,
		isOnline: () => online,
		resolveOrderId: async () => 42,
	});
	const connected = driver.connect!(
		(await driver.discoverReaders!('bluetooth')).find((r) => r.id === 'sim-offline')!,
		null
	);
	await jest.advanceTimersByTimeAsync(300);
	await connected;
	service.begin({
		...input,
		row: { ...deviceRow, recorded_offline: true },
		method: deviceMethod,
		transport: 'bluetooth',
		offline: true,
	});
	await jest.advanceTimersByTimeAsync(500);
	expect(service.get('order')).toMatchObject({
		outcome: 'captured',
		row: { status: 'authorized' },
	});
	service.dismiss('order');
	expect(service.get('order')).toBeNull();
	await jest.advanceTimersByTimeAsync(3000);
	expect(c.http.post).not.toHaveBeenCalled();
	online = true;
	c.http.post.mockResolvedValue({ data: { payment: { ...deviceRow, status: 'captured' } } });
	await service.flushOffline();
	expect(c.http.post).toHaveBeenCalledWith('orders/42/payments/leg/capture', {
		context: { provider_refs: { payment_intent: 'sim_pi_leg' } },
	});
	expect(c.mirror).toHaveBeenLastCalledWith('order', {
		payment: { ...deviceRow, status: 'captured' },
	});
	service.stop();
});
it('authorized offline rows never occupy a live leg on resume', async () => {
	const c = setup();
	expect(
		c.service.resume({
			...input,
			row: { ...deviceRow, status: 'authorized', recorded_offline: true },
		})
	).toBeUndefined();
	expect(c.service.get('order')).toBeNull();
	expect(c.service.readersInUse().size).toBe(0);
});

function offlineSetup(refs: PaymentRow['provider_refs'] = { payment_intent: 'pi' }) {
	const c = setup();
	let emit!: (event: { rowId: string; provider_refs: Record<string, unknown> }) => void;
	registerDriver({
		...createSimulatedDriver(),
		settleOffline$: {
			subscribe: (listener) => {
				emit = listener;
				return () => {};
			},
		},
	});
	const schedule = jest.fn((callback: () => void, ms: number) => setTimeout(callback, ms));
	const clear = jest.fn((timer: ReturnType<typeof setTimeout>) => clearTimeout(timer));
	const patch = jest.fn(async (_uuid: string, _row: PaymentRow) => {});
	const service = new TerminalPaymentsService({
		...c.options,
		isOnline: () => true,
		setTimeout: schedule,
		clearTimeout: clear,
		patchAndEnqueue: patch,
	});
	service.trackOffline({
		...input,
		row: { ...deviceRow, status: 'authorized', recorded_offline: true, provider_refs: refs },
	});
	return { ...c, service, emit, schedule, clear, patch };
}
it('recovers transaction-id-only settlement and ignores all-null references', async () => {
	const c = offlineSetup({ transaction_id: 'txn' });
	await c.service.flushOffline();
	expect(c.http.post).toHaveBeenCalledWith('orders/42/payments/leg/capture', {
		context: { provider_refs: { transaction_id: 'txn' } },
	});
	const empty = offlineSetup({ transaction_id: null });
	await empty.service.flushOffline();
	empty.emit({ rowId: 'leg', provider_refs: { transaction_id: null } });
	await jest.advanceTimersByTimeAsync(0);
	expect(empty.http.post).not.toHaveBeenCalled();
	c.service.stop();
	empty.service.stop();
});
it('a row that only names its reader is not ready to settle, and keeps the reader when it is', async () => {
	// The reader is minted onto the row before any collection; capturing on it alone
	// would fail until the driver emits the transaction reference and burn the retries.
	const c = offlineSetup({ reader: 'sn-1' });
	await c.service.flushOffline();
	expect(c.options.http.post).not.toHaveBeenCalled();
	c.emit({ rowId: 'leg', provider_refs: { transaction_id: 'txn' } });
	await c.service.flushOffline();
	expect(c.options.http.post).toHaveBeenCalledWith(expect.stringContaining('/capture'), {
		context: { provider_refs: { transaction_id: 'txn' } },
	});
	expect(c.patch).toHaveBeenCalledWith(
		expect.any(String),
		expect.objectContaining({ provider_refs: { reader: 'sn-1', transaction_id: 'txn' } })
	);
});
it('retries failed settlement at 5, 30 and 120 seconds then waits for another trigger', async () => {
	const c = offlineSetup();
	c.http.post.mockRejectedValue(new Error('capture unavailable'));
	await c.service.flushOffline();
	expect(c.http.post).toHaveBeenCalledTimes(1);
	for (const [index, delay] of [5000, 30000, 120000].entries()) {
		expect(c.schedule).toHaveBeenLastCalledWith(expect.any(Function), delay);
		expect(jest.getTimerCount()).toBe(1);
		await jest.advanceTimersByTimeAsync(delay - 1);
		expect(c.http.post).toHaveBeenCalledTimes(index + 1);
		await jest.advanceTimersByTimeAsync(1);
		expect(c.http.post).toHaveBeenCalledTimes(index + 2);
	}
	await jest.advanceTimersByTimeAsync(600000);
	expect(c.http.post).toHaveBeenCalledTimes(4);
	expect(jest.getTimerCount()).toBe(0);
	// Mid-arc attempts stay forensic; only the exhausted arc is an error the merchant
	// must act on — the card holds an authorization the store will never capture.
	expect(getLogger([]).debug).toHaveBeenCalledWith(
		'Offline payment settlement attempt failed',
		expect.objectContaining({
			// All three rows of one settlement carry the same type, so the Logs screen
			// titles attempt, failure and recovery as the same story.
			context: expect.objectContaining({
				type: 'payment.settlement',
				paymentId: 'leg',
				error: 'capture unavailable',
			}),
		})
	);
	expect(getLogger([]).warn).not.toHaveBeenCalled();
	expect(getLogger([]).error).toHaveBeenCalledWith(
		'Offline payment settlement failed',
		expect.objectContaining({
			code: 'PAYMENT201',
			// The settled-record shape is what puts an authorization the store will never
			// capture into the health header's stuck list.
			terminal: expect.objectContaining({
				operationId: 'leg',
				operationType: 'sync.record',
				outcome: 'failed',
			}),
			// Keyed on the payment, so one settling authorization cannot clear another's
			// stuck row on a split order.
			context: expect.objectContaining({ collection: 'payments', recordId: 'leg' }),
		})
	);
	await c.service.flushOffline();
	expect(c.http.post).toHaveBeenCalledTimes(5);
	expect(c.schedule).toHaveBeenLastCalledWith(expect.any(Function), 5000);
	c.service.stop();
});
it('stop clears the one pending settlement retry', async () => {
	const c = offlineSetup();
	c.http.post.mockRejectedValue(new Error('capture unavailable'));
	await c.service.flushOffline();
	await c.service.flushOffline();
	expect(jest.getTimerCount()).toBe(1);
	c.service.stop();
	expect(c.clear).toHaveBeenCalled();
	expect(jest.getTimerCount()).toBe(0);
	await jest.advanceTimersByTimeAsync(600000);
	expect(c.http.post).toHaveBeenCalledTimes(2);
});
it('coalesces concurrent flushes and drains one follow-up using updated refs', async () => {
	const c = offlineSetup();
	let reject!: (error: Error) => void;
	c.http.post.mockImplementationOnce(
		() =>
			new Promise((_resolve, no) => {
				reject = no;
			})
	);
	const first = c.service.flushOffline();
	await jest.advanceTimersByTimeAsync(0);
	c.emit({ rowId: 'leg', provider_refs: { transaction_id: 'updated' } });
	const second = c.service.flushOffline();
	const third = c.service.flushOffline();
	expect(c.http.post).toHaveBeenCalledTimes(1);
	reject(new Error('stale refs'));
	await Promise.all([first, second, third]);
	expect(c.http.post).toHaveBeenCalledTimes(2);
	expect(c.http.post).toHaveBeenLastCalledWith('orders/42/payments/leg/capture', {
		context: { provider_refs: { transaction_id: 'updated' } },
	});
	// Settlement refs merge into the row's own (which name its reader) rather than replace them.
	expect(c.patch).toHaveBeenCalledWith(
		'order',
		expect.objectContaining({
			provider_refs: expect.objectContaining({ transaction_id: 'updated' }),
		})
	);
	c.service.stop();
});
it('reserves one driver across two different methods', async () => {
	const c = setup();
	registerDriver({ ...createSimulatedDriver(), collect: () => new Promise(() => {}) });
	c.service.begin({ ...input, row: deviceRow, method: deviceMethod });
	expect(c.service.readersInUse().has('device:simulated')).toBe(true);
	expect(() =>
		c.service.begin({
			...input,
			orderUuid: 'other',
			row: { ...deviceRow, id: 'other-leg', method_id: 'other-method' },
			method: { ...deviceMethod, id: 'other-method' },
		})
	).toThrow();
	c.service.stop();
});
it.each([{ token: 'reader-token', method_id: 'wrong' }, null, undefined])(
	'bootstraps connection material with the requested method identity',
	async (handoff) => {
		const post = jest.fn(async () => ({ data: { handoff } }));
		const service = new TerminalPaymentsService({
			http: { post, get: jest.fn() },
			mirror: async () => {},
		});
		expect(await service.bootstrap('device', { transport: 'bluetooth' })).toEqual(
			handoff ? { token: 'reader-token', method_id: 'device' } : null
		);
		expect(post).toHaveBeenCalledWith('payment-methods/device/bootstrap', {
			context: { transport: 'bluetooth' },
		});
		service.stop();
	}
);

it('restores transaction references when an already tracked row hydrates', async () => {
	const c = offlineSetup({ transaction_id: null });
	c.service.trackOffline({
		...input,
		row: {
			...deviceRow,
			status: 'authorized',
			recorded_offline: true,
			provider_refs: { transaction_id: 'hydrated' },
		},
	});
	await c.service.flushOffline();
	expect(c.http.post).toHaveBeenCalledWith('orders/42/payments/leg/capture', {
		context: { provider_refs: { transaction_id: 'hydrated' } },
	});
	c.service.stop();
});

it('records an unobserved failure immediately and retains its settlement across subscribers', async () => {
	const c = setup();
	const error = getLogger([]).error as jest.Mock;
	error.mockClear();
	c.http.get.mockResolvedValue({
		data: {
			payment: { ...row, status: 'failed', failure_reason: 'card_declined' },
			order: c.summary,
		},
	});
	c.service.resume(input);
	await jest.advanceTimersByTimeAsync(0);
	expect(error).toHaveBeenCalledTimes(1);
	expect(error).toHaveBeenCalledWith(
		expect.any(String),
		expect.objectContaining({
			code: ERROR_CODES.PAYMENT_TERMINAL_REFUSED,
			context: expect.objectContaining({ type: 'payment.declined', reason: 'card_declined' }),
		})
	);
	expect(c.service.get('order')).toMatchObject({
		settlement: {
			outcome: 'failed',
			payment: { id: 'leg' },
			saleComplete: false,
		},
	});
	const unsub = c.service.subscribe(jest.fn());
	c.service.resume(input);
	unsub();
	c.service.subscribe(jest.fn());
	expect(error).toHaveBeenCalledTimes(1);
});

it('retains capture before refresh, narrates once across duplicate/stale delivery and remounts', async () => {
	const c = setup();
	const info = getLogger([]).info as jest.Mock;
	info.mockClear();
	const { createServerLeg } =
		await import('../../screens/main/pos/checkout/payments/server/server-leg');
	let deliver:
		| ((
				state: import('../../screens/main/pos/checkout/payments/server/server-leg').ServerLegState
		  ) => void)
		| undefined;
	let finish!: () => void;
	const completeOrder = jest.fn(
		() =>
			new Promise<void>((resolve) => {
				finish = resolve;
			})
	);
	let actor = { id: '7', name: 'Pat' };
	const service = new TerminalPaymentsService({
		...c.options,
		completeOrder,
		getActor: () => actor,
		factories: {
			server: (deps, input) => {
				deliver = deps.onFinal;
				return createServerLeg(deps, input);
			},
		},
	});
	c.http.get.mockResolvedValue({
		data: { payment: { ...row, status: 'captured' }, order: c.summary },
	});
	const leg = service.resume(input)!;
	actor = { id: '9', name: 'Sam' };
	const first = service.subscribe(jest.fn());
	service.subscribe(jest.fn());
	await jest.advanceTimersByTimeAsync(0);
	const settled = { ...leg.getState(), phase: 'final' as const };
	const replay = deliver!;
	expect(service.get('order')?.settlement).toMatchObject({
		outcome: 'captured',
		order: c.summary,
		saleComplete: true,
	});
	expect(completeOrder).toHaveBeenCalledWith('order', { id: '9', name: 'Sam' }, true);
	expect(info).toHaveBeenCalledWith(
		'Card payment taken',
		expect.objectContaining({ actor: { id: '9', name: 'Sam' } })
	);
	first();
	service.subscribe(jest.fn());
	replay(settled);
	service.dismiss('order');
	service.resume(input);
	await jest.advanceTimersByTimeAsync(0);
	replay(settled);
	service.begin({ ...input, row: { ...row, id: 'next' } });
	replay(settled);
	expect(completeOrder).toHaveBeenCalledTimes(1);
	expect(
		info.mock.calls.filter(([, options]) => options.context?.type === 'payment.captured')
	).toHaveLength(1);
	finish();
	await Promise.resolve();
	service.stop();
});

it('narrates offline authorization once and completes without refresh, not again at server capture', async () => {
	const c = setup();
	const info = getLogger([]).info as jest.Mock;
	info.mockClear();
	registerDriver({
		...createSimulatedDriver(),
		collect: async () => ({
			outcome: 'authorized',
			provider_refs: { transaction: 'offline-tx' },
			receipt: {},
			amount: '10.00',
			transport: 'bluetooth',
		}),
	});
	let online = false;
	const service = new TerminalPaymentsService({
		...c.options,
		isOnline: () => online,
		patchAndEnqueue: async () => c.summary,
		getActor: () => ({ id: '7', name: 'Pat' }),
	});
	const published = jest.fn();
	service.subscribe(() => published(service.get('order')?.settlement));
	service.begin({
		...input,
		row: deviceRow,
		method: deviceMethod,
		transport: 'bluetooth',
		offline: true,
	});
	await jest.advanceTimersByTimeAsync(0);
	expect(published).toHaveBeenCalledWith(
		expect.objectContaining({
			outcome: 'captured',
			payment: expect.objectContaining({ status: 'authorized' }),
			saleComplete: true,
		})
	);
	expect(service.get('order')).toBeNull();
	expect(c.completeOrder).toHaveBeenCalledWith('order', { id: '7', name: 'Pat' }, false);
	service.subscribe(jest.fn())();
	service.subscribe(jest.fn());
	online = true;
	c.http.post.mockResolvedValue({ data: { payment: { ...deviceRow, status: 'captured' } } });
	await service.flushOffline();
	expect(c.mirror).toHaveBeenCalledWith(
		'order',
		expect.objectContaining({ payment: expect.objectContaining({ status: 'captured' }) })
	);
	expect(c.completeOrder).toHaveBeenCalledTimes(1);
	expect(
		info.mock.calls.filter(([, options]) => options.context?.type === 'payment.authorized-offline')
	).toHaveLength(1);
	service.stop();
});

it.each(['mirror', 'completion'] as const)(
	'retains known capture and reports a local %s failure without recollection',
	async (failure) => {
		const c = setup();
		const warning = getLogger([]).error as jest.Mock;
		warning.mockClear();
		const error = new Error('local write failed');
		if (failure === 'mirror') c.mirror.mockRejectedValue(error);
		else c.completeOrder.mockRejectedValue(error);
		c.http.get.mockResolvedValue({
			data: { payment: { ...row, status: 'captured' }, order: c.summary },
		});
		const leg = c.service.resume(input)!;
		await jest.advanceTimersByTimeAsync(0);
		expect(c.service.get('order')?.settlement).toMatchObject({
			outcome: 'captured',
			finishingError: 'local write failed',
		});
		expect(warning).toHaveBeenCalledTimes(1);
		expect(warning).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				code: ERROR_CODES.PAYMENT_CAPTURED_ORDER_UNFINISHED,
				showToast: true,
			})
		);
		await leg.start();
		await leg.capture();
		expect(c.http.post).not.toHaveBeenCalled();
		c.service.stop();
	}
);

it.each(['provider_declined', 'wcpos_amount_exceeds_balance', 'expired'])(
	'records every settled refusal with no display subscribers (%s)',
	async (code) => {
		const c = setup();
		const error = getLogger([]).error as jest.Mock;
		error.mockClear();
		c.http.post.mockRejectedValue({
			response: {
				status: 400,
				data: {
					code: 'wcpos_provider_error',
					message: 'Refused',
					data: {
						detail: { code, message: 'Bank says no' },
						payment: { ...row, status: 'failed' },
					},
				},
			},
		});
		c.service.begin(input);
		await jest.advanceTimersByTimeAsync(0);
		expect(error).toHaveBeenCalledTimes(1);
		expect(error).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				code: ERROR_CODES.PAYMENT_TERMINAL_REFUSED,
				context: expect.objectContaining({ type: 'payment.declined', errorCode: code }),
			})
		);
		expect(c.completeOrder).not.toHaveBeenCalled();
	}
);

it('uses the persisted ledger balance when the terminal supplies no order summary', async () => {
	const c = setup();
	let read!: (value: string) => void;
	const options = {
		...c.options,
		getBalance: () =>
			new Promise<string>((resolve) => {
				read = resolve;
			}),
	};
	const service = new TerminalPaymentsService(options);
	c.http.post.mockResolvedValue({ data: { payment: { ...row, status: 'captured' } } });
	const published = jest.fn();
	service.subscribe(() => published(service.get('order')?.settlement));
	service.begin(input);
	await jest.advanceTimersByTimeAsync(0);
	expect(service.get('order')?.settlement).toBeUndefined();
	read('0.00');
	await jest.advanceTimersByTimeAsync(0);
	expect(published).toHaveBeenCalledWith(
		expect.objectContaining({
			saleComplete: true,
			outcome: 'captured',
		})
	);
	expect(service.get('order')).toBeNull();
	expect(c.completeOrder).toHaveBeenCalledTimes(1);
	service.stop();
});

it('does not enter an old store receipt when a pending local balance read finishes after stop', async () => {
	const { resetCheckoutMode, getCheckoutModeSnapshot } =
		await import('../../screens/main/pos/checkout/checkout-mode');
	resetCheckoutMode();
	const c = setup();
	let read!: (value: string) => void;
	const service = new TerminalPaymentsService({
		...c.options,
		getBalance: () =>
			new Promise<string>((resolve) => {
				read = resolve;
			}),
	});
	c.http.post.mockResolvedValue({ data: { payment: { ...row, status: 'captured' } } });
	service.begin(input);
	await jest.advanceTimersByTimeAsync(0);
	service.stop();
	read('0');
	await jest.advanceTimersByTimeAsync(0);
	expect(getCheckoutModeSnapshot().receiptOrders.has('order')).toBe(false);
	expect(c.completeOrder).not.toHaveBeenCalled();
});

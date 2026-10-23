import { log } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';
import { holdLiveTab, LiveTabNotOwnedError } from '@wcpos/database/live-tab';
import type { OrderPaymentSummary, PaymentRow } from '@wcpos/order-math';
import { MoneyCommandError } from '@wcpos/query';

import { RETIRE_RETRY_MS } from '../leg-finality';
import { createServerLeg } from './server-leg';

jest.mock('@wcpos/database/live-tab', () => ({
	...jest.requireActual('@wcpos/database/live-tab'),
	holdLiveTab: jest.fn(),
}));
const releaseHold = jest.fn();
beforeEach(() => {
	jest.mocked(holdLiveTab).mockReset().mockReturnValue(releaseHold);
	releaseHold.mockClear();
});

const epoch = Date.parse('2026-01-01T00:00:00Z');
// Explicit wire fixture, including the legacy GMT date format without a zone suffix.
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
	created_at_gmt: '2026-01-01T00:00:00',
	captured_at_gmt: null,
	updated_at_gmt: '2026-01-01T00:00:00Z',
	events: [],
	expires_at: null,
	void_requested_at: null,
};
const order: OrderPaymentSummary = {
	status: 'completed',
	total: '10.00',
	paid: '10.00',
	balance: '0.00',
	payment_method: 'terminal',
	payment_method_title: 'Terminal',
};
const response = (changes: Partial<PaymentRow> = {}) => ({
	payment: { ...row, ...changes },
	order,
});
const refusal = (status: number, code: string, data: object = {}) => ({
	response: { status, data: { code, message: 'Refused', data: { status, ...data } } },
});
function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((yes, no) => {
		resolve = yes;
		reject = no;
	});
	return { promise, resolve, reject };
}
function setup(
	resume = false,
	changes: Partial<PaymentRow> = {},
	extra: { retire?: (kind: 'intent', target: string) => Promise<void> } = {}
) {
	const scripts: Record<string, (() => Promise<{ data: unknown }>)[]> = {};
	const calls: { route: string; body?: unknown; at: number }[] = [];
	const request = async (url: string, body?: unknown) => {
		expect(url).toMatch(/^orders\/42\/payments\/leg\/(intent|status|capture|void)$/);
		const route = url.split('/').pop()!;
		calls.push({ route, body, at: Date.now() });
		return scripts[route]?.shift()?.() ?? { data: response() };
	};
	const mirror = jest.fn(async (_value: unknown) => {});
	const onFinal = jest.fn();
	const timer = jest.fn((fn: () => void, ms: number) => setTimeout(fn, ms));
	const leg = createServerLeg(
		{
			get: request,
			post: request,
			mirror,
			onFinal,
			now: Date.now,
			setTimeout: timer,
			clearTimeout,
			...extra,
		},
		{ orderId: 42, row: { ...row, ...changes }, reader: 'reader', resume }
	);
	const queue = (route: string, fn: () => Promise<{ data: unknown }>) => {
		(scripts[route] ??= []).push(fn);
	};
	return {
		leg,
		calls,
		mirror,
		onFinal,
		timer,
		queue,
		answer: (route: string, value = response()) => queue(route, async () => ({ data: value })),
		fail: (route: string, error: unknown = new Error('offline')) =>
			queue(route, async () => {
				throw error;
			}),
		count: (route: string) => calls.filter((call) => call.route === route).length,
	};
}
beforeEach(() => {
	jest.useFakeTimers();
	jest.setSystemTime(epoch);
});
afterEach(() => {
	jest.clearAllTimers();
	jest.useRealTimers();
});
const tick = (ms = 0) => jest.advanceTimersByTimeAsync(ms);

function setupRejoin() {
	const get = jest.fn<Promise<{ data: unknown }>, [string]>();
	const post = jest.fn<Promise<{ data: unknown }>, [string, unknown]>();
	const mirror = jest.fn(async () => {});
	const leg = createServerLeg(
		{ get, post, mirror, now: Date.now, setTimeout, clearTimeout },
		{ orderId: 42, row, reader: 'reader', resume: false }
	);
	return { leg, get, post, mirror };
}

it('rejoins an in-flight payment by polling the adopted id and finalizes capture', async () => {
	const c = setupRejoin();
	const intent = deferred<{ data: unknown }>();
	c.post.mockReturnValueOnce(intent.promise);
	c.get.mockResolvedValueOnce({ data: response({ id: 'live-1' }) });
	c.get.mockResolvedValueOnce({ data: response({ id: 'live-1', status: 'captured' }) });
	const started = c.leg.start();
	await tick(5000);
	intent.reject(refusal(409, 'wcpos_payment_in_flight', { payment_id: 'live-1' }));
	await started;
	expect(c.leg.getState()).toMatchObject({
		row: { id: 'live-1' },
		phase: 'polling',
		outcome: null,
		deadlineAt: epoch + 305_000,
		clientEvents: [
			expect.objectContaining({ message: 'Joined the payment already in progress', level: 'info' }),
		],
	});
	expect(c.mirror).not.toHaveBeenCalled();
	await tick();
	expect(c.get).toHaveBeenNthCalledWith(1, 'orders/42/payments/live-1/status');
	expect(c.mirror).toHaveBeenCalledWith(response({ id: 'live-1' }));
	expect(c.leg.getState().phase).toBe('polling');
	await tick(2000);
	expect(c.leg.getState()).toMatchObject({
		row: { id: 'live-1', status: 'captured' },
		phase: 'final',
		outcome: 'captured',
	});
	expect(c.post).toHaveBeenCalledTimes(1);
	expect(c.post).toHaveBeenCalledWith('orders/42/payments/leg/intent', {
		payment: row,
		context: { reader: 'reader' },
	});
});

it('a cancel during an in-flight intent voids the adopted id without retrying intent', async () => {
	const c = setupRejoin();
	const intent = deferred<{ data: unknown }>();
	c.post.mockReturnValueOnce(intent.promise);
	c.post.mockResolvedValueOnce({ data: response({ id: 'live-1', status: 'voided' }) });
	const started = c.leg.start();
	await c.leg.cancel();
	expect(c.post).toHaveBeenCalledTimes(1);
	intent.reject(refusal(409, 'wcpos_payment_in_flight', { payment_id: 'live-1' }));
	await started;
	expect(c.post).toHaveBeenNthCalledWith(2, 'orders/42/payments/live-1/void', {
		reason: 'cashier',
	});
	expect(c.leg.getState()).toMatchObject({
		row: { id: 'live-1' },
		cancelRequested: true,
		outcome: 'voided',
	});
	await tick(10000);
	expect(c.post).toHaveBeenCalledTimes(2);
	expect(c.get).not.toHaveBeenCalled();
});

it('a different wcpos 409 on intent remains a refusal, not a rejoin', async () => {
	const c = setup();
	c.fail('intent', refusal(409, 'wcpos_amount_mismatch', { payment_id: 'live-1' }));
	await c.leg.start();
	await tick(10000);
	expect(c.leg.getState()).toMatchObject({
		row: { id: 'leg', status: 'failed' },
		phase: 'final',
		outcome: 'failed',
	});
	expect(c.count('intent')).toBe(1);
	expect(c.count('status')).toBe(0);
});

it('a rejoined cancelled authorization keeps polling without capture until voided', async () => {
	const c = setupRejoin();
	c.post.mockRejectedValueOnce(refusal(409, 'wcpos_payment_in_flight', { payment_id: 'live-1' }));
	c.post.mockResolvedValue({ data: response({ id: 'live-1', status: 'captured' }) });
	c.get.mockResolvedValueOnce({
		data: response({
			id: 'live-1',
			status: 'authorized',
			created_at_gmt: '2025-12-31T23:59:00',
			void_requested_at: '2026-10-08T00:00:00Z',
		}),
	});
	c.get.mockResolvedValueOnce({ data: response({ id: 'live-1', status: 'voided' }) });
	await c.leg.start();
	await tick();
	expect(c.post).toHaveBeenCalledTimes(1);
	expect(c.leg.getState()).toMatchObject({
		phase: 'polling',
		outcome: null,
		cancelRequested: true,
		releaseAvailable: true,
		deadlineAt: epoch + 240_000,
	});
	await tick(2000);
	expect(c.get).toHaveBeenCalledTimes(2);
	expect(c.get).toHaveBeenLastCalledWith('orders/42/payments/live-1/status');
	expect(c.leg.getState()).toMatchObject({ phase: 'final', outcome: 'voided' });
	expect(c.post).toHaveBeenCalledTimes(1);
});

it.each(['locked', 'accepted'] as const)(
	'preserves cashier cancellation before the first rejoined status after a %s void',
	async (voidResult) => {
		const c = setupRejoin();
		c.post.mockRejectedValueOnce(refusal(409, 'wcpos_payment_in_flight', { payment_id: 'live-1' }));
		// A held lock ran nothing: the same void is re-sent after retry_after (ADR 0040 §1.3).
		if (voidResult === 'locked')
			c.post.mockRejectedValueOnce(refusal(409, 'wcpos_payment_locked', { retry_after: 1 }));
		c.post.mockResolvedValueOnce({ data: response({ id: 'live-1' }) });
		c.post.mockResolvedValue({ data: response({ id: 'live-1', status: 'captured' }) });
		c.get.mockResolvedValueOnce({ data: response({ id: 'live-1', status: 'authorized' }) });
		c.get.mockResolvedValueOnce({ data: response({ id: 'live-1', status: 'voided' }) });
		await c.leg.start();
		await c.leg.cancel();
		expect(c.post).toHaveBeenLastCalledWith('orders/42/payments/live-1/void', {
			reason: 'cashier',
		});
		if (voidResult === 'locked') await tick(1000);
		const voids = voidResult === 'locked' ? 2 : 1;
		expect(c.post.mock.calls.map(([url]) => url)).toEqual([
			'orders/42/payments/leg/intent',
			...Array(voids).fill('orders/42/payments/live-1/void'),
		]);
		expect(c.post.mock.calls.slice(1).map(([, body]) => body)).toEqual(
			Array(voids).fill({ reason: 'cashier' })
		);
		await tick(2000);
		expect(c.leg.getState()).toMatchObject({
			phase: 'polling',
			outcome: null,
			cancelRequested: true,
			releaseAvailable: true,
		});
		await tick(2000);
		expect(c.get).toHaveBeenCalledTimes(2);
		expect(c.get).toHaveBeenLastCalledWith('orders/42/payments/live-1/status');
		expect(c.leg.getState()).toMatchObject({ phase: 'final', outcome: 'voided' });
		expect(c.post).toHaveBeenCalledTimes(1 + voids);
	}
);

it('a first-status not-found after rejoin fails without mirroring the adopted id', async () => {
	const c = setupRejoin();
	c.post.mockRejectedValueOnce(refusal(409, 'wcpos_payment_in_flight', { payment_id: 'live-1' }));
	c.get.mockRejectedValueOnce(refusal(404, 'wcpos_payment_not_found'));
	await c.leg.start();
	await tick();
	expect(c.leg.getState()).toMatchObject({
		phase: 'final',
		outcome: 'failed',
		error: { code: 'wcpos_payment_not_found', message: 'Refused' },
	});
	expect(c.get).toHaveBeenCalledWith('orders/42/payments/live-1/status');
	expect(c.mirror).not.toHaveBeenCalled();
	expect(jest.getTimerCount()).toBe(0);
});

it('starts once, mirrors intent before polling and reads immediately on a timer', async () => {
	const c = setup();
	const pending = deferred<{ data: unknown }>();
	c.queue('intent', () => pending.promise);
	expect(c.leg.getState().phase).toBe('idle');
	const started = c.leg.start();
	void c.leg.start();
	expect(c.leg.getState().phase).toBe('creating');
	expect(c.count('intent')).toBe(1);
	pending.resolve({ data: response() });
	await started;
	expect(c.mirror).toHaveBeenCalledWith(response());
	expect(c.leg.getState().phase).toBe('polling');
	expect(c.count('status')).toBe(0);
	expect(c.calls[0].body).toEqual({ payment: row, context: { reader: 'reader' } });
	await tick();
	expect(c.count('status')).toBe(1);
	void c.leg.start();
	expect(c.count('intent')).toBe(1);
});
it('schedules cadence from response completion, not request start', async () => {
	const c = setup(true);
	const delayed = deferred<{ data: unknown }>();
	c.queue('status', () => delayed.promise);
	await tick();
	await tick(5000);
	expect(c.count('status')).toBe(1);
	delayed.resolve({ data: response() });
	await tick();
	await tick(1999);
	expect(c.count('status')).toBe(1);
	await tick(1);
	expect(c.calls.map((call) => call.at - epoch)).toEqual([0, 7000]);
});
it.each(['status', 'intent'])(
	'%s errors back off, flag unstable, recover, and reset',
	async (route) => {
		const c = setup(route === 'status');
		for (let i = 0; i < 5; i++) c.fail(route);
		if (route === 'intent') await c.leg.start();
		else await tick();
		const delays = [];
		for (const delay of [2000, 4000, 8000, 15000, 15000]) {
			delays.push(c.timer.mock.calls.at(-1)![1]);
			if (delays.length === 3) expect(c.leg.getState().unstable).toBe(true);
			await tick(delay);
		}
		expect(delays).toEqual([2000, 4000, 8000, 15000, 15000]);
		expect(c.leg.getState()).toMatchObject({ consecutiveErrors: 0, unstable: false });
		expect(c.leg.getState().clientEvents.some((e) => e.message === 'Connection unstable')).toBe(
			true
		);
		c.fail('status');
		await c.leg.checkNow();
		expect(c.timer.mock.calls.at(-1)![1]).toBe(2000);
		if (route === 'intent')
			expect(
				c.calls
					.filter((call) => call.route === 'intent')
					.every((call) => (call.body as { payment: PaymentRow }).payment.id === 'leg')
			).toBe(true);
	}
);
it('checkNow invalidates an older response, with no stale mirror or state changes', async () => {
	const c = setup(true);
	const delayed = deferred<{ data: unknown }>();
	c.queue('status', () => delayed.promise);
	await tick();
	await c.leg.checkNow();
	const state = c.leg.getState();
	const mirrors = c.mirror.mock.calls.length;
	delayed.resolve({ data: response({ status: 'captured' }) });
	await tick();
	expect(c.leg.getState()).toBe(state);
	expect(c.mirror).toHaveBeenCalledTimes(mirrors);
	await tick(2000);
	expect(c.count('status')).toBe(3);
});
it.each(['captured', 'failed', 'voided'] as const)(
	'%s finalizes once and stops all triggers',
	async (status) => {
		const c = setup(true);
		c.answer('status', response({ status }));
		await tick();
		expect(c.leg.getState()).toMatchObject({ phase: 'final', outcome: status });
		await c.leg.start();
		await c.leg.cancel();
		await c.leg.checkNow();
		await c.leg.capture();
		await c.leg.release();
		await tick(600000);
		expect(c.calls).toHaveLength(1);
		expect(c.onFinal).toHaveBeenCalledTimes(1);
	}
);
it('cancel twice issues one void, after the in-flight poll, and a late capture wins', async () => {
	const c = setup(true);
	const old = deferred<{ data: unknown }>();
	c.queue('status', () => old.promise);
	await tick();
	const cancel = deferred<{ data: unknown }>();
	c.queue('void', () => cancel.promise);
	await c.leg.cancel();
	await c.leg.cancel();
	expect(c.leg.getState()).toMatchObject({ phase: 'cancelling', cancelRequested: true });
	await c.leg.checkNow();
	expect(c.count('status')).toBe(1);
	expect(c.count('void')).toBe(0);
	old.resolve({ data: response() });
	await tick();
	expect(c.count('void')).toBe(1);
	cancel.resolve({ data: response({ void_requested_at: new Date().toISOString() }) });
	await tick();
	expect(c.leg.getState()).toMatchObject({ phase: 'polling', releaseAvailable: true });
	c.answer('status', response({ status: 'captured' }));
	await tick(2000);
	expect(c.leg.getState().outcome).toBe('captured');
	expect(c.leg.getState().clientEvents.map((e) => e.message)).toContain(
		'Cancel requested by cashier'
	);
});
it('a cancel while a status poll is in flight sends the void after the poll answer is mirrored', async () => {
	const c = setup(true);
	const poll = deferred<{ data: unknown }>();
	c.queue('status', () => poll.promise);
	c.answer('void', response({ status: 'voided' }));
	c.mirror.mockImplementation(async () => {
		c.calls.push({ route: 'mirror', at: Date.now() });
	});
	await tick();
	await c.leg.cancel('cashier');
	expect(c.count('void')).toBe(0);
	expect(c.leg.getState()).toMatchObject({ phase: 'cancelling', cancelRequested: true });
	const answered = { ...response(), revision: 'R2' };
	poll.resolve({ data: answered });
	await tick();
	expect(c.mirror).toHaveBeenNthCalledWith(1, answered);
	expect(c.calls.map((call) => call.route)).toEqual(['status', 'mirror', 'void', 'mirror']);
	expect(c.leg.getState().outcome).toBe('voided');
	await tick(10000);
	expect(c.count('status')).toBe(1);
	expect(c.count('void')).toBe(1);
});
it('a cancel while the poll answer is still being mirrored waits for the mirror', async () => {
	const c = setup(true);
	const mirroring = deferred<void>();
	c.answer('status', response());
	c.answer('void', response({ status: 'voided' }));
	let first = true;
	c.mirror.mockImplementation(async () => {
		c.calls.push({ route: 'mirror', at: Date.now() });
		if (first) {
			first = false;
			await mirroring.promise;
		}
	});
	await tick();
	expect(c.calls.map((call) => call.route)).toEqual(['status', 'mirror']);
	// The answer is back but not yet mirrored: the cancel must not void under the old revision.
	await c.leg.cancel('cashier');
	expect(c.count('void')).toBe(0);
	expect(c.leg.getState()).toMatchObject({ phase: 'cancelling', cancelRequested: true });
	mirroring.resolve();
	await tick();
	expect(c.calls.map((call) => call.route)).toEqual(['status', 'mirror', 'void', 'mirror']);
	expect(c.leg.getState().outcome).toBe('voided');
});
it('a status poll that errors while a cancel is pending still voids', async () => {
	const c = setup(true);
	const poll = deferred<{ data: unknown }>();
	c.queue('status', () => poll.promise);
	c.answer('void', response({ status: 'voided' }));
	await tick();
	await c.leg.cancel('cashier');
	expect(c.count('void')).toBe(0);
	poll.reject(new Error('offline'));
	await tick();
	expect(c.calls.map((call) => call.route)).toEqual(['status', 'void']);
	expect(c.calls[1].body).toEqual({ reason: 'cashier' });
	expect(c.leg.getState().outcome).toBe('voided');
});
it('a void response reporting captured wins immediately', async () => {
	const c = setup(true);
	c.answer('void', response({ status: 'captured' }));
	await c.leg.cancel();
	expect(c.leg.getState().outcome).toBe('captured');
	expect(jest.getTimerCount()).toBe(0);
});
it('release requires a live void response and mirrors only a local void', async () => {
	const c = setup(true);
	await c.leg.release();
	expect(c.mirror).not.toHaveBeenCalled();
	c.answer('void', response({ void_requested_at: new Date().toISOString() }));
	await c.leg.cancel();
	const count = c.calls.length;
	await c.leg.release();
	expect(c.leg.getState()).toMatchObject({ phase: 'final', outcome: 'released' });
	expect(c.mirror).toHaveBeenLastCalledWith({
		payment: expect.objectContaining({ status: 'voided', failure_reason: 'released' }),
		order,
	});
	expect(c.calls).toHaveLength(count);
	expect(jest.getTimerCount()).toBe(0);
	expect(c.leg.getState().clientEvents.at(-1)?.message).toBe('Leg released');
});
it.each(['pending', 'authorized', 'captured'] as const)(
	'deadline forced read precedes void; boundary %s',
	async (status) => {
		const c = setup(true, { expires_at: new Date(epoch).toISOString() });
		const read = deferred<{ data: unknown }>();
		c.queue('status', () => read.promise);
		await tick();
		expect(c.calls.map((call) => call.route)).toEqual(['status']);
		expect(c.leg.getState().deadlineHandled).toBe(true);
		c.answer('void', response({ void_requested_at: new Date().toISOString() }));
		read.resolve({ data: response({ status }) });
		await tick();
		if (status === 'captured') {
			expect(c.leg.getState().outcome).toBe('captured');
			expect(c.count('void')).toBe(0);
		} else {
			expect(c.calls.map((call) => call.route)).toEqual(['status', 'void']);
			expect(c.calls[1].body).toEqual({ reason: 'deadline' });
			expect(c.leg.getState().releaseAvailable).toBe(true);
			await tick(6000);
			expect(c.count('void')).toBe(1);
		}
		expect(
			c.leg.getState().clientEvents.filter((e) => e.message === 'Deadline reached')
		).toHaveLength(1);
	}
);
it('a release whose local write fails stays live with the release still on offer', async () => {
	const c = setup(true, { void_requested_at: '2026-01-01T00:00:00Z' });
	c.mirror.mockRejectedValueOnce(new Error('disk full'));
	await c.leg.release();
	expect(c.leg.getState()).toMatchObject({
		phase: 'polling',
		outcome: null,
		releaseAvailable: true,
		error: { code: 'mirror_failed', message: 'disk full' },
	});
	await c.leg.release();
	expect(c.leg.getState()).toMatchObject({ phase: 'final', outcome: 'released' });
	expect(c.mirror).toHaveBeenLastCalledWith(
		expect.objectContaining({ payment: expect.objectContaining({ status: 'voided' }) })
	);
});
it('resume uses creation time, never intents, and restores cancellation flags', async () => {
	jest.setSystemTime(epoch + 120000);
	const c = setup(true, { void_requested_at: new Date(epoch).toISOString() });
	expect(c.leg.getState()).toMatchObject({
		phase: 'polling',
		deadlineAt: epoch + 300000,
		cancelRequested: true,
		releaseAvailable: true,
	});
	await c.leg.start();
	await c.leg.cancel();
	c.answer('status', response({ status: 'captured' }));
	await tick();
	expect(c.calls.map((call) => call.route)).toEqual(['status']);
	expect(c.leg.getState().outcome).toBe('captured');
});
it('new intent deadline uses the earlier of provider expiry and five minutes from acceptance', async () => {
	const c = setup();
	c.answer('intent', response({ expires_at: new Date(epoch + 10000).toISOString() }));
	await c.leg.start();
	expect(c.leg.getState().deadlineAt).toBe(epoch + 10000);
});
it.each([7, undefined])(
	'lock schedules retry_after %s without counting transport errors',
	async (retry_after) => {
		const c = setup(true);
		c.fail('status');
		await tick();
		c.fail('status', refusal(409, 'wcpos_payment_locked', { retry_after }));
		await tick(2000);
		expect(c.leg.getState()).toMatchObject({ consecutiveErrors: 1, error: null });
		const delay = retry_after ? 7000 : 2000;
		await tick(delay - 1);
		expect(c.count('status')).toBe(2);
		await tick(1);
		expect(c.count('status')).toBe(3);
	}
);
// ADR 0040 §1.3: a held lock means nothing ran, and the journal keeps the command. The leg
// re-sends the same command after `retry_after`; a status read cannot answer it.
it('a locked intent is re-sent after retry_after, never polled', async () => {
	const c = setup();
	c.fail('intent', refusal(409, 'wcpos_payment_locked', { retry_after: 3 }));
	await c.leg.start();
	expect(c.leg.getState()).toMatchObject({ phase: 'creating', error: null, consecutiveErrors: 0 });
	await tick(2999);
	expect(c.count('intent')).toBe(1);
	await tick(1);
	expect(c.count('intent')).toBe(2);
	expect(c.calls[1].body).toEqual(c.calls[0].body);
	expect(c.calls.slice(0, 2).map(({ route }) => route)).toEqual(['intent', 'intent']);
	expect(c.leg.getState()).toMatchObject({ phase: 'polling', row: { status: 'pending' } });
});
// The lock ran nothing, so a cancel pressed while that intent was out goes out now as the void
// (answered 200 or not-found either way); the intent is never re-sent to the reader.
it('a cancel pending over a locked intent is resolved as the void, never an intent re-send', async () => {
	const c = setup();
	const intent = deferred<{ data: unknown }>();
	c.queue('intent', () => intent.promise);
	c.answer('void', response({ status: 'voided' }));
	const started = c.leg.start();
	await c.leg.cancel();
	intent.reject(refusal(409, 'wcpos_payment_locked', { retry_after: 1 }));
	await started;
	await tick(5000);
	expect(c.count('intent')).toBe(1);
	expect(c.count('void')).toBe(1);
	expect(c.leg.getState()).toMatchObject({ phase: 'final', outcome: 'voided' });
});
// The retirement of the cancelled locked intent is awaited before the leg is final: a failed
// journal write keeps the leg live with the reason, never final with a re-sendable intent left.
it.each([
	['succeeds', true],
	['fails', false],
])('a cancelled locked intent whose retirement %s', async (_, retired) => {
	const retire = jest.fn(async () => {
		if (!retired) throw new Error('journal write failed');
	});
	const c = setup(false, {}, { retire });
	const intent = deferred<{ data: unknown }>();
	c.queue('intent', () => intent.promise);
	c.answer('void', response({ status: 'voided' }));
	const started = c.leg.start();
	await c.leg.cancel();
	intent.reject(refusal(409, 'wcpos_payment_locked', { retry_after: 1 }));
	await started;
	await tick(0);
	expect(retire).toHaveBeenCalledWith('intent', 'leg');
	if (retired) expect(c.leg.getState()).toMatchObject({ phase: 'final', outcome: 'voided' });
	else
		expect(c.leg.getState()).toMatchObject({
			outcome: null,
			error: { code: 'retire_failed' },
		});
});
// A cancel pressed while the intent was out, whose POST then failed in transit (outcome unknown),
// goes out as the void; once that void ends the leg voided (here the store never saw the intent),
// the intent is retired from the journal, so no recovery or Try again re-sends it after the cancel.
it('a cancelled intent lost in transit is retired once its void ends the leg', async () => {
	const retire = jest.fn(async () => undefined);
	const c = setup(false, {}, { retire });
	const intent = deferred<{ data: unknown }>();
	c.queue('intent', () => intent.promise);
	c.fail('void', refusal(404, 'wcpos_payment_not_found'));
	const started = c.leg.start();
	await c.leg.cancel();
	intent.reject(new Error('Network Error'));
	await started;
	await tick(0);
	expect(c.count('intent')).toBe(1);
	expect(retire).toHaveBeenCalledWith('intent', 'leg');
	expect(c.leg.getState()).toMatchObject({ phase: 'final', outcome: 'voided' });
	expect(retire.mock.invocationCallOrder[0]).toBeLessThan(c.onFinal.mock.invocationCallOrder[0]);
});

// The poster refused the intent before it left the till: the order changed since the cashier
// approved it (or its pre-flight failed). Nothing reached the store; the leg ends at once with
// the reason, so the cashier chooses again, never an endless retry of a stale approval.
it.each(['order_changed', 'preflight_failed'] as const)(
	'an intent the poster refuses with %s ends the leg locally, without a retry',
	async (reason) => {
		const c = setup();
		c.fail('intent', new MoneyCommandError(reason, { id: 'command', sentAt: null } as never));
		await c.leg.start();
		expect(c.leg.getState()).toMatchObject({
			phase: 'final',
			outcome: 'failed',
			error: { code: reason },
		});
		await tick(60_000);
		expect(c.count('intent')).toBe(1);
	}
);

// An intent that keeps failing in transit is not retried past the leg's deadline: the cancel the
// status path would make at the deadline goes out instead.
it('an intent retried in transit stops at the deadline and cancels', async () => {
	const c = setup();
	for (let i = 0; i < 200; i++) c.fail('intent');
	c.fail('void', refusal(404, 'wcpos_payment_not_found'));
	await c.leg.start();
	// Past the five minutes, and the next retry (at most 15 s apart) is the last.
	await tick(320_000);
	const intents = c.count('intent');
	expect(c.count('void')).toBe(1);
	expect(c.leg.getState()).toMatchObject({ phase: 'final', outcome: 'voided' });
	await tick(60_000);
	expect(c.count('intent')).toBe(intents);
});

// Codex 4343940265 on #2834: a lock held past the deadline does not keep the intent going.
it('an intent locked past the deadline stops re-sending and cancels', async () => {
	const c = setup();
	for (let i = 0; i < 200; i++)
		c.fail('intent', refusal(409, 'wcpos_payment_locked', { retry_after: 15 }));
	c.fail('void', refusal(404, 'wcpos_payment_not_found'));
	await c.leg.start();
	await tick(320_000);
	const intents = c.count('intent');
	expect(c.count('void')).toBe(1);
	expect(c.calls.find(({ route }) => route === 'void')?.body).toEqual({ reason: 'deadline' });
	expect(c.leg.getState()).toMatchObject({ phase: 'final', outcome: 'voided' });
	await tick(60_000);
	expect(c.count('intent')).toBe(intents);
});

it('a locked capture is re-sent after retry_after, then settles', async () => {
	const c = setup(true);
	c.answer('status', response({ status: 'authorized' }));
	c.fail('capture', refusal(409, 'wcpos_payment_locked', { retry_after: 2 }));
	c.answer('capture', response({ status: 'captured' }));
	await tick();
	expect(c.count('capture')).toBe(1);
	expect(c.leg.getState()).toMatchObject({ capturing: true, outcome: null });
	await tick(2000);
	expect(c.count('capture')).toBe(2);
	expect(c.count('status')).toBe(1);
	expect(c.leg.getState()).toMatchObject({ phase: 'final', outcome: 'captured' });
});
it('a locked void is re-sent with its reason after retry_after', async () => {
	const c = setup(true);
	c.answer('status', response({ status: 'pending' }));
	await tick();
	c.fail('void', refusal(409, 'wcpos_payment_locked', { retry_after: 1 }));
	c.answer('void', response({ status: 'voided' }));
	await c.leg.cancel();
	expect(c.leg.getState()).toMatchObject({ phase: 'cancelling', cancelRequested: true });
	const reads = c.count('status');
	await tick(1000);
	expect(c.count('void')).toBe(2);
	expect(c.calls.filter(({ route }) => route === 'void').map(({ body }) => body)).toEqual([
		{ reason: 'cashier' },
		{ reason: 'cashier' },
	]);
	expect(c.count('status')).toBe(reads);
	expect(c.leg.getState()).toMatchObject({ phase: 'final', outcome: 'voided' });
});

it('authorized automatically captures once and mirrors both rows', async () => {
	const c = setup(true);
	c.answer('status', response({ status: 'authorized' }));
	const capture = deferred<{ data: unknown }>();
	c.queue('capture', () => capture.promise);
	await tick();
	expect(c.leg.getState()).toMatchObject({ phase: 'polling', capturing: true });
	await c.leg.capture();
	expect(c.count('capture')).toBe(1);
	expect(c.calls.at(-1)?.body).toEqual({ context: {} });
	capture.resolve({ data: response({ status: 'captured' }) });
	await tick();
	expect(c.leg.getState()).toMatchObject({ capturing: false, outcome: 'captured' });
	expect(
		c.mirror.mock.calls.map(([value]) => (value as { payment: PaymentRow }).payment.status)
	).toEqual(['authorized', 'captured']);
});
it.each([true, false])(
	'capture provider refusal rests with detail message (%s) until explicit retry',
	async (detail) => {
		const c = setup(true);
		c.answer('status', response({ status: 'authorized' }));
		c.fail(
			'capture',
			refusal(502, 'wcpos_provider_error', {
				...response({ status: 'authorized' }),
				...(detail ? { detail: { code: 'declined', message: 'Hold cannot be captured' } } : {}),
			})
		);
		await tick();
		expect(c.leg.getState()).toMatchObject({
			phase: 'polling',
			capturing: false,
			captureFailed: true,
			row: { status: 'authorized' },
			error: {
				code: detail ? 'declined' : 'wcpos_provider_error',
				message: detail ? 'Hold cannot be captured' : 'Refused',
			},
		});
		const count = c.calls.length;
		await tick(600000);
		expect(c.calls).toHaveLength(count);
		c.answer('capture', response({ status: 'captured' }));
		await c.leg.capture();
		expect(c.leg.getState().outcome).toBe('captured');
		expect(c.count('capture')).toBe(2);
	}
);
it('capture-failed hold can be voided instead of captured', async () => {
	const c = setup(true);
	c.answer('status', response({ status: 'authorized' }));
	c.fail('capture', refusal(502, 'wcpos_provider_error'));
	await tick();
	c.answer('void', response({ status: 'voided' }));
	await c.leg.cancel();
	expect(c.leg.getState().outcome).toBe('voided');
});
it.each(['wcpos_amount_exceeds_balance', 'wcpos_order_already_paid', 'wcpos_amount_mismatch'])(
	'intent refusal %s mirrors server failure and summary',
	async (code) => {
		const c = setup();
		const failed = response({ status: 'failed', failure_reason: code.slice(6) });
		c.fail('intent', refusal(409, code, failed));
		await c.leg.start();
		expect(c.mirror).toHaveBeenCalledWith(failed);
		expect(c.leg.getState()).toMatchObject({ outcome: 'failed', row: failed.payment });
		expect(c.count('status')).toBe(0);
	}
);
it.each(['wcpos_payment_not_found', 'wcpos_unknown_refusal'])(
	'%s finalizes a local failure',
	async (code) => {
		const c = setup(true);
		c.fail('status', refusal(404, code));
		await tick();
		expect(c.leg.getState()).toMatchObject({
			outcome: 'failed',
			row: { failure_reason: code === 'wcpos_payment_not_found' ? 'not_found' : code },
		});
	}
);
it('a cancel during an in-flight intent voids only once the intent has answered', async () => {
	const c = setup();
	const intent = deferred<{ data: unknown }>();
	c.queue('intent', () => intent.promise);
	c.answer('void', response({ status: 'voided' }));
	void c.leg.start();
	await tick();
	await c.leg.cancel();
	expect(c.count('void')).toBe(0);
	expect(c.leg.getState()).toMatchObject({ phase: 'cancelling', cancelRequested: true });
	intent.resolve({ data: response({ status: 'pending' }) });
	await tick();
	expect(c.count('void')).toBe(1);
	expect(c.count('status')).toBe(0);
	expect(c.leg.getState().outcome).toBe('voided');
});
it('a cancel during an intent that then fails in transit voids instead of retrying the intent', async () => {
	const c = setup();
	const intent = deferred<{ data: unknown }>();
	c.queue('intent', () => intent.promise);
	c.fail('void', refusal(404, 'wcpos_payment_not_found'));
	void c.leg.start();
	await tick();
	await c.leg.cancel();
	intent.reject(new Error('offline'));
	await tick();
	expect(c.count('intent')).toBe(1);
	expect(c.count('void')).toBe(1);
	expect(c.leg.getState().outcome).toBe('voided');
});
it('a capture lost in transit is issued again on the next authorized read', async () => {
	const c = setup(true, { status: 'authorized' });
	c.fail('capture');
	c.answer('status', response({ status: 'authorized' }));
	c.answer('status', response({ status: 'authorized' }));
	c.answer('capture', response({ status: 'captured' }));
	await tick();
	expect(c.count('capture')).toBe(1);
	expect(c.leg.getState()).toMatchObject({ phase: 'polling', captureFailed: false, outcome: null });
	await tick(2000);
	expect(c.count('capture')).toBe(2);
	expect(c.leg.getState().outcome).toBe('captured');
});
it('an unparseable expiry or creation date falls back to the five-minute deadline', async () => {
	const c = setup(true, { created_at_gmt: 'not a date', expires_at: 'never' });
	expect(c.leg.getState().deadlineAt).toBe(epoch + 300_000);
	c.answer('status', response({ status: 'pending', expires_at: 'soon' }));
	await tick();
	expect(Number.isNaN(c.leg.getState().deadlineAt)).toBe(false);
});
it('a 4xx that is not a contract code is retried like a dropped connection', async () => {
	const c = setup(true);
	c.fail('status', refusal(403, 'rest_forbidden'));
	c.answer('status', response({ status: 'captured' }));
	await tick();
	expect(c.leg.getState()).toMatchObject({ phase: 'polling', outcome: null, consecutiveErrors: 1 });
	await tick(2000);
	expect(c.leg.getState().outcome).toBe('captured');
});
// An intent the store or the provider refused is not a dropped connection: the same request
// would be refused the same way, and no leg exists on the server to poll. Found live on the
// first SumUp Solo run (a 422 for a currency the merchant cannot take, and a 400 from the
// ledger, each retried as "Connection unstable" until the five-minute deadline).
it.each([
	[400, 'rest_invalid_param', {}, 'Refused'],
	[
		422,
		'wcpos_provider_error',
		{ detail: { code: 'sumup_422', message: "This merchant can only accept 'EUR'" } },
		"This merchant can only accept 'EUR'",
	],
] as const)(
	'a refused intent (%s %s) lands as failed with the reason',
	async (status, code, data, message) => {
		const c = setup();
		c.fail('intent', refusal(status, code, data));
		await c.leg.start();
		await tick();
		expect(c.leg.getState()).toMatchObject({
			phase: 'final',
			outcome: 'failed',
			row: { status: 'failed' },
			error: { message },
			// The refusal is a logged event: the latest line under the stepper, and in Copy.
			clientEvents: [expect.objectContaining({ level: 'error', message })],
		});
		await tick(20000);
		expect(c.count('intent')).toBe(1);
	}
);
it('an auth 4xx on intent is still retried like a dropped connection', async () => {
	const c = setup();
	c.fail('intent', refusal(403, 'rest_forbidden'));
	c.answer('intent', response({ status: 'pending' }));
	await c.leg.start();
	await tick();
	expect(c.leg.getState()).toMatchObject({
		phase: 'creating',
		outcome: null,
		consecutiveErrors: 1,
	});
	await tick(2000);
	expect(c.leg.getState().phase).toBe('polling');
	expect(c.count('intent')).toBe(2);
});
// The journal keeps these intents for a re-send (sync-core's money answer rule), so the leg must
// not end failed: the cashier would move on while a re-send could still authorize.
it.each([
	['a 426 wcpos_update_required', refusal(426, 'wcpos_update_required')],
	['a non-JSON 404', { response: { status: 404, data: '<html>proxy</html>' } }],
	['a non-JSON 400', { response: { status: 400, data: '' } }],
])('an intent answered with %s stays live and is retried', async (_, error) => {
	const c = setup();
	c.fail('intent', error);
	await c.leg.start();
	expect(c.leg.getState()).toMatchObject({
		phase: 'creating',
		outcome: null,
		consecutiveErrors: 1,
	});
	await tick(2000);
	expect(c.count('intent')).toBe(2);
});
it('a void the server never saw is a local void, not a failure', async () => {
	const c = setup(true);
	c.fail('void', refusal(404, 'wcpos_payment_not_found'));
	await c.leg.cancel();
	expect(c.leg.getState()).toMatchObject({
		outcome: 'voided',
		row: { status: 'voided', failure_reason: null },
	});
	expect(c.mirror).toHaveBeenLastCalledWith(
		expect.objectContaining({ payment: expect.objectContaining({ status: 'voided' }) })
	);
});
it.each(['void', 'capture'])(
	'invalid transition on %s reads status, not final failure',
	async (route) => {
		const c = setup(true, { status: route === 'capture' ? 'authorized' : 'pending' });
		c.fail(route, refusal(409, 'wcpos_invalid_transition'));
		c.answer('status', response({ status: 'captured' }));
		if (route === 'void') await c.leg.cancel();
		else await c.leg.capture();
		await tick();
		expect(c.leg.getState().outcome).toBe('captured');
		expect(c.count(route)).toBe(1);
	}
);
it('cancel during intent transport retry stops intent retries and watches finality', async () => {
	const c = setup();
	c.fail('intent');
	await c.leg.start();
	c.answer('void', response({ void_requested_at: new Date().toISOString() }));
	await c.leg.cancel();
	c.answer('status', response({ status: 'captured' }));
	await tick(10000);
	expect(c.count('intent')).toBe(1);
	expect(c.leg.getState().outcome).toBe('captured');
});
it.each(['void', 'capture'])(
	'transport errors on %s read status without repeating the mutation',
	async (route) => {
		const c = setup(true, { status: route === 'capture' ? 'authorized' : 'pending' });
		c.fail(route);
		if (route === 'void') await c.leg.cancel();
		else await c.leg.capture();
		c.answer('status', response({ status: 'captured' }));
		await tick(2000);
		expect(c.count(route)).toBe(1);
		expect(c.leg.getState().outcome).toBe('captured');
	}
);
it('stop drops in-flight replies without state changes; dispose also drops listeners', async () => {
	const c = setup(true);
	const read = deferred<{ data: unknown }>();
	c.queue('status', () => read.promise);
	const listener = jest.fn();
	c.leg.subscribe(listener);
	await tick();
	const state = c.leg.getState();
	c.leg.stop();
	read.resolve({ data: response({ status: 'captured' }) });
	await tick();
	expect(c.leg.getState()).toBe(state);
	expect(c.mirror).not.toHaveBeenCalled();
	c.leg.dispose();
	await tick(600000);
	expect(c.calls).toHaveLength(1);
});

it('a known capture still finalizes if local mirroring fails, without retrying intent', async () => {
	const c = setup();
	c.answer('intent', response({ status: 'captured' }));
	c.mirror.mockRejectedValue(new Error('disk'));
	await c.leg.start();
	expect(c.leg.getState()).toMatchObject({ outcome: 'captured', error: { code: 'mirror_failed' } });
	await tick(10000);
	expect(c.count('intent')).toBe(1);
	expect(c.onFinal).toHaveBeenCalledTimes(1);
});
it('a successful final resets unstable/error count; a failed refusal still exposes its message', async () => {
	const c = setup(true);
	for (let i = 0; i < 3; i++) {
		c.fail('status');
		await c.leg.checkNow();
	}
	c.answer('status', response({ status: 'captured' }));
	await c.leg.checkNow();
	expect(c.leg.getState()).toMatchObject({
		unstable: false,
		consecutiveErrors: 0,
		outcome: 'captured',
	});
	const refused = setup();
	refused.fail('intent', refusal(409, 'wcpos_amount_mismatch', response({ status: 'failed' })));
	await refused.leg.start();
	expect(refused.leg.getState().error?.message).toBe('Refused');
});
it('a stale mirror rejection cannot mutate the state after checkNow supersedes it', async () => {
	const c = setup(true);
	const write = deferred<void>();
	c.mirror.mockImplementationOnce(() => write.promise);
	await tick();
	await c.leg.checkNow();
	const state = c.leg.getState();
	write.reject(new Error('old write'));
	await tick();
	expect(c.leg.getState()).toBe(state);
});

it.each(['success', 'rejection'])('holds only the awaited capture through %s', async (outcome) => {
	const c = setup(true, { status: 'authorized' });
	const pending = deferred<{ data: unknown }>();
	c.queue('capture', () => {
		expect(holdLiveTab).toHaveBeenCalledWith('payment');
		expect(releaseHold).not.toHaveBeenCalled();
		return pending.promise;
	});
	const capture = c.leg.capture();
	expect(holdLiveTab).toHaveBeenCalledTimes(1);
	expect(releaseHold).not.toHaveBeenCalled();
	if (outcome === 'success') pending.resolve({ data: response({ status: 'captured' }) });
	else pending.reject(new Error('transport failed'));
	await capture;
	expect(releaseHold).toHaveBeenCalledTimes(1);
	c.leg.dispose();
});

it('abandons capture silently when the registry refuses ownership', async () => {
	const c = setup(true, { status: 'authorized' });
	jest.mocked(log.info).mockClear();
	jest.mocked(holdLiveTab).mockImplementation(() => {
		throw new LiveTabNotOwnedError();
	});
	await c.leg.capture();
	await c.leg.capture();
	await tick(10000);
	expect(c.calls).toHaveLength(0);
	expect(c.leg.getState().error).toBeNull();
	expect(log.info).toHaveBeenCalledTimes(1);
	expect(log.info).toHaveBeenCalledWith(expect.any(String), {
		code: ERROR_CODES.REGISTER_TAB_NOT_OWNED,
	});
	c.leg.dispose();
});

// A capture or void the poster refuses before it left the till is no outcome: the authorization
// stays live on the store, and the journal holds no command for it. The leg stays live with the
// reason and retries, never finishing on a fabricated failed row.
it.each(['order_changed', 'preflight_failed'] as const)(
	'a capture or void the poster refuses with %s keeps the authorized leg live and retries',
	async (reason) => {
		const refused = () => new MoneyCommandError(reason, { id: 'command', sentAt: null } as never);
		const c = setup(true);
		c.answer('status', response({ status: 'authorized' }));
		c.fail('capture', refused());
		c.answer('status', response({ status: 'authorized' }));
		c.answer('capture', response({ status: 'captured' }));
		await tick();
		expect(c.count('capture')).toBe(1);
		expect(c.leg.getState()).toMatchObject({ outcome: null, error: { code: reason } });
		expect(c.leg.getState().phase).not.toBe('final');
		expect(c.mirror).not.toHaveBeenCalledWith(
			expect.objectContaining({ payment: expect.objectContaining({ status: 'failed' }) })
		);
		await tick(60_000);
		expect(c.count('capture')).toBe(2);
		expect(c.leg.getState()).toMatchObject({ phase: 'final', outcome: 'captured' });

		const v = setup(true);
		v.answer('status', response({ status: 'pending' }));
		await tick();
		v.fail('void', refused());
		v.answer('void', response({ status: 'voided' }));
		await v.leg.cancel();
		expect(v.count('void')).toBe(1);
		expect(v.leg.getState()).toMatchObject({
			phase: 'cancelling',
			cancelRequested: true,
			outcome: null,
			error: { code: reason },
		});
		await tick(60_000);
		expect(v.count('void')).toBe(2);
		expect(v.leg.getState()).toMatchObject({ phase: 'final', outcome: 'voided' });
	}
);

// A retirement that fails is retried by the finality gate itself, never left to the next status
// read: the store reads not-found for an intent that never ran, and the leg would end failed with
// the intent still journaled for a recovery to re-send.
it('a failed retirement is retried by the finality gate, not abandoned to a status read', async () => {
	const retire = jest
		.fn(async (_kind: 'intent', _target: string) => undefined)
		.mockRejectedValueOnce(new Error('journal write failed'));
	const c = setup(false, {}, { retire });
	const intent = deferred<{ data: unknown }>();
	c.queue('intent', () => intent.promise);
	c.fail('void', refusal(404, 'wcpos_payment_not_found'));
	c.fail('status', refusal(404, 'wcpos_payment_not_found'));
	const started = c.leg.start();
	await c.leg.cancel();
	intent.reject(refusal(409, 'wcpos_payment_locked', { retry_after: 1 }));
	await started;
	await tick(0);
	expect(c.leg.getState()).toMatchObject({ outcome: null, error: { code: 'retire_failed' } });
	await tick(RETIRE_RETRY_MS);
	expect(retire).toHaveBeenCalledTimes(2);
	expect(c.count('status')).toBe(0);
	expect(c.leg.getState()).toMatchObject({ phase: 'final', outcome: 'voided' });
});

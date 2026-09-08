import type { OrderPaymentSummary, PaymentRow } from '@wcpos/order-math';

import { createServerLeg } from './server-leg';

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
function setup(resume = false, changes: Partial<PaymentRow> = {}) {
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
it('cancel twice issues one void, invalidates stale polls and a late capture wins', async () => {
	const c = setup(true);
	const old = deferred<{ data: unknown }>();
	c.queue('status', () => old.promise);
	await tick();
	const cancel = deferred<{ data: unknown }>();
	c.queue('void', () => cancel.promise);
	const cancelling = c.leg.cancel();
	void c.leg.cancel();
	expect(c.leg.getState()).toMatchObject({ phase: 'cancelling', cancelRequested: true });
	expect(c.count('void')).toBe(1);
	await c.leg.checkNow();
	expect(c.count('status')).toBe(1);
	old.resolve({ data: response({ status: 'failed' }) });
	await tick();
	expect(c.mirror).not.toHaveBeenCalled();
	cancel.resolve({ data: response({ void_requested_at: new Date().toISOString() }) });
	await cancelling;
	expect(c.leg.getState()).toMatchObject({ phase: 'polling', releaseAvailable: true });
	c.answer('status', response({ status: 'captured' }));
	await tick(2000);
	expect(c.leg.getState().outcome).toBe('captured');
	expect(c.leg.getState().clientEvents.map((e) => e.message)).toContain(
		'Cancel requested by cashier'
	);
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

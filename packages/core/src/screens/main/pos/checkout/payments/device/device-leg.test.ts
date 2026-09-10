import { createDeviceLeg } from './device-leg';
import { method, row } from './fixtures.test-utils';

import type {
	CollectResult,
	PaymentDriver,
} from '../../../../../../services/payment-drivers/types';

const approved: CollectResult = {
	outcome: 'captured',
	provider_refs: { payment_intent: 'pi', nested: { opaque: true } },
	receipt: { brand: 'visa' },
	amount: '11.00',
	transport: 'bluetooth',
};
function deferred<T>() {
	let resolve!: (v: T) => void;
	const promise = new Promise<T>((yes) => {
		resolve = yes;
	});
	return { promise, resolve };
}
function setup(offline = false, resume = false, missing?: 'driver' | 'method') {
	const collection = deferred<CollectResult>();
	const driver: PaymentDriver = {
		provider: 'simulated',
		capabilities: { discovery: 'harness', cancel: 'app', refund: false },
		availability: () => ({ available: true }),
		status$: { get: () => ({ connection: 'connected', reader: null }), subscribe: () => () => {} },
		collect: jest.fn(() => collection.promise),
		cancel: jest.fn(async () => {}),
	};
	const post = jest.fn(async (url: string, _body: unknown): Promise<{ data: unknown }> => ({
		data: {
			payment: {
				...row,
				status: url.endsWith('/capture')
					? 'captured'
					: url.endsWith('/void')
						? 'voided'
						: 'pending',
			},
			handoff: { token: 'opaque' },
		},
	}));
	const mirror = jest.fn(async (_value: unknown) => {});
	const patchAndEnqueue = jest.fn(async (_row: unknown): Promise<void> => {});
	const onFinal = jest.fn();
	const leg = createDeviceLeg(
		{
			post,
			get: (url) => post(url, undefined),
			driver: missing === 'driver' ? undefined : driver,
			mirror,
			patchAndEnqueue,
			now: Date.now,
			setTimeout,
			clearTimeout,
			onFinal,
		},
		{
			orderId: 42,
			row,
			method: missing === 'method' ? undefined : method,
			transport: 'bluetooth',
			offline,
			tipEligibleMinor: 1000,
			resume,
		}
	);
	return { leg, driver, post, mirror, patchAndEnqueue, onFinal, collection };
}
beforeEach(() => {
	jest.useFakeTimers();
	jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
});
afterEach(() => {
	jest.clearAllTimers();
	jest.useRealTimers();
});
const tick = () => jest.advanceTimersByTimeAsync(0);
it('mirrors intent before collect and sends exactly the driver context for server verification', async () => {
	const c = setup();
	const start = c.leg.start();
	await tick();
	expect(c.post).toHaveBeenCalledWith('orders/42/payments/leg/intent', {
		payment: row,
		context: { transport: 'bluetooth' },
	});
	expect(c.mirror).toHaveBeenCalled();
	expect(c.driver.collect).toHaveBeenCalledWith({
		row,
		method,
		transport: 'bluetooth',
		handoff: { token: 'opaque' },
		offline: false,
		tipEligibleMinor: 1000,
	});
	c.collection.resolve(approved);
	await start;
	expect(c.post).toHaveBeenLastCalledWith('orders/42/payments/leg/capture', {
		context: {
			provider_refs: approved.provider_refs,
			receipt: approved.receipt,
			transport: approved.transport,
			amount: approved.amount,
		},
	});
	expect(c.leg.getState()).toMatchObject({ phase: 'final', outcome: 'captured' });
	expect(c.onFinal).toHaveBeenCalledTimes(1);
});
it.each(['declined', 'cancelled'] as const)(
	'voids %s without asserting a capture',
	async (outcome) => {
		const c = setup();
		const start = c.leg.start();
		await tick();
		c.collection.resolve({ ...approved, outcome, failure_reason: 'card_declined' });
		await start;
		expect(c.post).toHaveBeenLastCalledWith('orders/42/payments/leg/void', {
			reason: outcome === 'declined' ? 'card_declined' : 'cashier',
		});
		expect(c.leg.getState().outcome).toBe(outcome === 'declined' ? 'failed' : 'voided');
	}
);
it('does not report paid from a successful HTTP response with a pending row', async () => {
	const c = setup();
	c.post.mockResolvedValue({ data: { payment: row } });
	const start = c.leg.start();
	await tick();
	c.collection.resolve(approved);
	await start;
	expect(c.leg.getState().outcome).toBeNull();
	expect(c.leg.getState().captureFailed).toBe(true);
});
it('retries capture using the same driver result, never collecting twice', async () => {
	const c = setup();
	const start = c.leg.start();
	await tick();
	c.post.mockRejectedValueOnce({
		response: {
			data: {
				code: 'wcpos_provider_error',
				message: 'Try again',
				data: { payment: { ...row, status: 'authorized' } },
			},
		},
	});
	c.collection.resolve(approved);
	await start;
	expect(c.leg.getState()).toMatchObject({
		outcome: null,
		captureFailed: true,
		row: { status: 'authorized' },
	});
	await c.leg.capture();
	expect(c.leg.getState().outcome).toBe('captured');
	expect(c.driver.collect).toHaveBeenCalledTimes(1);
});
it('cancel waits for collection; a late successful result is still verified', async () => {
	const c = setup();
	const start = c.leg.start();
	await tick();
	await c.leg.cancel();
	expect(c.driver.cancel).toHaveBeenCalledTimes(1);
	expect(c.leg.getState().outcome).toBeNull();
	c.collection.resolve(approved);
	await start;
	expect(c.leg.getState().outcome).toBe('captured');
	expect(c.post.mock.calls.some(([url]) => url.endsWith('/void'))).toBe(false);
});
it('cancel during intent waits for intent, then voids without starting a collection', async () => {
	const c = setup();
	const intent = deferred<{ data: unknown }>();
	c.post.mockImplementationOnce(() => intent.promise);
	const start = c.leg.start();
	await c.leg.cancel();
	expect(c.post).toHaveBeenCalledTimes(1);
	intent.resolve({ data: { payment: row } });
	await start;
	expect(c.driver.collect).not.toHaveBeenCalled();
	expect(c.leg.getState().outcome).toBe('voided');
});
it('cancel during confirmation does not race a void against the capture', async () => {
	const c = setup();
	const start = c.leg.start();
	await tick();
	const capture = deferred<{ data: unknown }>();
	c.post.mockImplementationOnce(() => capture.promise);
	c.collection.resolve(approved);
	await tick();
	await c.leg.cancel();
	expect(c.driver.cancel).not.toHaveBeenCalled();
	capture.resolve({ data: { payment: { ...row, status: 'captured' } } });
	await start;
	expect(c.leg.getState().outcome).toBe('captured');
});
it('deadline requests cancellation at 300 seconds, and waits for the reader', async () => {
	const c = setup();
	const start = c.leg.start();
	await tick();
	await jest.advanceTimersByTimeAsync(300000);
	expect(c.driver.cancel).toHaveBeenCalledTimes(1);
	expect(c.leg.getState()).toMatchObject({ deadlineHandled: true, outcome: null });
	c.collection.resolve({ ...approved, outcome: 'cancelled' });
	await start;
	expect(c.leg.getState().outcome).toBe('voided');
});
it('on-device cancellation only publishes the request', async () => {
	const c = setup();
	c.driver.capabilities.cancel = 'on_device';
	const start = c.leg.start();
	await tick();
	await c.leg.cancel();
	expect(c.driver.cancel).not.toHaveBeenCalled();
	expect(c.leg.getState().cancelRequested).toBe(true);
	c.collection.resolve({ ...approved, outcome: 'cancelled' });
	await start;
});
it('queues offline authorization before telling the till it is paid', async () => {
	const c = setup(true);
	const write = deferred<void>();
	c.patchAndEnqueue.mockImplementationOnce(() => write.promise);
	const start = c.leg.start();
	c.collection.resolve({
		...approved,
		outcome: 'authorized',
		provider_refs: { payment_intent: null },
		receipt: { brand: 'visa' },
		amount: '10.00',
	});
	await tick();
	expect(c.post).not.toHaveBeenCalled();
	expect(c.leg.getState().outcome).toBeNull();
	expect(c.patchAndEnqueue).toHaveBeenCalledWith(
		expect.objectContaining({
			status: 'authorized',
			recorded_offline: true,
			provider_refs: { payment_intent: null },
		})
	);
	write.resolve();
	await start;
	expect(c.leg.getState()).toMatchObject({ outcome: 'captured', row: { status: 'authorized' } });
});
it('a failed offline write stays held for retry without a second collect', async () => {
	const c = setup(true);
	c.patchAndEnqueue.mockRejectedValueOnce(new Error('disk'));
	const start = c.leg.start();
	c.collection.resolve({
		...approved,
		outcome: 'authorized',
		provider_refs: { payment_intent: null },
	});
	await start;
	expect(c.leg.getState()).toMatchObject({ outcome: null, captureFailed: true });
	await c.leg.capture();
	expect(c.leg.getState().outcome).toBe('captured');
	expect(c.driver.collect).toHaveBeenCalledTimes(1);
});
it('lost pending sessions fail locally without restarting the driver', async () => {
	const c = setup(false, true);
	await c.leg.start();
	expect(c.driver.collect).not.toHaveBeenCalled();
	expect(c.post).not.toHaveBeenCalled();
	expect(c.mirror).toHaveBeenCalledWith({
		payment: expect.objectContaining({
			status: 'failed',
			events: [expect.objectContaining({ message: 'Reader session was lost' })],
		}),
	});
	expect(c.leg.getState().outcome).toBe('failed');
});
it('stop ignores a late collect result', async () => {
	const c = setup();
	const start = c.leg.start();
	await tick();
	c.leg.stop();
	c.collection.resolve(approved);
	await start;
	expect(c.post).toHaveBeenCalledTimes(1);
	expect(c.onFinal).not.toHaveBeenCalled();
});
it('an SDK rejection is confirmed by void instead of leaving a dead cancel button', async () => {
	const c = setup();
	c.driver.collect = jest.fn(async () => {
		throw new Error('Reader disconnected');
	});
	await c.leg.start();
	expect(c.post).toHaveBeenLastCalledWith('orders/42/payments/leg/void', {
		reason: 'reader_error',
	});
	expect(c.leg.getState().phase).toBe('final');
});
it('offline reader-added tips cannot pay down the remaining sale balance', async () => {
	const c = setup(true);
	const start = c.leg.start();
	c.collection.resolve({
		...approved,
		outcome: 'authorized',
		provider_refs: { payment_intent: null },
	});
	await start;
	expect(c.patchAndEnqueue).toHaveBeenCalledWith(
		expect.objectContaining({ amount: '10.00', tip: null })
	);
});
it('resumes an online authorization by checking the server, never recollecting or claiming it paid', async () => {
	const c = setup(false, true);
	const leg = createDeviceLeg(
		{
			post: c.post,
			get: async () => ({ data: { payment: { ...row, status: 'authorized' } } }),
			driver: c.driver,
			mirror: c.mirror,
			patchAndEnqueue: c.patchAndEnqueue,
			now: Date.now,
			setTimeout,
			clearTimeout,
		},
		{
			orderId: 42,
			row: { ...row, status: 'authorized' },
			resume: true,
			method,
			transport: 'bluetooth',
			offline: false,
			tipEligibleMinor: null,
		}
	);
	await leg.start();
	expect(leg.getState()).toMatchObject({ outcome: null, captureFailed: true });
	expect(c.driver.collect).not.toHaveBeenCalled();
	await leg.cancel();
	expect(c.post).toHaveBeenLastCalledWith('orders/42/payments/leg/void', { reason: 'cashier' });
	expect(leg.getState().outcome).toBe('voided');
});

it.each(['driver', 'method'] as const)(
	'finalizes instead of rejecting when %s is missing',
	async (missing) => {
		const c = setup(false, false, missing);
		await expect(c.leg.start()).resolves.toBeUndefined();
		expect(c.leg.getState()).toMatchObject({
			phase: 'final',
			outcome: 'failed',
			error: { code: 'device_driver_missing' },
		});
		expect(c.onFinal).toHaveBeenCalledTimes(1);
		expect(c.post).not.toHaveBeenCalled();
	}
);

import { log } from '@wcpos/utils/logger';
import { MoneyCommandError } from '@wcpos/query';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';
import { holdLiveTab, LiveTabNotOwnedError } from '@wcpos/database/live-tab';
import { createLiveTab, holdLiveTab as holdWebTab } from '@wcpos/database/live-tab/live-tab.web';

import { RETIRE_RETRY_MS } from '../leg-finality';
import { createDeviceLeg, type DeviceLegState } from './device-leg';
import { method, row } from './fixtures.test-utils';

import type {
	CollectResult,
	PaymentDriver,
} from '../../../../../../services/payment-drivers/types';

jest.mock('@wcpos/database/live-tab', () => ({
	...jest.requireActual('@wcpos/database/live-tab'),
	holdLiveTab: jest.fn(),
}));
const releaseHold = jest.fn();
beforeEach(() => {
	jest.mocked(holdLiveTab).mockReset().mockReturnValue(releaseHold);
	releaseHold.mockClear();
});

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
function setup(
	offline = false,
	resume = false,
	missing?: 'driver' | 'method',
	pendingRow = row,
	retire?: (kind: 'intent', target: string) => Promise<void>
) {
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
			dp: 3,
			handoff: { token: 'opaque' },
		},
	}));
	const get = jest.fn(async (_url: string): Promise<{ data: unknown }> => ({
		data: { payment: row },
	}));
	const mirror = jest.fn(async (_value: unknown) => {});
	const patchAndEnqueue = jest.fn(async (_row: unknown): Promise<void> => {});
	const onFinal = jest.fn();
	const leg = createDeviceLeg(
		{
			post,
			get,
			driver: missing === 'driver' ? undefined : driver,
			mirror,
			patchAndEnqueue,
			now: Date.now,
			setTimeout,
			clearTimeout,
			onFinal,
			...(retire ? { retire } : {}),
		},
		{
			dp: 3,
			orderId: 42,
			row: pendingRow,
			method: missing === 'method' ? undefined : method,
			transport: 'bluetooth',
			offline,
			tipEligibleMinor: 1000,
			resume,
		}
	);
	return { leg, driver, post, get, mirror, patchAndEnqueue, onFinal, collection };
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
		dp: 3,
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
it('publishes the captured row and outcome together before checkout can unmount', async () => {
	const c = setup();
	const start = c.leg.start();
	await tick();
	const summary = {
		status: 'completed',
		total: '11.00',
		paid: '11.00',
		balance: '0.00',
		payment_method: 'device',
		payment_method_title: 'Reader',
	};
	c.post.mockResolvedValueOnce({
		data: { payment: { ...row, status: 'captured', tip: '1.00' }, order: summary },
	});
	const captured: DeviceLegState[] = [];
	c.leg.subscribe(() => {
		const state = c.leg.getState();
		if (state.row.status === 'captured') captured.push(state);
	});
	c.collection.resolve(approved);
	await start;
	expect(captured).toHaveLength(1);
	expect(captured[0]).toMatchObject({
		phase: 'final',
		outcome: 'captured',
		row: { tip: '1.00' },
		order: summary,
	});
	expect(c.mirror).toHaveBeenLastCalledWith({ payment: captured[0].row, order: summary });
	expect(c.onFinal).toHaveBeenCalledTimes(1);
});
it('reconciles a reported decline through status without voiding a failed row', async () => {
	const c = setup();
	const start = c.leg.start();
	await tick();
	c.get.mockResolvedValueOnce({
		data: { payment: { ...row, status: 'failed', failure_reason: 'card_declined' } },
	});
	c.collection.resolve({ ...approved, outcome: 'declined', failure_reason: 'card_declined' });
	await start;
	expect(c.get).toHaveBeenCalledWith('orders/42/payments/leg/status');
	expect(c.post).toHaveBeenCalledTimes(1);
	expect(c.leg.getState()).toMatchObject({
		phase: 'final',
		outcome: 'failed',
		failureReason: 'card_declined',
		row: { status: 'failed', failure_reason: 'card_declined' },
	});
});
it.each(['pending', 'authorized'] as const)(
	'voids a declined row only after status is still %s',
	async (status) => {
		const c = setup();
		const start = c.leg.start();
		await tick();
		const statusRead = deferred<{ data: unknown }>();
		c.get.mockReturnValueOnce(statusRead.promise);
		c.collection.resolve({ ...approved, outcome: 'declined', failure_reason: 'card_declined' });
		await tick();
		expect(c.get).toHaveBeenCalledWith('orders/42/payments/leg/status');
		expect(c.post).toHaveBeenCalledTimes(1);
		statusRead.resolve({ data: { payment: { ...row, status } } });
		await start;
		expect(c.post).toHaveBeenLastCalledWith('orders/42/payments/leg/void', {
			reason: 'card_declined',
		});
		expect(c.leg.getState()).toMatchObject({
			phase: 'final',
			outcome: 'failed',
			failureReason: 'card_declined',
			row: { status: 'voided' },
		});
	}
);
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
		if (outcome === 'cancelled') expect(c.get).not.toHaveBeenCalled();
	}
);
// Tap to Pay on a Pixel 10 (2026-10-13): the SDK's own collect window ran out with no card.
it('voids a reader time-out as timed_out, not as a cashier cancel', async () => {
	const c = setup();
	const start = c.leg.start();
	await tick();
	c.collection.resolve({ ...approved, outcome: 'cancelled', failure_reason: 'timed_out' });
	await start;
	expect(c.post).toHaveBeenLastCalledWith('orders/42/payments/leg/void', { reason: 'timed_out' });
	expect(c.leg.getState()).toMatchObject({ outcome: 'voided', failureReason: 'timed_out' });
});
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
it('a capture the store refuses as a repeat is settled from the status route', async () => {
	// Stripe's webhook landed before the till's capture: the row is already captured there.
	const c = setup();
	const start = c.leg.start();
	await tick();
	c.post.mockRejectedValueOnce({
		response: {
			data: { code: 'wcpos_invalid_transition', message: 'Payment transition is invalid.' },
		},
	});
	c.get.mockResolvedValueOnce({ data: { payment: { ...row, status: 'captured' } } });
	c.collection.resolve(approved);
	await start;
	expect(c.get).toHaveBeenCalledWith('orders/42/payments/leg/status');
	expect(c.leg.getState()).toMatchObject({ outcome: 'captured', captureFailed: false });
	expect(c.driver.collect).toHaveBeenCalledTimes(1);
});
it('a refused capture the store cannot explain stays held for retry', async () => {
	const c = setup();
	const start = c.leg.start();
	await tick();
	c.post.mockRejectedValueOnce({
		response: {
			data: { code: 'wcpos_invalid_transition', message: 'Payment transition is invalid.' },
		},
	});
	c.get.mockRejectedValueOnce(new Error('offline'));
	c.collection.resolve(approved);
	await start;
	expect(c.leg.getState()).toMatchObject({ outcome: null, captureFailed: true });
});
it('a cashier cancel that lands as the reader times out still voids as cashier', async () => {
	const c = setup();
	const start = c.leg.start();
	await tick();
	await c.leg.cancel();
	c.collection.resolve({
		outcome: 'cancelled',
		failure_reason: 'timed_out',
		provider_refs: {},
		receipt: {},
		amount: null,
		transport: 'bluetooth',
	});
	await start;
	expect(c.leg.getState().outcome).toBe('voided');
	const voidCall = c.post.mock.calls.find(([url]) => url.endsWith('/void'));
	expect(voidCall?.[1]).toEqual({ reason: 'cashier' });
});
it('a reader-side cancel with no reason is named cancelled at confirm, and voids as cashier', async () => {
	const c = setup();
	const start = c.leg.start();
	await tick();
	c.collection.resolve({
		outcome: 'cancelled',
		provider_refs: {},
		receipt: {},
		amount: null,
		transport: 'bluetooth',
	});
	await start;
	expect(c.leg.getState()).toMatchObject({ outcome: 'voided', failureReason: 'cancelled' });
	const voidCall = c.post.mock.calls.find(([url]) => url.endsWith('/void'));
	expect(voidCall?.[1]).toEqual({ reason: 'cashier' });
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
// The store refused the intent (wrong currency, unsupported reader…): nothing reached the reader,
// so the leg ends failed on the step it was on, carrying the store's words — and tries a void in
// case the store minted a row before refusing.
it.each([
	{ name: 'void succeeds', voidFails: false },
	{ name: 'void answers payment-not-found', voidFails: true },
])(
	'a refused intent ends the leg failed with the store’s message ($name)',
	async ({ voidFails }) => {
		const c = setup();
		c.post.mockRejectedValueOnce({
			response: {
				data: { code: 'unsupported_currency', message: 'GBP is not supported by this account' },
			},
		});
		if (voidFails)
			c.post.mockRejectedValueOnce({
				response: {
					status: 404,
					data: { code: 'wcpos_payment_not_found', message: 'Payment not found' },
				},
			});
		const states: DeviceLegState['phase'][] = [];
		c.leg.subscribe(() => states.push(c.leg.getState().phase));
		await c.leg.start();
		expect(c.driver.collect).not.toHaveBeenCalled();
		expect(c.post.mock.calls.map(([url]) => url.split('/').pop())).toEqual(['intent', 'void']);
		expect(c.leg.getState()).toMatchObject({
			phase: 'final',
			outcome: 'failed',
			captureFailed: false,
			error: { code: 'unsupported_currency', message: 'GBP is not supported by this account' },
		});
		// Never through confirming/capturing: the stepper must not advance past "sent".
		expect(states).not.toContain('confirming');
		expect(states).not.toContain('collecting');
		expect(c.onFinal).toHaveBeenCalledTimes(1);
	}
);
// The SDK was re-initialised under the leg (or the reader is gone): cancel throws and no result
// will ever come. After a grace period for a result that might have been seconds away, the leg
// voids the intent and finishes instead of waiting forever.
it.each(['cashier', 'deadline'] as const)(
	'when the reader cannot be cancelled (%s), the leg voids the intent and ends',
	async (who) => {
		const c = setup();
		jest.mocked(c.driver.cancel!).mockRejectedValueOnce(new Error('Stripe Terminal is not ready'));
		const start = c.leg.start();
		await tick();
		const cancelled = who === 'deadline' ? jest.advanceTimersByTimeAsync(120000) : c.leg.cancel();
		await tick();
		// Inside the grace period the leg still waits, and says why.
		expect(c.leg.getState()).toMatchObject({
			phase: 'collecting',
			cancelRequested: true,
			error: { message: 'Stripe Terminal is not ready' },
		});
		expect(c.post).toHaveBeenCalledTimes(1);
		await jest.advanceTimersByTimeAsync(30000);
		await cancelled;
		await tick();
		expect(c.post.mock.calls.map(([url]) => url.split('/').pop())).toEqual(['intent', 'void']);
		expect(c.post.mock.calls[1][1]).toEqual({ reason: who });
		expect(c.leg.getState()).toMatchObject({
			phase: 'final',
			outcome: 'voided',
			deadlineHandled: who === 'deadline',
			failureReason: 'reader_unresponsive',
		});
		// The hold around collect() is released with finality, not left to a collect that may
		// never answer.
		expect(releaseHold).toHaveBeenCalledTimes(1);
		// The orphaned collection resolving later changes nothing.
		c.collection.resolve(approved);
		await start;
		expect(c.leg.getState().outcome).toBe('voided');
		expect(c.post.mock.calls.some(([url]) => url.endsWith('/capture'))).toBe(false);
		expect(releaseHold).toHaveBeenCalledTimes(1);
	}
);
// Rule 9: the cancel "failed" because the reader already had the card — the result wins.
it('a result that arrives during the cancel grace period is captured, not voided', async () => {
	const c = setup();
	jest.mocked(c.driver.cancel!).mockRejectedValueOnce(new Error('CANCEL_FAILED'));
	const start = c.leg.start();
	await tick();
	const cancelled = c.leg.cancel();
	await tick();
	await jest.advanceTimersByTimeAsync(5000);
	c.collection.resolve(approved);
	await start;
	await jest.advanceTimersByTimeAsync(30000);
	await cancelled;
	expect(c.leg.getState().outcome).toBe('captured');
	expect(c.post.mock.calls.map(([url]) => url.split('/').pop())).toEqual(['intent', 'capture']);
});
// Offline there is no intent to void and the reader's stored payment forwards regardless.
it('offline, a cancel the reader refuses leaves the leg waiting for the reader', async () => {
	const c = setup(true);
	jest.mocked(c.driver.cancel!).mockRejectedValueOnce(new Error('CANCEL_FAILED'));
	const start = c.leg.start();
	await tick();
	await c.leg.cancel();
	await jest.advanceTimersByTimeAsync(60000);
	expect(c.leg.getState()).toMatchObject({
		phase: 'collecting',
		cancelRequested: false,
		outcome: null,
		error: { message: 'CANCEL_FAILED' },
	});
	c.collection.resolve({
		...approved,
		outcome: 'authorized',
		provider_refs: { payment_intent: null },
		amount: '10.00',
	});
	await start;
	expect(c.leg.getState().outcome).toBe('captured');
	expect(c.patchAndEnqueue).toHaveBeenCalledTimes(1);
	expect(c.post).not.toHaveBeenCalled();
});
it('the deadline does not claim a cancel the cashier already asked for', async () => {
	const c = setup();
	const start = c.leg.start();
	await tick();
	await c.leg.cancel();
	await jest.advanceTimersByTimeAsync(120000);
	expect(c.leg.getState().deadlineHandled).toBe(false);
	expect(c.driver.cancel).toHaveBeenCalledTimes(1);
	c.collection.resolve({ ...approved, outcome: 'cancelled' });
	await start;
	const voidCall = c.post.mock.calls.find(([url]) => url.endsWith('/void'));
	expect(voidCall?.[1]).toEqual({ reason: 'cashier' });
});
it('deadline requests cancellation at 120 seconds, and waits for the reader', async () => {
	const c = setup();
	const start = c.leg.start();
	await tick();
	await jest.advanceTimersByTimeAsync(119000);
	expect(c.driver.cancel).not.toHaveBeenCalled();
	await jest.advanceTimersByTimeAsync(1000);
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
			authorized_at_gmt: '2026-01-01T00:00:00.000Z',
			updated_at_gmt: '2026-01-01T00:00:00.000Z',
			provider_refs: { payment_intent: null },
		})
	);
	write.resolve();
	await start;
	expect(c.leg.getState()).toMatchObject({ outcome: 'captured', row: { status: 'authorized' } });
});
it('keeps the reader the row was minted for through an offline authorization', async () => {
	const c = setup(true, false, undefined, { ...row, provider_refs: { reader: 'sn-1' } });
	const start = c.leg.start();
	c.collection.resolve({
		...approved,
		outcome: 'authorized',
		provider_refs: { payment_intent: null },
	});
	await start;
	// The driver's refs describe the offline intent; the reader is a fact about the row.
	expect(c.leg.getState().row.provider_refs).toEqual({ reader: 'sn-1', payment_intent: null });
});
it('does not stamp an approval time for an offline decline', async () => {
	const pendingRow = { ...row };
	delete pendingRow.authorized_at_gmt;
	const c = setup(true, false, undefined, pendingRow);
	const start = c.leg.start();
	c.collection.resolve({ ...approved, outcome: 'declined', provider_refs: {} });
	await start;
	expect(c.leg.getState().row.status).toBe('failed');
	expect(c.leg.getState().row).not.toHaveProperty('authorized_at_gmt');
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
	// The retry happens later; the approval time is when the reader answered, not now.
	jest.setSystemTime(new Date('2026-01-01T00:05:00Z'));
	await c.leg.capture();
	expect(c.leg.getState().outcome).toBe('captured');
	expect(c.driver.collect).toHaveBeenCalledTimes(1);
	expect(c.patchAndEnqueue).toHaveBeenLastCalledWith(
		expect.objectContaining({
			authorized_at_gmt: '2026-01-01T00:00:00.000Z',
			updated_at_gmt: '2026-01-01T00:05:00.000Z',
		})
	);
});
it('a resumed pending row the store has captured is paid, not lost', async () => {
	const c = setup(false, true);
	c.get.mockResolvedValueOnce({ data: { payment: { ...row, status: 'captured' } } });
	await c.leg.start();
	expect(c.driver.collect).not.toHaveBeenCalled();
	expect(c.post).not.toHaveBeenCalled();
	expect(c.mirror).toHaveBeenCalledWith({
		payment: expect.objectContaining({ status: 'captured' }),
	});
	expect(c.leg.getState().outcome).toBe('captured');
});
it('a resumed pending row recorded offline asks no store and ends lost', async () => {
	const c = setup(false, true, undefined, { ...row, recorded_offline: true });
	await c.leg.start();
	expect(c.get).not.toHaveBeenCalled();
	expect(c.post).not.toHaveBeenCalled();
	expect(c.mirror).toHaveBeenCalledWith({
		payment: expect.objectContaining({ status: 'failed', failure_reason: 'reader_session_lost' }),
	});
	expect(c.leg.getState().outcome).toBe('failed');
});
it('lost pending sessions fail locally without restarting the driver', async () => {
	const c = setup(false, true);
	await c.leg.start();
	expect(c.driver.collect).not.toHaveBeenCalled();
	expect(c.post).not.toHaveBeenCalled();
	expect(c.get).toHaveBeenCalledWith('orders/42/payments/leg/status');
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
			dp: 3,
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

it.each(['success', 'rejection'])(
	'holds the awaited external capture through %s, not preparation',
	async (outcome) => {
		const c = setup();
		const pending = deferred<{ data: unknown }>();
		c.post.mockImplementation(async (url) => {
			if (!url.endsWith('/capture')) {
				expect(holdLiveTab).not.toHaveBeenCalled();
				return { data: { payment: row } };
			}
			expect(holdLiveTab).toHaveBeenLastCalledWith('payment');
			expect(releaseHold).not.toHaveBeenCalled(); // collection stays held through confirmation
			await pending.promise;
			if (outcome === 'rejection') throw new Error('transport failed');
			return { data: { payment: { ...row, status: 'captured' } } };
		});
		const start = c.leg.start();
		await tick();
		expect(holdLiveTab).toHaveBeenCalledTimes(1); // driver.collect can return captured
		expect(releaseHold).not.toHaveBeenCalled();
		c.collection.resolve(approved);
		await tick();
		expect(holdLiveTab).toHaveBeenCalledTimes(2);
		expect(releaseHold).not.toHaveBeenCalled();
		pending.resolve({ data: {} });
		await start;
		expect(releaseHold).toHaveBeenCalledTimes(2);
		c.leg.dispose();
	}
);

it('releases the collection hold when the reader rejects', async () => {
	const c = setup();
	jest.mocked(c.driver.collect).mockRejectedValueOnce(new Error('reader disconnected'));
	await c.leg.start();
	expect(holdLiveTab).toHaveBeenCalledTimes(1);
	expect(releaseHold).toHaveBeenCalledTimes(1);
	c.leg.dispose();
});

it.each(['success', 'rejection'])(
	'keeps a deferred takeover held until offline persistence %s',
	async (outcome) => {
		const c = setup(true);
		const write = deferred<void>();
		c.patchAndEnqueue.mockImplementationOnce(async () => {
			await write.promise;
			if (outcome === 'rejection') throw new Error('disk');
		});
		const channel = {
			onmessage: null as ((event: MessageEvent) => void) | null,
			postMessage: jest.fn(),
			close: jest.fn(),
		};
		const tab = createLiveTab({
			channel: () => channel,
			onHandover: async () => {},
			onUnavailable: jest.fn(),
			onError: jest.fn(),
		});
		// As in the gate, parking unmounts the payment service.
		tab.state$.subscribe((state) => {
			if (state.kind === 'parked') c.leg.stop();
		});
		jest.mocked(holdLiveTab).mockImplementation(holdWebTab);
		const start = c.leg.start();
		channel.onmessage?.(
			new MessageEvent('message', { data: { type: 'takeover-request', requestId: 'other-tab' } })
		);
		c.collection.resolve({ ...approved, outcome: 'authorized', provider_refs: {} });
		await tick();
		expect(c.patchAndEnqueue).toHaveBeenCalledTimes(1);
		expect(tab.getState().kind).toBe('live');
		write.resolve();
		await start;
		await tick();
		expect(tab.getState()).toEqual({ kind: 'parked', reason: 'another-tab-live' });
		tab.dispose();
		expect(c.leg.getState()).toMatchObject(
			outcome === 'success' ? { outcome: 'captured' } : { outcome: null, captureFailed: true }
		);
	}
);

it.each(['collect', 'capture'])(
	'abandons device %s silently when ownership is refused',
	async (stage) => {
		const c = setup(stage === 'collect');
		jest.mocked(log.info).mockClear();
		if (stage === 'collect')
			jest.mocked(holdLiveTab).mockImplementation(() => {
				throw new LiveTabNotOwnedError();
			});
		const start = c.leg.start();
		await tick();
		if (stage === 'capture') {
			c.post.mockClear(); // The preparation intent is not a capture.
			jest.mocked(holdLiveTab).mockImplementation(() => {
				throw new LiveTabNotOwnedError();
			});
			c.collection.resolve(approved);
		}
		await start;
		await c.leg.capture();
		expect(c.post).not.toHaveBeenCalled();
		if (stage === 'collect') expect(c.driver.collect).not.toHaveBeenCalled();
		expect(c.leg.getState().error).toBeNull();
		expect(log.info).toHaveBeenCalledTimes(1);
		expect(log.info).toHaveBeenCalledWith(expect.any(String), {
			code: ERROR_CODES.REGISTER_TAB_NOT_OWNED,
		});
		c.leg.dispose();
	}
);

// An intent the store never confirmed (a held lock, a transport failure) whose cleanup void then
// shows no live intent (voided, or not found) is retired from the journal before the leg is
// final: a later recovery must never re-send it into a pending device payment no reader collects.
it.each([
	['not found', 'not_found'],
	['voided', 'voided'],
])(
	'an unanswered intent whose cleanup void shows it %s is retired before the leg ends',
	async (_, voidAnswer) => {
		const retire = jest.fn(async () => undefined);
		const c = setup(false, false, undefined, row, retire);
		c.post.mockRejectedValueOnce({
			response: { status: 409, data: { code: 'wcpos_payment_locked', data: { status: 409 } } },
		});
		if (voidAnswer === 'not_found')
			c.post.mockRejectedValueOnce({
				response: { status: 404, data: { code: 'wcpos_payment_not_found', data: { status: 404 } } },
			});
		await c.leg.start();
		expect(retire).toHaveBeenCalledWith('intent', row.id);
		expect(c.leg.getState()).toMatchObject({ phase: 'final', outcome: 'failed' });
		expect(retire.mock.invocationCallOrder[0]).toBeLessThan(c.onFinal.mock.invocationCallOrder[0]);
	}
);

// A retirement whose journal write fails keeps the leg live and retries: a final leg with its
// intent still journaled would let recovery mint a pending device payment no reader collects.
it('a failed intent retirement keeps the leg live and retries before the leg ends', async () => {
	const retire = jest
		.fn(async (_kind: 'intent', _target: string) => undefined)
		.mockRejectedValueOnce(new Error('journal write failed'));
	const c = setup(false, false, undefined, row, retire);
	c.post.mockRejectedValueOnce({
		response: { status: 409, data: { code: 'wcpos_payment_locked', data: { status: 409 } } },
	});
	c.post.mockRejectedValueOnce({
		response: { status: 404, data: { code: 'wcpos_payment_not_found', data: { status: 404 } } },
	});
	const started = c.leg.start();
	await jest.advanceTimersByTimeAsync(0);
	expect(retire).toHaveBeenCalledTimes(1);
	expect(c.leg.getState().phase).not.toBe('final');
	expect(c.leg.getState().error?.code).toBe('retire_failed');
	expect(c.onFinal).not.toHaveBeenCalled();
	await jest.advanceTimersByTimeAsync(RETIRE_RETRY_MS);
	await started;
	expect(retire).toHaveBeenCalledTimes(2);
	expect(c.leg.getState()).toMatchObject({ phase: 'final', outcome: 'failed' });
	// The cashier reads the store's refusal of the intent, not the journal's bookkeeping.
	expect(c.leg.getState().error?.code).toBe('wcpos_payment_locked');
	expect(retire.mock.invocationCallOrder[1]).toBeLessThan(c.onFinal.mock.invocationCallOrder[0]);
});

// The cleanup void of an unanswered intent is re-sent until the store decides it. A void lost in
// transit, rate-limited, failing on the store, locked, or refused before it left the till proves
// nothing, so the leg stays live; once the void lands, the intent is retired and the leg ends.
it.each([
	['lost in transit', new Error('Network Error')],
	['rate-limited', { response: { status: 429, data: { code: 'rest_limited', data: {} } } }],
	['failing on the store', { response: { status: 503, data: {} } }],
	['locked', { response: { status: 409, data: { code: 'wcpos_payment_locked', data: {} } } }],
	['refused before it left the till', new MoneyCommandError('preflight_failed', {} as never)],
])('a cleanup void %s is re-sent until the store decides it', async (_, voidFailure) => {
	const retire = jest.fn(async (_kind: 'intent', _target: string) => undefined);
	const c = setup(false, false, undefined, row, retire);
	c.post.mockRejectedValueOnce(new Error('Network Error')); // the intent's answer is lost
	c.post.mockRejectedValueOnce(voidFailure);
	const started = c.leg.start();
	await jest.advanceTimersByTimeAsync(0);
	expect(c.leg.getState().phase).not.toBe('final');
	expect(retire).not.toHaveBeenCalled();
	await jest.advanceTimersByTimeAsync(RETIRE_RETRY_MS);
	await started;
	expect(c.post.mock.calls.map(([url]) => url.split('/').pop())).toEqual([
		'intent',
		'void',
		'void',
	]);
	expect(retire).toHaveBeenCalledWith('intent', row.id);
	expect(c.leg.getState()).toMatchObject({ phase: 'final', outcome: 'failed' });
});

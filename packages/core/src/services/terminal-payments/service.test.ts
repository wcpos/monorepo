import type { PaymentRow } from '@wcpos/order-math';

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
const input = { orderUuid: 'order', orderId: 42, orderNumber: '42', row, reader: 'reader' };
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
	const onCaptured = jest.fn();
	const options = { http, mirror, onCaptured };
	return {
		service: new TerminalPaymentsService(options),
		options,
		http,
		mirror,
		onCaptured,
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
	expect(c.onCaptured).toHaveBeenCalledTimes(1);
	expect(c.onCaptured).toHaveBeenCalledWith('order', c.summary);
	expect(c.service.resume(input)).toBe(leg);
	expect(c.service.begin({ ...input, row: { ...row, id: 'new-leg' } })).not.toBe(leg);
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
	expect(service.get('order')).toMatchObject({
		outcome: 'failed',
		row: { failure_reason: 'reader_session_lost' },
	});
	expect(c.http.post).not.toHaveBeenCalled();
	expect(service.readersInUse().size).toBe(0);
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

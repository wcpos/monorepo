/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react';

import type { EngineEvent } from '@wcpos/sync-engine';
import type { EngineRecord } from '@wcpos/query';
import { applyLocalPatch, patchEngineResident } from '@wcpos/query/mutations';
import { log } from '@wcpos/utils/logger';

import { useReopenOrder } from './use-reopen-order';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
const mockListeners = new Set<(event: EngineEvent) => void>();
let mockConnectivity: 'online' | 'offline' = 'online';
// A drain that answers the reopen with the server's refusal, as the engine would.
let mockOnDrain: () => void = () => {};
const mockEngine = {
	events: (cb: (event: EngineEvent) => void) => {
		mockListeners.add(cb);
		return () => mockListeners.delete(cb);
	},
	status: () => ({ authRequired: false }),
	statusChanges: (cb: (status: { connectivity: string }) => void) => {
		cb({ connectivity: mockConnectivity });
		return () => {};
	},
	sync: jest.fn(async () => {
		if (mockConnectivity === 'offline') return { status: 'skipped', reason: 'offline' };
		mockOnDrain();
		return { status: 'ran' };
	}),
	// The store's copy of order 42, adopted by a forced targeted refresh.
	require: jest.fn((_request: unknown) => ({
		ready: Promise.resolve({ action: 'fetched', appliedRecordIds: ['42'] }),
		release: () => {},
	})),
};
const emit = (event: EngineEvent) => [...mockListeners].forEach((cb) => cb(event));
jest.mock('@wcpos/query', () => ({
	...jest.requireActual('@wcpos/query'),
	useQueryRuntime: () => ({ engine: mockEngine }),
}));

jest.mock('@wcpos/query/mutations', () => ({
	...jest.requireActual('@wcpos/query/mutations'),
	applyLocalPatch: jest.fn(),
	patchEngineResident: jest.fn(),
}));
jest.mock('../../../contexts/app-state', () => ({
	useStoreSession: () => ({
		store: { id: 1 },
		wpCredentials: { id: 7 },
		site: { uuid: 'site-1' },
	}),
}));
jest.mock('../../../contexts/translations', () => ({
	useT: () => (key: string, args?: Record<string, unknown>) =>
		args ? `${key} ${JSON.stringify(args)}` : key,
}));
jest.mock('../../../services/register/use-register', () => ({ useRegister: () => null }));
jest.mock('../hooks/use-storage-health', () => ({
	useStorageMoneyPathGuard: () => ({ blockIfDegraded: () => false }),
}));

const order = {
	uuid: 'order-1',
	payload: { id: 42, status: 'completed', meta_data: [] },
} as unknown as EngineRecord<'orders'>;

beforeEach(() => {
	jest.clearAllMocks();
	// A once-value a test queued but never consumed must not leak into the next test.
	jest.mocked(applyLocalPatch).mockReset();
	mockListeners.clear();
	mockConnectivity = 'online';
	mockOnDrain = () => {};
});

const leg = {
	id: 'pay-1',
	method_id: 'stripe_terminal',
	amount: '12.50',
	currency: 'USD',
	status: 'authorized',
};
const legAmount = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(
	12.5
);
const paidOrder = {
	uuid: 'order-1',
	payload: {
		id: 42,
		status: 'completed',
		payment_method: 'stripe_terminal',
		payment_method_title: 'Card reader',
		meta_data: [{ key: '_wcpos_payments', value: { schema: 1, payments: [leg] } }],
	},
} as unknown as EngineRecord<'orders'>;
const moneyInMotion = (serverMessage?: string, reason = 'wcpos_money_in_motion'): EngineEvent => ({
	type: 'write-rejected',
	collection: 'orders',
	recordId: 'order-1',
	mutationId: 'm-reopen',
	status: 422,
	reason,
	...(serverMessage ? { serverMessage } : {}),
	data: { status: 422, payment_id: 'pay-1' },
});
const reportedToast = () =>
	jest.mocked(log.debug).mock.calls.find(([message]) => message === 'Reopen refused')?.[1]?.toast;

it('a reopen refused with wcpos_money_in_motion names the leg and offers Cancel payments', async () => {
	jest
		.mocked(applyLocalPatch)
		.mockResolvedValueOnce({ document: paidOrder, mutationId: 'm-reopen' } as never);
	mockOnDrain = () => emit(moneyInMotion());
	const { result } = renderHook(() => useReopenOrder(paidOrder));
	await act(async () => result.current.reopen());

	// Never a silent local pos-open: the till stays where it is and says why.
	expect(mockPush).not.toHaveBeenCalled();
	const toast = reportedToast();
	expect(toast).toMatchObject({
		type: 'error',
		title: `orders.reopen_money_in_motion {"method":"Card reader","amount":"${legAmount}"}`,
		action: { label: 'pos_checkout.cancel_payment' },
	});
	toast!.action!.onClick();
	expect(mockPush).toHaveBeenCalledWith({
		pathname: '/(app)/(drawer)/(pos)/(modals)/cart/[orderId]/checkout',
		params: { orderId: 'order-1' },
	});
});

it("prefers the server's own sentence for the leg", async () => {
	jest
		.mocked(applyLocalPatch)
		.mockResolvedValueOnce({ document: paidOrder, mutationId: 'm-reopen' } as never);
	mockOnDrain = () => emit(moneyInMotion('Card payment pay-1 is still being captured.'));
	const { result } = renderHook(() => useReopenOrder(paidOrder));
	await act(async () => result.current.reopen());
	expect(reportedToast()).toMatchObject({ title: 'Card payment pay-1 is still being captured.' });
});

it('a reopen refused for another reason says the store refused it and stays put', async () => {
	jest
		.mocked(applyLocalPatch)
		.mockResolvedValueOnce({ document: paidOrder, mutationId: 'm-reopen' } as never);
	mockOnDrain = () => emit(moneyInMotion('Not allowed.', 'rest_forbidden'));
	const { result } = renderHook(() => useReopenOrder(paidOrder));
	await act(async () => result.current.reopen());
	expect(mockPush).not.toHaveBeenCalled();
	expect(reportedToast()).toMatchObject({
		title: 'pos_checkout.order_refused',
		text2: 'Not allowed.',
		action: { label: 'pos_checkout.open_store_health' },
	});
});

it('an offline reopen stays queued and reports the refusal when it drains', async () => {
	mockConnectivity = 'offline';
	jest
		.mocked(applyLocalPatch)
		.mockResolvedValueOnce({ document: paidOrder, mutationId: 'm-reopen' } as never);
	const { result } = renderHook(() => useReopenOrder(paidOrder));
	await act(async () => result.current.reopen());
	// Offline the reopen is queued as before: the cashier goes on to the cart.
	expect(mockPush).toHaveBeenCalledWith({
		pathname: '/cart/[...orderId]',
		params: { orderId: ['order-1'] },
	});
	expect(reportedToast()).toBeUndefined();

	await act(async () => emit(moneyInMotion()));
	expect(reportedToast()).toMatchObject({
		title: `orders.reopen_money_in_motion {"method":"Card reader","amount":"${legAmount}"}`,
		action: { label: 'pos_checkout.cancel_payment' },
	});
});

it('does not navigate when the local write resolves undefined', async () => {
	jest.mocked(applyLocalPatch).mockResolvedValueOnce(undefined as never);
	const { result } = renderHook(() => useReopenOrder(order));
	await act(async () => result.current.reopen());
	expect(mockPush).not.toHaveBeenCalled();
});

it('keeps the local mutation failure toast and does not navigate', async () => {
	jest.mocked(applyLocalPatch).mockRejectedValueOnce(new Error('write failed'));
	const { result } = renderHook(() => useReopenOrder(order));
	await act(async () => result.current.reopen());
	expect(log.error).toHaveBeenCalledWith(
		'Local mutation failed',
		expect.objectContaining({ showToast: true })
	);
	expect(mockPush).not.toHaveBeenCalled();
});

it('navigates to the order cart after a successful local write', async () => {
	jest.mocked(applyLocalPatch).mockResolvedValueOnce({ document: order } as never);
	const { result } = renderHook(() => useReopenOrder(order));
	await act(async () => result.current.reopen());
	expect(mockPush).toHaveBeenCalledWith({
		pathname: '/cart/[...orderId]',
		params: { orderId: ['order-1'] },
	});
});

it('a second press while the reopen awaits the store is ignored and never bypasses the refusal', async () => {
	jest
		.mocked(applyLocalPatch)
		.mockResolvedValueOnce({ document: paidOrder, mutationId: 'm-reopen' } as never)
		// The resident already reads pos-open: a second write would queue nothing.
		.mockResolvedValueOnce({ document: paidOrder } as never);
	const { result } = renderHook(() => useReopenOrder(paidOrder));
	let first!: Promise<unknown>;
	await act(async () => {
		first = Promise.resolve(result.current.reopen());
	});
	expect(result.current.reopening).toBe(true);
	await act(async () => result.current.reopen());
	expect(mockPush).not.toHaveBeenCalled();
	expect(applyLocalPatch).toHaveBeenCalledTimes(1);

	await act(async () => {
		emit(moneyInMotion());
		await first;
	});
	expect(result.current.reopening).toBe(false);
	expect(mockPush).not.toHaveBeenCalled();
	expect(reportedToast()).toMatchObject({ action: { label: 'pos_checkout.cancel_payment' } });
});

// The resident as the optimistic reopen left it: pos-open, until the refusal is undone.
const reopenedPaidOrder = {
	...paidOrder,
	getLatest: () => ({ payload: { ...paidOrder.payload, status: 'pos-open' } }),
} as unknown as EngineRecord<'orders'>;

it("a refused reopen re-adopts the store's copy of the order", async () => {
	jest
		.mocked(applyLocalPatch)
		.mockResolvedValueOnce({ document: reopenedPaidOrder, mutationId: 'm-reopen' } as never);
	mockOnDrain = () => emit(moneyInMotion());
	const { result } = renderHook(() => useReopenOrder(reopenedPaidOrder));
	await act(async () => result.current.reopen());
	// Orders never auto-revert: the optimistic pos-open is replaced by the store's document,
	// adopted even under an equal stamp because the store's copy did not change.
	expect(mockEngine.require).toHaveBeenCalledWith(
		expect.objectContaining({
			collection: 'orders',
			kind: 'targeted-records',
			remoteIds: ['42'],
			forceRefresh: true,
			readopt: true,
		})
	);
	expect(patchEngineResident).not.toHaveBeenCalled();
	expect(reportedToast()).toMatchObject({ action: { label: 'pos_checkout.cancel_payment' } });
});

it("a refused reopen whose store copy cannot be fetched puts the order's status back locally", async () => {
	jest
		.mocked(applyLocalPatch)
		.mockResolvedValueOnce({ document: reopenedPaidOrder, mutationId: 'm-reopen' } as never);
	mockEngine.require.mockImplementationOnce(() => ({
		ready: Promise.reject(new Error('offline')),
		release: () => {},
	}));
	mockOnDrain = () => emit(moneyInMotion());
	const { result } = renderHook(() => useReopenOrder(reopenedPaidOrder));
	await act(async () => result.current.reopen());
	expect(patchEngineResident).toHaveBeenCalledWith(
		expect.objectContaining({
			collection: 'orders',
			recordId: 'order-1',
			changes: { status: 'completed' },
		})
	);
	expect(mockPush).not.toHaveBeenCalled();
});

it('a refusal that names an attempt resolves it through the awaiting-customer stamp', async () => {
	const invoicedOrder = {
		uuid: 'order-1',
		payload: {
			id: 42,
			status: 'pending',
			payment_method: 'wcpos_email_invoice',
			payment_method_title: 'Email invoice',
			meta_data: [
				{
					key: '_wcpos_awaiting_customer',
					value: {
						method_id: 'wcpos_email_invoice',
						destination: 'buyer@example.com',
						attempt_id: 'attempt-7',
						sent_at_gmt: '2026-10-08T10:00:00.000Z',
						cashier_id: 7,
					},
				},
			],
		},
	} as unknown as EngineRecord<'orders'>;
	jest
		.mocked(applyLocalPatch)
		.mockResolvedValueOnce({ document: invoicedOrder, mutationId: 'm-reopen' } as never);
	mockOnDrain = () =>
		emit({ ...moneyInMotion(), data: { status: 422, attempt_id: 'attempt-7' } } as EngineEvent);
	const { result } = renderHook(() => useReopenOrder(invoicedOrder));
	await act(async () => result.current.reopen());
	expect(reportedToast()).toMatchObject({
		title: 'orders.reopen_money_in_motion_attempt {"method":"Email invoice"}',
		action: { label: 'pos_checkout.cancel_payment' },
	});
});

it('an attempt the order does not hold falls back to the unnamed copy', async () => {
	jest
		.mocked(applyLocalPatch)
		.mockResolvedValueOnce({ document: paidOrder, mutationId: 'm-reopen' } as never);
	mockOnDrain = () =>
		emit({ ...moneyInMotion(), data: { status: 422, attempt_id: 'attempt-x' } } as EngineEvent);
	const { result } = renderHook(() => useReopenOrder(paidOrder));
	await act(async () => result.current.reopen());
	expect(reportedToast()).toMatchObject({ title: 'orders.reopen_money_in_motion_unknown' });
});

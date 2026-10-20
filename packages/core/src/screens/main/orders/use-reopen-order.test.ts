/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react';

import type { EngineEvent } from '@wcpos/sync-engine';
import type { EngineRecord } from '@wcpos/query';
import { applyLocalPatch } from '@wcpos/query/mutations';
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
};
const emit = (event: EngineEvent) => [...mockListeners].forEach((cb) => cb(event));
jest.mock('@wcpos/query', () => ({
	...jest.requireActual('@wcpos/query'),
	useQueryRuntime: () => ({ engine: mockEngine }),
}));

jest.mock('@wcpos/query/mutations', () => ({
	...jest.requireActual('@wcpos/query/mutations'),
	applyLocalPatch: jest.fn(),
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
	await act(async () => result.current());

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
	await act(async () => result.current());
	expect(reportedToast()).toMatchObject({ title: 'Card payment pay-1 is still being captured.' });
});

it('a reopen refused for another reason says the store refused it and stays put', async () => {
	jest
		.mocked(applyLocalPatch)
		.mockResolvedValueOnce({ document: paidOrder, mutationId: 'm-reopen' } as never);
	mockOnDrain = () => emit(moneyInMotion('Not allowed.', 'rest_forbidden'));
	const { result } = renderHook(() => useReopenOrder(paidOrder));
	await act(async () => result.current());
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
	await act(async () => result.current());
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
	await act(async () => result.current());
	expect(mockPush).not.toHaveBeenCalled();
});

it('keeps the local mutation failure toast and does not navigate', async () => {
	jest.mocked(applyLocalPatch).mockRejectedValueOnce(new Error('write failed'));
	const { result } = renderHook(() => useReopenOrder(order));
	await act(async () => result.current());
	expect(log.error).toHaveBeenCalledWith(
		'Local mutation failed',
		expect.objectContaining({ showToast: true })
	);
	expect(mockPush).not.toHaveBeenCalled();
});

it('navigates to the order cart after a successful local write', async () => {
	jest.mocked(applyLocalPatch).mockResolvedValueOnce({ document: order } as never);
	const { result } = renderHook(() => useReopenOrder(order));
	await act(async () => result.current());
	expect(mockPush).toHaveBeenCalledWith({
		pathname: '/cart/[...orderId]',
		params: { orderId: ['order-1'] },
	});
});

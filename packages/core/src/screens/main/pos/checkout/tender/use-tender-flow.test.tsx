/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';

import type { EngineRecord } from '@wcpos/query';
import type { PaymentMethodDescriptor, PaymentRow } from '@wcpos/order-math';

import { useTenderFlow } from './use-tender-flow';

const mockRecordManualPayment = jest.fn();
const mockVoidPayments = jest.fn();
const mockCompleteOrderFlow = jest.fn();
const mockBlockIfDegraded = jest.fn();
const mockReplace = jest.fn();
const mockInfo = jest.fn();
const mockError = jest.fn();

const cash = {
	schema: 1,
	id: 'pos_cash',
	title: 'Cash',
	kind: 'cash',
	pos_enabled: true,
	order: 1,
	capture: { mode: 'manual', provider: null, hardware: null, webview_available: false },
	capabilities: {
		amount: { partial: true },
		change: true,
		refunds: { via: 'manual', partial: true },
		tips: 'none',
		offline: 'record',
		void: false,
	},
	defaults: { order_status: 'completed', rounding: null, open_drawer: true },
	provider_data: {},
} satisfies PaymentMethodDescriptor;

const card = {
	...cash,
	id: 'pos_card',
	title: 'Card',
	kind: 'card',
	order: 2,
	capabilities: { ...cash.capabilities, change: false },
} satisfies PaymentMethodDescriptor;

const noDriver = {
	...card,
	id: 'device_card',
	title: 'Device card',
	order: 3,
	capture: { ...card.capture, mode: 'device' },
} satisfies PaymentMethodDescriptor;

const methods = [cash, card, noDriver];
let mockPayload = { total: '92.95', meta_data: [] as { key: string; value: unknown }[] };
let mockMethods = methods;
let mockOnlineStatus = 'online-website-available';

jest.mock('../payments', () => ({
	useRecordManualPayment: () => mockRecordManualPayment,
	useVoidPayments: () => mockVoidPayments,
}));
jest.mock('../hooks/use-complete-order-flow', () => ({
	useCompleteOrderFlow: () => mockCompleteOrderFlow,
}));
jest.mock('../../../hooks/use-payment-methods', () => ({
	usePaymentMethods: () => ({
		methods: mockMethods,
		byId: new Map(mockMethods.map((method) => [method.id, method])),
		contract: 'payments-v1',
		loaded: true,
		unsupportedSchema: false,
	}),
}));
jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status: mockOnlineStatus }),
}));
jest.mock('../../../hooks/use-storage-health', () => ({
	useStorageMoneyPathGuard: () => ({ blockIfDegraded: mockBlockIfDegraded }),
}));
jest.mock('../../../../../contexts/app-state', () => ({
	useStoreSession: () => ({ store: { price_num_decimals: 2 } }),
}));
jest.mock('@wcpos/query', () => ({
	useRecordField: (_order: unknown, select: (record: unknown) => unknown) =>
		select({ payload: mockPayload }),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));
jest.mock('@wcpos/utils/logger', () => ({
	// The hook calls getLogger() at module scope, before this file's consts are
	// initialised — so the spies are read inside the call, not captured here.
	getLogger: () => ({
		info: (...args: unknown[]) => mockInfo(...args),
		error: (...args: unknown[]) => mockError(...args),
	}),
}));
jest.mock('../../../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));

const order = { uuid: 'order-1' } as EngineRecord<'orders'>;
const recorded = { kind: 'recorded', via: 'online' } as const;

function payment(overrides: Partial<PaymentRow> = {}): PaymentRow {
	return {
		id: 'payment-1',
		source: 'app',
		order_id: 42,
		method_id: 'pos_cash',
		provider: null,
		kind: 'cash',
		capture_mode: 'manual',
		transport: null,
		recorded_offline: false,
		amount: '50.00',
		currency: 'EUR',
		tendered: '50.00',
		change: '0.00',
		tip: null,
		status: 'captured',
		failure_reason: null,
		refunded_amount: '0.00',
		refunds: [],
		provider_refs: {},
		receipt: {},
		cashier_id: 7,
		store_id: 9,
		created_at_gmt: '2026-09-03T10:00:00.000Z',
		captured_at_gmt: '2026-09-03T10:00:00.000Z',
		updated_at_gmt: '2026-09-03T10:00:00.000Z',
		...overrides,
	};
}

describe('useTenderFlow', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockPayload = { total: '92.95', meta_data: [] };
		mockMethods = methods;
		mockOnlineStatus = 'online-website-available';
		mockBlockIfDegraded.mockReturnValue(false);
		mockRecordManualPayment.mockResolvedValue(recorded);
		mockVoidPayments.mockResolvedValue({ failed: [] });
		mockCompleteOrderFlow.mockResolvedValue(undefined);
	});

	it('pre-fills a picked method with the ledger-derived balance', () => {
		const { result } = renderHook(() => useTenderFlow(order));

		act(() => result.current.pickMethod('pos_cash'));

		expect(result.current.state).toMatchObject({
			view: 'amount',
			methodId: 'pos_cash',
			entryMinor: 9295,
		});
	});

	it('caps a cash overtender at the balance and records the tendered amount', async () => {
		const { result } = renderHook(() => useTenderFlow(order));
		act(() => {
			result.current.pickMethod('pos_cash');
		});
		act(() => result.current.dispatch({ type: 'set-entry', minor: 10000 }));

		expect(result.current.entryAppliedMinor).toBe(9295);
		expect(result.current.entryChangeMinor).toBe(705);

		await act(async () => result.current.takeTender());

		expect(mockRecordManualPayment).toHaveBeenCalledWith(order, cash, {
			amount: '92.95',
			tendered: '100.00',
		});
	});

	it('completes a fully paid online order after the record resolves', async () => {
		const { result } = renderHook(() => useTenderFlow(order));
		act(() => result.current.pickMethod('pos_cash'));
		act(() => result.current.dispatch({ type: 'set-entry', minor: 10000 }));

		await act(async () => result.current.takeTender());

		expect(mockCompleteOrderFlow).toHaveBeenCalledTimes(1);
		expect(mockCompleteOrderFlow).toHaveBeenCalledWith({ refresh: true });
	});

	it('returns to method selection without completing after a part payment', async () => {
		const { result } = renderHook(() => useTenderFlow(order));
		act(() => result.current.pickMethod('pos_cash'));
		act(() => result.current.dispatch({ type: 'set-entry', minor: 5000 }));

		await act(async () => result.current.takeTender());

		expect(mockRecordManualPayment).toHaveBeenCalledWith(order, cash, {
			amount: '50.00',
			tendered: '50.00',
		});
		expect(mockCompleteOrderFlow).not.toHaveBeenCalled();
		expect(result.current.state.view).toBe('select');
	});

	it('never records a card amount above the balance', async () => {
		const { result } = renderHook(() => useTenderFlow(order));
		act(() => result.current.pickMethod('pos_card'));
		act(() => result.current.dispatch({ type: 'set-entry', minor: 10000 }));

		await act(async () => result.current.takeTender());

		expect(mockRecordManualPayment).toHaveBeenCalledWith(order, card, {
			amount: '92.95',
			tendered: null,
		});
	});

	it('uses a split share as the next tender pre-fill', () => {
		const { result } = renderHook(() => useTenderFlow(order));
		act(() => result.current.dispatch({ type: 'set-split-share', minor: 4648 }));

		act(() => result.current.pickMethod('pos_cash'));

		expect(result.current.state.entryMinor).toBe(4648);
	});

	it('does not pick a disabled tile', () => {
		const { result } = renderHook(() => useTenderFlow(order));

		act(() => result.current.pickMethod('device_card'));

		expect(result.current.state.view).toBe('select');
	});

	it('voids live payments, resets tender state, and routes to the cart', async () => {
		const { result } = renderHook(() => useTenderFlow(order));
		act(() => result.current.dispatch({ type: 'request-cancel' }));

		await act(async () => result.current.cancelPayment());

		expect(mockVoidPayments).toHaveBeenCalledWith(order);
		expect(result.current.state).toMatchObject({ view: 'select', methodId: null });
		expect(mockReplace).toHaveBeenCalledWith({ pathname: '/cart' });
	});

	it('stays put when a provider reports a failed void', async () => {
		mockVoidPayments.mockResolvedValue({
			failed: [{ paymentId: 'payment-1', message: 'Provider refused' }],
		});
		const { result } = renderHook(() => useTenderFlow(order));
		act(() => result.current.dispatch({ type: 'request-cancel' }));

		await act(async () => result.current.cancelPayment());

		expect(result.current.state.view).toBe('cancel');
		expect(mockReplace).not.toHaveBeenCalled();
		expect(mockError).toHaveBeenCalledWith(
			'pos_checkout.void_failed',
			expect.objectContaining({ showToast: true })
		);
	});

	it('does not record when the storage money-path guard blocks the take', async () => {
		mockBlockIfDegraded.mockReturnValue(true);
		const { result } = renderHook(() => useTenderFlow(order));
		act(() => result.current.pickMethod('pos_cash'));

		await act(async () => result.current.takeTender());

		expect(mockBlockIfDegraded).toHaveBeenCalledWith('process-payment', {
			orderId: 'order-1',
		});
		expect(mockRecordManualPayment).not.toHaveBeenCalled();
	});

	it('re-derives rows and balance from the controlled order payload after rerender', () => {
		const { result, rerender } = renderHook(() => useTenderFlow(order));

		mockPayload = {
			total: '92.95',
			meta_data: [{ key: '_wcpos_payments', value: { schema: 1, payments: [payment()] } }],
		};
		rerender();

		expect(result.current.rows).toHaveLength(1);
		expect(result.current.liveRows).toHaveLength(1);
		expect(result.current.paidMinor).toBe(5000);
		expect(result.current.balanceMinor).toBe(4295);
	});
});

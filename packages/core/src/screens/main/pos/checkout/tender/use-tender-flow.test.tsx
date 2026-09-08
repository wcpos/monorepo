/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, fireEvent, render, renderHook } from '@testing-library/react';

import type { EngineRecord } from '@wcpos/query';
import type { PaymentMethodDescriptor, PaymentRow } from '@wcpos/order-math';

import {
	enterCheckout,
	enterReceipt,
	getCheckoutModeSnapshot,
	markOrderQueuedOffline,
	markOrderSaving,
	resetCheckoutMode,
	setTenderMethod,
	useCheckoutMode,
} from '../checkout-mode';
import { useLedgerView } from './use-ledger-view';
import { useTenderFlow } from './use-tender-flow';

import type {
	TerminalLegState,
	TerminalPaymentsService,
} from '../../../../../services/terminal-payments';

let mockRealService: TerminalPaymentsService | null = null;
let mockLeg: TerminalLegState | null = null;
const mockBegin = jest.fn();
const mockDismiss = jest.fn(() => {
	mockLeg = null;
});
const mockCancel = jest.fn();
const mockCapture = jest.fn();
const mockRelease = jest.fn();
jest.mock('../../../../../services/terminal-payments', () => ({
	getTerminalPaymentsService: () =>
		mockRealService ?? {
			subscribe: () => () => {},
			begin: mockBegin,
			dismiss: mockDismiss,
			get: () => mockLeg,
			readersInUse: () => new Map(),
			leg: () => ({ cancel: mockCancel, capture: mockCapture, release: mockRelease }),
		},
}));
jest.mock('../payments/server/use-terminal-leg', () => ({
	useTerminalLeg: () => {
		const React = jest.requireActual<typeof import('react')>('react');
		return React.useSyncExternalStore(
			mockRealService?.subscribe ?? (() => () => {}),
			() => mockRealService?.get('order-1') ?? mockLeg
		);
	},
}));
jest.mock('../payments/server/use-resume-terminal-legs', () => ({
	useResumeTerminalLegs: jest.fn(),
}));

let mockUuid = 0;
jest.mock('uuid', () => ({ v4: () => `payment-${++mockUuid}` }));
const mockRecordManualPayment = jest.fn();
const mockRecordOptions = jest.fn();
const mockVoidPayments = jest.fn();
const mockCompleteOrderFlow = jest.fn();
const mockLocalPatch = jest.fn();
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

const methods: PaymentMethodDescriptor[] = [cash, card, noDriver];
let mockPayload: {
	id?: number;
	number?: string;
	total: string;
	meta_data: { key: string; value: unknown }[];
} = { total: '92.95', meta_data: [] as { key: string; value: unknown }[] };
let mockMethodsLoaded = true;
let mockMethods: PaymentMethodDescriptor[] = methods;
let mockOnlineStatus = 'online-website-available';

jest.mock('../payments', () => ({
	useRecordManualPayment: (options: unknown) => {
		mockRecordOptions(options);
		return mockRecordManualPayment;
	},
	useVoidPayments: () => mockVoidPayments,
}));
jest.mock('../hooks/use-complete-order-flow', () => ({
	useCompleteOrderFlow: () => mockCompleteOrderFlow,
}));
jest.mock('../../../hooks/use-currency-format', () => ({
	useCurrencyFormat: () => ({ format: (value: number) => value.toFixed(2) }),
}));
jest.mock('../../../hooks/use-payment-methods', () => ({
	usePaymentMethods: () => ({
		methods: mockMethods,
		byId: new Map(mockMethods.map((method) => [method.id, method])),
		contract: 'payments-v1',
		loaded: mockMethodsLoaded,
		unsupportedSchema: false,
	}),
}));
jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status: mockOnlineStatus }),
}));
jest.mock('../../../hooks/use-storage-health', () => ({
	useStorageMoneyPathGuard: () => ({ blockIfDegraded: mockBlockIfDegraded }),
}));
jest.mock('../../../hooks/mutations/use-local-mutation', () => ({
	useLocalMutation: () => ({ localPatch: mockLocalPatch }),
}));
jest.mock('../../../../../contexts/app-state', () => ({
	useStoreSession: () => ({
		store: { price_num_decimals: 2, currency: 'EUR', id: 9 },
		wpCredentials: { id: 7 },
	}),
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
		mockSize = 'sm';
		resetCheckoutMode();
		jest.clearAllMocks();
		mockPayload = { total: '92.95', meta_data: [] };
		mockMethods = methods;
		mockMethodsLoaded = true;
		mockOnlineStatus = 'online-website-available';
		mockBlockIfDegraded.mockReturnValue(false);
		mockRecordManualPayment.mockResolvedValue(recorded);
		mockVoidPayments.mockResolvedValue({ failed: [] });
		mockCompleteOrderFlow.mockResolvedValue(undefined);
		mockLocalPatch.mockResolvedValue({ document: order });
	});

	it('publishes a picked method to the URL store', () => {
		const { result } = renderHook(() => useTenderFlow(order));
		act(() => result.current.pickMethod('pos_cash'));
		expect(getCheckoutModeSnapshot().tenderMethods.get(order.uuid)).toBe('pos_cash');
	});
	it('reopens the keypad for the method the store holds, prefilled with the balance', () => {
		setTenderMethod(order.uuid, 'pos_cash');
		const { result } = renderHook(() => useTenderFlow(order));
		expect(result.current.state).toMatchObject({
			view: 'amount',
			methodId: 'pos_cash',
			entryMinor: result.current.balanceMinor,
		});
		act(() => result.current.dispatch({ type: 'back' }));
		expect(result.current.state).toMatchObject({ view: 'select', methodId: null });
		expect(getCheckoutModeSnapshot().tenderMethods.has(order.uuid)).toBe(false);
	});
	it('keeps the keypad closed for a stored method the till does not offer', async () => {
		setTenderMethod(order.uuid, 'not_offered');
		const { result } = renderHook(() => useTenderFlow(order));
		expect(result.current.state.methodId).toBe('not_offered');
		expect(result.current.method).toBeNull();
		await act(async () => {
			await result.current.takeTender();
		});
		expect(mockRecordManualPayment).not.toHaveBeenCalled();
	});
	it('clears the published method once a leg is recorded', async () => {
		const { result } = renderHook(() => useTenderFlow(order));
		act(() => result.current.pickMethod('pos_cash'));
		act(() => result.current.dispatch({ type: 'set-entry', minor: 1000 }));
		await act(async () => {
			await result.current.takeTender();
		});
		expect(result.current.state.methodId).toBeNull();
		expect(getCheckoutModeSnapshot().tenderMethods.has(order.uuid)).toBe(false);
	});

	it('blocks method selection and recording while saving', async () => {
		markOrderSaving(order.uuid);
		const { result } = renderHook(() => useTenderFlow(order));
		expect(result.current.saveState).toEqual({ kind: 'saving' });
		act(() => result.current.pickMethod('pos_cash'));
		expect(result.current.state.view).toBe('select');
		// Exercise takeTender with a selected method so its guard is tested independently.
		act(() =>
			result.current.dispatch({
				type: 'pick-method',
				methodId: 'pos_cash',
				prefillMinor: 9295,
				readerId: null,
			})
		);
		await act(async () => result.current.takeTender());
		expect(mockRecordManualPayment).not.toHaveBeenCalled();
	});

	it('treats a save queued offline as offline for tender, even once connectivity is back', async () => {
		const onlineOnly = {
			...card,
			id: 'pos_online',
			title: 'Online only',
			order: 4,
			capabilities: { ...card.capabilities, offline: 'none' as const },
		};
		mockMethods = [cash, onlineOnly];
		markOrderSaving(order.uuid);
		markOrderQueuedOffline(order.uuid, 'm');
		const { result } = renderHook(() => useTenderFlow(order));
		expect(result.current.saveState).toEqual({ kind: 'queued-offline', mutationId: 'm' });
		expect(result.current.online).toBe(true);
		expect(result.current.tiles.find((tile) => tile.method.id === 'pos_online')).toMatchObject({
			disabled: true,
			reason: 'offline',
		});
		expect(mockRecordOptions).toHaveBeenLastCalledWith({ offline: true });
		act(() => result.current.pickMethod('pos_cash'));
		expect(result.current.state.view).toBe('amount');
		await act(async () => result.current.takeTender());
		expect(mockRecordManualPayment).toHaveBeenCalledTimes(1);
	});

	it.each(['online-website-available', 'offline'])(
		'keeps the read-only ledger aligned with tender flow (%s)',
		(status) => {
			mockOnlineStatus = status;
			const { result, rerender } = renderHook(() => ({
				flow: useTenderFlow(order),
				view: useLedgerView(order),
			}));
			expect(result.current.view.balanceMinor).toBe(9295);
			mockPayload.meta_data = [
				{ key: '_wcpos_payments', value: { schema: 1, payments: [payment()] } },
			];
			rerender();
			const { format, ...view } = result.current.view;
			expect(result.current.flow).toMatchObject(view);
			expect(view.paidMinor).toBe(5000);
			expect(format(view.balanceMinor)).toBe('42.95');
			expect(mockRecordManualPayment).not.toHaveBeenCalled();
			expect(mockVoidPayments).not.toHaveBeenCalled();
		}
	);

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

	it('completes a zero-balance order without recording a payment row', async () => {
		mockPayload = { total: '0.00', meta_data: [] };
		const { result } = renderHook(() => useTenderFlow(order));

		await act(async () => result.current.takeTender());

		expect(mockRecordManualPayment).not.toHaveBeenCalled();
		expect(mockLocalPatch).toHaveBeenCalledWith({
			document: order,
			data: { status: 'completed' },
		});
		expect(mockCompleteOrderFlow).toHaveBeenCalledWith({ refresh: false });
	});

	it('does not record an online-only method after connectivity drops', async () => {
		const onlineOnly = {
			...card,
			id: 'online_card',
			capabilities: { ...card.capabilities, offline: 'none' as const },
		};
		mockMethods = [onlineOnly];
		const { result, rerender } = renderHook(() => useTenderFlow(order));
		act(() => result.current.pickMethod('online_card'));

		mockOnlineStatus = 'offline';
		rerender();
		await act(async () => result.current.takeTender());

		expect(mockRecordManualPayment).not.toHaveBeenCalled();
		// Refusing silently would leave the cashier pressing a dead button.
		expect(mockInfo).toHaveBeenCalledWith('pos_checkout.needs_a_connection', {
			showToast: true,
		});
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

let mockSize = 'sm';
jest.mock('../../../../../contexts/theme', () => ({ useTheme: () => ({ screenSize: mockSize }) }));

it('leaves wide checkout mode without navigating after cancellation', async () => {
	jest.clearAllMocks();
	mockSize = 'lg';
	mockVoidPayments.mockResolvedValue({ failed: [] });
	enterCheckout(order.uuid);
	const { result } = renderHook(() => useTenderFlow(order));
	await act(async () => result.current.cancelPayment());
	expect(getCheckoutModeSnapshot().checkoutOrders.has(order.uuid)).toBe(false);
	expect(mockReplace).not.toHaveBeenCalled();
});

const terminal = {
	...card,
	id: 'terminal',
	capture: {
		...card.capture,
		mode: 'server',
		hardware: {
			discovery: 'server',
			readers: [{ id: 'reader', label: 'Front', status: 'online', default: true }],
			default_reader: 'reader',
			lock_to_default: false,
		},
	},
} satisfies PaymentMethodDescriptor;
function terminalState(changes: Partial<TerminalLegState> = {}): TerminalLegState {
	return {
		phase: 'polling',
		row: payment({ method_id: 'terminal', capture_mode: 'server', status: 'pending' }),
		outcome: null,
		cancelRequested: false,
		releaseAvailable: false,
		unstable: false,
		consecutiveErrors: 0,
		deadlineAt: 0,
		deadlineHandled: false,
		capturing: false,
		captureFailed: false,
		error: null,
		clientEvents: [],
		orderNumber: '42',
		reader: 'reader',
		...changes,
	};
}
describe('server tender', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockLeg = null;
		mockRealService = null;
		mockMethods = [terminal];
		mockOnlineStatus = 'online-website-available';
		mockPayload = { id: 42, number: '42', total: '92.95', meta_data: [] };
		mockBlockIfDegraded.mockReturnValue(false);
		mockBegin.mockImplementation(({ row }) => {
			mockLeg = terminalState({ row, phase: 'creating' });
		});
	});
	it('mints once, begins on the selected reader, and never records manually', async () => {
		const { result } = renderHook(() => useTenderFlow(order));
		act(() => result.current.pickMethod('terminal'));
		expect(result.current.state.readerId).toBe('reader');
		await act(async () => {
			await result.current.takeTender();
			await result.current.takeTender();
		});
		expect(mockBegin).toHaveBeenCalledTimes(1);
		expect(mockBegin).toHaveBeenCalledWith(
			expect.objectContaining({
				orderUuid: 'order-1',
				orderId: 42,
				orderNumber: '42',
				reader: 'reader',
				row: expect.objectContaining({
					amount: '92.95',
					status: 'pending',
					capture_mode: 'server',
					cashier_id: 7,
					store_id: 9,
				}),
			})
		);
		expect(mockRecordManualPayment).not.toHaveBeenCalled();
		expect(result.current.state.view).toBe('select');
	});
	it.each(['reader', 'order'] as const)('refuses Take without %s', async (missing) => {
		if (missing === 'order') delete mockPayload.id;
		const { result } = renderHook(() => useTenderFlow(order));
		act(() => result.current.pickMethod('terminal'));
		if (missing === 'reader')
			act(() => result.current.dispatch({ type: 'pick-reader', readerId: null }));
		await act(async () => result.current.takeTender());
		expect(mockBegin).not.toHaveBeenCalled();
		expect(mockInfo).toHaveBeenCalledWith(
			missing === 'reader'
				? 'pos_checkout.choose_a_terminal'
				: 'pos_checkout.order_not_on_store_yet',
			{ showToast: true }
		);
	});
	it('never preselects the first reader without a default', () => {
		mockMethods = [
			{
				...terminal,
				capture: {
					...terminal.capture,
					hardware: {
						...terminal.capture.hardware,
						default_reader: null,
						readers: [{ id: 'reader', label: 'Front', status: 'online', default: false }],
					},
				},
			},
		];
		const { result } = renderHook(() => useTenderFlow(order));
		act(() => result.current.pickMethod('terminal'));
		expect(result.current.state.readerId).toBeNull();
		act(() => result.current.pickReader('reader'));
		expect(result.current.state.readerId).toBe('reader');
	});
	it.each(['0.00', '42.95'])('dismisses captured and completes only at zero (%s)', (balance) => {
		mockLeg = terminalState({
			phase: 'final',
			outcome: 'captured',
			order: {
				status: 'completed',
				total: '92.95',
				paid: '92.95',
				balance,
				payment_method: 'terminal',
				payment_method_title: 'Card',
			},
		});
		const { result } = renderHook(() => useTenderFlow(order));
		expect(mockDismiss).toHaveBeenCalledWith('order-1');
		expect(result.current.state.view).toBe('select');
		expect(mockCompleteOrderFlow).toHaveBeenCalledTimes(balance === '0.00' ? 1 : 0);
		if (balance === '0.00') expect(mockCompleteOrderFlow).toHaveBeenCalledWith({ refresh: true });
	});
	it('retry preserves amount and reader but the next Take mints a new row', async () => {
		const { result, rerender } = renderHook(() => useTenderFlow(order));
		act(() => result.current.pickMethod('terminal'));
		act(() => result.current.dispatch({ type: 'set-entry', minor: 5000 }));
		await act(async () => result.current.takeTender());
		const first = mockBegin.mock.calls[0][0].row;
		act(() => result.current.dispatch({ type: 'set-tab', tab: 'legacy' }));
		mockLeg = terminalState({ row: first, phase: 'final', outcome: 'failed' });
		rerender();
		act(() => result.current.retryTerminalLeg());
		expect(result.current.state).toMatchObject({
			tab: 'payments',
			entryMinor: 5000,
			readerId: 'reader',
			methodId: 'terminal',
		});
		await act(async () => result.current.takeTender());
		expect(mockBegin).toHaveBeenCalledTimes(2);
		expect(mockBegin.mock.calls[1][0].row.id).not.toBe(first.id);
	});

	it.each([
		['provider_declined', 'Bank says no', 'Bank says no', false],
		['wcpos_amount_exceeds_balance', 'Too much', 'pos_checkout.payment_not_recorded', false],
		['provider_declined', 'Bank says no', null, true],
	] as const)(
		'toasts only initial Take refusals (%s, polling=%s)',
		async (code, message, expected, polling) => {
			const { result, rerender } = renderHook(() => useTenderFlow(order));
			act(() => result.current.pickMethod('terminal'));
			await act(async () => result.current.takeTender());
			if (polling) {
				mockLeg = { ...mockLeg!, phase: 'polling' };
				rerender();
			}
			mockLeg = { ...mockLeg!, phase: 'final', outcome: 'failed', error: { code, message } };
			rerender();
			if (expected)
				expect(mockError).toHaveBeenCalledWith(
					expected,
					expect.objectContaining({ showToast: true })
				);
			else expect(mockError).not.toHaveBeenCalled();
		}
	);
	it('routes actions to the existing leg', async () => {
		mockLeg = terminalState();
		const { result } = renderHook(() => useTenderFlow(order));
		await act(async () => {
			result.current.cancelTerminalLeg();
			result.current.releaseTerminalLeg();
			result.current.retryTerminalCapture();
		});
		expect(mockCancel).toHaveBeenCalledWith('cashier');
		expect(mockRelease).toHaveBeenCalledTimes(1);
		expect(mockCapture).toHaveBeenCalledTimes(1);
	});
	it('consumes full capture before the receipt host unmounts checkout', async () => {
		const { TerminalPaymentsService } = jest.requireActual<
			typeof import('../../../../../services/terminal-payments/service')
		>('../../../../../services/terminal-payments/service');
		resetCheckoutMode();
		mockRealService = new TerminalPaymentsService({
			http: {
				get: jest.fn(),
				post: async () => ({
					data: {
						payment: payment({ status: 'captured', capture_mode: 'server', method_id: 'terminal' }),
						order: {
							status: 'completed',
							total: '92.95',
							paid: '92.95',
							balance: '0.00',
							payment_method: 'terminal',
							payment_method_title: 'Card',
						},
					},
				}),
			},
			mirror: async () => {},
			onCaptured: () => enterReceipt('order-1'),
		});
		function Checkout() {
			const flow = useTenderFlow(order);
			return (
				<>
					<button onClick={() => flow.pickMethod('terminal')}>Pick</button>
					<button onClick={() => void flow.takeTender()}>Take</button>
				</>
			);
		}
		function Host() {
			return useCheckoutMode().receiptOrders.has('order-1') ? <span>Receipt</span> : <Checkout />;
		}
		const host = render(<Host />);
		fireEvent.click(host.getByRole('button', { name: 'Pick' }));
		await act(async () => fireEvent.click(host.getByRole('button', { name: 'Take' })));

		expect(getCheckoutModeSnapshot().receiptOrders.has('order-1')).toBe(true);
		expect(mockRealService.get('order-1')).toBeNull();
		expect(mockCompleteOrderFlow).toHaveBeenCalledWith({ refresh: true });
		mockRealService.stop();
		mockRealService = null;
	});
});

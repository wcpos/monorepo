/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, fireEvent, render, renderHook, waitFor } from '@testing-library/react';

import { withLedger } from '@wcpos/order-math';
import type { StoreDatabase } from '@wcpos/database';
import type { EngineRecord } from '@wcpos/query';
import type { PaymentMethodDescriptor, PaymentRow } from '@wcpos/order-math';

import { createSimulatedDriver } from '../../../../../services/payment-drivers/simulated-driver';
import { registerDriver } from '../../../../../services/payment-drivers/registry';
import { method as deviceMethod, row as deviceRow } from '../payments/device/fixtures.test-utils';
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
import { rememberedReaders } from './remembered-readers';

import type {
	TerminalLegState,
	TerminalPaymentsService,
} from '../../../../../services/terminal-payments';

let mockRealService: TerminalPaymentsService | null = null;
let mockLeg: TerminalLegState | null = null;
const mockReaderPreferences: Record<string, string> = {};
const mockReadersInUse = new Map<string, { orderUuid: string; orderNumber: string }>();
const mockReaderState = {
	get: (path: string) => mockReaderPreferences[path],
	set: async (path: string, modify: (value: string | undefined) => string) => {
		mockReaderPreferences[path] = modify(mockReaderPreferences[path]);
	},
};
const mockStoreDB = { addState: jest.fn(async () => mockReaderState) };
beforeEach(() => {
	for (const key of Object.keys(mockReaderPreferences)) delete mockReaderPreferences[key];
	mockReadersInUse.clear();
});
it('stores only the reader id, separately for each method', async () => {
	const preferences = rememberedReaders(mockStoreDB as unknown as StoreDatabase);
	expect(await preferences.get('terminal')).toBeNull();
	await preferences.set('terminal', 'b');
	await preferences.set('other', 'a');
	expect(await preferences.get('terminal')).toBe('b');
	expect(await preferences.get('other')).toBe('a');
	await preferences.set('terminal', 'c');
	expect(await preferences.get('terminal')).toBe('c');
	expect(mockStoreDB.addState).toHaveBeenCalledWith('terminal-readers_v1');
});
const mockPushDocument = jest.fn(async () => order);
jest.mock('../../../contexts/use-push-document', () => ({
	usePushDocument: () => mockPushDocument,
}));
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
			readersInUse: () => mockReadersInUse,
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
let mockUseRealManual = false;
const mockManualPost = jest.fn();
const mockManualMirror = jest.fn();
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
	meta_data: import('@wcpos/order-math').MetaDataEntry[];
	line_items?: {
		id?: number;
		name: string;
		quantity: number;
		total: string;
		total_tax?: string;
		meta_data?: { key: string; value: unknown }[];
	}[];
} = { total: '92.95', meta_data: [] as { key: string; value: unknown }[] };
let mockMethodsLoaded = true;
let mockMethods: PaymentMethodDescriptor[] = methods;
let mockOnlineStatus = 'online-website-available';
let mockTaxDisplayCart: 'incl' | 'excl' = 'excl';

jest.mock('../../../hooks/use-rest-http-client', () => ({
	useRestHttpClient: () => ({ post: mockManualPost }),
}));
jest.mock('../payments', () => ({
	useRecordManualPayment: (options: unknown) => {
		mockRecordOptions(options);
		if (mockUseRealManual)
			return jest
				.requireActual('../payments/use-record-manual-payment')
				.useRecordManualPayment(options);
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
	patchEngineResident: (input: unknown) => mockManualMirror(input),
}));
jest.mock('../../../../../contexts/app-state', () => ({
	useStoreSession: () => ({
		storeDB: mockStoreDB,
		site: { uuid: 'site' },
		store: {
			price_num_decimals: 2,
			currency: 'EUR',
			id: 9,
			tax_display_cart: mockTaxDisplayCart,
		},
		wpCredentials: { id: 7 },
	}),
}));
jest.mock('@wcpos/query', () => ({
	useQueryRuntime: () => ({}),
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

const order = {
	uuid: 'order-1',
	getLatest: () => ({ payload: mockPayload }),
} as EngineRecord<'orders'>;
const recorded = { kind: 'recorded', via: 'online', row: payment() } as const;

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
		mockTaxDisplayCart = 'excl';
		mockBlockIfDegraded.mockReturnValue(false);
		mockRecordManualPayment.mockResolvedValue(recorded);
		mockVoidPayments.mockResolvedValue({ failed: [] });
		mockCompleteOrderFlow.mockResolvedValue(undefined);
		mockLocalPatch.mockResolvedValue({ document: order });
	});
	it('preselects the first available method once, without recording', async () => {
		mockMethods = [noDriver, card];
		const { result, rerender } = renderHook(() => useTenderFlow(order));
		expect(result.current.state).toMatchObject({
			methodId: 'pos_card',
			entryMinor: 9295,
			entryDirty: false,
		});
		act(() => result.current.dispatch({ type: 'key', key: '2' }));
		rerender();
		expect(result.current.state.entryMinor).toBe(2);
		expect(mockRecordManualPayment).not.toHaveBeenCalled();
		await act(async () => {});
	});

	it('publishes a picked method to the URL store', async () => {
		const { result } = renderHook(() => useTenderFlow(order));
		act(() => result.current.pickMethod('pos_cash'));
		expect(getCheckoutModeSnapshot().tenderMethods.get(order.uuid)).toBe('pos_cash');
		await act(async () => {});
	});
	it('reopens the keypad for the method the store holds, prefilled with the balance', async () => {
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
		await act(async () => {});
	});
	it('falls back from a stored method the till does not offer', async () => {
		setTenderMethod(order.uuid, 'not_offered');
		const { result } = renderHook(() => useTenderFlow(order));
		expect(result.current.state).toMatchObject({
			view: 'amount',
			methodId: 'pos_cash',
			entryMinor: result.current.balanceMinor,
		});
		expect(result.current.method?.id).toBe('pos_cash');
		await act(async () => {});
	});
	it('keeps the chosen method for the next leg once one is recorded', async () => {
		const { result } = renderHook(() => useTenderFlow(order));
		act(() => result.current.pickMethod('pos_cash'));
		act(() => result.current.dispatch({ type: 'set-entry', minor: 1000 }));
		await act(async () => {
			await result.current.takeTender();
		});
		// The selector is always on screen now, so a leg never sends the cashier back to a menu.
		expect(result.current.state.methodId).toBe('pos_cash');
		expect(result.current.state.view).toBe('amount');
		expect(getCheckoutModeSnapshot().tenderMethods.get(order.uuid)).toBe('pos_cash');
	});

	it('blocks method selection and recording while saving', async () => {
		markOrderSaving(order.uuid);
		const { result } = renderHook(() => useTenderFlow(order));
		expect(result.current.saveState).toEqual({ kind: 'saving' });
		act(() => result.current.pickMethod('pos_card'));
		expect(result.current.state.methodId).toBe('pos_cash');
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
		async (status) => {
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
			await act(async () => {});
		}
	);

	it('treats cash above a planned share as change, not a bigger leg', async () => {
		const { result } = renderHook(() => useTenderFlow(order));
		act(() =>
			result.current.dispatch({
				type: 'set-plan',
				plan: { kind: 'even', ways: 2, from: 0 },
				balanceMinor: 9295,
			})
		);
		act(() => result.current.pickMethod('pos_cash'));
		act(() => result.current.dispatch({ type: 'set-entry', minor: 5000 }));
		expect(result.current.entryAppliedMinor).toBe(4648);
		expect(result.current.entryChangeMinor).toBe(352);
		await act(async () => {});
	});
	it('lets the last planned cash leg take the whole remaining balance', async () => {
		const { result, rerender } = renderHook(() => useTenderFlow(order));
		act(() =>
			result.current.dispatch({
				type: 'set-plan',
				plan: { kind: 'even', ways: 2, from: 0 },
				balanceMinor: 9295,
			})
		);
		act(() =>
			result.current.dispatch({
				type: 'pick-method',
				methodId: 'pos_cash',
				prefillMinor: 4648,
				readerId: null,
			})
		);
		mockPayload.meta_data = withLedger([], [payment({ amount: '10.00' })]);
		rerender();
		act(() =>
			result.current.dispatch({
				type: 'tender-recorded',
				rowsSinceFrom: [{ title: 'Cash', amountMinor: 1000 }],
				balanceMinor: result.current.balanceMinor,
			})
		);
		expect(result.current.planLabel).toBe('pos_checkout.payment_n_of');
		expect(result.current.entryAppliedMinor).toBe(result.current.balanceMinor);
		await act(async () => {});
	});
	it('pre-fills a picked method with the ledger-derived balance', async () => {
		const { result } = renderHook(() => useTenderFlow(order));

		act(() => result.current.pickMethod('pos_cash'));

		expect(result.current.state).toMatchObject({
			view: 'amount',
			methodId: 'pos_cash',
			entryMinor: 9295,
		});
		await act(async () => {});
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
			data: {
				status: 'completed',
				meta_data: expect.arrayContaining([{ key: '_wcpos_sale_counter', value: '1' }]),
			},
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
		expect(result.current.state.view).toBe('amount');
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

	it('uses a split share as the next tender pre-fill', async () => {
		const { result } = renderHook(() => useTenderFlow(order));
		act(() =>
			result.current.dispatch({
				type: 'set-plan',
				plan: { kind: 'even', ways: 2, from: 0 },
				balanceMinor: 9295,
			})
		);

		act(() => result.current.pickMethod('pos_cash'));

		expect(result.current.state.entryMinor).toBe(4648);
		await act(async () => {});
	});

	it('derives this payment, custom prefill, and quick amounts from the entry', async () => {
		const { result } = renderHook(() => useTenderFlow(order));
		expect(result.current.thisPaymentMinor).toBe(9295);
		act(() =>
			result.current.dispatch({
				type: 'set-plan',
				plan: { kind: 'even', ways: 2, from: 0 },
				balanceMinor: 9295,
			})
		);
		expect(result.current.thisPaymentMinor).toBe(4648);
		act(() => result.current.pickMethod('pos_cash'));
		expect(result.current.thisPaymentMinor).toBe(4648);
		expect(result.current.quickAmountsMinor).toEqual([4648, 5000]);
		act(() => result.current.dispatch({ type: 'set-entry', minor: 1200 }));
		expect(result.current.thisPaymentMinor).toBe(4648);
		expect(result.current.afterThisPaymentMinor).toBe(8095);
		expect(result.current.quickAmountsMinor).toEqual([1200, 1500, 2000, 5000]);
		act(() => result.current.dispatch({ type: 'back' }));
		act(() => result.current.dispatch({ type: 'arm-custom' }));
		act(() => result.current.pickMethod('pos_cash'));
		expect(result.current.state.entryMinor).toBe(0);
		expect(result.current.thisPaymentMinor).toBe(9295);
		await act(async () => {});
	});
	it('advances the plan only for a recorded leg and shows its actual ledger amount', async () => {
		const { result, rerender } = renderHook(() => useTenderFlow(order));
		act(() =>
			result.current.dispatch({
				type: 'set-plan',
				plan: { kind: 'even', ways: 2, from: 0 },
				balanceMinor: 9295,
			})
		);
		act(() => result.current.pickMethod('pos_cash'));
		mockRecordManualPayment.mockResolvedValueOnce({ kind: 'refused' });
		await act(async () => result.current.takeTender());
		expect(result.current.planLegs.filter((leg) => leg.state === 'done')).toHaveLength(0);
		act(() => result.current.pickMethod('pos_cash'));
		act(() => result.current.dispatch({ type: 'set-entry', minor: 5000 }));
		mockPayload.meta_data = [
			{
				key: '_wcpos_payments',
				value: { schema: 1, payments: [payment(), payment({ id: 'void', status: 'voided' })] },
			},
		];
		await act(async () => result.current.takeTender());
		rerender();
		expect(result.current.planLabel).toBe('pos_checkout.payment_n_of');
		expect(result.current.planLegs).toEqual([
			{ minor: 5000, state: 'done', title: 'Cash' },
			{ minor: 4295, state: 'now' },
		]);
		act(() => result.current.pickMethod('pos_cash'));
		expect(result.current.state.entryMinor).toBe(4295);
	});

	it('exposes item lines, derives their shared group and publishes completed badges for the ledger', async () => {
		mockPayload.total = '46.00';
		mockPayload.line_items = [
			{ id: 1, name: 'Scarf', quantity: 1, total: '22.00' },
			{ id: 2, name: 'Socks', quantity: 2, total: '6.00' },
		];
		const { result, rerender } = renderHook(() => useTenderFlow(order));
		expect(result.current.lines[1]).toEqual({ id: 2, name: 'Socks', quantity: 2, totalMinor: 600 });
		act(() =>
			result.current.dispatch({
				type: 'set-plan',
				plan: { kind: 'items', lineIds: [1], ways: 2, firstMinor: 2200, from: 0 },
				balanceMinor: 4600,
			})
		);
		expect(result.current.planLabel).toBe('pos_checkout.item_payment_n_of');
		const first = payment({ id: 'first', amount: '11.00', method_id: 'pos_card' });
		mockRecordManualPayment.mockImplementationOnce(async () => {
			mockPayload.meta_data = withLedger([], [first]);
			return { ...recorded, row: first };
		});
		act(() => result.current.pickMethod('pos_card'));
		await act(async () => result.current.takeTender());
		expect(result.current.linesPaidBy).toEqual({});
		const second = payment({ id: 'second', amount: '11.00' });
		mockRecordManualPayment.mockImplementationOnce(async () => {
			mockPayload.meta_data = withLedger([], [first, second]);
			return { ...recorded, row: second };
		});
		act(() => result.current.pickMethod('pos_cash'));
		await act(async () => result.current.takeTender());
		rerender();
		expect(result.current.planLabel).toBe('pos_checkout.rest_of_the_order');
		expect(result.current.thisPaymentMinor).toBe(2400);
		expect(result.current.planMore).toBe(true);
		expect(result.current.linesPaidBy).toEqual({ 1: ['Card', 'Cash'] });
		expect(getCheckoutModeSnapshot().linesPaidBy.get(order.uuid)).toEqual(
			result.current.linesPaidBy
		);
	});
	it('uses the tax-inclusive cart amount for item splits when configured', async () => {
		mockTaxDisplayCart = 'incl';
		mockPayload.line_items = [
			{ id: 1, name: 'Scarf', quantity: 1, total: '10.00', total_tax: '2.00' },
		];

		const { result } = renderHook(() => useTenderFlow(order));

		expect(result.current.lines[0]?.totalMinor).toBe(1200);
		await act(async () => {});
	});
	it('keeps the POS line UUID stable when an offline item receives its server ID', async () => {
		const line = {
			name: 'Scarf',
			quantity: 1,
			total: '10.00',
			meta_data: [{ key: '_woocommerce_pos_uuid', value: 'line-local' }],
		};
		mockPayload.line_items = [line];
		const { result, rerender } = renderHook(() => useTenderFlow(order));
		expect(result.current.lines[0]?.id).toBe('line-local');

		mockPayload.line_items = [{ ...line, id: 123 }];
		rerender();

		expect(result.current.lines[0]?.id).toBe('line-local');
		await act(async () => {});
	});
	it('restores an active split plan after an order-switch remount', async () => {
		const plan = { kind: 'even' as const, ways: 2, from: 0 };
		const first = renderHook(() => useTenderFlow(order));
		act(() => first.result.current.dispatch({ type: 'set-plan', plan, balanceMinor: 9295 }));
		first.unmount();

		const second = renderHook(() => useTenderFlow(order));

		expect(second.result.current.state).toMatchObject({ plan, entryMinor: 4648 });
		second.unmount();
	});
	it('does not pick a disabled tile', async () => {
		const { result } = renderHook(() => useTenderFlow(order));

		act(() => result.current.pickMethod('device_card'));

		expect(result.current.state.methodId).toBe('pos_cash');
		await act(async () => {});
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

	it('re-derives rows and balance from the controlled order payload after rerender', async () => {
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
		await act(async () => {});
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
function terminalState(
	changes: Partial<
		import('../payments/server/server-leg').ServerLegState & {
			orderNumber: string;
			reader: string | null;
		}
	> = {}
): TerminalLegState {
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
	it.each([false, true])('remembers a confirmed reader, unless now busy (%s)', async (busy) => {
		mockMethods = [
			{
				...terminal,
				capture: {
					...terminal.capture,
					hardware: {
						...terminal.capture.hardware,
						readers: [
							...terminal.capture.hardware.readers,
							{ id: 'b', label: 'Back', status: 'online', default: false },
						],
					},
				},
			},
		];
		const { result, unmount } = renderHook(() => useTenderFlow(order));
		await act(async () => result.current.pickMethod('terminal'));
		act(() => result.current.pickReader('b'));
		act(() => result.current.dispatch({ type: 'back' }));
		act(() => result.current.pickMethod('terminal'));
		expect(result.current.state.readerId).toBe('reader');
		act(() => result.current.pickReader('b'));
		await act(async () => result.current.takeTender());
		mockLeg = null;
		act(() => result.current.pickMethod('terminal'));
		expect(result.current.state.readerId).toBe('b');
		unmount();
		resetCheckoutMode();
		if (busy) mockReadersInUse.set('b', { orderUuid: 'other', orderNumber: '99' });
		const next = renderHook(() => useTenderFlow(order));
		await act(async () => {});
		act(() => next.result.current.pickMethod('terminal'));
		expect(next.result.current.state.readerId).toBe(busy ? 'reader' : 'b');
	});
	it('applies a late remembered read when no reader has been picked', async () => {
		mockReaderPreferences.terminal = 'reader';
		mockMethods = [
			{
				...terminal,
				capture: {
					...terminal.capture,
					hardware: {
						...terminal.capture.hardware,
						default_reader: null,
						readers: [{ ...terminal.capture.hardware.readers[0], default: false }],
					},
				},
			},
		];
		const { result } = renderHook(() => useTenderFlow(order));
		act(() => result.current.pickMethod('terminal'));
		expect(result.current.state.readerId).toBeNull();
		await waitFor(() => expect(result.current.state.readerId).toBe('reader'));
	});
	it('lets a remembered reader override the initially preselected default', async () => {
		mockReaderPreferences.terminal = 'b';
		mockMethods = [
			{
				...terminal,
				capture: {
					...terminal.capture,
					hardware: {
						...terminal.capture.hardware,
						readers: [
							...terminal.capture.hardware.readers,
							{ id: 'b', label: 'Back', status: 'online', default: false },
						],
					},
				},
			},
		];
		const { result } = renderHook(() => useTenderFlow(order));
		expect(result.current.state.readerId).toBe('reader');
		await waitFor(() => expect(result.current.state.readerId).toBe('b'));
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
		expect(result.current.state.view).toBe('amount');
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
	it('never preselects the first reader without a default', async () => {
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
		await act(async () => {});
	});
	it.each(['0.00', '42.95'])(
		'dismisses captured and completes only at zero (%s)',
		async (balance) => {
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
			expect(result.current.state.view).toBe('amount');
			expect(mockCompleteOrderFlow).toHaveBeenCalledTimes(balance === '0.00' ? 1 : 0);
			if (balance === '0.00') expect(mockCompleteOrderFlow).toHaveBeenCalledWith({ refresh: true });
			await act(async () => {});
		}
	);
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

describe('device tender', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockLeg = null;
		mockRealService = null;
		mockMethods = [deviceMethod];
		mockOnlineStatus = 'online-website-available';
		mockPayload = { id: 42, number: '42', total: '92.95', meta_data: [] };
		mockBlockIfDegraded.mockReturnValue(false);
		resetCheckoutMode();
		mockBegin.mockImplementation(() => {});
	});
	it('provides bootstrap and remembered-reader operations from the flow', async () => {
		const { TerminalPaymentsService } = jest.requireActual<
			typeof import('../../../../../services/terminal-payments/service')
		>('../../../../../services/terminal-payments/service');
		const post = jest.fn(async () => ({ data: { handoff: { token: 'connection' } } }));
		mockRealService = new TerminalPaymentsService({
			http: { post, get: jest.fn() },
			mirror: async () => {},
		});
		registerDriver(createSimulatedDriver());
		mockReaderPreferences.device = 'remembered';
		const { result } = renderHook(() => useTenderFlow(order));
		await act(async () => result.current.pickMethod('device'));
		expect(result.current.rememberedReaderId).toBe('remembered');
		await expect(result.current.bootstrapReader('bluetooth')).resolves.toEqual({
			token: 'connection',
			method_id: 'device',
		});
		expect(post).toHaveBeenCalledWith('payment-methods/device/bootstrap', {
			context: { transport: 'bluetooth' },
		});
		await act(async () => result.current.rememberReader('replacement'));
		expect(mockReaderPreferences.device).toBe('replacement');
		mockRealService.stop();
		mockRealService = null;
	});
	it('requires connection and routes device tender to the terminal service, not manual recording', async () => {
		const driver = createSimulatedDriver();
		registerDriver(driver);
		const { result } = renderHook(() => useTenderFlow(order));
		act(() => result.current.pickMethod(deviceMethod.id));
		await act(async () => result.current.takeTender());
		expect(mockBegin).not.toHaveBeenCalled();
		await act(async () => {
			await driver.connect!((await driver.discoverReaders!('bluetooth'))[0], null);
		});
		expect(result.current.deviceReady).toBe(true);
		await act(async () => result.current.takeTender());
		expect(mockBegin).toHaveBeenCalledWith(
			expect.objectContaining({
				method: deviceMethod,
				transport: 'bluetooth',
				offline: false,
				row: expect.objectContaining({ capture_mode: 'device', status: 'pending' }),
			})
		);
		expect(mockRecordManualPayment).not.toHaveBeenCalled();
	});
	it.each(['harness', 'sdk_ui'] as const)(
		'refuses a stale Take during connection and uses the live reader once connected (%s)',
		async (discovery) => {
			const driver = createSimulatedDriver();
			driver.capabilities.discovery = discovery;
			registerDriver(driver);
			const readers = await driver.discoverReaders!('bluetooth');
			await driver.connect!(readers[1], null);
			const { result } = renderHook(() => useTenderFlow(order));
			await act(async () => result.current.pickMethod(deviceMethod.id));
			const take = result.current.takeTender;
			let connecting!: Promise<void>;
			act(() => {
				connecting = driver.connect!(readers[0], null);
			});
			expect(result.current.deviceReady).toBe(false);
			await act(async () => take());
			expect(mockBegin).not.toHaveBeenCalled();
			expect(mockInfo).toHaveBeenCalledWith('pos_checkout.reader_connecting', { showToast: true });
			await act(async () => connecting);
			expect(result.current.deviceReady).toBe(true);
			await act(async () => take());
			expect(mockBegin).toHaveBeenCalledTimes(1);
			expect(mockBegin).toHaveBeenCalledWith(
				expect.objectContaining({
					reader: 'sim-approve',
					row: expect.objectContaining({ capture_mode: 'device', status: 'pending' }),
				})
			);
		}
	);
	it.each(['disconnected', 'discovering', 'updating', 'wrong-transport', 'no-reader'] as const)(
		'keeps Take unavailable and refuses minting with %s',
		async (state) => {
			const driver = createSimulatedDriver();
			driver.capabilities.discovery = 'sdk_ui';
			registerDriver(driver);
			const reader = (await driver.discoverReaders!('tap_to_pay'))[0];
			jest.spyOn(driver.status$, 'get').mockReturnValue({
				connection: state === 'wrong-transport' || state === 'no-reader' ? 'connected' : state,
				reader: state === 'no-reader' ? null : reader,
			});
			const { result } = renderHook(() => useTenderFlow(order));
			await act(async () => result.current.pickMethod(deviceMethod.id));
			expect(result.current.deviceReady).toBe(false);
			await act(async () => result.current.takeTender());
			expect(mockBegin).not.toHaveBeenCalled();
			expect(mockInfo).toHaveBeenCalledWith('pos_checkout.reader_disconnected', {
				showToast: true,
			});
		}
	);
	it('does not locally void an offline device authorization when abandoning a split sale', async () => {
		mockPayload = {
			...mockPayload,
			meta_data: withLedger([], [{ ...deviceRow, status: 'authorized', recorded_offline: true }]),
		};
		const { result } = renderHook(() => useTenderFlow(order));
		await act(async () => result.current.cancelPayment());
		expect(mockVoidPayments).not.toHaveBeenCalled();
		expect(mockInfo).toHaveBeenCalled();
	});
});
it('reopens a device tile via its queued transport when the selected transport needs a connection', async () => {
	jest.clearAllMocks();
	mockLeg = null;
	mockRealService = null;
	mockMethods = [deviceMethod];
	mockOnlineStatus = 'online-website-available';
	mockPayload = { id: 42, number: '42', total: '92.95', meta_data: [] };
	resetCheckoutMode();
	registerDriver(createSimulatedDriver());
	const { result, rerender } = renderHook(() => useTenderFlow(order));
	act(() => {
		result.current.pickMethod(deviceMethod.id);
	});
	act(() => {
		result.current.pickTransport!('tap_to_pay');
	});
	mockOnlineStatus = 'offline';
	rerender();
	expect(result.current.tiles[0].reason).toBe('offline');
	act(() => result.current.dispatch({ type: 'back' }));
	act(() => result.current.pickMethod(deviceMethod.id));
	expect(result.current.deviceTransport).toBe('bluetooth');
	expect(result.current.tiles[0].disabled).toBe(false);
});

jest.mock('../../../../../services/register/register-document', () => ({
	readRegister: async () => ({ id: 'register' }),
}));
jest.mock('../provenance/stamp-completion', () => ({
	completionMeta: async ({ meta_data }: { meta_data: unknown[] }) => [
		...meta_data,
		{ key: '_wcpos_sale_counter', value: '1' },
	],
}));
it('zero balance writes completion and provenance together exactly once', async () => {
	mockPayload = { total: '0.00', meta_data: [] };
	mockLocalPatch.mockClear();
	mockBlockIfDegraded.mockReturnValue(false);
	const { result } = renderHook(() => useTenderFlow(order));
	await act(async () => result.current.takeTender());
	expect(mockLocalPatch).toHaveBeenCalledTimes(1);
	expect(mockLocalPatch).toHaveBeenCalledWith({
		document: order,
		data: { status: 'completed', meta_data: [{ key: '_wcpos_sale_counter', value: '1' }] },
	});
});

it('full manual online tender enqueues one follow-up provenance patch after the mirror', async () => {
	mockUseRealManual = true;
	mockLocalPatch.mockClear();
	mockManualMirror.mockClear();
	mockPayload = { id: 42, total: '10.00', meta_data: [] };
	mockMethods = methods;
	mockOnlineStatus = 'online-website-available';
	mockBlockIfDegraded.mockReturnValue(false);
	mockManualPost.mockResolvedValue({ data: { order: { status: 'completed', balance: '0.00' } } });
	resetCheckoutMode();
	const view = renderHook(() => useTenderFlow(order));
	try {
		act(() => view.result.current.pickMethod('pos_cash'));
		await act(async () => view.result.current.takeTender());
		expect(mockManualMirror).toHaveBeenCalledTimes(1);
		expect(mockLocalPatch).toHaveBeenCalledTimes(1);
		expect(mockLocalPatch).toHaveBeenCalledWith({
			document: order,
			data: { meta_data: expect.arrayContaining([{ key: '_wcpos_sale_counter', value: '1' }]) },
		});
	} finally {
		view.unmount();
		mockUseRealManual = false;
	}
});

describe('provider completion provenance before intent', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		resetCheckoutMode();
		mockLeg = null;
		mockRealService = null;
		mockMethods = [terminal];
		mockOnlineStatus = 'online-website-available';
		mockPayload = { id: 42, total: '92.95', meta_data: [] };
		mockLocalPatch.mockResolvedValue(order);
		mockPushDocument.mockResolvedValue(order);
		mockBlockIfDegraded.mockReturnValue(false);
	});
	it('awaits the explicit tuple write before beginning the server leg', async () => {
		let finish!: (value: typeof order) => void;
		mockPushDocument.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					finish = resolve;
				})
		);
		const { result } = renderHook(() => useTenderFlow(order));
		act(() => result.current.pickMethod('terminal'));
		let take!: Promise<void>;
		await act(async () => {
			take = result.current.takeTender();
		});
		expect(mockLocalPatch).toHaveBeenCalledWith({
			document: order,
			data: { meta_data: [{ key: '_wcpos_sale_counter', value: '1' }] },
		});
		expect(mockPushDocument).toHaveBeenCalledWith(order);
		expect(mockLocalPatch.mock.invocationCallOrder[0]).toBeLessThan(
			mockPushDocument.mock.invocationCallOrder[0]
		);
		expect(mockBegin).not.toHaveBeenCalled();
		await act(async () => {
			finish(order);
			await take;
		});
		expect(mockBegin).toHaveBeenCalledTimes(1);
	});
	it('does not begin a provider leg after a failed explicit save', async () => {
		mockPushDocument.mockRejectedValueOnce(new Error('save failed'));
		const { result } = renderHook(() => useTenderFlow(order));
		act(() => result.current.pickMethod('terminal'));
		await act(async () => result.current.takeTender());
		expect(mockBegin).not.toHaveBeenCalled();
		expect(mockError).toHaveBeenCalledWith(
			'Checkout failed',
			expect.objectContaining({
				showToast: true,
				toast: { title: 'pos_cart.checkout_failed' },
			})
		);
	});
	it('does not stamp a partial server leg', async () => {
		const { result } = renderHook(() => useTenderFlow(order));
		act(() => result.current.pickMethod('terminal'));
		act(() => result.current.dispatch({ type: 'set-entry', minor: 5000 }));
		await act(async () => result.current.takeTender());
		expect(mockBegin).toHaveBeenCalledTimes(1);
		expect(mockLocalPatch).not.toHaveBeenCalled();
		expect(mockPushDocument).not.toHaveBeenCalled();
	});
});

it('resets a failed manual tender without logging a second error or toast', async () => {
	jest.clearAllMocks();
	resetCheckoutMode();
	mockLeg = null;
	mockMethods = methods;
	mockPayload = { id: 42, total: '10.00', meta_data: [] };
	mockRecordManualPayment.mockResolvedValueOnce({ kind: 'failed' });
	const { result } = renderHook(() => useTenderFlow(order));
	act(() => result.current.pickMethod('pos_cash'));
	await act(async () => result.current.takeTender());
	expect(mockRecordManualPayment).toHaveBeenCalledTimes(1);
	expect(mockError).not.toHaveBeenCalled();
	expect(mockInfo).not.toHaveBeenCalled();
	expect(result.current.state).toMatchObject({ view: 'select', methodId: null });
	expect(getCheckoutModeSnapshot().tenderMethods.has(order.uuid)).toBe(false);
	expect(mockCompleteOrderFlow).not.toHaveBeenCalled();
});

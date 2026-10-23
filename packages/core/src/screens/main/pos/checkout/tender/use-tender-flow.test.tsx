/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { flushSync } from 'react-dom';
import { BehaviorSubject, Subject } from 'rxjs';
import { map, startWith } from 'rxjs/operators';
import { act, fireEvent, render, renderHook, waitFor } from '@testing-library/react';

import { Toast } from '@wcpos/components/toast';
import { readLedger, withLedger } from '@wcpos/order-math';
import type { StoreDatabase } from '@wcpos/database';
import type { EngineRecord } from '@wcpos/query';
import type { MetaDataEntry, PaymentMethodDescriptor, PaymentRow } from '@wcpos/order-math';
import { RegisterSessionRequiredError } from '@wcpos/query/register-session';
import {
	failCompletionAttempt,
	readAwaitingAnswer,
	recordCompletionAttempt,
	recordPaymentAttention,
	rememberedReaders,
	resolveCompletionAttempt,
} from '@wcpos/query/store-local';

import {
	createActionContext,
	registerActionHook,
	resetActionHookStrikes,
	TENDER_COMMIT_EVENT,
} from '../../../../../extensions/actions';
import { cashRounding } from '../cash-rounding-hook';
import { useTerminalPaymentsService } from '../payments/server/use-terminal-payments-service';
import { createSimulatedDriver } from '../../../../../services/payment-drivers/simulated-driver';
import { registerDriver } from '../../../../../services/payment-drivers/registry';
import { method as deviceMethod, row as deviceRow } from '../payments/device/fixtures.test-utils';
import {
	claimReceiptAutoPrint,
	enterCheckout,
	enterReceipt,
	getCheckoutModeSnapshot,
	markOrderQueuedOffline,
	markOrderSaving,
	resetCheckoutMode,
	resolveStage,
	setTenderMethod,
	setTenderPlan,
	useOrderCheckoutStage,
} from '../checkout-mode';
import * as provenance from '../sale-completion';
import { enqueueOrderMutation } from '../../hooks/order-mutation-queue';
import { useLedgerView } from './use-ledger-view';
import { useTenderFlow } from './use-tender-flow';
import { passThroughPoster } from '../../../../../services/terminal-payments/pass-through-poster.test-utils';

import type {
	TerminalLegState,
	TerminalPaymentsService,
} from '../../../../../services/terminal-payments';

// The writer re-runs `requireOpenSession` (the pre-action write) after the gate's read; the
// fixtures carry no session collection; both reads share the happy-path session id.
jest.mock('@wcpos/query/register-session', () => ({
	...jest.requireActual('@wcpos/query/register-session'),
	requireOpenSession: jest.fn(async (_sessions: unknown, _registerId: unknown, enabled: boolean) =>
		enabled ? mockSessionId : null
	),
}));

const persistProvenanceSpy = jest.spyOn(provenance, 'persistSaleProvenance');

let mockRealService: TerminalPaymentsService | null = null;
let mockLeg: TerminalLegState | null = null;
type MockReader = { id: string; label: string; transport?: string };
const mockReaderPreferences: Record<string, MockReader> = {};
const mockReadersInUse = new Map<string, { orderUuid: string; orderNumber: string }>();
const mockReaderChanges = new Subject<void>();
const mockReaderState = {
	get$: () =>
		mockReaderChanges.pipe(
			startWith(undefined),
			map(() => mockReaderPreferences)
		),
	get: (path: string) => mockReaderPreferences[path],
	set: async (path: string, modify: (value: MockReader | undefined) => MockReader) => {
		mockReaderPreferences[path] = modify(mockReaderPreferences[path]);
		mockReaderChanges.next();
	},
};
// The money command journal's tender gate (ADR 0040): a command dispatched and not answered.
const mockGate$ = new BehaviorSubject(false);
const mockResend = jest.fn(
	async (
		..._args: Parameters<typeof import('@wcpos/query').resendOpenCommands>
	): Promise<{ kind: string; data: Record<string, unknown> }[]> => []
);
const mockPosterInputs: { approval: unknown }[] = [];
const mockDefer = jest.fn(async (_url: string, body: unknown) => body);
const mockStoreDB = {
	addState: jest.fn(async () => mockReaderState),
};
beforeEach(() => {
	mockGate$.next(false);
	for (const key of Object.keys(mockReaderPreferences)) delete mockReaderPreferences[key];
	mockReadersInUse.clear();
});
it('stores the reader snapshot separately for each method, and forgets one', async () => {
	const preferences = rememberedReaders(mockStoreDB as unknown as StoreDatabase);
	expect(await preferences.get('terminal')).toBeNull();
	await preferences.set('terminal', { id: 'b', label: 'Back', transport: 'bluetooth' });
	await preferences.set('other', { id: 'a', label: 'Front' });
	expect(await preferences.get('terminal')).toEqual({
		id: 'b',
		label: 'Back',
		transport: 'bluetooth',
		model: undefined,
		serial: undefined,
	});
	expect((await preferences.get('other'))?.id).toBe('a');
	await preferences.set('terminal', { id: 'c', label: 'Counter', transport: 'bluetooth' });
	expect((await preferences.get('terminal'))?.id).toBe('c');
	await preferences.forget('terminal');
	expect(await preferences.get('terminal')).toBeNull();
	expect(mockStoreDB.addState).toHaveBeenCalledWith('terminal-readers_v2');
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
	...jest.requireActual('../../../../../services/terminal-payments'),
	startTerminalPaymentsService: (
		options: import('../../../../../services/terminal-payments').TerminalPaymentsServiceOptions
	) =>
		(mockRealService = jest
			.requireActual('../../../../../services/terminal-payments')
			.startTerminalPaymentsService(options)),
	getTerminalPaymentsService: () =>
		mockRealService ?? {
			subscribe: () => () => {},
			flushOffline: async () => {},
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
let mockUseRealVoid = false;
const mockManualPost = jest.fn();
const mockGatewaysGet = jest.fn();
const mockManualMirror = jest.fn();
const mockVoidPayments = jest.fn();
const mockCompleteOrderFlow = jest.fn();
let mockUseRealCompletion = false;
const mockSetCurrentOrderID = jest.fn();
const mockRequire = jest.fn();
const mockAdjustStock = jest.fn();
const mockRuntime = {
	engine: { require: mockRequire, db$: () => () => {}, events: () => () => {} },
};
let mockAutoShowReceipt = true;
jest.mock('@wcpos/components/toast', () => ({ Toast: { show: jest.fn() } }));
jest.mock('../../../contexts/ui-settings', () => ({
	useUISettings: () => ({ uiSettings: { autoShowReceipt: mockAutoShowReceipt } }),
}));
jest.mock('../../contexts/current-order/context', () => ({
	useCurrentOrderActions: () => ({
		setCurrentOrderID: mockSetCurrentOrderID,
		getCurrentOrderRecord: () => order,
		getCurrentOrderID: () => order.uuid,
	}),
}));
jest.mock('../../../hooks/use-stock-adjustment', () => ({
	stockAdjustment: (...args: unknown[]) => mockAdjustStock(...args),
}));
const mockLocalPatch = jest.fn();
const mockBlockIfDegraded = jest.fn();
const mockReplace = jest.fn();
const mockDismissTo = jest.fn();
const mockInfo = jest.fn();
const mockError = jest.fn();
const mockWarn = jest.fn();

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
	status?: string;
	currency?: string;
	total: string;
	meta_data: import('@wcpos/order-math').MetaDataEntry[];
	billing?: { email?: string; phone?: string };
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

// One client per test file, as the real hook memoises: a fresh object per render would re-arm
// every fetch effect keyed on it.
//
// The fixtures below script only the summary a test is about. The store's real record answer
// also carries the row it stored (sync-core `isMoneyAnswer`, which the record path now requires),
// so a scripted record answer without one is completed with the posted row here.
const mockHttp = {
	post: async (url: string, body: unknown) => {
		const answer = await mockManualPost(url, body);
		const data = answer?.data as Record<string, unknown> | undefined;
		const row = (body as { payment?: unknown } | undefined)?.payment;
		return /\/payments$/.test(url) && data && !data.payment && row
			? { ...answer, data: { ...data, payment: row } }
			: answer;
	},
	get: mockGatewaysGet,
};
jest.mock('../../../hooks/use-rest-http-client', () => ({
	useRestHttpClient: () => mockHttp,
}));
jest.mock('../payments', () => ({
	RecordManualPaymentError: jest.requireActual('../payments/record-manual-payment')
		.RecordManualPaymentError,
	useRecordManualPayment: () =>
		mockUseRealManual
			? jest.requireActual('../payments/use-record-manual-payment').useRecordManualPayment()
			: mockRecordManualPayment,
	useVoidPayments: () =>
		mockUseRealVoid
			? jest.requireActual('../payments/use-void-payments').useVoidPayments()
			: mockVoidPayments,
}));
jest.mock('../../hooks/use-cart-config', () => {
	const { createCartConfig } = jest.requireActual('@wcpos/order-math');
	const config = createCartConfig({
		rates: [],
		allRates: [],
		calcTaxes: true,
		pricesIncludeTax: false,
		taxRoundAtSubtotal: false,
		dp: 2,
		shippingTaxClass: '',
		taxClassSlugs: ['standard'],
		calcDiscountsSequentially: false,
	});
	return { useCartConfig: () => config };
});
jest.mock('../hooks/use-complete-order-flow', () => ({
	useCompleteOrderFlow: (order: EngineRecord<'orders'>) =>
		mockUseRealCompletion
			? jest.requireActual('../hooks/use-complete-order-flow').useCompleteOrderFlow(order)
			: mockCompleteOrderFlow,
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
jest.mock('@wcpos/query/record-readers', () => ({
	...jest.requireActual('@wcpos/query/record-readers'),
	readResidentOrder: async () => order,
}));
jest.mock('../../../hooks/mutations/use-local-mutation', () => ({
	useLocalMutation: () => ({ localPatch: mockLocalPatch }),
}));
jest.mock('../../../../../contexts/app-state', () => ({
	useStoreSession: () => ({
		storeDB: mockStoreDB,
		site: { uuid: 'site' },
		store: {
			register_sessions: mockSessionsOn,
			price_num_decimals: 2,
			currency: 'EUR',
			id: 9,
			tax_display_cart: mockTaxDisplayCart,
		},
		wpCredentials: { id: 7, display_name: 'Pat', username: 'pat' },
	}),
}));
jest.mock('@wcpos/query', () => ({
	useDocField: (doc: unknown, pick: (doc: unknown) => unknown) => pick(doc),
	useQueryRuntime: () => mockRuntime,
	useRecordField: (_order: unknown, select: (record: unknown) => unknown) =>
		select({ payload: mockPayload }),
	// pushFailureCode tests these with instanceof and reads `status`.
	WriteDeferredError: class WriteDeferredError extends Error {
		status?: number;
		constructor(mutationId: string, status?: number) {
			super(`write-deferred (${status}) for mutation "${mutationId}"`);
			this.status = status;
		}
	},
	WriteOutcomeError: class WriteOutcomeError extends Error {},
	MoneyCommandError: class MoneyCommandError extends Error {},
	// The real completion asks before its second read; never adopted here, so it always refreshes.
	answerAdopted: async () => false,
	moneyCommandPoster: (input: {
		post: (url: string, body: unknown) => Promise<unknown>;
		runtime: unknown;
		orderUuid: string;
		approval: unknown;
	}) => {
		mockPosterInputs.push(input);
		return Object.assign((url: string, body: unknown) => input.post(url, body), {
			// The mocked fakeMirror under a fixed revision.
			mirror: async (answer: object) => {
				await jest
					.requireMock('@wcpos/query/mutations')
					.fakeMirror(input.runtime, input.orderUuid, {
						...answer,
						sentRevision: 'sha256:sent',
					});
			},
			settle: async () => undefined,
			defer: (url: string, body: unknown) => mockDefer(url, body),
		});
	},
	resendOpenCommands: (...args: Parameters<typeof import('@wcpos/query').resendOpenCommands>) =>
		mockResend(...args),
}));
jest.mock('expo-router', () => ({
	useRouter: () => ({ replace: mockReplace, dismissTo: mockDismissTo }),
}));
jest.mock('@wcpos/utils/logger', () => ({
	getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
	// The hook calls getLogger() at module scope, before this file's consts are
	// initialised — so the spies are read inside the call, not captured here.
	getLogger: () => ({
		info: (...args: unknown[]) => mockInfo(...args),
		warn: (...args: unknown[]) => mockWarn(...args),
		error: (...args: unknown[]) => mockError(...args),
		// Recovered arcs (a refresh that timed out or failed) log at debug; the hook must not crash on them.
		debug: () => undefined,
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

// The flow asks the cashier through `useConfirmOfflineTender` (its own suite); yes by default.
const mockConfirmOffline = jest.fn();
jest.mock('./use-confirm-offline-tender', () => ({
	useConfirmOfflineTender: () => ({
		confirmOfflineTender: (facts: unknown) => mockConfirmOffline(facts) ?? Promise.resolve(true),
		dialog: null,
	}),
}));

describe('useTenderFlow', () => {
	beforeEach(() => {
		mockSize = 'sm';
		resetCheckoutMode();
		jest.clearAllMocks();
		// A store order: a manual leg journals against `orders/{id}/payments` (ADR 0040 Decided 1).
		mockPayload = { id: 42, total: '92.95', meta_data: [] };
		mockMethods = methods;
		mockMethodsLoaded = true;
		mockOnlineStatus = 'online-website-available';
		mockTaxDisplayCart = 'excl';
		mockBlockIfDegraded.mockReturnValue(false);
		mockRecordManualPayment.mockResolvedValue(recorded);
		mockVoidPayments.mockResolvedValue({ rows: [], failed: [] });
		mockCompleteOrderFlow.mockResolvedValue(undefined);
		mockLocalPatch.mockResolvedValue({ document: order });
	});
	it('a mounted tender is a checkout member; a confirmed receipt is not re-entered', () => {
		renderHook(() => useTenderFlow(order, hostAtWidth()));
		expect(getCheckoutModeSnapshot().checkoutOrders.has(order.uuid)).toBe(true);
		resetCheckoutMode();
		enterReceipt(order.uuid);
		renderHook(() => useTenderFlow(order, hostAtWidth()));
		expect(getCheckoutModeSnapshot().checkoutOrders.has(order.uuid)).toBe(false);
	});
	it.each([
		['online', 'payment.recorded'],
		['offline', 'payment.recorded-offline'],
	])('logs one manual action for a payment recorded %s', async (via, type) => {
		mockPayload.id = 42;
		mockRecordManualPayment.mockResolvedValue({ ...recorded, via });
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		await act(async () => result.current.takeTender());
		expect(mockInfo.mock.calls.filter(([, options]) => options.context?.type === type)).toEqual([
			[
				expect.any(String),
				expect.objectContaining({
					actor: { id: '7', name: 'Pat' },
					terminal: { operationId: 'payment-1' },
					context: {
						type,
						orderId: 42,
						orderUUID: 'order-1',
						paymentId: 'payment-1',
						amount: '50.00',
						method: 'pos_cash',
					},
				}),
			],
		]);
	});

	// A record answered on a sale another till reopened says so at the press, as Try again does.
	it('a record answered on a reopened sale says the sale was reopened elsewhere', async () => {
		mockPayload.id = 42;
		const reopened = { status: 'pos-open', balance: '0.00' };
		mockRecordManualPayment.mockResolvedValue({ ...recorded, order: reopened, notMirrored: null });
		mockCompleteOrderFlow.mockResolvedValueOnce('partial');
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		await act(async () => result.current.takeTender());
		expect(mockCompleteOrderFlow).toHaveBeenCalledWith(
			expect.objectContaining({ source: 'manual', order: reopened }),
			expect.anything()
		);
		expect(mockInfo).toHaveBeenCalledWith(
			'pos_checkout.sale_reopened_elsewhere',
			expect.objectContaining({ showToast: true })
		);
	});

	// ADR 0040 §1.3: a sent command whose answer never arrived (this process or a previous one)
	// offers no tile and no close, only a re-send of the same journaled command.
	it('an unanswered command gates the tiles and Try again re-sends it', async () => {
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		expect(result.current.tiles.length).toBeGreaterThan(0);
		act(() => mockGate$.next(true));
		expect(result.current.unansweredCommand).toBe(true);
		expect(result.current.tiles).toEqual([]);
		await act(async () => result.current.takeTender());
		expect(mockRecordManualPayment).not.toHaveBeenCalled();
		await act(async () => result.current.retryCommand());
		expect(mockResend).toHaveBeenCalledWith(expect.anything(), mockStoreDB, 'order-1', {
			post: expect.any(Function),
		});
	});

	it('Try again does not select a receipt for a replayed cancel with a paid summary', async () => {
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		mockResend.mockImplementationOnce(async () => {
			mockPayload.status = 'processing';
			const answer = { kind: 'cancel' as const, data: { order: { status: 'processing' } } };
			return [answer];
		});
		await act(async () => result.current.retryCommand());
		expect(getCheckoutModeSnapshot().selectedReceiptOrder).toBeNull();
		expect(mockCompleteOrderFlow).not.toHaveBeenCalled();
	});

	// CodeRabbit 4346454764 on #2837: a re-send in flight never shows the keypad.
	it('Try again in flight keeps the gate: no tiles until the re-send settles', async () => {
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => mockGate$.next(true));
		let answer!: (value: { kind: string; data: Record<string, unknown> }[]) => void;
		mockResend.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
		let retried!: Promise<void>;
		act(() => {
			retried = result.current.retryCommand();
		});
		expect(result.current.busy).toBe(true);
		expect(result.current.unansweredCommand).toBe(true);
		expect(result.current.tiles).toEqual([]);
		await act(async () => {
			answer([]);
			await retried;
		});
	});

	it('Try again reports a changed order as such, never as an unanswered payment', async () => {
		const { MoneyCommandError } = jest.requireMock('@wcpos/query');
		mockResend.mockRejectedValueOnce(
			Object.assign(new MoneyCommandError('money_command_order_changed'), {
				reason: 'order_changed',
			})
		);
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		await act(async () => result.current.retryCommand());
		expect(mockInfo).toHaveBeenCalledWith(
			'pos_checkout.order_changed_retry',
			expect.objectContaining({ showToast: true })
		);
		expect(mockError).not.toHaveBeenCalledWith(
			'pos_checkout.payment_unanswered',
			expect.anything()
		);
	});

	// A close replayed after a remote reopen answers its stored completion with the order as it
	// now stands (`Payments_Controller.php:452-468`). It lands through the table: the completion
	// judges it with the resident (sale-completion.test.ts), and a close it did not finish was
	// reopened (land-answer.test.ts).
	it('a replayed close the completion does not finish says the sale was reopened', async () => {
		const answer = {
			kind: 'close' as const,
			data: { order: { status: 'completed' }, completion: { n: 1, id: 'c1' } },
		};
		mockResend.mockResolvedValueOnce([answer]);
		mockCompleteOrderFlow.mockResolvedValueOnce('not-completed');
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		await act(async () => result.current.retryCommand());
		expect(mockCompleteOrderFlow).toHaveBeenCalledWith(
			{ source: 'zero-balance', order: { status: 'completed' } },
			undefined
		);
		expect(mockInfo).toHaveBeenCalledWith(
			'pos_checkout.sale_reopened_elsewhere',
			expect.objectContaining({ showToast: true })
		);
	});

	// A replayed gateway submit answers its stored outcome with the order as it now stands.
	// The paid/settled × status mapping is answerOf's table (land-answer.test.ts).
	it.each([
		['paid', 'completed', 1],
		['settled', 'pos-partial', 0],
	])(
		'a replayed %s submit with a %s summary finishes the sale only while done',
		async (outcome, status, finished) => {
			const { resolveCompletionAttempt } = jest.requireMock('@wcpos/query/store-local');
			mockResend.mockResolvedValueOnce([{ kind: 'submit', data: { outcome, order: { status } } }]);
			const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
			await act(async () => result.current.retryCommand());
			expect(mockCompleteOrderFlow).toHaveBeenCalledTimes(finished);
			// A reopen since ends the completion attempt and says so, as at the press.
			expect(resolveCompletionAttempt).toHaveBeenCalledTimes(1 - finished);
			if (!finished)
				expect(mockInfo).toHaveBeenCalledWith(
					'pos_checkout.sale_reopened_elsewhere',
					expect.objectContaining({ showToast: true })
				);
		}
	);

	// A recovered gateway submit answered `sent` finishes as a sent sale, from the stamp the
	// refresh adopted with the store's document.
	it('a Try again answered sent finishes the sale through the sent path', async () => {
		const stamp = {
			method_id: 'wcpos_email_invoice',
			destination: 'a@b.c',
			attempt_id: 'attempt-1',
			sent_at_gmt: '2026-10-20T10:00:00Z',
			cashier_id: 7,
		};
		mockPayload = {
			...mockPayload,
			meta_data: [{ key: '_wcpos_awaiting_customer', value: stamp }],
		} as typeof mockPayload;
		const summary = { status: 'pending' };
		mockResend.mockResolvedValueOnce([
			{ kind: 'submit', data: { outcome: 'sent', order: summary } },
		]);
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		await act(async () => result.current.retryCommand());
		expect(mockCompleteOrderFlow).toHaveBeenCalledWith(
			{ source: 'gateway', order: summary, stamp },
			undefined
		);
	});

	// A recovered send whose stamp disappeared finishes nothing and frees the print claim.
	it('a recovered send whose refresh drops the stamp returns to checkout', async () => {
		const stamp = {
			method_id: 'wcpos_email_invoice',
			destination: 'a@b.c',
			attempt_id: 'attempt-1',
			sent_at_gmt: '2026-10-20T10:00:00Z',
			cashier_id: 7,
		};
		const answer = {
			kind: 'submit' as const,
			data: { outcome: 'sent', order: { status: 'on-hold' } },
		};
		enterCheckout(order.uuid);
		expect(claimReceiptAutoPrint(order.uuid)).toBe(true);
		mockResend.mockImplementationOnce(async () => {
			mockPayload = {
				...mockPayload,
				status: 'on-hold',
				meta_data: [{ key: '_wcpos_awaiting_customer', value: stamp }],
			} as typeof mockPayload;
			expect(resolveStage(order.uuid, getCheckoutModeSnapshot(), [], mockPayload.status)).toBe(
				'receipt'
			);
			mockPayload = { ...mockPayload, status: 'pos-open', meta_data: [] } as typeof mockPayload;
			return [answer];
		});
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		await act(async () => result.current.retryCommand());
		expect(mockCompleteOrderFlow).not.toHaveBeenCalled();
		expect(resolveStage(order.uuid, getCheckoutModeSnapshot(), [], mockPayload.status)).toBe(
			'checkout'
		);
		expect(claimReceiptAutoPrint(order.uuid)).toBe(true);
		expect(getCheckoutModeSnapshot().receiptOrders.has(order.uuid)).toBe(false);
		expect(getCheckoutModeSnapshot().selectedReceiptOrder).toBeNull();
	});

	// A cash record whose answer was lost, then a remote reopen: the replay answers the captured
	// row with the order as it now stands, open at a zero balance. Mirrored and settled; the
	// completion leaves it partial, and the table says reopened (land-answer.test.ts).
	it('a replayed record whose sale was reopened since does not finish the sale', async () => {
		const row = payment({ amount: '92.95', tendered: '100.00' });
		const reopened = { status: 'pos-open', total: '92.95', paid: '92.95', balance: '0.00' };
		mockResend.mockResolvedValueOnce([{ kind: 'record', data: { payment: row, order: reopened } }]);
		mockCompleteOrderFlow.mockResolvedValueOnce('partial');
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		await act(async () => result.current.retryCommand());
		expect(mockCompleteOrderFlow).toHaveBeenCalledWith(
			expect.objectContaining({ source: 'manual', order: reopened }),
			undefined
		);
		expect(mockInfo).toHaveBeenCalledWith(
			'pos_checkout.sale_reopened_elsewhere',
			expect.objectContaining({ showToast: true })
		);
	});

	it('a Try again the store answers finishes the sale like a first answer', async () => {
		const row = payment({ amount: '92.95', tendered: '100.00' });
		const summary = { status: 'completed', total: '92.95', paid: '92.95', balance: '0.00' };
		mockResend.mockResolvedValueOnce([{ kind: 'record', data: { payment: row, order: summary } }]);
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		await act(async () => result.current.retryCommand());
		expect(mockCompleteOrderFlow).toHaveBeenCalledWith(
			expect.objectContaining({
				source: 'manual',
				via: 'online',
				row,
				order: summary,
				remainingMinor: 0,
			}),
			undefined
		);
		expect(mockError).not.toHaveBeenCalled();
	});

	it('preselects the first available method once, without recording', async () => {
		mockMethods = [noDriver, card];
		const { result, rerender } = renderHook(() => useTenderFlow(order, hostAtWidth()));
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
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => result.current.pickMethod('pos_cash'));
		expect(getCheckoutModeSnapshot().tenderMethods.get(order.uuid)).toBe('pos_cash');
		await act(async () => {});
	});
	it('reopens the keypad for the method the store holds, prefilled with the balance', async () => {
		setTenderMethod(order.uuid, 'pos_cash');
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
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
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		expect(result.current.state).toMatchObject({
			view: 'amount',
			methodId: 'pos_cash',
			entryMinor: result.current.balanceMinor,
		});
		expect(result.current.method?.id).toBe('pos_cash');
		await act(async () => {});
	});
	it('keeps the chosen method for the next leg once one is recorded', async () => {
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
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
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
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

	it('treats a save queued offline as offline for tender, even once connectivity is back: only a record tile takes it, settling later', async () => {
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
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		expect(result.current.saveState).toEqual({ kind: 'queued-offline', mutationId: 'm' });
		expect(result.current.online).toBe(true);
		expect(result.current.tiles.find((tile) => tile.method.id === 'pos_online')).toMatchObject({
			disabled: true,
			reason: 'offline',
		});
		// ADR 0040 Decided 1 rule 2: a `record` method journals; rule 1: its tile says it settles later.
		expect(result.current.tiles.find((tile) => tile.method.id === 'pos_cash')).toMatchObject({
			disabled: false,
			reason: null,
			settlesLater: true,
		});
		// The press freezes the queued save as its lane: the record journals, it never posts.
		act(() => result.current.pickMethod('pos_cash'));
		await act(async () => result.current.takeTender());
		expect(mockRecordManualPayment).toHaveBeenCalledWith(
			order,
			cash,
			expect.objectContaining({ lane: 'settles-later' })
		);
	});

	it.each(['online-website-available', 'offline'])(
		'keeps the read-only ledger aligned with tender flow (%s)',
		async (status) => {
			mockOnlineStatus = status;
			const { result, rerender } = renderHook(() => ({
				flow: useTenderFlow(order, hostAtWidth()),
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
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
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
		const { result, rerender } = renderHook(() => useTenderFlow(order, hostAtWidth()));
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
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));

		act(() => result.current.pickMethod('pos_cash'));

		expect(result.current.state).toMatchObject({
			view: 'amount',
			methodId: 'pos_cash',
			entryMinor: 9295,
		});
		await act(async () => {});
	});

	it('caps a cash overtender at the balance and records the tendered amount', async () => {
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
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
			lane: 'online',
			session: { registerId: 'register', sessionId: null },
		});
	});

	it('completes a fully paid online order after the record resolves', async () => {
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => result.current.pickMethod('pos_cash'));
		act(() => result.current.dispatch({ type: 'set-entry', minor: 10000 }));

		await act(async () => result.current.takeTender());

		expect(mockCompleteOrderFlow).toHaveBeenCalledTimes(1);
		expect(mockCompleteOrderFlow).toHaveBeenCalledWith(
			expect.objectContaining({ source: 'manual', via: 'online' }),
			expect.objectContaining({ dispatchToken: expect.any(Object) })
		);
	});

	it('completes a zero-balance order without recording a payment row', async () => {
		mockPayload = { id: 42, total: '0.00', meta_data: [] };
		mockManualPost.mockResolvedValue({
			data: { order: { status: 'completed' }, completion: { n: 1, id: 'c1' } },
		});
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));

		await act(async () => result.current.takeTender());

		expect(mockRecordManualPayment).not.toHaveBeenCalled();
		expect(mockLocalPatch).toHaveBeenCalledWith(
			{ document: order, changes: expect.any(Function) },
			{ collectionName: 'orders' }
		);
		// ADR 0040 D2: the provenance rides the write, the status comes from the store's close.
		expect(mockLocalPatch.mock.calls[0][0].changes(mockPayload)).toEqual({
			meta_data: expect.arrayContaining([{ key: '_wcpos_sale_counter', value: '1' }]),
		});
		expect(mockManualPost).toHaveBeenCalledWith('orders/42/close', {});
		expect(mockCompleteOrderFlow).toHaveBeenCalledWith(
			{ source: 'zero-balance', order: { status: 'completed' } },
			expect.objectContaining({ dispatchToken: expect.any(Object) })
		);
	});

	it('a zero balance offline is refused with CHECKOUT101 and writes nothing', async () => {
		mockPayload = { id: 42, total: '0.00', meta_data: [] };
		mockOnlineStatus = 'offline';
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));

		await act(async () => result.current.takeTender());

		expect(mockLocalPatch).not.toHaveBeenCalled();
		expect(mockManualPost).not.toHaveBeenCalled();
		expect(mockCompleteOrderFlow).not.toHaveBeenCalled();
		expect(mockError).toHaveBeenCalledWith(
			'pos_checkout.close_needs_connection',
			expect.objectContaining({ code: 'CHECKOUT101', showToast: true })
		);
	});

	it('a zero balance whose save is queued offline is refused with CHECKOUT101 even online, and sends no close', async () => {
		mockPayload = { id: 42, total: '0.00', meta_data: [] };
		markOrderSaving(order.uuid);
		markOrderQueuedOffline(order.uuid, 'm');
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		expect(result.current.online).toBe(true);

		await act(async () => result.current.takeTender());

		expect(mockLocalPatch).not.toHaveBeenCalled();
		expect(mockManualPost).not.toHaveBeenCalled();
		expect(mockCompleteOrderFlow).not.toHaveBeenCalled();
		expect(mockError).toHaveBeenCalledWith(
			'pos_checkout.close_needs_connection',
			expect.objectContaining({ code: 'CHECKOUT101', showToast: true })
		);
	});

	it('does not record an online-only method after connectivity drops', async () => {
		const onlineOnly = {
			...card,
			id: 'online_card',
			capabilities: { ...card.capabilities, offline: 'none' as const },
		};
		mockMethods = [onlineOnly];
		const { result, rerender } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => result.current.pickMethod('online_card'));

		mockOnlineStatus = 'offline';
		rerender();
		await act(async () => result.current.takeTender());

		expect(mockRecordManualPayment).not.toHaveBeenCalled();
		// Refusing silently would leave the cashier pressing a dead button.
		expect(mockInfo).toHaveBeenCalledWith(
			'pos_checkout.needs_a_connection',
			expect.objectContaining({ showToast: true })
		);
	});

	it('returns to method selection without completing after a part payment', async () => {
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => result.current.pickMethod('pos_cash'));
		act(() => result.current.dispatch({ type: 'set-entry', minor: 5000 }));

		await act(async () => result.current.takeTender());

		expect(mockRecordManualPayment).toHaveBeenCalledWith(order, cash, {
			amount: '50.00',
			tendered: '50.00',
			lane: 'online',
			session: { registerId: 'register', sessionId: null },
		});
		expect(mockCompleteOrderFlow).toHaveBeenCalledWith(
			expect.objectContaining({
				source: 'manual',
				mirrorFailed: false,
				remainingMinor: 4295,
			}),
			expect.objectContaining({ dispatchToken: expect.any(Object) })
		);
		expect(provenance.isSaleComplete(mockCompleteOrderFlow.mock.calls[0][0], 2)).toBe(false);
		expect(result.current.state.view).toBe('amount');
	});

	it('never records a card amount above the balance', async () => {
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => result.current.pickMethod('pos_card'));
		act(() => result.current.dispatch({ type: 'set-entry', minor: 10000 }));

		await act(async () => result.current.takeTender());

		expect(mockRecordManualPayment).toHaveBeenCalledWith(order, card, {
			amount: '92.95',
			tendered: null,
			lane: 'online',
			session: { registerId: 'register', sessionId: null },
		});
	});

	it('uses a split share as the next tender pre-fill', async () => {
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
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
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
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
		const { result, rerender } = renderHook(() => useTenderFlow(order, hostAtWidth()));
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
		// In the app the ledger change re-renders the keypad before the next tap; without this the
		// commit sees a balance that moved since the keypad was drawn and refuses, as it should.
		rerender();
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
		const { result, rerender } = renderHook(() => useTenderFlow(order, hostAtWidth()));
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

		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));

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
		const { result, rerender } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		expect(result.current.lines[0]?.id).toBe('line-local');

		mockPayload.line_items = [{ ...line, id: 123 }];
		rerender();

		expect(result.current.lines[0]?.id).toBe('line-local');
		await act(async () => {});
	});
	it('restores an active split plan after an order-switch remount', async () => {
		const plan = { kind: 'even' as const, ways: 2, from: 0 };
		const first = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => first.result.current.dispatch({ type: 'set-plan', plan, balanceMinor: 9295 }));
		first.unmount();

		const second = renderHook(() => useTenderFlow(order, hostAtWidth()));

		expect(second.result.current.state).toMatchObject({ plan, entryMinor: 4648 });
		second.unmount();
	});
	it('keeps the stored plan while a short split still owes money (roadmap#422)', async () => {
		// Two legs planned; the first took 30.00, the second is short too. The planned count is
		// reached but the sale is not paid: the plan stays stored for the leg that finishes it.
		const plan = { kind: 'even' as const, ways: 2, from: 0 };
		mockPayload.meta_data = withLedger([], [payment({ id: 'a', amount: '30.00', tendered: null })]);
		mockRecordManualPayment.mockResolvedValue({
			...recorded,
			row: payment({ id: 'b', amount: '30.00', tendered: null }),
		});
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => result.current.dispatch({ type: 'set-plan', plan, balanceMinor: 6295 }));
		act(() => result.current.pickMethod('pos_cash'));
		act(() => result.current.dispatch({ type: 'set-entry', minor: 3000 }));
		await act(async () => result.current.takeTender());
		// Before the fix the store held null here (two legs taken on a 2-way plan); the mocked
		// payload is not mirrored in this harness, so only the stored and reducer plans are read.
		expect(getCheckoutModeSnapshot().tenderPlans.get(order.uuid)).toEqual(plan);
		expect(result.current.state.plan).toEqual(plan);
	});

	// Codex 4342609028 on #2831: the next leg reads derive()'s balance, which counts a succeeded
	// refund on a reopened sale as due again.
	it('a replacement leg on a reopened sale with a refund leaves the rest due and keeps the plan', async () => {
		const plan = { kind: 'even' as const, ways: 2, from: 1 };
		const refunds: PaymentRow['refunds'] = [
			{ id: 1, amount: '20.00', status: 'succeeded', provider_ref: null },
		];
		mockPayload = {
			total: '50.00',
			meta_data: withLedger([], [payment({ id: 'a', amount: '50.00', tendered: null, refunds })]),
		};
		mockRecordManualPayment.mockResolvedValue({
			...recorded,
			row: payment({ id: 'b', amount: '10.00', tendered: null }),
		});
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => result.current.dispatch({ type: 'set-plan', plan, balanceMinor: 2000 }));
		act(() => result.current.pickMethod('pos_cash'));
		act(() => result.current.dispatch({ type: 'set-entry', minor: 1000 }));
		await act(async () => result.current.takeTender());
		expect(result.current.state.entryMinor).toBe(1000);
		expect(getCheckoutModeSnapshot().tenderPlans.get(order.uuid)).toEqual(plan);
	});

	// ADR 0040 D6: an offline device authorization is a hold the store does not count as paid.
	it('an offline device authorization never advances a split plan to its next leg', async () => {
		const plan = { kind: 'even' as const, ways: 3, from: 0 };
		mockPayload = {
			id: 42,
			total: '90.00',
			meta_data: withLedger([], [payment({ id: 'a', amount: '30.00', tendered: null })]),
		};
		mockRecordManualPayment.mockResolvedValue({
			...recorded,
			row: payment({
				id: 'b',
				amount: '30.00',
				tendered: null,
				capture_mode: 'device',
				recorded_offline: true,
				status: 'authorized',
			}),
		});
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => result.current.dispatch({ type: 'set-plan', plan, balanceMinor: 9000 }));
		act(() => result.current.pickMethod('pos_cash'));
		act(() => result.current.dispatch({ type: 'set-entry', minor: 3000 }));
		await act(async () => result.current.takeTender());
		// Leg 2 of 3 is still due: 30.00 of the 60.00 balance, not the whole of it as leg 3.
		expect(result.current.state.entryMinor).toBe(3000);
		expect(getCheckoutModeSnapshot().tenderPlans.get(order.uuid)).toEqual(plan);
		// The ledger as the store answers it: the keypad shows payment 2 of 3 for 30.00, and a
		// remount pre-fills the same (Codex 4342686838 on #2831).
		const authorized = await mockRecordManualPayment.mock.results[0].value;
		mockPayload.meta_data = withLedger(
			[],
			[payment({ id: 'a', amount: '30.00', tendered: null }), authorized.row]
		);
		const view = renderHook(() => useTenderFlow(order, hostAtWidth()));
		expect(view.result.current.planLegs).toEqual([
			{ minor: 3000, state: 'done', title: 'Cash' },
			{ minor: 3000, state: 'now' },
			{ minor: 3000, state: 'todo' },
		]);
		expect(view.result.current.state.entryMinor).toBe(3000);
		view.unmount();
	});

	it('a remount after the planned legs are taken still journals every share on the last leg (roadmap#422)', async () => {
		const plan = { kind: 'even' as const, ways: 2, from: 0 };
		setTenderPlan(order.uuid, plan);
		mockPayload.meta_data = withLedger(
			[],
			[
				payment({ id: 'a', amount: '30.00', tendered: null }),
				payment({ id: 'b', amount: '30.00', tendered: null }),
			]
		);
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		expect(result.current.state.plan).toEqual(plan);
		expect(result.current.plan).toBeNull();
		act(() => result.current.pickMethod('pos_cash'));
		await act(async () => result.current.takeTender());
		const [, , input] = mockRecordManualPayment.mock.calls[0];
		expect(input.extraMeta?.[0].key).toBe('_wcpos_split');
		expect(JSON.parse(input.extraMeta?.[0].value as string)).toMatchObject({
			kind: 'even',
			shares: ['30.00', '30.00', '32.95'],
		});
	});

	it('does not pick a disabled tile', async () => {
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));

		act(() => result.current.pickMethod('device_card'));

		expect(result.current.state.methodId).toBe('pos_cash');
		await act(async () => {});
	});

	it('voids live payments, resets tender state, and routes to the cart', async () => {
		mockVoidPayments.mockResolvedValue({ rows: [payment({ status: 'voided' })], failed: [] });
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => result.current.dispatch({ type: 'request-cancel' }));

		await act(async () => result.current.cancelPayment());

		expect(mockInfo).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				actor: { id: '7', name: 'Pat' },
				context: expect.objectContaining({
					type: 'checkout.cancelled',
					voided: 1,
					orderUUID: 'order-1',
				}),
			})
		);
		expect(mockInfo).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				actor: { id: '7', name: 'Pat' },
				terminal: { operationId: 'payment-1' },
				context: expect.objectContaining({ type: 'payment.voided', paymentId: 'payment-1' }),
			})
		);
		expect(mockVoidPayments).toHaveBeenCalledWith(order);
		expect(result.current.state).toMatchObject({ view: 'select', methodId: null });
		expect(mockDismissTo).toHaveBeenCalledWith('/(app)/(drawer)/(pos)/(tabs)/cart');
	});

	it('stays put when a provider reports a failed void', async () => {
		mockVoidPayments.mockResolvedValue({
			rows: [payment({ id: 'voided-payment', status: 'voided' })],
			failed: [{ paymentId: 'payment-1', message: 'Provider refused', refused: true }],
		});
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => result.current.dispatch({ type: 'request-cancel' }));

		await act(async () => result.current.cancelPayment());

		expect(
			mockInfo.mock.calls.filter(([, options]) => options.context?.type === 'checkout.cancelled')
		).toHaveLength(0);
		expect(mockInfo).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				context: expect.objectContaining({ type: 'payment.voided', paymentId: 'voided-payment' }),
			})
		);
		expect(result.current.state.view).toBe('cancel');
		expect(mockReplace).not.toHaveBeenCalled();
		expect(mockError).toHaveBeenCalledWith(
			'pos_checkout.void_failed',
			expect.objectContaining({
				code: 'PAYMENT221',
				showToast: true,
				context: expect.objectContaining({
					type: 'payment.void-refused',
					paymentId: 'payment-1',
					reason: 'payment-1: Provider refused',
				}),
			})
		);
	});

	it('a cancel whose only remaining legs the store keeps for a refund is reported once, as information', async () => {
		// `voidPayments` never sends a captured card leg a void; it reports it retained. The confirm
		// announced that leg as a refund, so it is not a failed void and "Try again" is wrong advice.
		// The sale stays in checkout: money is still held, and the stage is derived from the live
		// ledger rows (#2861), so leaving would not stick on the columns host either.
		mockVoidPayments.mockResolvedValue({
			rows: [payment({ id: 'voided-payment', status: 'voided' })],
			failed: [{ paymentId: 'card-1', message: 'captured_refund_required', refused: true }],
		});
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => result.current.dispatch({ type: 'request-cancel' }));

		await act(async () => result.current.cancelPayment());

		expect(mockError).not.toHaveBeenCalled();
		expect(mockInfo).toHaveBeenCalledWith(
			'pos_checkout.cancel_refund_required',
			expect.objectContaining({
				showToast: true,
				context: expect.objectContaining({
					type: 'payment.void-refused',
					voided: 1,
					paymentId: 'card-1',
				}),
			})
		);
		expect(
			mockInfo.mock.calls.filter(([, options]) => options.context?.type === 'checkout.cancelled')
		).toHaveLength(0);
		expect(result.current.state.view).toBe('cancel');
		expect(mockReplace).not.toHaveBeenCalled();
		expect(mockDismissTo).not.toHaveBeenCalled();
	});

	it('keeps a lost void answer outcome-unknown rather than promising a refund', async () => {
		// A void whose answer never arrived may already have been applied; PAYMENT221's
		// "refund these" instruction would then return the money twice.
		mockVoidPayments.mockResolvedValue({
			rows: [],
			failed: [{ paymentId: 'payment-1', message: 'network', refused: false }],
		});
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => result.current.dispatch({ type: 'request-cancel' }));

		await act(async () => result.current.cancelPayment());

		expect(mockError).toHaveBeenCalledWith(
			'pos_checkout.void_failed',
			expect.objectContaining({
				code: 'PAYMENT201',
				// The type titles the row on every till: it must not read as a refusal.
				context: expect.objectContaining({ type: 'payment.void-unknown' }),
			})
		);
	});

	it('an offline cancel says it needs the store and never promises a hand refund', async () => {
		mockVoidPayments.mockResolvedValue({ kind: 'offline', paymentIds: ['payment-1'] });
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => result.current.dispatch({ type: 'request-cancel' }));

		await act(async () => result.current.cancelPayment());

		expect(mockInfo).toHaveBeenCalledWith(
			'pos_checkout.void_needs_connection',
			expect.objectContaining({ showToast: true })
		);
		expect(mockError).not.toHaveBeenCalled();
	});

	it('does not record when the storage money-path guard blocks the take', async () => {
		mockBlockIfDegraded.mockReturnValue(true);
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => result.current.pickMethod('pos_cash'));

		await act(async () => result.current.takeTender());

		expect(mockBlockIfDegraded).toHaveBeenCalledWith('process-payment', {
			orderId: 'order-1',
		});
		expect(mockRecordManualPayment).not.toHaveBeenCalled();
	});

	it('re-derives rows and balance from the controlled order payload after rerender', async () => {
		const { result, rerender } = renderHook(() => useTenderFlow(order, hostAtWidth()));

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
/** The app's own hosts: a phone checks out in the routed modal, a wide till in the columns. */
function hostAtWidth() {
	return mockSize === 'sm' ? 'modal' : 'columns';
}
jest.mock('../../../../../contexts/theme', () => ({ useTheme: () => ({ screenSize: mockSize }) }));

it('leaves wide checkout mode without navigating after cancellation', async () => {
	jest.clearAllMocks();
	mockSize = 'lg';
	mockVoidPayments.mockResolvedValue({ rows: [], failed: [] });
	enterCheckout(order.uuid);
	const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
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
		intentId: changes.row?.id ?? 'payment-1',
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
	it.each([null, 'register'])(
		'stamps the bound register, never the till, on server tenders (%s)',
		async (registerId) => {
			mockBoundRegisterId = registerId;
			mockSessionsOn = !!registerId;
			const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
			act(() => result.current.pickMethod('terminal'));
			await act(async () => result.current.takeTender());
			expect(mockBegin).toHaveBeenCalledWith(
				expect.objectContaining({
					row: expect.objectContaining({
						register_id: registerId,
						session_id: registerId ? 'session' : null,
					}),
				})
			);
		}
	);
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
		const { result, unmount } = renderHook(() => useTenderFlow(order, hostAtWidth()));
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
		const next = renderHook(() => useTenderFlow(order, hostAtWidth()));
		await act(async () => {});
		act(() => next.result.current.pickMethod('terminal'));
		expect(next.result.current.state.readerId).toBe(busy ? 'reader' : 'b');
	});
	it('applies a late remembered read when no reader has been picked', async () => {
		mockReaderPreferences.terminal = { id: 'reader', label: 'Reader' };
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
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => result.current.pickMethod('terminal'));
		expect(result.current.state.readerId).toBeNull();
		await waitFor(() => expect(result.current.state.readerId).toBe('reader'));
	});
	it('lets a remembered reader override the initially preselected default', async () => {
		mockReaderPreferences.terminal = { id: 'b', label: 'Back' };
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
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		expect(result.current.state.readerId).toBe('reader');
		await waitFor(() => expect(result.current.state.readerId).toBe('b'));
	});
	it('mints once, begins on the selected reader, and never records manually', async () => {
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
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
				// The cashier's approval, frozen at the press (ADR 0040).
				approval: { total: '92.95', currency: 'EUR' },
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
	it.each([
		['USD', 'USD'],
		[undefined, 'EUR'],
	])(
		'mints in the order currency (%s), the store currency only when it has none',
		async (orderCurrency, minted) => {
			// The store document says EUR; a saved cart opened in USD keeps USD.
			mockPayload = { ...mockPayload, currency: orderCurrency };
			const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
			act(() => result.current.pickMethod('terminal'));
			await act(async () => result.current.takeTender());
			expect(mockBegin).toHaveBeenCalledWith(
				expect.objectContaining({ row: expect.objectContaining({ currency: minted }) })
			);
		}
	);
	it.each(['reader', 'order'] as const)('refuses Take without %s', async (missing) => {
		if (missing === 'order') delete mockPayload.id;
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => result.current.pickMethod('terminal'));
		if (missing === 'reader')
			act(() => result.current.dispatch({ type: 'pick-reader', readerId: null }));
		await act(async () => result.current.takeTender());
		expect(mockBegin).not.toHaveBeenCalled();
		expect(mockInfo).toHaveBeenCalledWith(
			missing === 'reader'
				? 'pos_checkout.choose_a_terminal'
				: 'pos_checkout.order_not_on_store_yet',
			expect.objectContaining({
				showToast: true,
				context: expect.objectContaining({ orderUUID: 'order-1' }),
			})
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
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => result.current.pickMethod('terminal'));
		expect(result.current.state.readerId).toBeNull();
		act(() => result.current.pickReader('reader'));
		expect(result.current.state.readerId).toBe('reader');
		await act(async () => {});
	});
	it.each(['0.00', '42.95'])(
		'presents a recorded capture only at zero without completing it again (%s)',
		async (balance) => {
			resetCheckoutMode();
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
			mockLeg.settlement = {
				payment: mockLeg.row,
				outcome: 'captured',
				order: mockLeg.order,
				saleComplete: balance === '0.00',
			};
			const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
			expect(mockDismiss).toHaveBeenCalledTimes(balance === '0.00' ? 0 : 1);
			expect(result.current.state.view).toBe('amount');
			expect(mockCompleteOrderFlow).not.toHaveBeenCalled();
			expect(getCheckoutModeSnapshot().selectedReceiptOrder).toBe(
				balance === '0.00' ? 'order-1' : null
			);
			await act(async () => {});
		}
	);
	it('displays an offline authorization without narrating it on rerenders', async () => {
		mockLeg = terminalState({
			phase: 'final',
			outcome: 'captured',
			row: payment({
				capture_mode: 'device',
				status: 'authorized',
				recorded_offline: true,
			}),
		});
		mockLeg.settlement = { payment: mockLeg.row, outcome: 'captured', saleComplete: false };
		const { rerender } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		rerender();
		await act(async () => {});
		expect(
			mockInfo.mock.calls.filter(
				([, options]) => options.context?.type === 'payment.authorized-offline'
			)
		).toEqual([]);
	});
	it('retry preserves amount and reader but the next Take mints a new row', async () => {
		const { result, rerender } = renderHook(() => useTenderFlow(order, hostAtWidth()));
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
		['provider_declined', 'Bank says no', null, 'Bank says no', false],
		['wcpos_amount_exceeds_balance', 'Too much', null, 'pos_checkout.payment_not_recorded', false],
		// The leg copies a refusal code into the row; the cashier never reads the identifier.
		[
			'wcpos_amount_exceeds_balance',
			'Too much',
			'wcpos_amount_exceeds_balance',
			'pos_checkout.payment_not_recorded',
			false,
		],
		['wcpos_provider_error', 'Bank says no', 'card_declined', 'Bank says no', false],
		['wcpos_declined', 'declined', 'card_declined', 'pos_checkout.reason_card_declined', false],
		['provider_declined', 'Bank says no', null, 'Bank says no', true],
	] as const)(
		'only displays cashier copy for the initial Take (%s, reason %s, polling=%s)',
		async (code, message, failureReason, expected, polling) => {
			const { result, rerender } = renderHook(() => useTenderFlow(order, hostAtWidth()));
			act(() => result.current.pickMethod('terminal'));
			await act(async () => result.current.takeTender());
			if (polling) {
				mockLeg = { ...mockLeg!, phase: 'polling' };
				rerender();
			}
			const row = { ...mockLeg!.row, failure_reason: failureReason };
			mockLeg = {
				...mockLeg!,
				row,
				phase: 'final',
				outcome: 'failed',
				error: { code, message },
				settlement: { payment: row, outcome: 'failed', saleComplete: false },
			};
			rerender();
			expect(mockError).not.toHaveBeenCalled();
			expect(Toast.show).toHaveBeenCalledTimes(polling ? 0 : 1);
			if (!polling) expect(Toast.show).toHaveBeenCalledWith({ type: 'error', title: expected });
		}
	);
	it("recognizes an adopted row as the cashier's own Take by its intent id", async () => {
		const { result, rerender } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => result.current.pickMethod('terminal'));
		await act(async () => result.current.takeTender());
		const row = { ...mockLeg!.row, id: 'adopted-leg', status: 'failed' as const };
		mockLeg = {
			...mockLeg!,
			row,
			phase: 'final',
			outcome: 'failed',
			error: { code: 'provider_declined', message: 'Bank says no' },
			settlement: { payment: row, outcome: 'failed', saleComplete: false },
		};
		expect(mockLeg.intentId).not.toBe(mockLeg.row.id);
		rerender();
		expect(Toast.show).toHaveBeenCalledTimes(1);
		expect(Toast.show).toHaveBeenCalledWith({ type: 'error', title: 'Bank says no' });
	});
	it('does not narrate or toast a retained failure on remount', async () => {
		mockLeg = terminalState({ phase: 'final', outcome: 'failed', error: null });
		mockLeg.settlement = { payment: mockLeg.row, outcome: 'failed', saleComplete: false };
		const hook = renderHook(() => useTenderFlow(order, hostAtWidth()));
		await act(async () => {});
		hook.unmount();
		const reopened = renderHook(() => useTenderFlow(order, hostAtWidth()));
		expect(mockError).not.toHaveBeenCalled();
		expect(Toast.show).not.toHaveBeenCalled();
		await act(async () => {});
		reopened.unmount();
	});

	it('routes actions to the existing leg', async () => {
		mockLeg = terminalState();
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		await act(async () => {
			result.current.cancelTerminalLeg();
			result.current.releaseTerminalLeg();
			result.current.retryTerminalCapture();
		});
		expect(mockCancel).toHaveBeenCalledWith('cashier');
		expect(mockRelease).toHaveBeenCalledTimes(1);
		expect(mockCapture).toHaveBeenCalledTimes(1);
	});
	it.each([false, true])(
		'requests one finishing warning after receipt entry (checkout unmounted=%s)',
		async (unmounted) => {
			const { TerminalPaymentsService } = jest.requireActual<
				typeof import('../../../../../services/terminal-payments/service')
			>('../../../../../services/terminal-payments/service');
			let rejectCompletion!: (error: Error) => void;
			const captured = payment({ capture_mode: 'server', method_id: 'terminal' });
			const completeOrder = jest.fn(async (_uuid, actor, outcome) => {
				let finishingError: Error;
				const ready = new Promise<void>((resolve) => {
					rejectCompletion = (error) => {
						finishingError = error;
						resolve();
					};
				});
				await provenance.completeSale(
					{
						userDB: {},
						siteUuid: 'site',
						storeId: 9,
						dp: 2,
						actor,
						runtime: { engine: { require: () => ({ ready, release: jest.fn() }) } },
						stockAdjustment: () => {
							throw finishingError;
						},
					} as unknown as provenance.SaleContext,
					order,
					outcome,
					{ host: 'background' }
				);
			});
			const service = new TerminalPaymentsService({
				http: {
					get: async () => ({
						data: {
							payment: captured,
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
					post: jest.fn(),
				},
				commandPoster: () => passThroughPoster(jest.fn()),
				mirror: async () => {},
				completeOrder,
			});
			mockRealService = service;
			const hook = renderHook(() => useTenderFlow(order, hostAtWidth()));
			try {
				await act(async () => {
					const leg = service.resume({
						orderUuid: 'order-1',
						orderId: 42,
						orderNumber: '42',
						row: { ...captured, status: 'pending' },
					})!;
					await leg.checkNow();
				});
				expect(getCheckoutModeSnapshot().receiptOrders.has('order-1')).toBe(true);
				expect(completeOrder).toHaveBeenCalledTimes(1);
				if (unmounted) hook.unmount();
				await act(async () => rejectCompletion(new Error('completion failed')));
				const warnings = mockError.mock.calls.filter(([, options]) => options.showToast);
				expect(warnings.length + (Toast.show as jest.Mock).mock.calls.length).toBe(1);
				expect(service.get('order-1')?.settlement?.finishingError).toBe('completion failed');
			} finally {
				hook.unmount();
				service.stop();
				mockRealService = null;
			}
		}
	);
	it.each(['before-response', 'during-recording', 'receipt-entry'] as const)(
		'real bridge records once when checkout unmounts %s, before refresh finishes',
		async (when) => {
			resetCheckoutMode();
			const checkoutMode = await import('../checkout-mode');
			enterCheckout('order-1');
			let respond!: (value: unknown) => void;
			let recorded!: () => void;
			let refreshed!: () => void;
			mockManualPost.mockImplementation(
				() =>
					new Promise((resolve) => {
						respond = resolve;
					})
			);
			mockManualMirror.mockImplementation(async ({ changes }: { changes: object }) => {
				if (when === 'during-recording')
					await new Promise<void>((resolve) => {
						recorded = resolve;
					});
				mockPayload = { ...mockPayload, ...changes };
				// Deliver the paid record emission before the mirror returns to the service.
				if (when === 'receipt-entry') flushSync(() => host.rerender(<Host />));
			});
			mockRequire.mockReturnValue({
				ready: new Promise<void>((resolve) => {
					refreshed = resolve;
				}),
				release: jest.fn(),
			});
			const bridge = renderHook(() => useTerminalPaymentsService());
			function Checkout() {
				const flow = useTenderFlow(order, hostAtWidth());
				return (
					<>
						<button onClick={() => flow.pickMethod('terminal')}>Pick</button>
						<button onClick={() => void flow.takeTender()}>Take</button>
					</>
				);
			}
			function Host() {
				return useOrderCheckoutStage(order) === 'receipt' ? (
					<span data-testid="receipt">Receipt</span>
				) : (
					<Checkout />
				);
			}
			const host = render(<Host />);
			fireEvent.click(host.getByRole('button', { name: 'Pick' }));
			await act(async () => fireEvent.click(host.getByRole('button', { name: 'Take' })));
			if (when === 'before-response') host.unmount();
			await act(async () =>
				respond({
					data: {
						payment: payment({
							status: 'captured',
							capture_mode: 'server',
							method_id: 'terminal',
							kind: 'card',
							amount: '92.95',
							tendered: null,
							change: null,
						}),
						order: {
							status: 'completed',
							total: '92.95',
							paid: '92.95',
							balance: '0.00',
							payment_method: 'terminal',
							payment_method_title: 'Card',
						},
					},
				})
			);
			if (when === 'during-recording') {
				expect(mockRealService!.get('order-1')?.settlement).toBeUndefined();
				host.unmount();
				await act(async () => recorded());
			}
			if (when === 'receipt-entry') {
				expect(host.getByTestId('receipt')).toBeDefined();
			}
			expect(getCheckoutModeSnapshot().receiptOrders.has('order-1')).toBe(true);
			// Background confirmation never selects the receipt; the current order derives it.
			expect(getCheckoutModeSnapshot().selectedReceiptOrder).toBeNull();
			expect(mockCompleteOrderFlow).not.toHaveBeenCalled();
			expect(mockRequire).toHaveBeenCalledTimes(1);
			expect(
				mockInfo.mock.calls.filter(([, options]) => options.context?.type === 'payment.captured')
			).toHaveLength(1);
			expect(
				mockInfo.mock.calls.filter(([, options]) => options.context?.type === 'checkout.completed')
			).toHaveLength(0);
			await act(async () => refreshed());
			expect(mockAdjustStock).toHaveBeenCalledTimes(1);
			expect(
				mockInfo.mock.calls.filter(([, options]) => options.context?.type === 'checkout.completed')
			).toHaveLength(1);
			if (when === 'receipt-entry') {
				host.unmount();
				act(() => {
					checkoutMode.finishReceipt('order-1');
					enterCheckout('order-1');
				});
				// Orders -> Re-open gives the same order a fresh tender flow.
				mockPayload = { id: 42, number: '42', total: '92.95', meta_data: [] };
				const reopened = renderHook(() => useTenderFlow(order, hostAtWidth()));
				await act(async () => {});
				expect(reopened.result.current.terminalLeg).toBeNull();
				// A re-opened flow must not bring the finished sale's receipt back.
				expect(getCheckoutModeSnapshot().selectedReceiptOrder).toBeNull();
				act(() => reopened.result.current.pickMethod('terminal'));
				await act(async () => reopened.result.current.takeTender());
				expect(mockManualPost).toHaveBeenCalledTimes(2);
				expect(getCheckoutModeSnapshot().selectedReceiptOrder).toBeNull();
				reopened.unmount();
			}
			bridge.unmount();
			mockRealService = null;
			mockManualPost.mockReset();
			mockManualMirror.mockReset();
		}
	);
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
			commandPoster: () => passThroughPoster(post),
			mirror: async () => {},
		});
		registerDriver(createSimulatedDriver());
		mockReaderPreferences.device = {
			id: 'remembered',
			label: 'Remembered',
			transport: 'bluetooth',
		};
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		await act(async () => result.current.pickMethod('device'));
		expect(result.current.rememberedReaderId).toBe('remembered');
		await expect(result.current.bootstrapReader('bluetooth')).resolves.toEqual({
			token: 'connection',
			method_id: 'device',
		});
		expect(post).toHaveBeenCalledWith('payment-methods/device/bootstrap', {
			context: { transport: 'bluetooth' },
		});
		await act(async () =>
			result.current.rememberReader({
				id: 'replacement',
				label: 'Replacement',
				transport: 'bluetooth',
			})
		);
		expect(mockReaderPreferences.device.id).toBe('replacement');
		mockRealService.stop();
		mockRealService = null;
	});
	it('refuses a press on an order the store has not created, before the reader starts', async () => {
		delete mockPayload.id;
		const driver = createSimulatedDriver();
		registerDriver(driver);
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => result.current.pickMethod(deviceMethod.id));
		await act(async () => {
			await driver.connect!((await driver.discoverReaders!('bluetooth'))[0], null);
		});
		expect(result.current.deviceReady).toBe(true);
		await act(async () => result.current.takeTender());
		expect(mockBegin).not.toHaveBeenCalled();
		expect(mockInfo).toHaveBeenCalledWith(
			'pos_checkout.order_not_on_store_yet',
			expect.objectContaining({ showToast: true })
		);
		expect(mockError).not.toHaveBeenCalled();
	});
	it('requires connection and stamps the session on device tender', async () => {
		mockSessionsOn = true;
		const driver = createSimulatedDriver();
		registerDriver(driver);
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
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
				approval: { total: mockPayload.total, currency: 'EUR' },
				row: expect.objectContaining({
					capture_mode: 'device',
					status: 'pending',
					session_id: 'session',
					provider_refs: { reader: driver.status$.get().reader!.id },
				}),
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
			const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
			await act(async () => result.current.pickMethod(deviceMethod.id));
			const take = result.current.takeTender;
			let connecting!: Promise<void>;
			act(() => {
				connecting = driver.connect!(readers[0], null);
			});
			expect(result.current.deviceReady).toBe(false);
			await act(async () => take());
			expect(mockBegin).not.toHaveBeenCalled();
			expect(mockInfo).toHaveBeenCalledWith(
				'pos_checkout.reader_connecting',
				expect.objectContaining({ showToast: true })
			);
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
	it('the connected reader decides the transport unless the cashier picked one', async () => {
		// Readers connect on Settings → Card readers (roadmap#407): a Tap to Pay reader that is
		// already connected makes the leg a tap_to_pay leg without a chip tap in the sheet.
		const driver = createSimulatedDriver();
		registerDriver(driver);
		const reader = (await driver.discoverReaders!('tap_to_pay'))[0];
		jest.spyOn(driver.status$, 'get').mockReturnValue({ connection: 'connected', reader });
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		await act(async () => result.current.pickMethod(deviceMethod.id));
		expect(result.current.deviceTransport).toBe('tap_to_pay');
		expect(result.current.deviceReady).toBe(true);
		// A transport left over from an earlier reader does not outrank the connected one.
		await act(async () => result.current.pickTransport!('bluetooth'));
		expect(result.current.deviceTransport).toBe('tap_to_pay');
		expect(result.current.deviceReady).toBe(true);
	});
	it.each(['disconnected', 'discovering', 'updating', 'no-reader'] as const)(
		'keeps Take unavailable and refuses minting with %s',
		async (state) => {
			const driver = createSimulatedDriver();
			driver.capabilities.discovery = 'sdk_ui';
			registerDriver(driver);
			const reader = (await driver.discoverReaders!('tap_to_pay'))[0];
			jest.spyOn(driver.status$, 'get').mockReturnValue({
				connection: state === 'no-reader' ? 'connected' : state,
				reader: state === 'no-reader' ? null : reader,
			});
			const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
			await act(async () => result.current.pickMethod(deviceMethod.id));
			expect(result.current.deviceReady).toBe(false);
			await act(async () => result.current.takeTender());
			expect(mockBegin).not.toHaveBeenCalled();
			expect(mockInfo).toHaveBeenCalledWith(
				'pos_checkout.reader_disconnected',
				expect.objectContaining({ showToast: true })
			);
		}
	);
	it('does not locally void an offline device authorization when abandoning a split sale', async () => {
		mockPayload = {
			...mockPayload,
			meta_data: withLedger([], [{ ...deviceRow, status: 'authorized', recorded_offline: true }]),
		};
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		await act(async () => result.current.cancelPayment());
		expect(mockVoidPayments).not.toHaveBeenCalled();
		expect(mockInfo).toHaveBeenCalled();
	});
});
// ADR 0040 §offline: offline tenders do not queue, so a device tile whose descriptor allows an
// offline queue is not reopened offline on any transport.
it('does not reopen an offline device tile, whatever its descriptor allows offline', async () => {
	jest.clearAllMocks();
	mockLeg = null;
	mockRealService = null;
	mockMethods = [deviceMethod];
	mockOnlineStatus = 'online-website-available';
	mockPayload = { id: 42, number: '42', total: '92.95', meta_data: [] };
	resetCheckoutMode();
	registerDriver(createSimulatedDriver());
	const { result, rerender } = renderHook(() => useTenderFlow(order, hostAtWidth()));
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
	expect(result.current.state.methodId).toBeNull();
	expect(result.current.tiles[0]).toMatchObject({ disabled: true, reason: 'offline' });
});

let mockBoundRegisterId: string | null = 'register';
beforeEach(() => {
	mockBoundRegisterId = 'register';
});
let mockBindingStatus: 'bound' | 'choose' | 'none' | 'unknown' = 'bound';
jest.mock('../../../../../services/register/use-register-binding', () => ({
	useRegisterBinding: () => ({
		status: mockBindingStatus,
		registerId: null,
		registerName: null,
		registers: [],
		bind: jest.fn(),
	}),
}));

it('zero balance writes its provenance once, then closes', async () => {
	jest.mocked(recordCompletionAttempt).mockClear();
	mockPayload = { id: 42, total: '0.00', meta_data: [] };
	mockManualPost.mockResolvedValue({
		data: { order: { status: 'completed' }, completion: { n: 1, id: 'c1' } },
	});
	mockLocalPatch.mockClear();
	mockLocalPatch.mockResolvedValue({ document: order });
	mockBlockIfDegraded.mockReturnValue(false);
	mockOnlineStatus = 'online-website-available';
	const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
	await act(async () => result.current.takeTender());
	expect(jest.mocked(recordCompletionAttempt).mock.invocationCallOrder[0]).toBeLessThan(
		mockLocalPatch.mock.invocationCallOrder[0]
	);
	expect(mockLocalPatch).toHaveBeenCalledTimes(1);
	expect(mockLocalPatch).toHaveBeenCalledWith(
		{ document: order, changes: expect.any(Function) },
		{ collectionName: 'orders' }
	);
	expect(mockLocalPatch.mock.calls[0][0].changes(mockPayload)).toEqual({
		meta_data: [{ key: '_wcpos_sale_counter', value: '1' }],
	});
	expect(mockManualPost.mock.invocationCallOrder[0]).toBeGreaterThan(
		mockLocalPatch.mock.invocationCallOrder[0]
	);
});

it.each([
	['1.00', 'pos-open', false, 1000],
	['0.00', 'completed', true, 1000],
	['0.00', 'completed', true, 500],
] as const)(
	'manual online tender uses server balance %s (%s, complete %s, tender %s)',
	async (balance, status, completed, amountMinor) => {
		jest.clearAllMocks();
		resetCheckoutMode();
		enterCheckout(order.uuid);
		mockUseRealManual = true;
		mockUseRealCompletion = true;
		mockAutoShowReceipt = true;
		mockLeg = null;
		mockPayload = { id: 42, total: '10.00', meta_data: [] };
		mockMethods = methods;
		mockOnlineStatus = 'online-website-available';
		mockBlockIfDegraded.mockReturnValue(false);
		mockLocalPatch.mockResolvedValue(order);
		mockManualPost.mockResolvedValue({
			data: {
				order: {
					status,
					total: completed ? (amountMinor / 100).toFixed(2) : '11.00',
					paid: (amountMinor / 100).toFixed(2),
					balance,
					payment_method: 'pos_cash',
					payment_method_title: 'Cash',
				},
			},
		});
		mockManualMirror.mockImplementation(async ({ changes }: { changes: object }) => {
			mockPayload = { ...mockPayload, ...changes };
		});
		mockRequire.mockImplementation(() => ({
			ready: Promise.resolve().then(() => {
				mockPayload = {
					...mockPayload,
					total: completed ? (amountMinor / 100).toFixed(2) : '11.00',
				};
			}),
			release: jest.fn(),
		}));
		const view = renderHook(() => useTenderFlow(order, hostAtWidth()));
		try {
			act(() => view.result.current.pickMethod('pos_cash'));
			if (amountMinor === 500)
				act(() => view.result.current.dispatch({ type: 'set-entry', minor: 500 }));
			expect(view.result.current.entryAppliedMinor).toBe(amountMinor);
			await act(async () => view.result.current.takeTender());
			expect(mockManualPost).toHaveBeenCalledTimes(1);
			expect(mockManualMirror).toHaveBeenCalledTimes(1);
			expect(order.getLatest().payload.status).toBe(status);
			expect(getCheckoutModeSnapshot().receiptOrders.has(order.uuid)).toBe(completed);
			expect(
				mockInfo.mock.calls.filter(([, options]) => options.context?.type === 'checkout.completed')
			).toHaveLength(completed ? 1 : 0);
			expect(mockSetCurrentOrderID).not.toHaveBeenCalled();
			expect(mockReplace).not.toHaveBeenCalled();
			expect(mockRequire).toHaveBeenCalledTimes(1);
			expect(mockRequire).toHaveBeenCalledWith(
				expect.objectContaining({ kind: 'targeted-records', remoteIds: ['42'], forceRefresh: true })
			);
			if (!completed) {
				expect(view.result.current.balanceMinor).toBe(100);
				expect(view.result.current.entryAppliedMinor).toBe(100);
				expect(view.result.current.state.entryMinor).toBe(100);
				expect(view.result.current.busy).toBe(false);
			}
			if (amountMinor === 500) {
				expect(recordCompletionAttempt).toHaveBeenCalledTimes(1);
				expect(recordCompletionAttempt).toHaveBeenCalledWith(undefined, {
					orderUuid: order.uuid,
					source: 'manual',
					actor: { id: '7', name: 'Pat' },
				});
				expect(jest.mocked(recordCompletionAttempt).mock.invocationCallOrder[0]).toBeLessThan(
					mockRequire.mock.invocationCallOrder[0]
				);
			}
			expect(mockError).not.toHaveBeenCalled();
		} finally {
			view.unmount();
			mockUseRealManual = false;
			mockUseRealCompletion = false;
			mockManualMirror.mockReset();
			mockRequire.mockReset();
			jest.clearAllMocks();
		}
	}
);

it('full manual online tender persists provenance before POST and the mirror', async () => {
	jest.mocked(provenance.completionMetaFor).mockClear();
	jest.mocked(recordCompletionAttempt).mockClear();
	mockUseRealManual = true;
	mockLocalPatch.mockClear();
	mockManualMirror.mockClear();
	mockPayload = { id: 42, total: '10.00', meta_data: [] };
	mockMethods = methods;
	mockOnlineStatus = 'online-website-available';
	mockBlockIfDegraded.mockReturnValue(false);
	mockManualPost.mockResolvedValue({ data: { order: { status: 'completed', balance: '0.00' } } });
	resetCheckoutMode();
	const view = renderHook(() => useTenderFlow(order, hostAtWidth()));
	try {
		act(() => view.result.current.pickMethod('pos_cash'));
		let release!: () => void;
		jest.mocked(recordCompletionAttempt).mockImplementationOnce(
			() =>
				new Promise<void>((resolve) => {
					release = resolve;
				})
		);
		let taking!: Promise<void>;
		await act(async () => {
			taking = view.result.current.takeTender();
		});
		expect(recordCompletionAttempt).toHaveBeenCalledTimes(1);
		expect(mockLocalPatch).not.toHaveBeenCalled();
		expect(mockManualPost).not.toHaveBeenCalled();
		await act(async () => {
			release();
			await taking;
		});
		expect(mockManualMirror).toHaveBeenCalledTimes(1);
		expect(recordCompletionAttempt).toHaveBeenCalledWith(undefined, {
			orderUuid: order.uuid,
			source: 'manual',
			actor: { id: '7', name: 'Pat' },
		});
		expect(jest.mocked(recordCompletionAttempt).mock.invocationCallOrder[0]).toBeLessThan(
			jest.mocked(provenance.completionMetaFor).mock.invocationCallOrder[0]
		);
		expect(mockLocalPatch).toHaveBeenCalledTimes(1);
		expect(mockLocalPatch.mock.invocationCallOrder[0]).toBeLessThan(
			mockPushDocument.mock.invocationCallOrder[0]
		);
		expect(mockPushDocument.mock.invocationCallOrder[0]).toBeLessThan(
			mockManualPost.mock.invocationCallOrder[0]
		);
		expect(mockManualPost.mock.invocationCallOrder[0]).toBeLessThan(
			mockManualMirror.mock.invocationCallOrder[0]
		);
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
	it.each([false, true])(
		'passes the final three split shares, replacing what an earlier attempt wrote (%s)',
		async (existing) => {
			const original = { key: '_wcpos_split', value: 'original split' };
			const { result, rerender } = renderHook(() => useTenderFlow(order, hostAtWidth()));
			act(() =>
				result.current.dispatch({
					type: 'set-plan',
					plan: { kind: 'even', ways: 3, from: 0 },
					balanceMinor: 9295,
				})
			);
			mockPayload.meta_data = withLedger(existing ? [original] : [], [
				payment({ id: 'first', amount: '30.99' }),
				payment({ id: 'declined', amount: '30.98', status: 'failed' }),
				payment({ id: 'second', amount: '30.98' }),
			]);
			rerender();
			act(() => result.current.pickMethod('terminal'));
			expect(result.current.entryAppliedMinor).toBe(3098);
			const beforeMeta = mockPayload.meta_data;
			await act(async () => result.current.takeTender());
			const split = {
				key: '_wcpos_split',
				value: JSON.stringify({ kind: 'even', ways: 3, shares: ['30.99', '30.98', '30.98'] }),
			};
			expect(persistProvenanceSpy).toHaveBeenCalledWith(
				expect.anything(),
				expect.objectContaining({ extraMeta: [split] })
			);
			// A declined attempt followed by a re-divided remainder must not leave the first
			// attempt's shares on the order: the split is replaced by key, in place so a synced
			// entry keeps its Woo id, never kept.
			expect(mockLocalPatch).toHaveBeenCalledWith({
				document: order,
				data: {
					meta_data: existing
						? [
								split,
								...beforeMeta.filter(({ key }) => key !== '_wcpos_split'),
								{ key: '_wcpos_sale_counter', value: '1' },
							]
						: [...beforeMeta, { key: '_wcpos_sale_counter', value: '1' }, split],
				},
			});
			expect(mockBegin).toHaveBeenCalledTimes(1);
		}
	);
	it('a completion with no plan clears the split a failed earlier attempt left behind', async () => {
		const stale = { id: 7, key: '_wcpos_split', value: 'stale' };
		mockPayload.meta_data = withLedger([stale], [payment({ id: 'first', amount: '46.48' })]);
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => result.current.pickMethod('terminal'));
		await act(async () => result.current.takeTender());
		const cleared = { key: '_wcpos_split', value: null };
		expect(persistProvenanceSpy).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ extraMeta: [cleared] })
		);
		// A synced entry is nulled rather than dropped: that is how Woo is told to delete it.
		expect(mockLocalPatch).toHaveBeenCalledWith({
			document: order,
			data: {
				meta_data: expect.arrayContaining([{ id: 7, key: '_wcpos_split', value: null }]),
			},
		});
	});
	it('the last leg of a split past its planned ways still records the shares', async () => {
		// Two legs of 30.00 against a 2-way plan, then the rest: activePlan is null by then, the
		// stored plan is not. The journal must carry every share (Greptile on #2453).
		mockMethods = [cash];
		mockPayload.meta_data = withLedger(
			[],
			[payment({ id: 'a', amount: '30.00' }), payment({ id: 'b', amount: '30.00' })]
		);
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() =>
			result.current.dispatch({
				type: 'set-plan',
				plan: { kind: 'even', ways: 2, from: 0 },
				balanceMinor: 3295,
			})
		);
		expect(result.current.plan).toBeNull();
		act(() => result.current.pickMethod('pos_cash'));
		act(() => result.current.dispatch({ type: 'set-entry', minor: 3295 }));
		await act(async () => result.current.takeTender());
		const [, , input] = mockRecordManualPayment.mock.calls[0];
		expect(input.extraMeta?.[0].key).toBe('_wcpos_split');
		expect(JSON.parse(input.extraMeta?.[0].value as string)).toMatchObject({
			kind: 'even',
			shares: ['30.00', '30.00', '32.95'],
		});
	});
	it('hands the split summary to a cash leg, which never passes through saveProvenance', async () => {
		mockMethods = [cash];
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() =>
			result.current.dispatch({
				type: 'set-plan',
				plan: { kind: 'even', ways: 2, from: 0 },
				balanceMinor: 9295,
			})
		);
		act(() => result.current.pickMethod('pos_cash'));
		await act(async () => result.current.takeTender());
		const [, , input] = mockRecordManualPayment.mock.calls[0];
		expect(input.extraMeta).toHaveLength(1);
		expect(input.extraMeta?.[0].key).toBe('_wcpos_split');
		expect(JSON.parse(input.extraMeta?.[0].value as string)).toEqual({
			kind: 'even',
			ways: 2,
			shares: ['46.48'],
		});
	});
	it('awaits the explicit tuple write before beginning the server leg', async () => {
		jest.mocked(recordCompletionAttempt).mockClear();
		let finish!: (value: typeof order) => void;
		mockPushDocument.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					finish = resolve;
				})
		);
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => result.current.pickMethod('terminal'));
		let take!: Promise<void>;
		await act(async () => {
			take = result.current.takeTender();
		});
		expect(mockLocalPatch).toHaveBeenCalledWith({
			document: order,
			data: { meta_data: [{ key: '_wcpos_sale_counter', value: '1' }] },
		});
		expect(persistProvenanceSpy).toHaveBeenCalledTimes(1);
		expect(persistProvenanceSpy.mock.calls[0][1]).toHaveProperty('extraMeta', undefined);
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
		expect(jest.mocked(recordCompletionAttempt).mock.invocationCallOrder[0]).toBeLessThan(
			mockBegin.mock.invocationCallOrder[0]
		);
	});
	it('does not begin a provider leg after a failed explicit save', async () => {
		mockPushDocument.mockRejectedValueOnce(new Error('save failed'));
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
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
	it('reports a provenance push refused for the session as AUTH101', async () => {
		const { WriteDeferredError } = jest.requireMock('@wcpos/query');
		mockPushDocument.mockRejectedValueOnce(new WriteDeferredError('mutation-1', 401));
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => result.current.pickMethod('terminal'));
		await act(async () => result.current.takeTender());
		expect(mockBegin).not.toHaveBeenCalled();
		const failures = mockError.mock.calls.filter(([message]) => message === 'Checkout failed');
		expect(failures).toHaveLength(1);
		expect(failures[0][1]).toEqual(expect.objectContaining({ code: 'AUTH101' }));
	});
	it('does not stamp a partial server leg', async () => {
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => result.current.pickMethod('terminal'));
		act(() => result.current.dispatch({ type: 'set-entry', minor: 5000 }));
		await act(async () => result.current.takeTender());
		expect(mockBegin).toHaveBeenCalledTimes(1);
		expect(mockLocalPatch).not.toHaveBeenCalled();
		expect(mockPushDocument).not.toHaveBeenCalled();
	});
});

it('does not claim the store holds a payment it refused but could not mirror', async () => {
	mockUseRealManual = true;
	jest.clearAllMocks();
	resetCheckoutMode();
	mockLeg = null;
	mockMethods = methods;
	mockPayload = { id: 42, total: '10.00', meta_data: [] };
	mockOnlineStatus = 'online-website-available';
	mockBlockIfDegraded.mockReturnValue(false);
	mockLocalPatch.mockResolvedValue(order);
	mockPushDocument.mockResolvedValue(order);
	// The server refuses and stores a `failed` row; mirroring that refusal then fails.
	mockManualPost.mockRejectedValue({
		response: {
			status: 409,
			data: { code: 'wcpos_order_already_paid', data: { order: { status: 'completed' } } },
		},
	});
	mockManualMirror.mockRejectedValue(new Error('resident write failed'));
	const view = renderHook(() => useTenderFlow(order, hostAtWidth()));
	try {
		act(() => view.result.current.pickMethod('pos_cash'));
		await act(async () => view.result.current.takeTender());

		// Nothing was taken, so "the store has this payment, don't take it again" would
		// both contradict the refusal the cashier was just shown and block a corrected
		// retry. The refusal row is the one that speaks.
		expect(mockWarn).not.toHaveBeenCalled();
		expect(view.result.current.state).toMatchObject({ view: 'select', methodId: null });
		// The refusal is kept for Orders (ADR 0040 Decided 1 rule 4), mirror or no mirror.
		expect(recordPaymentAttention).toHaveBeenCalledWith(
			mockStoreDB,
			expect.objectContaining({ orderUuid: order.uuid, orderId: 42 })
		);
	} finally {
		view.unmount();
		mockUseRealManual = false;
		mockManualMirror.mockReset();
		mockManualPost.mockReset();
	}
});

it('reports a payment the store took but the till could not mirror, and never says it was not recorded', async () => {
	mockUseRealManual = true;
	jest.clearAllMocks();
	resetCheckoutMode();
	mockLeg = null;
	mockMethods = methods;
	mockPayload = { id: 42, total: '10.00', meta_data: [] };
	mockOnlineStatus = 'online-website-available';
	mockBlockIfDegraded.mockReturnValue(false);
	mockLocalPatch.mockResolvedValue(order);
	mockPushDocument.mockResolvedValue(order);
	mockCompleteOrderFlow.mockResolvedValue(undefined);
	// The store answers 2xx and settles the order; only the local mirror fails.
	mockManualPost.mockResolvedValue({ data: { order: { status: 'completed', balance: '0.00' } } });
	mockManualMirror.mockRejectedValue(new Error('resident write failed'));
	const view = renderHook(() => useTenderFlow(order, hostAtWidth()));
	try {
		act(() => view.result.current.pickMethod('pos_cash'));
		await act(async () => view.result.current.takeTender());

		expect(mockWarn).toHaveBeenCalledWith(
			'pos_checkout.payment_recorded_not_synced',
			expect.objectContaining({
				code: 'PAYMENT111',
				showToast: true,
				context: expect.objectContaining({
					type: 'payment.not-mirrored',
					orderId: 42,
					paymentId: expect.any(String),
				}),
			})
		);
		expect(mockError).not.toHaveBeenCalled();
		// The store said the order is settled, so the sale still finishes.
		expect(mockCompleteOrderFlow).toHaveBeenCalledWith(
			expect.objectContaining({ source: 'manual', via: 'online' }),
			expect.anything()
		);
	} finally {
		view.unmount();
		mockUseRealManual = false;
		mockManualMirror.mockReset();
	}
});

// Codex on C1-S1: the payment stands once the store answered; a completion that throws after it
// is a failed status check, never "nothing was taken, try again", and the fee stays.
it('a recorded payment whose mirror and completion both fail warns status-check-failed, never PAYMENT999', async () => {
	mockUseRealManual = true;
	jest.clearAllMocks();
	resetCheckoutMode();
	mockLeg = null;
	mockMethods = methods;
	mockPayload = { id: 42, total: '10.00', meta_data: [] };
	mockOnlineStatus = 'online-website-available';
	mockBlockIfDegraded.mockReturnValue(false);
	mockLocalPatch.mockResolvedValue(order);
	mockPushDocument.mockResolvedValue(order);
	mockCompleteOrderFlow.mockRejectedValueOnce(new Error('journal write failed'));
	mockManualPost.mockResolvedValue({ data: { order: { status: 'completed', balance: '0.00' } } });
	mockManualMirror.mockRejectedValue(new Error('resident write failed'));
	const view = renderHook(() => useTenderFlow(order, hostAtWidth()));
	try {
		act(() => view.result.current.pickMethod('pos_cash'));
		await act(async () => view.result.current.takeTender());

		expect(mockWarn).toHaveBeenCalledWith(
			'pos_checkout.payment_recorded_not_synced',
			expect.objectContaining({ code: 'PAYMENT111' })
		);
		expect(mockWarn).toHaveBeenCalledWith(
			'journal write failed',
			expect.objectContaining({ code: 'PAYMENT101', showToast: true })
		);
		expect(mockError).not.toHaveBeenCalled();
		expect(view.result.current.busy).toBe(false);
	} finally {
		view.unmount();
		mockUseRealManual = false;
		mockManualMirror.mockReset();
		mockCompleteOrderFlow.mockReset();
		mockCompleteOrderFlow.mockResolvedValue(undefined);
	}
});

it('keeps the pane on the balance the store reports when a partial payment could not be mirrored', async () => {
	mockUseRealManual = true;
	jest.clearAllMocks();
	resetCheckoutMode();
	mockLeg = null;
	mockMethods = methods;
	mockPayload = { id: 42, total: '10.00', meta_data: [] };
	mockOnlineStatus = 'online-website-available';
	mockBlockIfDegraded.mockReturnValue(false);
	mockLocalPatch.mockResolvedValue(order);
	mockPushDocument.mockResolvedValue(order);
	mockCompleteOrderFlow.mockResolvedValue(undefined);
	mockManualPost.mockResolvedValue({ data: { order: { status: 'pos-open', balance: '5.00' } } });
	mockManualMirror.mockRejectedValue(new Error('resident write failed'));
	const view = renderHook(() => useTenderFlow(order, hostAtWidth()));
	try {
		act(() => view.result.current.pickMethod('pos_cash'));
		act(() => view.result.current.dispatch({ type: 'set-entry', minor: 500 }));
		await act(async () => view.result.current.takeTender());

		expect(mockWarn).toHaveBeenCalledTimes(1);
		expect(mockCompleteOrderFlow).toHaveBeenCalledWith(
			expect.objectContaining({
				source: 'manual',
				mirrorFailed: true,
				order: { status: 'pos-open', balance: '5.00' },
			}),
			expect.anything()
		);
		expect(provenance.isSaleComplete(mockCompleteOrderFlow.mock.calls[0][0], 2)).toBe(false);
		// The resident order is the copy that failed to save, and the recovery refresh may
		// not have landed, so the derived balance is still the pre-payment one. What must
		// not happen is the keypad pre-typing the whole balance again on a payment the store
		// already took: folding the accepted row into the pane's own ledger re-types the 5.00
		// that is actually left.
		expect(view.result.current.state).toMatchObject({ entryMinor: 500, methodId: 'pos_cash' });
	} finally {
		view.unmount();
		mockUseRealManual = false;
		mockManualMirror.mockReset();
	}
});

it('resets a failed manual tender without logging a second error or toast', async () => {
	jest.clearAllMocks();
	resetCheckoutMode();
	mockLeg = null;
	mockMethods = methods;
	mockPayload = { id: 42, total: '10.00', meta_data: [] };
	mockRecordManualPayment.mockResolvedValueOnce({ kind: 'failed' });
	const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
	act(() => result.current.pickMethod('pos_cash'));
	await act(async () => result.current.takeTender());
	expect(mockRecordManualPayment).toHaveBeenCalledTimes(1);
	expect(mockError).not.toHaveBeenCalled();
	expect(mockInfo).not.toHaveBeenCalled();
	expect(result.current.state).toMatchObject({ view: 'select', methodId: null });
	expect(getCheckoutModeSnapshot().tenderMethods.has(order.uuid)).toBe(false);
	expect(mockCompleteOrderFlow).not.toHaveBeenCalled();
});

let mockSessionsOn = false;
let mockSessionId: string | null = 'session';
beforeEach(() => {
	mockSessionsOn = false;
	mockSessionId = 'session';
});

it('no open session: toasts without POST, recording a leg or rejecting tender', async () => {
	jest.clearAllMocks();
	mockResolveSession.mockRejectedValueOnce(new RegisterSessionRequiredError());
	mockSessionsOn = true;
	mockSessionId = null;
	mockLeg = null;
	mockRealService = null;
	resetCheckoutMode();
	const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
	await act(async () => {
		await expect(result.current.takeTender()).resolves.toBeUndefined();
	});
	expect(mockInfo).toHaveBeenCalledWith(
		'pos_checkout.open_register_first',
		expect.objectContaining({ showToast: true })
	);
	expect(mockRecordManualPayment).not.toHaveBeenCalled();
	expect(mockBegin).not.toHaveBeenCalled();
	expect(mockLocalPatch).not.toHaveBeenCalled();
	expect(mockPushDocument).not.toHaveBeenCalled();
	expect(mockCompleteOrderFlow).not.toHaveBeenCalled();
	expect(result.current.busy).toBe(false);
});

describe('register still to be chosen', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		resetCheckoutMode();
		mockMethods = [cash];
		mockPayload = { id: 42, total: '92.95', meta_data: [] };
		mockBlockIfDegraded.mockReturnValue(false);
		mockBindingStatus = 'choose';
	});
	afterEach(() => {
		mockBindingStatus = 'bound';
	});
	it('refuses the completing leg until a register is picked, with the reason on screen', async () => {
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => result.current.pickMethod('pos_cash'));
		await act(async () => result.current.takeTender());
		expect(mockRecordManualPayment).not.toHaveBeenCalled();
		expect(mockInfo).toHaveBeenCalledWith(
			'pos_checkout.choose_register_first',
			expect.objectContaining({ showToast: true })
		);
	});
	it('lets a part payment through: only completion needs the register', async () => {
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => result.current.pickMethod('pos_cash'));
		act(() => result.current.dispatch({ type: 'set-entry', minor: 5000 }));
		await act(async () => result.current.takeTender());
		expect(mockRecordManualPayment).toHaveBeenCalledTimes(1);
	});
	it('a store with no register at all keeps trading', async () => {
		mockBindingStatus = 'none';
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => result.current.pickMethod('pos_cash'));
		await act(async () => result.current.takeTender());
		expect(mockRecordManualPayment).toHaveBeenCalledTimes(1);
	});
});

it('does not present a raw final leg until the service records its settlement', async () => {
	resetCheckoutMode();
	mockLeg = terminalState({ phase: 'final', outcome: 'captured' });
	const hook = renderHook(() => useTenderFlow(order, hostAtWidth()));
	await act(async () => {});
	expect(getCheckoutModeSnapshot().receiptOrders.has('order-1')).toBe(false);
	hook.unmount();
});

it.each([
	['modal', [{ pathname: '/cart' }]],
	['columns', undefined],
] as const)(
	'a terminal sale completing with no receipt stage on a wide screen leaves the %s host it opened in',
	async (host, replacedWith) => {
		jest.clearAllMocks();
		resetCheckoutMode();
		mockSize = 'lg';
		mockAutoShowReceipt = false;
		mockLeg = terminalState({ phase: 'final', outcome: 'captured' });
		mockLeg.settlement = { payment: mockLeg.row, outcome: 'captured', saleComplete: true };
		try {
			// A standalone checkout is the routed modal on a wide screen too.
			const hook = renderHook(() => useTenderFlow(order, host));
			await act(async () => {});
			if (replacedWith) expect(mockReplace).toHaveBeenCalledWith(...replacedWith);
			else expect(mockReplace).not.toHaveBeenCalled();
			expect(mockDismissTo).not.toHaveBeenCalled();
			hook.unmount();
		} finally {
			mockSize = 'sm';
			mockAutoShowReceipt = true;
		}
	}
);

it('retains a late finishing error without duplicating the service warning or offering another collection', async () => {
	jest.clearAllMocks();
	mockLeg = terminalState({ phase: 'final', outcome: 'captured' });
	mockLeg.settlement = { payment: mockLeg.row, outcome: 'captured', saleComplete: true };
	const hook = renderHook(() => useTenderFlow(order, hostAtWidth()));
	mockLeg = {
		...mockLeg,
		settlement: { ...mockLeg.settlement, finishingError: 'local write failed' },
	};
	hook.rerender();
	await act(async () => {});
	expect(Toast.show).not.toHaveBeenCalled();
	expect(hook.result.current.terminalLeg?.settlement?.finishingError).toBe('local write failed');
	expect(mockError).not.toHaveBeenCalled();
	expect(mockBegin).not.toHaveBeenCalled();
	hook.unmount();
});

it('keeps a captured partial payment with a failed mirror out of the Take pane', async () => {
	jest.clearAllMocks();
	mockLeg = terminalState({ phase: 'final', outcome: 'captured' });
	mockLeg.settlement = {
		payment: mockLeg.row,
		outcome: 'captured',
		saleComplete: false,
		finishingError: 'local write failed',
	};
	const hook = renderHook(() => useTenderFlow(order, hostAtWidth()));
	await act(async () => {});
	expect(mockDismiss).not.toHaveBeenCalled();
	expect(hook.result.current.terminalLeg?.outcome).toBe('captured');
	expect(Toast.show).not.toHaveBeenCalled();
	hook.unmount();
});

it('does not describe a refused payment with a mirror failure as paid', async () => {
	jest.clearAllMocks();
	mockLeg = terminalState({ phase: 'final', outcome: 'failed' });
	mockLeg.settlement = {
		payment: mockLeg.row,
		outcome: 'failed',
		saleComplete: false,
		finishingError: 'local write failed',
	};
	const hook = renderHook(() => useTenderFlow(order, hostAtWidth()));
	await act(async () => {});
	expect(Toast.show).not.toHaveBeenCalled();
	hook.unmount();
});

jest.mock('../sale-completion', () => {
	const actual = jest.requireActual<typeof import('../sale-completion')>('../sale-completion');
	const { withMetaReplaced } =
		jest.requireActual<typeof import('@wcpos/order-math')>('@wcpos/order-math');
	const completionMetaFor = jest.fn<
		ReturnType<typeof actual.completionMetaFor>,
		Parameters<typeof actual.completionMetaFor>
	>();
	completionMetaFor.mockImplementation(async (_ctx, meta, facts) =>
		withMetaReplaced(meta, [{ key: '_wcpos_sale_counter', value: '1' }, ...(facts.extraMeta ?? [])])
	);
	return {
		...actual,
		recordSaleAttempt: jest.fn(actual.recordSaleAttempt),
		refreshOrderRecord: jest.fn(actual.refreshOrderRecord),
		completionMetaFor,
		persistSaleProvenance: jest.fn(
			async (
				ctx: import('../sale-completion').SaleContext,
				input: Parameters<typeof actual.persistSaleProvenance>[1]
			) => {
				const meta_data = input.online
					? await completionMetaFor(ctx, input.order.getLatest().payload.meta_data, input)
					: withMetaReplaced(input.order.getLatest().payload.meta_data, input.extraMeta ?? []);
				if (!input.online && !input.extraMeta) return;
				if (!(await ctx.stampCompletion(input.order, meta_data)))
					throw new Error('provenance_save_failed');
				if (input.online) {
					mockPayload.meta_data = meta_data;
					await ctx.pushDocument(input.order);
				}
			}
		),
	};
});

jest.mock('../hooks/use-sale-context', () => ({
	useSaleContext: () => ({
		actionActor: { userId: 7, registerId: 'register', sessionId: null },
		actionCtx: createActionContext({
			log: (_level, message, options) => {
				const { category: _category, ...rest } = options ?? {};
				mockInfo(message, rest);
			},
			t: (key) => key,
			readCatalog: async () => null,
			readPaymentMethod: () => null,
			preventOverselling: false,
			priceDecimals: 2,
			resolveSession: async () => ({ registerId: null, sessionId: null }),
		}),

		userDB: { getLocal: async () => null },
		sessionsOn: mockSessionsOn,
		siteUuid: 'site',
		storeId: 1,
		runtime: mockRuntime,
		dp: 2,
		stampCompletion: (
			...[o, m]: Parameters<import('../sale-completion').SaleContext['stampCompletion']>
		) => mockLocalPatch({ document: o, data: { meta_data: m } }),
		pushDocument: mockPushDocument,
		actor: { id: '7', name: 'Pat' },
		stockAdjustment: mockAdjustStock,
	}),
}));

// Journal storage is exercised against RxDB in the owner/journal suites.
jest.mock('@wcpos/query/store-local', () => ({
	...jest.requireActual('@wcpos/query/store-local'),
	recordCompletionAttempt: jest.fn(async () => {}),
	resolveCompletionAttempt: jest.fn(async () => {}),
	failCompletionAttempt: jest.fn(async () => {}),
	observeTenderGate: () => mockGate$,
	readAwaitingAnswer: jest.fn(async () => []),
	readJournaledRecordIds: jest.fn(async () => new Set()),
	recordPaymentAttention: jest.fn(async () => {}),
}));

describe('gateway capture mode (contract 1.2)', () => {
	const invoice = {
		...card,
		id: 'wcpos_email_invoice',
		title: 'Email Invoice',
		kind: 'other',
		order: 5,
		capture: { ...card.capture, mode: 'gateway', webview_available: true },
		capabilities: { ...card.capabilities, amount: { partial: false }, offline: 'none' },
		fields: {
			schema: 1,
			verb: { kind: 'send', label: 'Send invoice' },
			components: [
				{
					component: 'field',
					id: 'woocommerce_pos_invoice_email_address',
					input: 'email',
					label: 'Email address',
					required: true,
					default: '',
					prefill: 'order.billing.email',
				},
				{
					component: 'checkbox',
					id: 'woocommerce_pos_save_billing_email',
					label: 'Save email to billing address',
					default: false,
					prefill: null,
				},
			],
		},
	} satisfies PaymentMethodDescriptor;
	const summary = (status: string) => ({
		status,
		total: '92.95',
		paid: '0.00',
		balance: '92.95',
		payment_method: 'wcpos_email_invoice',
		payment_method_title: 'Email Invoice',
	});
	const stamp = {
		method_id: 'wcpos_email_invoice',
		destination: 'buyer@example.com',
		attempt_id: 'attempt-0',
		sent_at_gmt: '2026-10-08T10:00:00.000Z',
		cashier_id: 7,
	};
	beforeEach(() => {
		jest.clearAllMocks();
		resetCheckoutMode();
		mockLeg = null;
		mockRealService = null;
		mockMethods = [cash, invoice];
		mockPayload = {
			id: 42,
			total: '92.95',
			meta_data: [],
			billing: { email: 'buyer@example.com', phone: '' },
		};
		mockBlockIfDegraded.mockReturnValue(false);
		mockLocalPatch.mockResolvedValue({ document: order });
		mockManualMirror.mockResolvedValue(undefined);
		mockCompleteOrderFlow.mockResolvedValue(undefined);
		mockGatewaysGet.mockResolvedValue({ data: [] });
	});

	it.each(['pos_cash', 'wcpos_email_invoice'])(
		'refuses %s on an order the store has not created: no fee, no record, no submit',
		async (methodId) => {
			const rounding = { increment: '0.05', mode: 'nearest' as const };
			mockMethods = [{ ...cash, defaults: { ...cash.defaults, rounding } }, invoice];
			mockPayload = { total: '10.02', meta_data: [], billing: mockPayload.billing };
			const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
			act(() => result.current.pickMethod(methodId));
			await act(async () => result.current.takeTender());
			expect(mockInfo).toHaveBeenCalledWith(
				'pos_checkout.order_not_on_store_yet',
				expect.objectContaining({ showToast: true })
			);
			expect(mockRecordManualPayment).not.toHaveBeenCalled();
			expect(mockManualPost).not.toHaveBeenCalled();
			expect(mockLocalPatch).not.toHaveBeenCalled();
			expect(mockError).not.toHaveBeenCalled();
		}
	);

	it('a settled answer is the paid completion: no row, no stamp, the stored status journaled, the sale leaves the till', async () => {
		// The gateway catalog names the status the merchant stored for the gateway.
		mockGatewaysGet.mockResolvedValue({
			data: [{ id: 'wcpos_email_invoice', settled_order_status: 'pending' }],
		});
		mockPayload.meta_data = [{ key: '_wcpos_awaiting_customer', value: stamp }];
		mockManualPost.mockResolvedValue({
			data: { outcome: 'settled', payment: null, order: summary('pending') },
		});
		mockManualMirror.mockImplementation(async ({ changes }: { changes: object }) => {
			mockPayload = { ...mockPayload, ...changes };
		});
		mockRequire.mockImplementation(() => ({ ready: Promise.resolve(), release: jest.fn() }));
		enterCheckout(order.uuid);
		mockUseRealCompletion = true;
		mockAutoShowReceipt = true;
		const view = renderHook(() => useTenderFlow(order, hostAtWidth()));
		try {
			act(() => view.result.current.pickMethod('wcpos_email_invoice'));
			// The catalog lands after mount; the press reads it.
			await act(async () => {});
			await act(async () => view.result.current.takeTender());
			expect(mockManualPost).toHaveBeenCalledWith(
				'orders/42/payment-methods/wcpos_email_invoice/submit',
				expect.objectContaining({ attempt_id: expect.any(String) })
			);
			expect(recordCompletionAttempt).toHaveBeenCalledWith(undefined, {
				orderUuid: order.uuid,
				source: 'gateway',
				actor: { id: '7', name: 'Pat' },
				settledOrderStatus: 'pending',
				settledOrderGateway: 'wcpos_email_invoice',
			});
			// The stale stamp goes with the mirror; no row is minted.
			expect(mockManualMirror).toHaveBeenCalledWith(
				expect.objectContaining({
					changes: {
						status: 'pending',
						meta_data: expect.not.arrayContaining([
							expect.objectContaining({ key: '_wcpos_awaiting_customer' }),
							expect.objectContaining({ key: '_wcpos_payments' }),
						]),
					},
				})
			);
			expect(order.getLatest().payload.status).toBe('pending');
			expect(getCheckoutModeSnapshot().receiptOrders.has(order.uuid)).toBe(true);
			expect(
				mockInfo.mock.calls.filter(([, options]) => options.context?.type === 'checkout.completed')
			).toHaveLength(1);
			expect(mockRequire).toHaveBeenCalledWith(
				expect.objectContaining({ kind: 'targeted-records', remoteIds: ['42'], forceRefresh: true })
			);
			expect(mockRecordManualPayment).not.toHaveBeenCalled();
			expect(mockError).not.toHaveBeenCalled();
			expect(view.result.current.busy).toBe(false);
		} finally {
			view.unmount();
			mockUseRealCompletion = false;
			mockManualMirror.mockReset();
			mockRequire.mockReset();
		}
	});

	it('a settled answer without the receipt stage says the paid sentence, never the sent one', async () => {
		mockAutoShowReceipt = false;
		mockPayload.number = '1042';
		mockCompleteOrderFlow.mockResolvedValueOnce('completed');
		mockManualPost.mockResolvedValue({
			data: { outcome: 'settled', payment: null, order: summary('pending') },
		});
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		try {
			act(() => result.current.pickMethod('wcpos_email_invoice'));
			await act(async () => result.current.takeTender());
			expect(mockCompleteOrderFlow).toHaveBeenCalledWith(
				{ source: 'gateway-settled', order: summary('pending') },
				expect.objectContaining({ dispatchToken: expect.any(Object) })
			);
			expect(mockInfo).toHaveBeenCalledWith(
				'pos_checkout.payment_completed_for_order',
				expect.objectContaining({
					showToast: true,
					context: expect.objectContaining({
						orderId: 42,
						method: 'wcpos_email_invoice',
						outcome: 'settled',
						status: 'pending',
					}),
				})
			);
			expect(mockInfo).not.toHaveBeenCalledWith('pos_checkout.invoice_sent', expect.anything());
			// Nothing stored for the gateway: the attempt journals no status.
			expect(jest.mocked(provenance.recordSaleAttempt)).toHaveBeenCalledWith(
				expect.anything(),
				expect.objectContaining({ source: 'gateway', completing: true, settledOrderStatus: null })
			);
		} finally {
			mockAutoShowReceipt = true;
		}
	});

	it('a mirror failure after the store answered settled completes the sale and warns, never "try again"', async () => {
		mockManualPost.mockResolvedValue({
			data: { outcome: 'settled', payment: null, order: summary('pending') },
		});
		mockManualMirror.mockRejectedValueOnce(new Error('disk'));
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => result.current.pickMethod('wcpos_email_invoice'));
		await act(async () => result.current.takeTender());
		expect(mockWarn).toHaveBeenCalledWith(
			'pos_checkout.payment_recorded_not_synced',
			expect.objectContaining({
				code: 'PAYMENT111',
				showToast: true,
				context: expect.objectContaining({ type: 'payment.not-mirrored', outcome: 'settled' }),
			})
		);
		expect(mockError).not.toHaveBeenCalled();
		// Completed inside the commit's queue slot, like an answer that mirrored.
		expect(mockCompleteOrderFlow).toHaveBeenCalledWith(
			{ source: 'gateway-settled', order: summary('pending') },
			expect.anything()
		);
		expect(result.current.busy).toBe(false);
	});

	// ADR 0040: the approval is frozen at the press, before the provenance save; the poster then
	// refuses a submit whose order moved (query/tests/money-command.test.ts).
	it('a provenance push that moves the total from 100 to 120 leaves the submit approved at 100', async () => {
		mockPayload.total = '100.00';
		mockManualPost.mockResolvedValue({
			data: { outcome: 'sent', payment: null, order: summary('pending') },
		});
		jest.mocked(provenance.persistSaleProvenance).mockImplementationOnce(async () => {
			mockPayload.total = '120.00';
		});
		mockPosterInputs.length = 0;
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => result.current.pickMethod('wcpos_email_invoice'));
		await act(async () => result.current.takeTender());
		expect(mockPosterInputs.at(-1)?.approval).toEqual({ total: '100.00', currency: 'EUR' });
	});

	// Codex 4340856695 on #2798: a settled answer the resident after the mirror does not show (a
	// reopen adopted since) is no finished sale, so the paid sentence is not said.
	it('a settled answer whose resident reads open says no paid sentence', async () => {
		mockAutoShowReceipt = false;
		mockManualPost.mockResolvedValue({
			data: { outcome: 'settled', payment: null, order: summary('pending') },
		});
		mockCompleteOrderFlow.mockImplementationOnce(async () => {
			mockPayload = { ...mockPayload, status: 'pos-open' } as typeof mockPayload;
			return 'not-completed';
		});
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		try {
			act(() => result.current.pickMethod('wcpos_email_invoice'));
			await act(async () => result.current.takeTender());
			expect(mockCompleteOrderFlow).toHaveBeenCalledTimes(1);
			expect(mockInfo).not.toHaveBeenCalledWith(
				'pos_checkout.payment_completed_for_order',
				expect.anything()
			);
		} finally {
			mockAutoShowReceipt = true;
		}
	});

	it('a replayed paid submit whose sale was reopened since finishes nothing and says so', async () => {
		const { resolveCompletionAttempt } = jest.requireMock('@wcpos/query/store-local');
		mockManualPost.mockResolvedValue({
			data: { outcome: 'paid', payment: null, order: summary('pos-open') },
		});
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => result.current.pickMethod('wcpos_email_invoice'));
		await act(async () => result.current.takeTender());
		expect(mockCompleteOrderFlow).not.toHaveBeenCalled();
		// The reopen ends the completion attempt at the press, as a reopened close does.
		expect(resolveCompletionAttempt).toHaveBeenCalledWith(expect.anything(), order.uuid);
		expect(mockInfo).toHaveBeenCalledWith(
			'pos_checkout.sale_reopened_elsewhere',
			expect.objectContaining({ showToast: true })
		);
	});

	// CodeRabbit 4346454779 on #2837: a reopened replay took no money, whatever its mirror did.
	it('a reopened replay whose mirror fails says the sale was reopened, never recorded', async () => {
		mockManualPost.mockResolvedValue({
			data: { outcome: 'paid', payment: null, order: summary('pos-open') },
		});
		mockManualMirror.mockRejectedValueOnce(new Error('disk'));
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => result.current.pickMethod('wcpos_email_invoice'));
		await act(async () => result.current.takeTender());
		expect(mockInfo).toHaveBeenCalledWith(
			'pos_checkout.sale_reopened_elsewhere',
			expect.objectContaining({ showToast: true })
		);
		expect(mockWarn).not.toHaveBeenCalledWith(
			'pos_checkout.payment_recorded_not_synced',
			expect.anything()
		);
		expect(mockCompleteOrderFlow).not.toHaveBeenCalled();
	});

	it('a cancel answered with the order not open again says the invoice stands', async () => {
		const stamp = {
			method_id: 'wcpos_email_invoice',
			destination: 'a@b.c',
			attempt_id: 'attempt-1',
			sent_at_gmt: '2026-10-20T10:00:00Z',
			cashier_id: 7,
		};
		mockPayload = {
			...mockPayload,
			meta_data: [{ key: '_wcpos_awaiting_customer', value: stamp }],
		} as typeof mockPayload;
		mockManualPost.mockResolvedValue({ data: { order: summary('completed') } });
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		await act(async () => result.current.cancelInvoice());
		expect(mockWarn).toHaveBeenCalledWith(
			'pos_checkout.invoice_not_cancelled',
			expect.objectContaining({ showToast: true })
		);
		expect(mockInfo).not.toHaveBeenCalledWith('pos_checkout.invoice_cancelled', expect.anything());
	});

	// Codex 4346411064 on #2837: a mirror failure does not turn an unchanged answer into a cancel.
	it('a cancel answered not open whose mirror fails still says the invoice stands', async () => {
		const stamp = {
			method_id: 'wcpos_email_invoice',
			destination: 'a@b.c',
			attempt_id: 'attempt-1',
			sent_at_gmt: '2026-10-20T10:00:00Z',
			cashier_id: 7,
		};
		mockPayload = {
			...mockPayload,
			meta_data: [{ key: '_wcpos_awaiting_customer', value: stamp }],
		} as typeof mockPayload;
		mockManualPost.mockResolvedValue({ data: { order: summary('completed') } });
		mockManualMirror.mockRejectedValueOnce(new Error('disk'));
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		await act(async () => result.current.cancelInvoice());
		expect(mockWarn).toHaveBeenCalledWith(
			'pos_checkout.invoice_not_cancelled',
			expect.objectContaining({ showToast: true })
		);
		expect(mockWarn).not.toHaveBeenCalledWith(
			'pos_checkout.invoice_cancelled_not_synced',
			expect.anything()
		);
	});

	it('prefills the declared components from the order and posts them under a fresh attempt id', async () => {
		mockManualPost.mockResolvedValue({
			data: { outcome: 'sent', payment: null, order: summary('pending') },
		});
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => result.current.pickMethod('wcpos_email_invoice'));
		expect(result.current.fieldValues).toEqual({
			woocommerce_pos_invoice_email_address: 'buyer@example.com',
			woocommerce_pos_save_billing_email: false,
		});
		act(() =>
			result.current.setFieldValues(
				{ ...result.current.fieldValues, woocommerce_pos_save_billing_email: true },
				'woocommerce_pos_save_billing_email'
			)
		);
		await act(async () => result.current.takeTender());
		expect(mockManualPost).toHaveBeenCalledWith(
			'orders/42/payment-methods/wcpos_email_invoice/submit',
			{
				attempt_id: expect.stringMatching(/^payment-\d+$/),
				values: {
					woocommerce_pos_invoice_email_address: 'buyer@example.com',
					woocommerce_pos_save_billing_email: true,
				},
			}
		);
		// The completing provenance went first; the stamp and the server status are mirrored.
		expect(provenance.persistSaleProvenance).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ online: true })
		);
		expect(mockManualMirror).toHaveBeenCalledWith(
			expect.objectContaining({
				changes: expect.objectContaining({
					status: 'pending',
					meta_data: expect.arrayContaining([
						expect.objectContaining({
							key: '_wcpos_awaiting_customer',
							value: expect.objectContaining({ destination: 'buyer@example.com' }),
						}),
					]),
				}),
			})
		);
		expect(mockCompleteOrderFlow).toHaveBeenCalledWith(
			{
				source: 'gateway',
				order: summary('pending'),
				stamp: expect.objectContaining({ method_id: 'wcpos_email_invoice' }),
			},
			expect.objectContaining({ dispatchToken: expect.any(Object) })
		);
		expect(mockRecordManualPayment).not.toHaveBeenCalled();
		expect(result.current.busy).toBe(false);
	});

	it('runs the whole order whatever another pill left typed, and is journaled as completing', async () => {
		mockManualPost.mockResolvedValue({
			data: { outcome: 'sent', payment: null, order: summary('pending') },
		});
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => result.current.pickMethod('pos_cash'));
		act(() => result.current.dispatch({ type: 'key', key: '2' }));
		act(() => result.current.pickMethod('wcpos_email_invoice'));
		// The reducer keeps a hand-typed amount across pills (ledger line 1); what is applied is the balance.
		expect(result.current.entryAppliedMinor).toBe(9295);
		await act(async () => result.current.takeTender());
		expect(jest.mocked(provenance.recordSaleAttempt)).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ source: 'gateway', completing: true })
		);
		expect(provenance.persistSaleProvenance).toHaveBeenCalled();
	});

	it('leaves the shared entry alone: a typed cash amount survives a visit to the invoice pill', async () => {
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => result.current.pickMethod('pos_cash'));
		act(() => result.current.dispatch({ type: 'set-entry', minor: 4648 }));
		act(() => result.current.pickMethod('wcpos_email_invoice'));
		expect(result.current.entryAppliedMinor).toBe(9295);
		act(() => result.current.pickMethod('pos_cash'));
		expect(result.current.state.entryMinor).toBe(4648);
		expect(result.current.entryAppliedMinor).toBe(4648);
		await act(async () => {});
	});

	it('drops an unstarted split plan when a whole-order gateway is picked', async () => {
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() =>
			result.current.dispatch({
				type: 'set-plan',
				plan: { kind: 'even', ways: 2, from: 0 },
				balanceMinor: 9295,
			})
		);
		expect(result.current.plan).not.toBeNull();
		act(() => result.current.pickMethod('wcpos_email_invoice'));
		expect(result.current.plan).toBeNull();
		expect(getCheckoutModeSnapshot().tenderPlans.get(order.uuid)).toBeUndefined();
		await act(async () => {});
	});

	it('a split plan set after the invoice pill is picked is ignored and never journaled', async () => {
		mockManualPost.mockResolvedValue({
			data: { outcome: 'sent', payment: null, order: summary('pending') },
		});
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => result.current.pickMethod('wcpos_email_invoice'));
		act(() =>
			result.current.dispatch({
				type: 'set-plan',
				plan: { kind: 'even', ways: 2, from: 0 },
				balanceMinor: 9295,
			})
		);
		expect(result.current.plan).toBeNull();
		expect(result.current.planLabel).toBeNull();
		await act(async () => result.current.takeTender());
		expect(provenance.persistSaleProvenance).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ extraMeta: undefined })
		);
	});

	it('a change of pill mints a new attempt; the id the stamp already names is never replayed', async () => {
		mockManualPost.mockRejectedValueOnce(
			Object.assign(new Error('down'), { response: { status: 503 } })
		);
		mockManualPost.mockResolvedValue({
			data: { outcome: 'sent', payment: null, order: summary('pending') },
		});
		const { result, rerender } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => result.current.pickMethod('wcpos_email_invoice'));
		await act(async () => result.current.takeTender());
		act(() => result.current.pickMethod('pos_cash'));
		act(() => result.current.pickMethod('wcpos_email_invoice'));
		await act(async () => result.current.takeTender());
		const ids = mockManualPost.mock.calls.map(
			([, body]) => (body as { attempt_id: string }).attempt_id
		);
		expect(ids[0]).not.toBe(ids[1]);
		// The lost answer syncs in as the stamp: the next press is Send again, under a new id.
		mockManualPost.mockRejectedValueOnce(
			Object.assign(new Error('down'), { response: { status: 503 } })
		);
		await act(async () => result.current.takeTender());
		const lost = (mockManualPost.mock.calls.at(-1)![1] as { attempt_id: string }).attempt_id;
		mockPayload.meta_data = [
			{ key: '_wcpos_awaiting_customer', value: { ...stamp, attempt_id: lost } },
		];
		rerender();
		await act(async () => result.current.takeTender());
		expect((mockManualPost.mock.calls.at(-1)![1] as { attempt_id: string }).attempt_id).not.toBe(
			lost
		);
	});

	it('the next pill starts from the balance once the invoice pill dropped a plan', async () => {
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => result.current.pickMethod('pos_cash'));
		act(() =>
			result.current.dispatch({
				type: 'set-plan',
				plan: { kind: 'even', ways: 2, from: 0 },
				balanceMinor: 9295,
			})
		);
		expect(result.current.state.entryMinor).toBe(4648);
		act(() => result.current.pickMethod('wcpos_email_invoice'));
		act(() => result.current.pickMethod('pos_cash'));
		expect(result.current.plan).toBeNull();
		expect(result.current.state.entryMinor).toBe(9295);
		await act(async () => {});
	});

	it('a cancel the store applied but the till could not save is still a cancel', async () => {
		mockPayload.meta_data = [{ key: '_wcpos_awaiting_customer', value: stamp }];
		mockManualPost.mockResolvedValue({ data: { order: summary('pos-open') } });
		mockManualMirror.mockRejectedValueOnce(new Error('disk'));
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		await act(async () => result.current.cancelInvoice());
		expect(mockInfo).toHaveBeenCalledWith(
			'pos_checkout.invoice_cancelled',
			expect.objectContaining({
				context: expect.objectContaining({ type: 'checkout.cancelled', attemptId: 'attempt-0' }),
			})
		);
		expect(mockWarn).toHaveBeenCalledWith(
			'pos_checkout.invoice_cancelled_not_synced',
			expect.objectContaining({
				code: 'PAYMENT113',
				toast: { title: 'pos_checkout.invoice_cancelled_not_synced' },
			})
		);
		expect(mockError).not.toHaveBeenCalled();
		expect(result.current.busy).toBe(false);
	});

	it('a new attempt id after a change of values', async () => {
		mockManualPost.mockRejectedValueOnce(
			Object.assign(new Error('down'), { response: { status: 503 } })
		);
		mockManualPost.mockResolvedValue({
			data: { outcome: 'sent', payment: null, order: summary('pending') },
		});
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => result.current.pickMethod('wcpos_email_invoice'));
		await act(async () => result.current.takeTender());
		act(() =>
			result.current.setFieldValues(
				{ ...result.current.fieldValues, woocommerce_pos_invoice_email_address: 'other@b.c' },
				'woocommerce_pos_invoice_email_address'
			)
		);
		await act(async () => result.current.takeTender());
		const ids = mockManualPost.mock.calls.map(
			([, body]) => (body as { attempt_id: string }).attempt_id
		);
		expect(ids[0]).not.toBe(ids[1]);
	});

	it('Send again prefills where the last invoice went when the order has no billing email', async () => {
		mockPayload.billing = { email: '', phone: '' };
		mockPayload.meta_data = [{ key: '_wcpos_awaiting_customer', value: stamp }];
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => result.current.pickMethod('wcpos_email_invoice'));
		expect(result.current.fieldValues.woocommerce_pos_invoice_email_address).toBe(
			'buyer@example.com'
		);
		await act(async () => {});
	});

	it('keeps the attempt id across a lost answer so the retry replays, and clears it after', async () => {
		mockManualPost
			.mockRejectedValueOnce(Object.assign(new Error('down'), { response: { status: 503 } }))
			.mockResolvedValueOnce({
				data: { outcome: 'sent', payment: null, order: summary('pending') },
			})
			.mockResolvedValueOnce({
				data: { outcome: 'sent', payment: null, order: summary('pending') },
			});
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => result.current.pickMethod('wcpos_email_invoice'));
		await act(async () => result.current.takeTender());
		expect(mockError).toHaveBeenCalledWith(
			'pos_checkout.payment_not_recorded',
			expect.objectContaining({ showToast: true })
		);
		await act(async () => result.current.takeTender());
		await act(async () => result.current.takeTender());
		const ids = mockManualPost.mock.calls.map(
			([, body]) => (body as { attempt_id: string }).attempt_id
		);
		expect(ids).toHaveLength(3);
		expect(ids[0]).toBe(ids[1]);
		expect(ids[2]).not.toBe(ids[1]);
	});

	it('a mirror failure after the store answered sent completes the sale and warns, never "try again"', async () => {
		mockManualPost.mockResolvedValue({
			data: { outcome: 'sent', payment: null, order: summary('pending') },
		});
		mockManualMirror.mockRejectedValueOnce(new Error('disk'));
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => result.current.pickMethod('wcpos_email_invoice'));
		await act(async () => result.current.takeTender());
		expect(mockWarn).toHaveBeenCalledWith(
			'pos_checkout.invoice_sent_not_synced',
			expect.objectContaining({
				code: 'PAYMENT113',
				showToast: true,
				toast: { title: 'pos_checkout.invoice_sent_not_synced' },
			})
		);
		expect(mockError).not.toHaveBeenCalled();
		expect(mockCompleteOrderFlow).toHaveBeenCalledWith(
			expect.objectContaining({ source: 'gateway', order: summary('pending') }),
			expect.anything()
		);
	});

	// Codex on C1-S1: the invoice stands once answered; a completion that throws after it is a
	// failed status check, never the generic "nothing was taken, try again".
	it('a sent answer whose mirror and completion both fail warns status-check-failed, never PAYMENT999', async () => {
		mockManualPost.mockResolvedValue({
			data: { outcome: 'sent', payment: null, order: summary('pending') },
		});
		mockManualMirror.mockRejectedValueOnce(new Error('disk'));
		mockCompleteOrderFlow.mockRejectedValueOnce(new Error('journal write failed'));
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => result.current.pickMethod('wcpos_email_invoice'));
		await act(async () => result.current.takeTender());
		expect(mockWarn).toHaveBeenCalledWith(
			'pos_checkout.invoice_sent_not_synced',
			expect.objectContaining({ code: 'PAYMENT113' })
		);
		expect(mockWarn).toHaveBeenCalledWith(
			'journal write failed',
			expect.objectContaining({ code: 'PAYMENT101', showToast: true })
		);
		expect(mockError).not.toHaveBeenCalled();
		expect(result.current.busy).toBe(false);
	});

	it('a refusal belongs to the pill it came from', async () => {
		mockManualPost.mockRejectedValue(
			Object.assign(new Error('invalid'), {
				response: {
					status: 400,
					data: { code: 'wcpos_fields_invalid', data: { errors: { _form: ['Nope.'] } } },
				},
			})
		);
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => result.current.pickMethod('wcpos_email_invoice'));
		await act(async () => result.current.takeTender());
		expect(result.current.fieldErrors).toEqual({ _form: 'Nope.' });
		act(() => result.current.pickMethod('pos_cash'));
		expect(result.current.fieldErrors).toEqual({});
	});

	it('a leg that lands while provenance saves stops the send', async () => {
		jest.mocked(provenance.persistSaleProvenance).mockImplementationOnce(async () => {
			mockPayload.meta_data = withLedger(mockPayload.meta_data, [payment({ status: 'pending' })]);
		});
		mockManualPost.mockResolvedValue({
			data: { outcome: 'sent', payment: null, order: summary('pending') },
		});
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => result.current.pickMethod('wcpos_email_invoice'));
		await act(async () => result.current.takeTender());
		expect(mockManualPost).not.toHaveBeenCalled();
		expect(mockInfo).toHaveBeenCalledWith(
			'pos_checkout.not_with_split',
			expect.objectContaining({ showToast: true })
		);
	});

	it('refuses to send with the required field empty, naming it, without a request', async () => {
		mockPayload.billing = { email: '', phone: '' };
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => result.current.pickMethod('wcpos_email_invoice'));
		await act(async () => result.current.takeTender());
		expect(mockManualPost).not.toHaveBeenCalled();
		expect(mockInfo).toHaveBeenCalledWith(
			'pos_checkout.enter_field',
			expect.objectContaining({ showToast: true })
		);
	});

	it('wcpos_fields_invalid lands under its component and clears when it is edited', async () => {
		mockManualPost.mockRejectedValue(
			Object.assign(new Error('invalid'), {
				response: {
					status: 400,
					data: {
						code: 'wcpos_fields_invalid',
						message: 'Check the details.',
						data: { errors: { woocommerce_pos_invoice_email_address: 'Enter a valid email.' } },
					},
				},
			})
		);
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => result.current.pickMethod('wcpos_email_invoice'));
		await act(async () => result.current.takeTender());
		expect(result.current.fieldErrors).toEqual({
			woocommerce_pos_invoice_email_address: 'Enter a valid email.',
		});
		expect(mockCompleteOrderFlow).not.toHaveBeenCalled();
		expect(mockError).not.toHaveBeenCalled();
		act(() =>
			result.current.setFieldValues(
				{ ...result.current.fieldValues, woocommerce_pos_invoice_email_address: 'x@y.z' },
				'woocommerce_pos_invoice_email_address'
			)
		);
		expect(result.current.fieldErrors).toEqual({});
	});

	it("the gateway's own refusal is the toast; nothing is completed", async () => {
		mockManualPost.mockRejectedValue(
			Object.assign(new Error('refused'), {
				response: {
					status: 502,
					data: { code: 'wcpos_provider_error', message: 'Mail server unreachable.' },
				},
			})
		);
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => result.current.pickMethod('wcpos_email_invoice'));
		await act(async () => result.current.takeTender());
		expect(mockError).toHaveBeenCalledWith(
			'Mail server unreachable.',
			expect.objectContaining({
				code: 'PAYMENT212',
				showToast: true,
				toast: { title: 'Mail server unreachable.' },
			})
		);
		expect(mockCompleteOrderFlow).not.toHaveBeenCalled();
		expect(result.current.busy).toBe(false);
	});

	// #2900: a 409 wcpos_payment_in_flight {attempt_id} is an attempt that may have taken money.
	describe('an attempt with no answer yet', () => {
		const inFlight = (data: object = { attempt_id: 'attempt-9' }) =>
			Object.assign(new Error('in flight'), {
				response: {
					status: 409,
					data: { code: 'wcpos_payment_in_flight', message: 'No outcome yet.', data },
				},
			});
		const unanswered = () =>
			mockWarn.mock.calls.filter(([message]) => message === 'pos_checkout.attempt_unanswered');
		const expectOneWarning = (context: object) => {
			expect(unanswered()).toEqual([
				[
					'pos_checkout.attempt_unanswered',
					{ showToast: true, context: expect.objectContaining(context) },
				],
			]);
			expect(mockError).not.toHaveBeenCalled();
			expect(mockCompleteOrderFlow).not.toHaveBeenCalled();
		};

		it('a press answered in flight warns once, never PAYMENT212 or "send again"', async () => {
			mockManualPost.mockRejectedValue(inFlight());
			const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
			act(() => result.current.pickMethod('wcpos_email_invoice'));
			await act(async () => result.current.takeTender());
			expectOneWarning({ attemptId: 'attempt-9', method: 'wcpos_email_invoice' });
			expect(mockInfo).not.toHaveBeenCalledWith(
				'pos_checkout.order_open_send_again',
				expect.anything()
			);
			expect(result.current.busy).toBe(false);
		});

		it('a zero-balance close answered in flight warns the same, never CHECKOUT101', async () => {
			mockPayload = { id: 42, total: '0.00', meta_data: [] };
			mockManualPost.mockRejectedValue(
				inFlight({ attempt_id: 'attempt-9', order: summary('pos-partial') })
			);
			const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
			await act(async () => result.current.takeTender());
			expect(mockManualPost).toHaveBeenCalledWith('orders/42/close', {});
			expectOneWarning({ attemptId: 'attempt-9' });
		});

		it('a Try again answered in flight warns the same, never PAYMENT201', async () => {
			mockResend.mockRejectedValueOnce(inFlight());
			const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
			await act(async () => result.current.retryCommand());
			expectOneWarning({ attemptId: 'attempt-9' });
		});
	});

	it('a recorded answer is a manual leg: the returned row completes the sale', async () => {
		const row = payment({
			id: 'payment-9',
			method_id: 'wcpos_email_invoice',
			capture_mode: 'gateway',
			amount: '92.95',
			tendered: null,
		});
		mockManualPost.mockResolvedValue({
			data: {
				outcome: 'recorded',
				payment: row,
				order: { ...summary('completed'), balance: '0.00' },
			},
		});
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => result.current.pickMethod('wcpos_email_invoice'));
		await act(async () => result.current.takeTender());
		expect(mockCompleteOrderFlow).toHaveBeenCalledWith(
			expect.objectContaining({
				source: 'manual',
				via: 'online',
				row,
				mirrorFailed: false,
				remainingMinor: 0,
			}),
			expect.objectContaining({ dispatchToken: expect.any(Object) })
		);
	});

	it('a recorded answer the till could not mirror completes on the facts the chain rewrote', async () => {
		// Stands in for a rewriting extension on the gateway leg, under the rounding hook's id so the
		// registration is restored after.
		registerActionHook(
			TENDER_COMMIT_EVENT,
			async (_ctx, e, next) => next({ ...e, payload: { ...e.payload, amountMinor: 9290 } }),
			{ id: 'cash.rounding', tier: 'extension', order: 0 }
		);
		const row = payment({ method_id: 'wcpos_email_invoice', amount: '92.90', tendered: null });
		mockManualPost.mockResolvedValue({
			data: {
				outcome: 'recorded',
				payment: row,
				order: { ...summary('completed'), balance: '0.00' },
			},
		});
		mockManualMirror.mockRejectedValue(new Error('resident write failed'));
		try {
			const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
			act(() => result.current.pickMethod('wcpos_email_invoice'));
			await act(async () => result.current.takeTender());
			expect(mockCompleteOrderFlow).toHaveBeenCalledWith(
				expect.objectContaining({
					source: 'manual',
					mirrorFailed: true,
					// The chain's 9295 - 9290, not the keypad's 9295 - 9295.
					remainingMinor: 5,
				}),
				expect.anything()
			);
		} finally {
			registerActionHook(TENDER_COMMIT_EVENT, cashRounding, {
				id: 'cash.rounding',
				tier: 'extension',
				order: 0,
			});
		}
	});

	it('a sent answer whose order is still open writes no stamp and says so', async () => {
		mockManualPost.mockResolvedValue({
			data: { outcome: 'sent', payment: null, order: summary('pos-open') },
		});
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => result.current.pickMethod('wcpos_email_invoice'));
		await act(async () => result.current.takeTender());
		expect(mockManualMirror).toHaveBeenCalledWith(
			expect.objectContaining({
				changes: {
					status: 'pos-open',
					meta_data: expect.not.arrayContaining([
						expect.objectContaining({ key: '_wcpos_awaiting_customer' }),
					]),
				},
			})
		);
		expect(mockInfo).toHaveBeenCalledWith(
			'pos_checkout.order_open_send_again',
			expect.objectContaining({ showToast: true })
		);
	});

	it('is unavailable beside money already held, with the reason', async () => {
		mockPayload.meta_data = withLedger([], [payment({ amount: '10.00' })]);
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		expect(
			result.current.tiles.find((tile) => tile.method.id === 'wcpos_email_invoice')
		).toMatchObject({
			disabled: true,
			reason: 'not_with_split',
		});
		await act(async () => {});
	});

	it('a sent order carries the stamp; Cancel invoice names its attempt and the order comes back open', async () => {
		mockPayload.meta_data = [{ key: '_wcpos_awaiting_customer', value: stamp }];
		mockManualPost.mockResolvedValue({ data: { order: summary('pos-open') } });
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		expect(result.current.invoiceSent).toEqual(stamp);
		await act(async () => result.current.cancelInvoice());
		expect(mockManualPost).toHaveBeenCalledWith(
			'orders/42/payment-methods/wcpos_email_invoice/cancel',
			{ attempt_id: 'attempt-0' }
		);
		expect(mockManualMirror).toHaveBeenCalledWith(
			expect.objectContaining({ changes: { status: 'pos-open', meta_data: [] } })
		);
		expect(mockInfo).toHaveBeenCalledWith(
			'pos_checkout.invoice_cancelled',
			expect.objectContaining({
				showToast: true,
				context: expect.objectContaining({ type: 'checkout.cancelled' }),
			})
		);
		expect(result.current.busy).toBe(false);
	});

	it('a stamp beside a counting row is stale and not shown', async () => {
		mockPayload.meta_data = [
			{ key: '_wcpos_awaiting_customer', value: stamp },
			...withLedger([], [payment({ amount: '10.00' })]),
		];
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		expect(result.current.invoiceSent).toBeNull();
		await act(async () => {});
	});
});

const mockActionLog = jest.fn();
const mockResolveSession = jest.fn();
let mockPreventOverselling = false;
const mockCatalog = jest.fn(async (_kind: string, _id: number): Promise<unknown> => null);
jest.mock('../../hooks/use-action-context', () => ({
	useActionContext: () => ({
		ctx: {
			log: mockActionLog,
			t: (key: string) => key,
			now: () => Date.now(),
			read: {
				catalog: mockCatalog,
				paymentMethod: (id: string) => mockMethods.find((method) => method.id === id) ?? null,
			},
			store: { preventOverselling: mockPreventOverselling, priceDecimals: 2 },
			register: { resolveSession: mockResolveSession },
		},
		actor: { userId: 7, registerId: mockBoundRegisterId, sessionId: null },
	}),
}));
beforeEach(() => {
	resetActionHookStrikes();
	mockActionLog.mockClear();
	mockResolveSession.mockReset().mockImplementation(async () => ({
		registerId: mockBoundRegisterId,
		sessionId: mockSessionsOn ? mockSessionId : null,
	}));
});
it('presents a failed session guard and never starts the tender writer', async () => {
	jest.clearAllMocks();
	mockLeg = null;
	mockRealService = null;
	resetCheckoutMode();
	mockResolveSession.mockRejectedValueOnce(new Error('session storage unavailable'));
	const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
	await act(async () => result.current.takeTender());
	expect(mockActionLog).toHaveBeenCalledWith(
		'warn',
		'actions.hook_failed',
		expect.objectContaining({
			showToast: true,
			context: expect.objectContaining({
				hookId: 'session.gate',
				reasonKey: 'actions.hook_failed',
			}),
		})
	);
	expect(recordCompletionAttempt).not.toHaveBeenCalled();
	expect(mockRecordManualPayment).not.toHaveBeenCalled();
	expect(mockBegin).not.toHaveBeenCalled();
	expect(mockLocalPatch).not.toHaveBeenCalled();
	expect(mockPushDocument).not.toHaveBeenCalled();
	expect(result.current.busy).toBe(false);
});

it('waits for the order mutation queue before resolving the session or recording tender', async () => {
	jest.clearAllMocks();
	mockLeg = null;
	mockRealService = null;
	resetCheckoutMode();
	mockMethods = [cash];
	mockPayload = { id: 42, total: '92.95', meta_data: [] };
	mockBlockIfDegraded.mockReturnValue(false);
	let release!: () => void;
	const ahead = enqueueOrderMutation(
		order.uuid,
		() =>
			new Promise<void>((resolve) => {
				release = resolve;
			})
	);
	const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
	act(() => result.current.pickMethod('pos_cash'));
	let taking!: Promise<void>;
	await act(async () => {
		taking = result.current.takeTender();
		await Promise.resolve();
	});
	try {
		expect(mockResolveSession).not.toHaveBeenCalled();
		expect(recordCompletionAttempt).not.toHaveBeenCalled();
		expect(mockRecordManualPayment).not.toHaveBeenCalled();
	} finally {
		await act(async () => {
			release();
			await ahead;
			await taking;
		});
	}
	expect(mockResolveSession).toHaveBeenCalledTimes(1);
	expect(mockRecordManualPayment).toHaveBeenCalledTimes(1);
});

it('refuses the commit when a cart edit queued before Pay moved the balance', async () => {
	jest.clearAllMocks();
	mockLeg = null;
	mockRealService = null;
	resetCheckoutMode();
	mockMethods = [cash];
	mockPayload = { id: 42, total: '92.95', meta_data: [] };
	mockBlockIfDegraded.mockReturnValue(false);
	let release!: () => void;
	// The edit ahead in the queue changes the order's total while the keypad still shows 92.95.
	const ahead = enqueueOrderMutation(
		order.uuid,
		() =>
			new Promise<void>((resolve) => {
				release = () => {
					mockPayload.total = '100.00';
					resolve();
				};
			})
	);
	const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
	act(() => result.current.pickMethod('pos_cash'));
	let taking!: Promise<void>;
	await act(async () => {
		taking = result.current.takeTender();
		await Promise.resolve();
	});
	await act(async () => {
		release();
		await ahead;
		await taking;
	});
	// Refused before any gate or leg ran: nothing resolved, nothing recorded.
	expect(mockResolveSession).not.toHaveBeenCalled();
	expect(recordCompletionAttempt).not.toHaveBeenCalled();
	expect(mockRecordManualPayment).not.toHaveBeenCalled();
	// The cashier is told why, once, with both balances in the row.
	expect(mockActionLog).toHaveBeenCalledTimes(1);
	expect(mockActionLog).toHaveBeenCalledWith(
		'warn',
		'pos_checkout.order_changed_retry',
		expect.objectContaining({
			showToast: true,
			context: expect.objectContaining({
				reasonKey: 'pos_checkout.order_changed_retry',
				balanceMinor: 9295,
				latestBalanceMinor: 10000,
			}),
		})
	);
	expect(result.current.busy).toBe(false);
});

describe('the conditions gate (roadmap#62)', () => {
	const belt = (quantity: number) => ({
		product_id: 5,
		variation_id: 0,
		quantity,
		name: 'Belt',
		total: '92.95',
		meta_data: [{ key: '_woocommerce_pos_uuid', value: 'belt' }],
	});
	const stocked = (stock_quantity: number, backorders = 'no') =>
		mockCatalog.mockImplementation(async () => ({
			manage_stock: true,
			stock_quantity,
			backorders,
		}));
	beforeEach(() => {
		jest.clearAllMocks();
		mockLeg = null;
		mockRealService = null;
		resetCheckoutMode();
		mockMethods = [cash];
		mockBlockIfDegraded.mockReturnValue(false);
		mockPreventOverselling = true;
	});
	afterEach(() => {
		mockPreventOverselling = false;
		mockCatalog.mockReset().mockImplementation(async () => null);
	});
	const take = async () => {
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => result.current.pickMethod('pos_cash'));
		await act(async () => result.current.takeTender());
		return result;
	};

	it('refuses with the first unmet line’s reason; no attempt, no leg', async () => {
		mockPayload = { id: 42, total: '92.95', meta_data: [], line_items: [belt(3)] };
		stocked(2);
		const result = await take();
		expect(mockActionLog).toHaveBeenCalledWith(
			'warn',
			'pos_cart.only_n_available',
			expect.objectContaining({
				showToast: true,
				context: expect.objectContaining({
					reasonKey: 'pos_cart.only_n_available',
					lineUuid: 'belt',
				}),
			})
		);
		expect(jest.mocked(recordCompletionAttempt)).not.toHaveBeenCalled();
		expect(mockRecordManualPayment).not.toHaveBeenCalled();
		expect(result.current.busy).toBe(false);
	});

	it('passes a backorder the store notifies about', async () => {
		mockPayload = { id: 42, total: '92.95', meta_data: [], line_items: [belt(3)] };
		stocked(2, 'notify');
		await take();
		expect(mockRecordManualPayment).toHaveBeenCalledTimes(1);
	});

	it('judges nothing with overselling allowed', async () => {
		mockPayload = { id: 42, total: '92.95', meta_data: [], line_items: [belt(3)] };
		mockPreventOverselling = false;
		stocked(0);
		await take();
		expect(mockCatalog).not.toHaveBeenCalled();
		expect(mockRecordManualPayment).toHaveBeenCalledTimes(1);
	});

	it('the slot’s count decides: a line raised by a write queued ahead is refused', async () => {
		mockPayload = { id: 42, total: '92.95', meta_data: [], line_items: [belt(1)] };
		stocked(2);
		let release!: () => void;
		// The edit ahead raises the line past the stock while the keypad, and the press, see 1.
		const ahead = enqueueOrderMutation(
			order.uuid,
			() =>
				new Promise<void>((resolve) => {
					release = () => {
						mockPayload.line_items = [belt(3)];
						resolve();
					};
				})
		);
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => result.current.pickMethod('pos_cash'));
		let taking!: Promise<void>;
		await act(async () => {
			taking = result.current.takeTender();
			await Promise.resolve();
		});
		await act(async () => {
			release();
			await ahead;
			await taking;
		});
		expect(mockActionLog).toHaveBeenCalledWith(
			'warn',
			'pos_cart.only_n_available',
			expect.anything()
		);
		expect(mockRecordManualPayment).not.toHaveBeenCalled();
	});
});

it("writes the session's pre-action reset in the handler, after the gate's read and before the attempt record", async () => {
	jest.clearAllMocks();
	mockSessionsOn = true;
	mockSessionId = 'session';
	mockLeg = null;
	mockRealService = null;
	resetCheckoutMode();
	mockMethods = [cash];
	mockPayload = { id: 42, total: '92.95', meta_data: [] };
	mockBlockIfDegraded.mockReturnValue(false);
	const { requireOpenSession } = jest.requireMock('@wcpos/query/register-session') as {
		requireOpenSession: jest.Mock;
	};
	requireOpenSession.mockClear();
	const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
	act(() => result.current.pickMethod('pos_cash'));
	await act(async () => result.current.takeTender());
	// The gate read first, the handler then wrote, then the attempt was recorded.
	expect(mockResolveSession).toHaveBeenCalledTimes(1);
	expect(requireOpenSession).toHaveBeenCalledTimes(1);
	// The fixture's sale context carries no session collection; the register id and the flag are the facts.
	expect(requireOpenSession.mock.calls[0].slice(1)).toEqual(['register', true]);
	expect(jest.mocked(recordCompletionAttempt)).toHaveBeenCalledTimes(1);
	expect(mockResolveSession.mock.invocationCallOrder[0]).toBeLessThan(
		requireOpenSession.mock.invocationCallOrder[0]
	);
	expect(requireOpenSession.mock.invocationCallOrder[0]).toBeLessThan(
		jest.mocked(recordCompletionAttempt).mock.invocationCallOrder[0]
	);
	// The writer records the ids the gate stamped, and resolves nothing itself.
	expect(mockRecordManualPayment).toHaveBeenCalledTimes(1);
	expect(mockRecordManualPayment.mock.calls[0][2]).toEqual(
		expect.objectContaining({ session: { registerId: 'register', sessionId: 'session' } })
	);
});

it('a session closed between the gate and the write refuses with the open-register toast, no attempt, no payment', async () => {
	jest.clearAllMocks();
	mockSessionsOn = true;
	mockSessionId = 'session';
	mockLeg = null;
	mockRealService = null;
	resetCheckoutMode();
	mockMethods = [cash];
	mockPayload = { id: 42, total: '92.95', meta_data: [] };
	mockBlockIfDegraded.mockReturnValue(false);
	const { requireOpenSession } = jest.requireMock('@wcpos/query/register-session') as {
		requireOpenSession: jest.Mock;
	};
	requireOpenSession.mockImplementationOnce(async () => {
		throw new RegisterSessionRequiredError();
	});
	const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
	act(() => result.current.pickMethod('pos_cash'));
	await act(async () => {
		await expect(result.current.takeTender()).resolves.toBeUndefined();
	});
	expect(mockResolveSession).toHaveBeenCalledTimes(1);
	expect(mockInfo).toHaveBeenCalledWith(
		'pos_checkout.open_register_first',
		expect.objectContaining({ showToast: true })
	);
	expect(jest.mocked(recordCompletionAttempt)).not.toHaveBeenCalled();
	expect(mockRecordManualPayment).not.toHaveBeenCalled();
	expect(result.current.busy).toBe(false);
});

it('a session replaced between the gate and the write refuses with the open-register toast, no attempt, no payment', async () => {
	jest.clearAllMocks();
	mockSessionsOn = true;
	mockSessionId = 'session';
	mockLeg = null;
	mockRealService = null;
	resetCheckoutMode();
	mockMethods = [cash];
	mockPayload = { id: 42, total: '92.95', meta_data: [] };
	mockBlockIfDegraded.mockReturnValue(false);
	const { requireOpenSession } = jest.requireMock('@wcpos/query/register-session') as {
		requireOpenSession: jest.Mock;
	};
	requireOpenSession.mockResolvedValueOnce('replacement-session');
	const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
	act(() => result.current.pickMethod('pos_cash'));
	await act(async () => {
		await expect(result.current.takeTender()).resolves.toBeUndefined();
	});
	expect(mockResolveSession).toHaveBeenCalledTimes(1);
	expect(mockInfo).toHaveBeenCalledWith(
		'pos_checkout.open_register_first',
		expect.objectContaining({ showToast: true })
	);
	expect(jest.mocked(recordCompletionAttempt)).not.toHaveBeenCalled();
	expect(mockRecordManualPayment).not.toHaveBeenCalled();
	expect(result.current.busy).toBe(false);
});

describe('cash rounding (#66, #84)', () => {
	const roundingCash = {
		...cash,
		defaults: { ...cash.defaults, rounding: { increment: '0.05', mode: 'nearest' as const } },
	};
	type Patch = { data: Record<string, unknown> };
	let appliedPatches: Record<string, unknown>[];
	// One product line. The stored total may differ from it: the store can own the order's money
	// (ADR 0032), and a fee edit must move the stored total, not recompute it from the lines.
	const sale = (total: string, linesTotal = total) => ({
		id: 42,
		total,
		meta_data: [],
		line_items: [{ name: 'Item', quantity: 1, total: linesTotal, total_tax: '0.00' }],
	});
	const patches = () => appliedPatches;
	beforeEach(() => {
		jest.clearAllMocks();
		resetCheckoutMode();
		mockLeg = null;
		mockRealService = null;
		mockSessionsOn = false;
		mockBindingStatus = 'bound';
		mockMethods = [roundingCash, card];
		// Online: until ADR 0040 PR B an offline tender is refused, so rounding is taken online.
		mockOnlineStatus = 'online-website-available';
		mockBlockIfDegraded.mockReturnValue(false);
		mockCompleteOrderFlow.mockResolvedValue(undefined);
		mockRecordManualPayment.mockResolvedValue(recorded);
		mockPushDocument.mockResolvedValue(order);
		// The resident record takes each patch, so the writer reads what the handler wrote.
		appliedPatches = [];
		mockLocalPatch.mockImplementation(
			async ({
				data,
				changes,
			}: Partial<Patch> & {
				changes?: (current: Record<string, unknown>) => Record<string, unknown>;
			}) => {
				const patch = changes ? changes(mockPayload) : data!;
				appliedPatches.push(patch);
				mockPayload = { ...mockPayload, ...patch };
				return order;
			}
		);
	});
	afterEach(() => {
		mockUseRealManual = false;
		mockUseRealVoid = false;
		mockManualMirror.mockReset();
		mockManualPost.mockReset();
	});

	it('previews the rounded due: the prefill, the change and the rounding for the cash tile only', async () => {
		mockPayload = sale('10.03');
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => result.current.pickMethod('pos_cash'));
		expect(result.current).toMatchObject({
			balanceMinor: 1003,
			roundedDueMinor: 1005,
			roundingMinor: 2,
			entryAppliedMinor: 1005,
			entryChangeMinor: 0,
			state: { entryMinor: 1005, entryDirty: false },
		});
		act(() => result.current.dispatch({ type: 'set-entry', minor: 2000 }));
		expect(result.current).toMatchObject({ roundingMinor: 2, entryChangeMinor: 995 });
		// An exact unrounded entry pays the balance as it is; the hook does not round it either.
		act(() => result.current.dispatch({ type: 'set-entry', minor: 1003 }));
		expect(result.current).toMatchObject({ roundingMinor: 0, entryAppliedMinor: 1003 });
		// A partial tender is never rounded.
		act(() => result.current.dispatch({ type: 'set-entry', minor: 500 }));
		expect(result.current).toMatchObject({ roundingMinor: 0, entryAppliedMinor: 500 });
		act(() => result.current.pickMethod('pos_card'));
		expect(result.current).toMatchObject({ roundedDueMinor: 1003, roundingMinor: 0 });
		await act(async () => {});
	});

	it.each([
		// A share within the rounding of the balance, paid with a big note: the hook settles it.
		[1002, 1001, -2, 1000, 1000],
		// A share well short of it: the cashier hands what they hand.
		[1003, 500, 0, 500, 1500],
	])(
		'a split share of %i previews what the hook decides (share %i)',
		async (balance, share, rounding, applied, change) => {
			mockPayload = sale((balance / 100).toFixed(2));
			const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
			act(() => result.current.pickMethod('pos_cash'));
			const plan = { kind: 'fixed', firstMinor: share, title: null, from: 0 } as const;
			act(() => result.current.dispatch({ type: 'set-plan', plan, balanceMinor: balance }));
			act(() => result.current.dispatch({ type: 'set-entry', minor: 2000 }));
			expect(result.current).toMatchObject({
				thisPaymentMinor: share,
				roundingMinor: rounding,
				entryAppliedMinor: applied,
				entryChangeMinor: change,
			});
			await act(async () => {});
		}
	);

	it('writes the rounding fee before the cash row: the stored total moves by the fee alone and the leg settles', async () => {
		mockUseRealManual = true;
		mockPayload = sale('12.03', '10.03');
		// The store records the row and completes the sale; the mirror lands both on the order.
		mockManualPost.mockImplementation(async (_url: string, body: { payment: PaymentRow }) => ({
			data: {
				payment: { ...body.payment, status: 'captured' },
				order: { status: 'completed', balance: '0.00' },
			},
		}));
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => result.current.pickMethod('pos_cash'));
		act(() => result.current.dispatch({ type: 'set-entry', minor: 2000 }));
		await act(async () => result.current.takeTender());

		const [fee] = patches();
		const leg = mockManualMirror.mock.calls[0][0].changes as Record<string, unknown>;
		const [line] = fee.fee_lines as {
			name: string;
			tax_status: string;
			total: string;
			meta_data: { key: string; value: Record<string, unknown> }[];
		}[];
		expect(line).toMatchObject({
			name: 'pos_checkout.rounding',
			tax_status: 'none',
			total: '0.02',
		});
		// Only the fee and the stored total: nothing recomputed from the lines (10.03 + 0.02).
		expect(Object.keys(fee).sort()).toEqual(['fee_lines', 'total']);
		expect(fee.total).toBe('12.05');
		const rounding = line.meta_data.find(({ key }) => key === '_woocommerce_pos_data')?.value
			.rounding as Record<string, unknown>;
		const [row] = readLedger(leg.meta_data as MetaDataEntry[]);
		expect(rounding).toEqual({ increment: '0.05', mode: 'nearest', payment_ref: row.id });
		expect(row).toMatchObject({ amount: '12.05', tendered: '20.00', change: '7.95' });
		expect(leg.status).toBe('completed');
		expect(mockCompleteOrderFlow).toHaveBeenCalledWith(
			expect.objectContaining({
				source: 'manual',
				remainingMinor: 0,
			}),
			expect.anything()
		);
	});

	it('a round-down leg the store took but the till could not mirror still completes on the rewritten facts', async () => {
		mockUseRealManual = true;
		mockOnlineStatus = 'online-website-available';
		mockPayload = sale('10.02');
		mockManualPost.mockResolvedValue({ data: { order: { status: 'completed', balance: '0.00' } } });
		mockManualMirror.mockRejectedValue(new Error('resident write failed'));
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => result.current.pickMethod('pos_cash'));
		// The keypad says 10.00 against 10.02 (2 left); the chain rounds the due to 10.00 (none left).
		act(() => result.current.dispatch({ type: 'set-entry', minor: 1000 }));
		await act(async () => result.current.takeTender());

		expect(mockCompleteOrderFlow).toHaveBeenCalledWith(
			expect.objectContaining({
				source: 'manual',
				mirrorFailed: true,
				remainingMinor: 0,
			}),
			expect.anything()
		);
		// The money landed: its rounding stays.
		expect(mockPayload).toMatchObject({ total: '10.00' });
	});

	it.each([
		['failed to save', async () => ({ kind: 'failed', reason: 'provenance_save_failed' })],
		[
			'refused by the store',
			async () => ({
				kind: 'refused',
				reason: 'amount_exceeds_balance',
				row: payment({ status: 'failed' }),
				order: null,
			}),
		],
		['invalid', async () => ({ kind: 'invalid', reason: 'tendered_below_amount' })],
		[
			'thrown by the writer',
			async () => {
				throw Object.assign(new Error('refused'), { code: 'wcpos_invalid' });
			},
		],
	])('a leg %s takes its rounding fee back off the order', async (_name, outcome) => {
		mockPayload = sale('10.03');
		mockRecordManualPayment.mockImplementationOnce(outcome);
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => result.current.pickMethod('pos_cash'));
		await act(async () => result.current.takeTender());

		const [fee, unround] = patches();
		expect(fee.total).toBe('10.05');
		expect(unround).toEqual({ fee_lines: [], total: '10.03' });
		expect(mockCompleteOrderFlow).not.toHaveBeenCalled();
	});

	// Codex 4342982186 on #2832: a record whose answers were all lost stays journaled at its rounded
	// amount, so its rounding stays too: the re-send lands 10.00 on a 10.00 total.
	it('a leg the store never answered keeps its rounding fee: 10.02 stays rounded to 10.00', async () => {
		mockPayload = sale('10.02');
		mockRecordManualPayment.mockImplementationOnce(async () => ({
			kind: 'unknown',
			row: payment({ amount: '10.00' }),
		}));
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => result.current.pickMethod('pos_cash'));
		await act(async () => result.current.takeTender());

		const [fee, ...rest] = patches();
		expect(fee.total).toBe('10.00');
		expect(rest).toEqual([]);
		expect(mockPayload).toMatchObject({ total: '10.00' });
		// The record hook already said the store has not answered: back to the methods, no second toast.
		expect(result.current.state.methodId).toBeNull();
		expect(mockError).not.toHaveBeenCalledWith(
			'pos_checkout.payment_not_recorded',
			expect.anything()
		);
	});

	// Codex 4343139031 on #2832: the replay of a rounded record that went unanswered carries no
	// fee of its own (the balance is already rounded); a refusal takes back the fee its row carried.
	it('a refused replay of an unanswered rounded record takes its fee back off: 10.05 returns to 10.03', async () => {
		mockPayload = sale('10.03');
		let rowId = '';
		mockRecordManualPayment.mockImplementationOnce(async (_o, _m, input: { paymentId: string }) => {
			rowId = input.paymentId;
			return { kind: 'unknown', row: payment({ id: rowId, amount: '10.05' }) };
		});
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => result.current.pickMethod('pos_cash'));
		await act(async () => result.current.takeTender());
		expect(mockPayload).toMatchObject({ total: '10.05' });

		mockRecordManualPayment.mockImplementationOnce(async () => ({
			kind: 'refused',
			reason: 'amount_exceeds_balance',
			row: payment({ id: rowId, amount: '10.05', status: 'failed' }),
			order: null,
		}));
		act(() => result.current.pickMethod('pos_cash'));
		await act(async () => result.current.takeTender());

		expect(mockPayload).toMatchObject({ total: '10.03', fee_lines: [] });
	});

	// Codex 4346411073 on #2837: Try again's refusal unrounds as the press's refusal does; a record
	// the store still has not answered (still journaled) keeps its rounding.
	it.each([
		['refused (left the journal, no live row)', false, '10.03'],
		['still unanswered (journaled)', true, '10.05'],
	])(
		'a Try again whose rounded record is %s (journaled: %s) leaves the total at %s',
		async (_, journaled, total) => {
			const { readJournaledRecordIds } = jest.requireMock('@wcpos/query/store-local');
			mockPayload = sale('10.03');
			let rowId = '';
			mockRecordManualPayment.mockImplementationOnce(
				async (_o, _m, input: { paymentId: string }) => {
					rowId = input.paymentId;
					return { kind: 'unknown', row: payment({ id: rowId, amount: '10.05' }) };
				}
			);
			const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
			act(() => result.current.pickMethod('pos_cash'));
			await act(async () => result.current.takeTender());
			expect(mockPayload).toMatchObject({ total: '10.05' });

			act(() => mockGate$.next(true));
			readJournaledRecordIds.mockResolvedValueOnce(new Set(journaled ? [rowId] : []));
			mockResend.mockRejectedValueOnce(new Error('wcpos_amount_exceeds_balance'));
			await act(async () => result.current.retryCommand());
			expect(mockPayload).toMatchObject({ total });
		}
	);

	// Codex 4346556717 on #2837: a void recovered by Try again takes its leg's rounding back off,
	// as the press's void does (one sweep after every settle).
	it('a rounded cash leg whose void Try again recovers takes its fee back off: 10.05 returns to 10.03', async () => {
		mockPayload = sale('10.03');
		let rowId = '';
		mockRecordManualPayment.mockImplementationOnce(async (_o, _m, input: { paymentId: string }) => {
			rowId = input.paymentId;
			return { ...recorded, row: payment({ id: rowId, amount: '10.05' }) };
		});
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => result.current.pickMethod('pos_cash'));
		await act(async () => result.current.takeTender());
		expect(mockPayload).toMatchObject({ total: '10.05' });

		act(() => mockGate$.next(true));
		mockResend.mockImplementationOnce(async () => {
			const voided = payment({ id: rowId, amount: '10.05', status: 'voided' });
			mockPayload = { ...mockPayload, meta_data: withLedger([], [voided]) };
			return [{ kind: 'void', data: { payment: voided, order: { status: 'pos-open' } } }];
		});
		await act(async () => result.current.retryCommand());
		expect(mockPayload).toMatchObject({ total: '10.03' });
	});

	it('a replay refused by a thrown payment conflict takes its fee back off: 10.05 returns to 10.03', async () => {
		const { RecordManualPaymentError } = jest.requireActual('../payments/record-manual-payment');
		mockPayload = sale('10.03');
		let rowId = '';
		mockRecordManualPayment.mockImplementationOnce(async (_o, _m, input: { paymentId: string }) => {
			rowId = input.paymentId;
			return { kind: 'unknown', row: payment({ id: rowId, amount: '10.05' }) };
		});
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => result.current.pickMethod('pos_cash'));
		await act(async () => result.current.takeTender());
		expect(mockPayload).toMatchObject({ total: '10.05' });

		mockRecordManualPayment.mockImplementationOnce(async () => {
			throw new RecordManualPaymentError('conflict', 'wcpos_payment_conflict', 409);
		});
		act(() => result.current.pickMethod('pos_cash'));
		await act(async () => result.current.takeTender());

		expect(mockPayload).toMatchObject({ total: '10.03', fee_lines: [] });
	});

	it('a synced fee comes back off as a tombstone that no longer counts in the total', async () => {
		mockPayload = sale('10.03');
		// The provenance push came back with the fee's server id.
		mockLocalPatch.mockImplementation(async ({ data }: Patch) => {
			appliedPatches.push(data);
			const fees = data.fee_lines as { id?: number }[] | undefined;
			mockPayload = {
				...mockPayload,
				...data,
				...(fees ? { fee_lines: fees.map((fee) => ({ id: 7, ...fee })) } : {}),
			};
			return order;
		});
		mockRecordManualPayment.mockResolvedValueOnce({
			kind: 'failed',
			reason: 'provenance_save_failed',
		});
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => result.current.pickMethod('pos_cash'));
		await act(async () => result.current.takeTender());

		const [, unround] = patches();
		expect(unround).toEqual({
			fee_lines: [expect.objectContaining({ id: 7, name: null, total: '0.02' })],
			total: '10.03',
		});
	});

	it('a void whose fee sweep cannot write still reports the legs the store voided', async () => {
		mockUseRealVoid = true;
		mockOnlineStatus = 'online-website-available';
		const fee = {
			id: 7,
			name: 'Rounding',
			total: '0.02',
			total_tax: '0.00',
			meta_data: [
				{
					key: '_woocommerce_pos_data',
					value: { rounding: { increment: '0.05', mode: 'nearest', payment_ref: 'payment-1' } },
				},
			],
		};
		mockPayload = {
			...sale('10.05'),
			fee_lines: [fee],
			meta_data: withLedger([], [payment({ amount: '10.05' })]),
		} as typeof mockPayload;
		mockManualPost.mockResolvedValue({
			data: { payment: payment({ status: 'voided' }), order: { status: 'pos-open' } },
		});
		mockManualMirror.mockImplementation(async ({ changes }: { changes: object }) => {
			mockPayload = { ...mockPayload, ...changes };
		});
		mockLocalPatch.mockResolvedValue(undefined);
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => result.current.dispatch({ type: 'request-cancel' }));
		await act(async () => result.current.cancelPayment());

		expect(mockInfo).toHaveBeenCalledWith(
			'Payment voided',
			expect.objectContaining({
				context: expect.objectContaining({ type: 'payment.voided', paymentId: 'payment-1' }),
			})
		);
		expect(mockError).not.toHaveBeenCalled();
		expect(mockWarn).toHaveBeenCalledWith(
			'Rounding fee not removed after the void; the next void removes it',
			expect.anything()
		);
	});

	it('a cash due rounded to nothing writes the fee in one patch and completes through close', async () => {
		mockPayload = sale('0.02');
		mockManualPost.mockResolvedValue({
			data: { order: { status: 'completed' }, completion: { n: 1, id: 'c1' } },
		});
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => result.current.pickMethod('pos_cash'));
		expect(result.current).toMatchObject({ roundedDueMinor: 0, roundingMinor: -2 });
		await act(async () => result.current.takeTender());

		expect(patches()).toEqual([
			expect.objectContaining({
				fee_lines: [expect.objectContaining({ total: '-0.02', tax_status: 'none' })],
				total: '0.00',
				meta_data: expect.any(Array),
			}),
		]);
		// ADR 0040 D2: the till never writes completed; the store closes the sale.
		expect(patches()[0]).not.toHaveProperty('status');
		expect(mockManualPost).toHaveBeenCalledWith('orders/42/close', {});
		expect(mockRecordManualPayment).not.toHaveBeenCalled();
		expect(mockCompleteOrderFlow).toHaveBeenCalledWith(
			{ source: 'zero-balance', order: { status: 'completed' } },
			expect.anything()
		);
	});

	it('a cash balance of 0.02 rounded to zero completes through close on the first press', async () => {
		mockPayload = sale('0.02');
		mockManualPost.mockResolvedValue({
			data: { order: { status: 'completed' }, completion: { n: 1, id: 'c1' } },
		});
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => result.current.pickMethod('pos_cash'));
		await act(async () => result.current.takeTender());

		// The close is approved against the total the rounding fee commits (0.00), not the 0.02
		// the cashier saw before it: the store's order and the approval agree on the first press.
		const close = mockPosterInputs.at(-1) as { approval: { total: string } };
		expect(close.approval.total).toBe('0.00');
		expect(mockCompleteOrderFlow).toHaveBeenCalledWith(
			{ source: 'zero-balance', order: { status: 'completed' } },
			expect.anything()
		);
	});

	it('a zero-balance completion that cannot build its meta leaves no fee behind', async () => {
		mockPayload = sale('0.02');
		jest.mocked(provenance.completionMetaFor).mockRejectedValueOnce(new Error('meta'));
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => result.current.pickMethod('pos_cash'));
		await act(async () => result.current.takeTender());

		expect(mockLocalPatch).not.toHaveBeenCalled();
		expect(mockPayload).toMatchObject({ total: '0.02' });
		expect(mockCompleteOrderFlow).not.toHaveBeenCalled();
	});

	it('a guard refusing after the rewrite writes nothing: the register gate judges the rounded amounts', async () => {
		// 10.02 rounds down to 10.00: the entry is short of the balance until the hook settles it.
		mockPayload = sale('10.02');
		mockBindingStatus = 'choose';
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => result.current.pickMethod('pos_cash'));
		expect(result.current.state.entryMinor).toBe(1000);
		await act(async () => result.current.takeTender());

		expect(mockInfo).toHaveBeenCalledWith(
			'pos_checkout.choose_register_first',
			expect.objectContaining({ showToast: true })
		);
		expect(mockLocalPatch).not.toHaveBeenCalled();
		expect(mockRecordManualPayment).not.toHaveBeenCalled();
	});
});

jest.mock('@wcpos/query/mutations', () => ({
	...jest.requireActual('@wcpos/query/mutations'),
	// The real mirror resolves the answer over the LATEST resident (ADR 0040); the spy sees the
	// changes it would write: the row upserted into the current ledger, the asserted meta, the status.
	fakeMirror: (
		manager: unknown,
		recordId: string,
		answer: {
			payment?: PaymentRow;
			order?: { status?: string } | null;
			meta?: (meta: MetaDataEntry[]) => MetaDataEntry[];
		}
	) => {
		const ledger = jest.requireActual('@wcpos/order-math');
		const meta = (mockPayload.meta_data ?? []) as MetaDataEntry[];
		const ledgerMeta = answer.payment
			? ledger.withLedger(meta, ledger.upsertPaymentRow(ledger.readLedger(meta), answer.payment))
			: meta;
		const changes = {
			...(answer.order?.status ? { status: answer.order.status } : {}),
			meta_data: answer.meta ? answer.meta(ledgerMeta) : ledgerMeta,
		};
		return mockManualMirror({ manager, collection: 'orders', recordId, changes });
	},
}));

// ADR 0040 Decided 1: a manual `offline: 'record'` tender journals offline (rule 2) after the
// cashier confirms it (rule 1).
describe('offline manual tenders', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		resetCheckoutMode();
		mockBindingStatus = 'bound';
		mockSessionsOn = false;
		mockLeg = null;
		mockSize = 'sm';
		mockOnlineStatus = 'offline';
		mockMethods = methods;
		mockMethodsLoaded = true;
		mockBlockIfDegraded.mockReturnValue(false);
		mockPayload = { id: 42, total: '10.00', meta_data: [] };
		mockRecordManualPayment.mockResolvedValue({ ...recorded, via: 'offline' });
		mockCompleteOrderFlow.mockResolvedValue(undefined);
		mockLocalPatch.mockImplementation(async ({ document, data }) => {
			if (data?.meta_data) mockPayload = { ...mockPayload, meta_data: data.meta_data };
			return { document };
		});
		mockManualMirror.mockImplementation(async ({ changes }: { changes: object }) => {
			mockPayload = { ...mockPayload, ...changes };
		});
	});
	afterEach(() => {
		mockUseRealManual = false;
		mockUseRealCompletion = false;
		mockOnlineStatus = 'online-website-available';
		mockManualMirror.mockReset();
		mockLocalPatch.mockReset();
		jest.mocked(readAwaitingAnswer).mockResolvedValue([]);
		jest.restoreAllMocks();
	});

	it('offline manual record completes and keeps the attempt awaiting adoption', async () => {
		mockUseRealManual = true;
		mockUseRealCompletion = true;
		enterCheckout(order.uuid);
		const view = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => view.result.current.pickMethod('pos_cash'));
		await act(async () => view.result.current.takeTender());
		view.unmount();

		expect(mockDefer).toHaveBeenCalledWith('orders/42/payments', {
			payment: expect.objectContaining({ amount: '10.00', recorded_offline: true }),
		});
		expect(mockManualPost).not.toHaveBeenCalled();
		expect(mockPayload.status).toBe('completed');
		expect(getCheckoutModeSnapshot().receiptOrders.has(order.uuid)).toBe(true);
		// The store has not answered: the bridge finishes the sale once it does (rule 3).
		// The sale context's storeDB is undefined in this suite (as `recordCompletionAttempt` above).
		expect(failCompletionAttempt).toHaveBeenCalledWith(undefined, order.uuid, 'unconfirmed', {
			awaitingAdoption: true,
		});
		expect(resolveCompletionAttempt).not.toHaveBeenCalled();
		expect(mockError).not.toHaveBeenCalled();
	});

	it('a deferred record does not gate the tender; second leg mints a new row', async () => {
		mockUseRealManual = true;
		const first = payment({ id: 'row-a', amount: '4.00', tendered: null, recorded_offline: true });
		mockPayload = { id: 42, total: '10.00', meta_data: withLedger([], [first]) };
		// Journaled, awaiting the store, and not gating: the gate stays false.
		jest.mocked(readAwaitingAnswer).mockResolvedValue([{ kind: 'record', row: first }]);
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));

		expect(result.current.unansweredCommand).toBe(false);
		expect(result.current.tiles.find(({ method }) => method.id === 'pos_cash')).toMatchObject({
			disabled: false,
			settlesLater: true,
		});
		act(() => result.current.pickMethod('pos_cash'));
		await act(async () => result.current.takeTender());

		expect(mockDefer).toHaveBeenCalledTimes(1);
		const [, body] = mockDefer.mock.calls[0] as [string, { payment: PaymentRow }];
		expect(body.payment).toMatchObject({ amount: '6.00', recorded_offline: true });
		expect(body.payment.id).not.toBe('row-a');
	});

	// No route for the record (orders created offline are a later slice): never offered, never asked.
	it('an order the store has never seen is not offered offline; the cashier is never asked', async () => {
		mockPayload = { total: '10.00', meta_data: [] };
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		expect(result.current.tiles.find(({ method }) => method.id === 'pos_cash')).toMatchObject({
			disabled: true,
			reason: 'offline',
			settlesLater: false,
		});
		act(() => result.current.pickMethod('pos_cash'));
		await act(async () => result.current.takeTender());

		expect(mockConfirmOffline).not.toHaveBeenCalled();
		expect(mockRecordManualPayment).not.toHaveBeenCalled();
	});

	// Cash rounding: the dialog names what is recorded, 10.05 for a 10.03 balance, not the keyed 10.03.
	it('the confirmation names the rounded amount that will be recorded', async () => {
		mockMethods = [
			{
				...cash,
				defaults: { ...cash.defaults, rounding: { increment: '0.05', mode: 'nearest' as const } },
			},
		];
		mockPayload = { id: 42, total: '10.03', meta_data: [] };
		mockConfirmOffline.mockResolvedValueOnce(false);
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => result.current.pickMethod('pos_cash'));
		await act(async () => result.current.takeTender());
		expect(mockConfirmOffline).toHaveBeenCalledWith(expect.objectContaining({ amountMinor: 1005 }));
	});

	it('the cashier declines the offline confirmation → nothing journaled', async () => {
		mockConfirmOffline.mockResolvedValueOnce(false);
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => result.current.pickMethod('pos_cash'));
		await act(async () => result.current.takeTender());

		expect(mockConfirmOffline).toHaveBeenCalledWith({
			method: cash,
			amountMinor: 1000,
		});
		expect(mockRecordManualPayment).not.toHaveBeenCalled();
		expect(recordCompletionAttempt).not.toHaveBeenCalled();
		expect(result.current.busy).toBe(false);
	});

	it('the cashier confirms offline → journaled via defer and logged as recorded offline', async () => {
		mockUseRealManual = true;
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => result.current.pickMethod('pos_cash'));
		await act(async () => result.current.takeTender());

		expect(mockConfirmOffline).toHaveBeenCalledWith({
			method: cash,
			amountMinor: 1000,
		});
		expect(mockDefer).toHaveBeenCalledWith('orders/42/payments', {
			payment: expect.objectContaining({ amount: '10.00', recorded_offline: true }),
		});
		expect(mockManualPost).not.toHaveBeenCalled();
		expect(mockInfo).toHaveBeenCalledWith(
			'Manual payment recorded',
			expect.objectContaining({
				context: expect.objectContaining({ type: 'payment.recorded-offline' }),
			})
		);
	});

	it('a second press while the confirmation is open asks once; a throwing prompt frees the flow', async () => {
		let answer: (confirmed: boolean) => void = () => {};
		mockConfirmOffline.mockImplementationOnce(
			() => new Promise<boolean>((resolve) => (answer = resolve))
		);
		const { result } = renderHook(() => useTenderFlow(order, hostAtWidth()));
		act(() => result.current.pickMethod('pos_cash'));
		const first = result.current.takeTender();
		await act(async () => result.current.takeTender());
		expect(mockConfirmOffline).toHaveBeenCalledTimes(1);
		await act(async () => {
			answer(false);
			await first;
		});
		expect(mockRecordManualPayment).not.toHaveBeenCalled();

		mockConfirmOffline.mockRejectedValueOnce(new Error('prompt lost'));
		await act(async () => result.current.takeTender());
		expect(mockConfirmOffline).toHaveBeenCalledTimes(2);
		expect(mockRecordManualPayment).not.toHaveBeenCalled();
		// Freed: the next press asks again.
		mockConfirmOffline.mockResolvedValueOnce(false);
		await act(async () => result.current.takeTender());
		expect(mockConfirmOffline).toHaveBeenCalledTimes(3);
	});
});

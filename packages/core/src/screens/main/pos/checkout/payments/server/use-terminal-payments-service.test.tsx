/** @jest-environment jsdom */
import { renderHook, waitFor } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import { type MetaDataEntry, readLedger, withLedger } from '@wcpos/order-math';

import { createActionContext } from '../../../../../../extensions/actions';
import { useTerminalPaymentsService } from './use-terminal-payments-service';
import {
	getTerminalPaymentsService,
	stopTerminalPaymentsService,
} from '../../../../../../services/terminal-payments';
import { row } from '../device/fixtures.test-utils';
import {
	type CheckoutModeSnapshot,
	enterCheckout,
	getCheckoutModeSnapshot,
	resetCheckoutMode,
	watchTender,
} from '../../checkout-mode';

const mockStore = { id: 1, price_num_decimals: 2 };
const mockSite = {};
const mockRow = {
	...row,
	recorded_offline: true,
	status: 'authorized' as const,
	provider_refs: { payment_intent: 'settled_pi' },
};
const mockResident = {
	uuid: 'completed-order',
	getLatest() {
		return this;
	},
	payload: {
		id: 42,
		number: '42',
		total: '10.00',
		status: 'completed',
		meta_data: withLedger([{ key: '_wcpos_sale_counter', value: '1' }], [mockRow]),
	},
};
const mockDocuments = new BehaviorSubject([mockResident]);
const mockFind = jest.fn(() => ({ $: mockDocuments }));
const mockRuntime = {
	engine: {
		active: () => null,
		ready: new Promise(() => {}),
		require: jest.fn(() => ({ ready: Promise.resolve(), release: jest.fn() })),
		db$: (listener: (db: object) => void) => {
			listener({ collections: { orders: { find: mockFind } } });
			return () => {};
		},
	},
};
const mockHttp = {
	get: jest.fn(),
	post: jest.fn(async () => ({
		data: {
			payment: { ...mockRow, status: 'captured', amount: '11.00', tip: '1.00' },
			order: {
				status: 'completed',
				total: '11.00',
				paid: '11.00',
				balance: '0',
				payment_method: 'device',
				payment_method_title: 'Reader',
			},
		},
	})),
};
const mockMirror = jest.fn(async (_input: unknown) => {});
const mockPatch = jest.fn<
	Promise<object | undefined>,
	[{ document: unknown; data: { meta_data?: MetaDataEntry[]; status?: string } }]
>(async () => ({}));
jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status: 'online-website-available' }),
}));
jest.mock('@wcpos/query', () => ({
	useQueryRuntime: () => mockRuntime,
	engineCollection: () => ({ find: mockFind }),
}));
// Mutable so a test can change the cashier without remounting the hook.
const mockSession = { wpCredentials: { id: 7, display_name: 'Pat' } };
jest.mock('../../../../../../contexts/app-state', () => ({
	useStoreSession: () => ({
		store: mockStore,
		site: mockSite,
		wpCredentials: mockSession.wpCredentials,
	}),
}));
jest.mock('../../../../hooks/use-rest-http-client', () => ({ useRestHttpClient: () => mockHttp }));
jest.mock('../../../../hooks/use-payment-methods', () => ({
	usePaymentMethods: () => ({ methods: [] }),
}));
jest.mock('@wcpos/query/record-readers', () => ({
	refreshOrderRecord: jest.requireActual('@wcpos/query/record-readers').refreshOrderRecord,
	readResidentOrder: async () => mockResident,
}));
jest.mock('../../../../hooks/mutations/use-local-mutation', () => ({
	useLocalMutation: () => ({ localPatch: mockPatch }),
}));
afterEach(() => {
	stopTerminalPaymentsService();
	jest.clearAllMocks();
});
it('recovers a completed resident offline authorization without any open checkout or live leg', async () => {
	const hook = renderHook(() => useTerminalPaymentsService());
	await waitFor(() =>
		expect(mockHttp.post).toHaveBeenCalledWith('orders/42/payments/leg/capture', {
			context: { provider_refs: { payment_intent: 'settled_pi' } },
		})
	);
	expect(mockFind).toHaveBeenCalledWith({
		selector: {
			'payload.meta_data': {
				$elemMatch: {
					key: '_wcpos_payments',
					'value.payments': {
						$elemMatch: { capture_mode: 'device', recorded_offline: true, status: 'authorized' },
					},
				},
			},
		},
	});
	expect(getTerminalPaymentsService()?.get('completed-order')).toBeNull();
	expect(mockMirror).toHaveBeenCalledWith(
		expect.objectContaining({ changes: expect.objectContaining({ total: '11.00' }) })
	);
	expect(mockPatch).not.toHaveBeenCalled(); // Already-persisted refs are not re-enqueued.
	hook.unmount();
});

it('offline settlement puts the tuple and ledger in the same completing patch', async () => {
	const original = mockResident.payload.meta_data;
	mockResident.payload.meta_data = withLedger([], []);
	const start = jest.spyOn(
		await import('../../../../../../services/terminal-payments'),
		'startTerminalPaymentsService'
	);
	const hook = renderHook(() => useTerminalPaymentsService());
	const options = start.mock.calls[0][0];
	await options.patchAndEnqueue!('completed-order', { ...mockRow, status: 'captured' });
	expect(mockPatch).toHaveBeenCalledWith(
		expect.objectContaining({
			data: {
				status: 'completed',
				meta_data: expect.arrayContaining([
					{ key: '_wcpos_sale_counter', value: '2' },
					expect.objectContaining({ key: '_wcpos_payments' }),
				]),
			},
		})
	);
	hook.unmount();
	start.mockRestore();
	mockResident.payload.meta_data = original;
});

it('reads the decimal count from the latest store document at call time, not the snapshot', async () => {
	const start = jest.spyOn(
		await import('../../../../../../services/terminal-payments'),
		'startTerminalPaymentsService'
	);
	const store = mockStore as typeof mockStore & {
		getLatest?: () => { price_num_decimals: number };
	};
	const hook = renderHook(() => useTerminalPaymentsService());
	try {
		const options = start.mock.calls[0][0];
		const dp = () => (typeof options.dp === 'function' ? options.dp() : options.dp);
		expect(dp()).toBe(2);
		// Settings → General changes the decimals: the session's document instance is immutable,
		// the latest one says 0.
		store.getLatest = () => ({ price_num_decimals: 0 });
		expect(dp()).toBe(0);
	} finally {
		delete store.getLatest;
		hook.unmount();
		start.mockRestore();
	}
});

it('background terminal settlement enqueues one provenance-only patch after mirroring', async () => {
	const original = mockResident.payload.meta_data;
	mockResident.payload.meta_data = withLedger([], [mockRow]);
	const hook = renderHook(() => useTerminalPaymentsService());
	try {
		await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1));
		expect(mockMirror).toHaveBeenCalledTimes(1);
		expect(mockPatch).toHaveBeenCalledWith({
			document: mockResident,
			data: {
				meta_data: expect.arrayContaining([{ key: '_wcpos_sale_counter', value: '2' }]),
			},
		});
	} finally {
		hook.unmount();
		mockResident.payload.meta_data = original;
	}
});

const mockMirrorError = jest.fn();
const mockInfo = jest.fn();
const mockWarn = jest.fn();
jest.mock('@wcpos/utils/logger', () => ({
	getLogger: () => ({
		error: (...args: unknown[]) => mockMirrorError(...args),
		warn: (...args: unknown[]) => mockWarn(...args),
		info: (...args: unknown[]) => mockInfo(...args),
		// Recovered arcs (a refresh that timed out or failed) log at debug; the hook must not crash on them.
		debug: () => undefined,
	}),
	getErrorMessage: String,
}));
it('reports a falsy terminal provenance patch without rejecting the recorded payment', async () => {
	const original = mockResident.payload.meta_data;
	mockResident.payload.meta_data = withLedger([], [mockRow]);
	mockPatch.mockResolvedValueOnce(undefined as never);
	const hook = renderHook(() => useTerminalPaymentsService());
	try {
		await waitFor(() =>
			expect(mockMirrorError).toHaveBeenCalledWith(
				'Checkout failed',
				expect.objectContaining({ code: 'CHECKOUT101', showToast: true })
			)
		);
		expect(getTerminalPaymentsService()?.get('completed-order')).toBeNull();
	} finally {
		hook.unmount();
		mockResident.payload.meta_data = original;
	}
});

it('names the cashier at the till when a capture lands, not the one who started the service', async () => {
	const start = jest.spyOn(
		await import('../../../../../../services/terminal-payments'),
		'startTerminalPaymentsService'
	);
	const hook = renderHook(() => useTerminalPaymentsService());
	try {
		const service = getTerminalPaymentsService()!;
		const settle = async (id: string) => {
			const payment = {
				...mockRow,
				id,
				capture_mode: 'server' as const,
				recorded_offline: false,
				status: 'captured' as const,
			};
			mockHttp.get.mockResolvedValue({ data: { payment } });
			service.resume({
				orderUuid: 'completed-order',
				orderId: 42,
				orderNumber: '42',
				row: { ...payment, status: 'pending' },
			});
			await waitFor(() => expect(service.get('completed-order')).toBeNull());
		};
		await settle('first');
		expect(mockInfo).toHaveBeenCalledWith(
			'Card payment taken',
			expect.objectContaining({ actor: { id: '7', name: 'Pat' } })
		);
		mockSession.wpCredentials = { id: 9, display_name: 'Sam' };
		hook.rerender();
		expect(start).toHaveBeenCalledTimes(1);
		await settle('second');
		expect(mockInfo).toHaveBeenCalledWith(
			'Card payment taken',
			expect.objectContaining({ actor: { id: '9', name: 'Sam' } })
		);
	} finally {
		hook.unmount();
		start.mockRestore();
		mockSession.wpCredentials = { id: 7, display_name: 'Pat' };
	}
});

it.each(['ledger', 'provenance'] as const)(
	'preserves the rejection contract for a failed %s patch',
	async (failure) => {
		const original = mockResident.payload.meta_data;
		mockResident.payload.meta_data = [];
		const start = jest.spyOn(
			await import('../../../../../../services/terminal-payments'),
			'startTerminalPaymentsService'
		);
		const error = new Error(`${failure} write failed`);
		if (failure === 'ledger') mockMirror.mockRejectedValueOnce(error);
		else mockPatch.mockRejectedValueOnce(error);
		const hook = renderHook(() => useTerminalPaymentsService());
		try {
			const result = start.mock.calls[0][0].mirror('completed-order', {
				payment: { ...mockRow, status: 'captured' },
				order: {
					status: 'completed',
					total: '10.00',
					paid: '10.00',
					balance: '0.00',
					payment_method: 'device',
					payment_method_title: 'Reader',
				},
			});
			if (failure === 'ledger') {
				await expect(result).rejects.toBe(error);
				expect(mockPatch).not.toHaveBeenCalled();
			} else {
				await expect(result).resolves.toBeUndefined();
				expect(mockMirrorError).toHaveBeenCalledWith(
					'Checkout failed',
					expect.objectContaining({
						context: { error: String(error) },
					})
				);
			}
		} finally {
			hook.unmount();
			start.mockRestore();
			mockResident.payload.meta_data = original;
		}
	}
);

it('a completion nobody was watching still reports its missing store register', async () => {
	const start = jest.spyOn(
		await import('../../../../../../services/terminal-payments'),
		'startTerminalPaymentsService'
	);
	const hook = renderHook(() => useTerminalPaymentsService());
	try {
		mockWarn.mockClear();
		mockHttp.get.mockResolvedValue({
			data: {
				payment: { ...mockRow, status: 'captured' },
				order: {
					status: 'completed',
					total: '10.00',
					paid: '10.00',
					balance: '0',
					payment_method: 'device',
					payment_method_title: 'Reader',
				},
			},
		});
		getTerminalPaymentsService()!.resume({
			orderUuid: 'completed-order',
			orderId: 42,
			orderNumber: '42',
			row: { ...mockRow, capture_mode: 'server', recorded_offline: false, status: 'pending' },
		});
		await waitFor(() =>
			expect(mockWarn).toHaveBeenCalledWith(
				'Sale recorded without register provenance',
				expect.objectContaining({
					context: expect.objectContaining({
						reason: 'no_register_bound',
						orderUUID: 'completed-order',
					}),
				})
			)
		);
	} finally {
		hook.unmount();
		start.mockRestore();
	}
});

it('narrates a terminal refusal with no checkout mounted', async () => {
	const hook = renderHook(() => useTerminalPaymentsService());
	mockHttp.get.mockResolvedValue({
		data: {
			payment: {
				...mockRow,
				recorded_offline: false,
				status: 'failed',
				failure_reason: 'card_declined',
			},
		},
	});
	getTerminalPaymentsService()!.resume({
		orderUuid: 'completed-order',
		orderId: 42,
		orderNumber: '42',
		row: { ...mockRow, capture_mode: 'server', status: 'pending', recorded_offline: false },
	});
	await waitFor(() =>
		expect(mockMirrorError).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				context: expect.objectContaining({ type: 'payment.declined', reason: 'card_declined' }),
			})
		)
	);
	expect(
		mockMirrorError.mock.calls.filter(([, options]) => options.context?.type === 'payment.declined')
	).toHaveLength(1);
	hook.unmount();
});

jest.mock('../../sale-completion', () => {
	const actual =
		jest.requireActual<typeof import('../../sale-completion')>('../../sale-completion');
	const { withMetaReplaced } =
		jest.requireActual<typeof import('@wcpos/order-math')>('@wcpos/order-math');
	const completionMetaFor = jest.fn<
		ReturnType<typeof actual.completionMetaFor>,
		Parameters<typeof actual.completionMetaFor>
	>();
	completionMetaFor.mockImplementation(async (_ctx, meta, facts) =>
		withMetaReplaced(meta, [{ key: '_wcpos_sale_counter', value: '2' }, ...(facts.extraMeta ?? [])])
	);
	return { ...actual, completionMetaFor };
});

jest.mock('../../hooks/use-sale-context', () => ({
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

		userDB: {},
		siteUuid: 'site',
		storeId: 1,
		runtime: mockRuntime,
		dp: 2,
		stampCompletion: (
			...[o, m]: Parameters<import('../../sale-completion').SaleContext['stampCompletion']>
		) => mockPatch({ document: o, data: { meta_data: m } }),
		actor: {
			id: String(mockSession.wpCredentials.id),
			name: mockSession.wpCredentials.display_name,
		},
		stockAdjustment: jest.fn(),
	}),
}));

// Journal storage is exercised against RxDB in the owner/journal suites.
jest.mock('@wcpos/query/store-local', () => ({
	...jest.requireActual('@wcpos/query/store-local'),
	recordCompletionAttempt: jest.fn(async () => {}),
	resolveCompletionAttempt: jest.fn(async () => {}),
	failCompletionAttempt: jest.fn(async () => {}),
}));

jest.mock('@wcpos/query/mutations', () => ({
	mirrorServerOrder: (manager: unknown, recordId: string, changes: unknown) =>
		mockMirror({ manager, collection: 'orders', recordId, changes }),
	observeOfflineDeviceAuthorizations:
		jest.requireActual('@wcpos/query/mutations').observeOfflineDeviceAuthorizations,
}));

// Without a queue around the snapshot and write, the second leg replaces the first row.
it('preserves both offline payment rows when two legs race on one order', async () => {
	const original = mockResident.payload;
	mockResident.payload = { ...original, status: 'pos-open', meta_data: [] };
	const start = jest.spyOn(
		await import('../../../../../../services/terminal-payments'),
		'startTerminalPaymentsService'
	);
	mockPatch.mockImplementation(async ({ data }) => {
		// Model asynchronous persistence: a precomputed patch replaces the whole ledger.
		await Promise.resolve();
		mockResident.payload = { ...mockResident.payload, ...data };
		return mockResident;
	});
	const hook = renderHook(() => useTerminalPaymentsService());
	try {
		const { patchAndEnqueue } = start.mock.calls[0][0];
		await Promise.all([
			patchAndEnqueue!('completed-order', {
				...mockRow,
				id: 'first',
				amount: '4.00',
				status: 'captured',
			}),
			patchAndEnqueue!('completed-order', {
				...mockRow,
				id: 'second',
				amount: '6.00',
				status: 'captured',
			}),
		]);
		expect(readLedger(mockResident.payload.meta_data)).toEqual([
			expect.objectContaining({ id: 'first', amount: '4.00' }),
			expect.objectContaining({ id: 'second', amount: '6.00' }),
		]);
		expect(mockResident.payload.status).toBe('completed');
	} finally {
		hook.unmount();
		start.mockRestore();
		mockPatch.mockImplementation(async () => ({}));
		mockResident.payload = original;
	}
});

// A completing status drops the order from the till's open orders, which unmounts the tender
// that would select its receipt; the receipt must be entered before that write lands.
describe('a server capture of the order in checkout', () => {
	const order = (status: string) => ({
		status,
		total: '10.00',
		paid: '10.00',
		balance: '0.00',
		payment_method: 'device',
		payment_method_title: 'Reader',
	});
	async function mirrorCapture(status: string) {
		const start = jest.spyOn(
			await import('../../../../../../services/terminal-payments'),
			'startTerminalPaymentsService'
		);
		const original = mockResident.payload.meta_data;
		// No recoverable offline row: only this test's mirror reaches the status write.
		mockResident.payload.meta_data = [];
		const hook = renderHook(() => useTerminalPaymentsService());
		let atWrite: CheckoutModeSnapshot | null = null;
		mockMirror.mockImplementationOnce(async () => {
			atWrite = getCheckoutModeSnapshot();
		});
		try {
			await start.mock.calls[0][0].mirror('completed-order', {
				payment: { ...mockRow, status: 'captured' },
				order: order(status),
			});
		} finally {
			hook.unmount();
			start.mockRestore();
			mockResident.payload.meta_data = original;
		}
		expect(mockMirror).toHaveBeenCalledTimes(1);
		return atWrite! as CheckoutModeSnapshot;
	}
	let unwatch: (() => void) | undefined;
	afterEach(() => {
		unwatch?.();
		unwatch = undefined;
		resetCheckoutMode();
	});

	it.each([
		[true, 'completed-order'],
		[false, null],
	])(
		'enters its receipt before the status write (autoShowReceipt %s, selected %s)',
		async (autoShowReceipt, selected) => {
			enterCheckout('completed-order');
			unwatch = watchTender('completed-order', autoShowReceipt);
			const atWrite = await mirrorCapture('completed');
			expect(atWrite.receiptOrders.has('completed-order')).toBe(true);
			expect(atWrite.checkoutOrders.has('completed-order')).toBe(false);
			expect(atWrite.selectedReceiptOrder).toBe(selected);
		}
	);

	it('does not select the receipt while the cashier is on another order', async () => {
		enterCheckout('completed-order');
		unwatch = watchTender('other-order', true);
		const atWrite = await mirrorCapture('completed');
		expect(atWrite.receiptOrders.has('completed-order')).toBe(true);
		expect(atWrite.selectedReceiptOrder).toBeNull();
	});

	it('leaves a part-paid order in checkout', async () => {
		enterCheckout('completed-order');
		unwatch = watchTender('completed-order', true);
		const atWrite = await mirrorCapture('pos-partial');
		expect(atWrite.checkoutOrders.has('completed-order')).toBe(true);
		expect(atWrite.receiptOrders.size).toBe(0);
		expect(atWrite.selectedReceiptOrder).toBeNull();
	});
});

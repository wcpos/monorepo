/** @jest-environment jsdom */
import { renderHook, waitFor } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import { type MetaDataEntry, withLedger } from '@wcpos/order-math';

import { createActionContext } from '../../../../../../extensions/actions';
import { useTerminalPaymentsService } from './use-terminal-payments-service';
import {
	getTerminalPaymentsService,
	stopTerminalPaymentsService,
} from '../../../../../../services/terminal-payments';
import { row } from '../device/fixtures.test-utils';
import { getCheckoutModeSnapshot, resetCheckoutMode } from '../../checkout-mode';

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
const mockEngineListeners = new Set<(event: { type: string }) => void>();
const mockRuntime = {
	engine: {
		events: (listener: (event: { type: string }) => void) => {
			mockEngineListeners.add(listener);
			return () => mockEngineListeners.delete(listener);
		},
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
const mockPosterRefresh = jest.fn(async () => {});
const mockMirror = jest.fn(async (_input: unknown) => {});
const mockPatch = jest.fn<
	Promise<object | undefined>,
	[{ document: unknown; data: { meta_data?: MetaDataEntry[]; status?: string } }]
>(async () => ({}));
jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status: 'online-website-available' }),
}));
const mockPosterInputs: {
	post: (url: string, body: unknown) => Promise<unknown>;
	provenance?: (command: unknown) => Promise<unknown>;
}[] = [];
const mockCommandProvenance = jest.fn(async (..._args: unknown[]) => null);
jest.mock('../../provenance/command-provenance', () => ({
	commandProvenance: (...args: unknown[]) => mockCommandProvenance(...args),
}));
jest.mock('@wcpos/query', () => ({
	// Posts straight through; its mirror is the mocked mirrorServerOrder under a fixed revision.
	moneyCommandPoster: (input: {
		post: (url: string, body: unknown) => Promise<unknown>;
		runtime: unknown;
		orderUuid: string;
	}) =>
		mockPosterInputs.push(input) &&
		Object.assign((url: string, body: unknown) => input.post(url, body), {
			mirror: async (answer: object) => {
				await jest
					.requireMock('@wcpos/query/mutations')
					.mirrorServerOrder(input.runtime, input.orderUuid, {
						...answer,
						sentRevision: 'sha256:sent',
					});
				await mockPosterRefresh();
			},
			settle: async () => undefined,
		}),
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
beforeEach(() => resetCheckoutMode());
afterEach(() => {
	stopTerminalPaymentsService();
	jest.clearAllMocks();
});
// A cashier switch moves the till to another scope, where a live leg's order is not resident:
// the legs stop instead of polling and posting into a scope that cannot read them.
it('suspends every live terminal leg when the engine switches scope', async () => {
	const hook = renderHook(() => useTerminalPaymentsService());
	const service = getTerminalPaymentsService()!;
	const suspend = jest.spyOn(service, 'scopeSwitched');
	mockEngineListeners.forEach((listener) => listener({ type: 'collection-reset' }));
	expect(suspend).not.toHaveBeenCalled();
	mockEngineListeners.forEach((listener) =>
		listener({ type: 'scope-switched', scopeId: 'cashier-b' } as { type: string })
	);
	expect(suspend).toHaveBeenCalledWith('cashier-b');
	hook.unmount();
	expect(mockEngineListeners.size).toBe(0);
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

// ADR 0040 PR A: an offline authorization is never written locally; PR B queues it.
it('a re-completion provenance names the session the leg was approved under', async () => {
	const start = jest.spyOn(
		await import('../../../../../../services/terminal-payments'),
		'startTerminalPaymentsService'
	);
	const hook = renderHook(() => useTerminalPaymentsService());
	try {
		start.mock.calls[0][0].commandPoster!('completed-order', { sessionId: 'session-7' });
		const command = { kind: 'capture', target: 'leg', body: { context: {} } };
		await mockPosterInputs.at(-1)!.provenance!(command);
		expect(mockCommandProvenance).toHaveBeenCalledWith(
			expect.anything(),
			mockResident,
			'session-7',
			command
		);
	} finally {
		hook.unmount();
		start.mockRestore();
	}
});

it('the offline payment writer refuses with offline_unavailable', async () => {
	const start = jest.spyOn(
		await import('../../../../../../services/terminal-payments'),
		'startTerminalPaymentsService'
	);
	const hook = renderHook(() => useTerminalPaymentsService());
	try {
		await expect(
			start.mock.calls[0][0].patchAndEnqueue!('order', { ...mockRow, status: 'authorized' })
		).rejects.toThrow('offline_unavailable');
		expect(mockPatch).not.toHaveBeenCalled();
	} finally {
		hook.unmount();
		start.mockRestore();
	}
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
	const original = mockResident.payload.meta_data;
	// ADR 0040 D6: the resident's balance is zero only through captured money.
	mockResident.payload.meta_data = withLedger([], [{ ...mockRow, status: 'captured' }]);
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
		mockResident.payload.meta_data = original;
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
			const options = start.mock.calls[0][0];
			const result = options.mirror(
				'completed-order',
				{
					payment: { ...mockRow, status: 'captured' },
					order: {
						status: 'completed',
						total: '10.00',
						paid: '10.00',
						balance: '0.00',
						payment_method: 'device',
						payment_method_title: 'Reader',
					},
				},
				options.commandPoster('completed-order', { sessionId: null })
			);
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

it('a status answer’s revision reaches the poster’s mirror', async () => {
	const original = mockResident.payload.meta_data;
	mockResident.payload.meta_data = [];
	const start = jest.spyOn(
		await import('../../../../../../services/terminal-payments'),
		'startTerminalPaymentsService'
	);
	const hook = renderHook(() => useTerminalPaymentsService());
	try {
		const options = start.mock.calls[0][0];
		const payment = { ...mockRow, capture_mode: 'server' as const, recorded_offline: false };
		await options.mirror(
			'completed-order',
			{ payment, revision: 'sha256:poll' },
			options.commandPoster('completed-order', { sessionId: null })
		);
		expect(mockMirror).toHaveBeenCalledWith(
			expect.objectContaining({ changes: expect.objectContaining({ revision: 'sha256:poll' }) })
		);
	} finally {
		hook.unmount();
		start.mockRestore();
		mockResident.payload.meta_data = original;
	}
});

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
		expect(getCheckoutModeSnapshot().receiptOrders.has('completed-order')).toBe(true);
		expect(getCheckoutModeSnapshot().selectedReceiptOrder).toBeNull();
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

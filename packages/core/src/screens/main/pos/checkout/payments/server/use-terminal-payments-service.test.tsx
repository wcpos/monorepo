/** @jest-environment jsdom */
import { renderHook, waitFor } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import { withLedger } from '@wcpos/order-math';

import { useTerminalPaymentsService } from './use-terminal-payments-service';
import {
	getTerminalPaymentsService,
	stopTerminalPaymentsService,
} from '../../../../../../services/terminal-payments';
import { row } from '../device/fixtures.test-utils';

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
		require: jest.fn(() => ({ ready: Promise.resolve(), release: jest.fn() })),
		db$: (listener: (db: object) => void) => {
			listener({});
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
const mockPatch = jest.fn(async () => ({}));
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
jest.mock('../../../../hooks/mutations/use-local-mutation', () => ({
	useLocalMutation: () => ({ localPatch: mockPatch }),
	findEngineResident: async () => mockResident,
	patchEngineResident: (input: unknown) => mockMirror(input),
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
		userDB: {},
		siteUuid: 'site',
		storeId: 1,
		runtime: mockRuntime,
		dp: 2,
		localPatch: mockPatch,
		actor: {
			id: String(mockSession.wpCredentials.id),
			name: mockSession.wpCredentials.display_name,
		},
		stockAdjustment: jest.fn(),
	}),
}));

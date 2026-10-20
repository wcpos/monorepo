/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react';

import type { PaymentMethodDescriptor } from '@wcpos/order-math';
import type { EngineRecord } from '@wcpos/query';

import { useRecordManualPayment } from './use-record-manual-payment';

const mockPost = jest.fn();
const mockGet = jest.fn();
const mockLocalPatch = jest.fn();
const mockPatchEngineResident = jest.fn(async (_input: unknown) => undefined);
const mockPosterInput = jest.fn();
const mockSettle = jest.fn(async () => undefined);
const mockLoggerError = jest.fn();
const mockT = jest.fn();
const mockEngineRequire = jest.fn((_input: unknown) => ({
	ready: Promise.resolve(),
	release: () => {},
}));
const manager = { engine: { require: (input: unknown) => mockEngineRequire(input) } };
let onlineStatus = 'offline';

jest.mock('uuid', () => ({ v4: () => 'payment-id' }));
jest.mock('../../../hooks/use-rest-http-client', () => ({
	useRestHttpClient: () => ({ post: mockPost, get: mockGet }),
}));
jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status: onlineStatus }),
}));
jest.mock('../../../../../contexts/app-state', () => ({
	useStoreSession: () => ({
		site: { uuid: 'site' },
		wpCredentials: { id: 7 },
		store: { register_sessions: mockSessionsOn, id: 9, currency: 'EUR', price_num_decimals: 2 },
	}),
}));
jest.mock('../../../hooks/mutations/use-local-mutation', () => ({
	useLocalMutation: () => ({ localPatch: mockLocalPatch }),
}));
jest.mock('@wcpos/query', () => ({
	// The envelope itself is pinned in query/tests/money-command.test.ts; here it stamps the
	// revision so a test can see the post went through it.
	moneyCommandPoster: (input: {
		post: (url: string, body: unknown) => Promise<unknown>;
		runtime: unknown;
		orderUuid: string;
		approval: unknown;
	}) => {
		mockPosterInput(input);
		return Object.assign(
			(url: string, body: object) => input.post(url, { ...body, revision: 'sha256:sent' }),
			{
				// The mocked mirrorServerOrder under the revision the post went out with, then settle.
				mirror: async (answer: object) => {
					await jest
						.requireMock('@wcpos/query/mutations')
						.mirrorServerOrder(input.runtime, input.orderUuid, {
							...answer,
							sentRevision: 'sha256:sent',
						});
					await mockSettle();
				},
				settle: mockSettle,
			}
		);
	},
	useDocField: (doc: unknown, pick: (doc: unknown) => unknown) => pick(doc),
	useQueryRuntime: () => manager,
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
}));
jest.mock('@wcpos/utils/logger', () => ({
	// Lazy: the hook module calls getLogger() at import time, before the const above initialises.
	getLogger: () => ({
		error: (...args: unknown[]) => mockLoggerError(...args),
	}),
}));
jest.mock('../../../../../contexts/translations', () => {
	const { createTestT } = jest.requireActual<typeof import('../../../../../../jest/translate')>(
		'../../../../../../jest/translate'
	);
	const catalogT = createTestT();
	return {
		useT: () => (key: string, values?: Record<string, unknown>) => {
			mockT(key, values);
			return catalogT(key, values);
		},
	};
});

const method = {
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
const order = {
	uuid: 'o-1',
	payload: {
		id: 1042,
		number: '1042',
		total: '100.00',
		meta_data: [{ key: '_pos_user', value: '7' }],
	},
	getLatest: () => order,
} as EngineRecord<'orders'>;

beforeEach(() => {
	jest.clearAllMocks();
	order.payload.meta_data = [{ key: '_pos_user', value: '7' }];
	mockLocalPatch.mockImplementation(async ({ data }) => {
		Object.assign(order.payload, data);
		return { document: order };
	});
	onlineStatus = 'offline';
});

// ADR 0040 PR A: a tender the server cannot hear is refused (CHECKOUT101); PR B queues it.
it('refuses an offline row with CHECKOUT101 and writes nothing', async () => {
	const { result } = renderHook(() => useRecordManualPayment());

	await expect(
		result.current(order, method, { session: gateSession(), amount: 40, tendered: 50 })
	).resolves.toEqual({ kind: 'failed', reason: 'offline_unavailable' });

	expect(mockLocalPatch).not.toHaveBeenCalled();
	expect(mockPost).not.toHaveBeenCalled();
	expect(mockLoggerError).toHaveBeenCalledWith(
		'Checkout failed',
		expect.objectContaining({ code: 'CHECKOUT101', showToast: true })
	);
});

it('refreshes the order over REST when a refusal omits the server summary', async () => {
	onlineStatus = 'online-website-available';
	mockPost.mockRejectedValue({
		response: {
			status: 409,
			data: { code: 'wcpos_order_already_paid', message: 'Paid', data: {} },
		},
	});
	mockGet.mockResolvedValue({ data: { id: 1042, status: 'completed' } });
	const { result } = renderHook(() => useRecordManualPayment());

	await act(() => result.current(order, method, { session: gateSession(), amount: 40 }));

	expect(mockGet).toHaveBeenCalledWith('orders/1042');
	expect(mockPatchEngineResident).toHaveBeenCalledWith(
		expect.objectContaining({
			changes: expect.objectContaining({ order: { status: 'completed' } }),
		})
	);
});

it('logs a refused online payment as a failed sync record needing attention', async () => {
	onlineStatus = 'online-website-available';
	mockPost.mockRejectedValue({
		response: {
			status: 409,
			data: {
				code: 'wcpos_order_already_paid',
				message: 'Paid',
				data: { order: { status: 'completed', balance: '0.00' } },
			},
		},
	});
	const { result } = renderHook(() => useRecordManualPayment());

	await act(() => result.current(order, method, { session: gateSession(), amount: 40 }));

	expect(mockPatchEngineResident).toHaveBeenCalledWith(
		expect.objectContaining({ manager, collection: 'orders', recordId: order.uuid })
	);
	expect(mockT).toHaveBeenCalledWith('payments.refusal.already_paid', {
		number: '1042',
		amount: '40.00',
		method: 'Cash',
	});
	expect(mockLoggerError).toHaveBeenCalledWith(
		expect.stringContaining('Order #1042 was already paid online'),
		expect.objectContaining({
			code: 'PAYMENT501',
			terminal: expect.objectContaining({ operationType: 'sync.record', outcome: 'failed' }),
			context: expect.objectContaining({
				collection: 'orders',
				recordId: order.uuid,
				// The attention list renders `context.reason` as its line (deriveStuckRecords):
				// it must be the cashier-readable sentence, never the machine code.
				reason:
					'Order #1042 was already paid online; 40.00 Cash was also taken at the till — refund that payment.',
				refusal: 'order_already_paid',
			}),
		})
	);
});

it('localizes an amount-exceeds-balance refusal with the server balance', async () => {
	onlineStatus = 'online-website-available';
	mockPost.mockRejectedValue({
		response: {
			status: 400,
			data: {
				code: 'wcpos_amount_exceeds_balance',
				message: 'Too much',
				data: { order: { status: 'pos-partial', balance: '15.00' } },
			},
		},
	});
	const { result } = renderHook(() => useRecordManualPayment());

	await act(() => result.current(order, method, { session: gateSession(), amount: 40 }));

	expect(mockT).toHaveBeenCalledWith('payments.refusal.exceeds_balance_with_balance', {
		number: '1042',
		amount: '40.00',
		method: 'Cash',
		balance: '15.00',
	});
	expect(mockLoggerError).toHaveBeenCalledWith(
		'Order #1042 only had 15.00 outstanding; 40.00 Cash was taken at the till — refund the difference.',
		// Its own code: an over-payment is answered by taking the store's balance, which
		// is a different story from an order that was already paid online.
		expect.objectContaining({
			code: 'PAYMENT511',
			terminal: expect.objectContaining({ operationId: expect.any(String) }),
		})
	);
});

let mockBoundRegisterId: string | null = 'register';
beforeEach(() => {
	mockBoundRegisterId = 'register';
});
/** The ids the tender gates stamp before any manual leg reaches the writer. */
const gateSession = () => ({
	registerId: mockBoundRegisterId,
	sessionId: mockSessionsOn ? mockSessionId : null,
});

it.each([null, 'register'])(
	'queues one provenance patch and stamps only the bound register (%s)',
	async (registerId) => {
		mockBoundRegisterId = registerId;
		onlineStatus = 'online-website-available';
		mockPost.mockResolvedValue({ data: { order: { status: 'completed', balance: '0.00' } } });
		const { result } = renderHook(() => useRecordManualPayment());
		const split = {
			key: '_wcpos_split',
			value: '{"kind":"even","ways":2,"shares":["50.00","50.00"]}',
		};
		await act(() =>
			result.current(order, method, { session: gateSession(), amount: 100, extraMeta: [split] })
		);
		expect(mockPatchEngineResident).toHaveBeenCalledTimes(1);
		expect(mockLocalPatch).toHaveBeenCalledTimes(1);
		// The split summary rides with the leg that completes the sale.
		expect(mockLocalPatch).toHaveBeenCalledWith({
			document: order,
			data: {
				meta_data: expect.arrayContaining([{ key: '_wcpos_sale_counter', value: '1' }, split]),
			},
		});
		expect(mockPost.mock.calls[0][1].payment).toMatchObject({
			register_id: registerId,
			session_id: null,
		});
	}
);

const mockPushDocument = jest.fn(async () => undefined);
jest.mock('../../../contexts/use-push-document', () => ({
	usePushDocument: () => mockPushDocument,
}));

it('logs the cart-safe error without enqueueing a payment when the provenance patch fails', async () => {
	onlineStatus = 'online-website-available';
	mockLocalPatch.mockResolvedValue(undefined);
	const original = JSON.stringify(order.payload);
	const { result } = renderHook(() => useRecordManualPayment());

	await expect(
		result.current(order, method, { session: gateSession(), amount: 100 })
	).resolves.toEqual({
		kind: 'failed',
		reason: 'provenance_save_failed',
	});

	expect(mockLoggerError).toHaveBeenCalledWith(
		'Checkout failed',
		expect.objectContaining({
			code: 'CHECKOUT101',
			showToast: true,
			toast: { title: expect.any(String) },
		})
	);
	expect(mockT).toHaveBeenCalledWith('pos_cart.checkout_failed', undefined);
	expect(mockLocalPatch).toHaveBeenCalledTimes(1);
	expect(mockLocalPatch.mock.calls[0][0].data).not.toHaveProperty('status');
	expect(mockPushDocument).not.toHaveBeenCalled();
	expect(mockPost).not.toHaveBeenCalled();
	expect(mockPatchEngineResident).not.toHaveBeenCalled();
	expect(JSON.stringify(order.payload)).toBe(original);
});

it('posts the record through the command poster with the order revision', async () => {
	onlineStatus = 'online-website-available';
	mockPost.mockResolvedValueOnce({ data: { order: { status: 'pos-partial', balance: '60.00' } } });
	const { result } = renderHook(() => useRecordManualPayment());
	await act(() => result.current(order, method, { session: gateSession(), amount: 40 }));

	// A record is never approval-checked: the poster freezes the order as it stands.
	expect(mockPosterInput).toHaveBeenCalledWith(expect.objectContaining({ orderUuid: order.uuid }));
	expect(mockPosterInput.mock.calls[0][0].approval).toBeUndefined();
	expect(mockPost).toHaveBeenCalledWith(
		'orders/1042/payments',
		expect.objectContaining({ payment: expect.any(Object), revision: 'sha256:sent' })
	);
	expect(mockPatchEngineResident).toHaveBeenCalledWith(
		expect.objectContaining({ changes: expect.objectContaining({ sentRevision: 'sha256:sent' }) })
	);
	expect(mockSettle).toHaveBeenCalledTimes(1);
});

it('awaits the provenance push before posting and mirrors only the answered row, never pre-command meta', async () => {
	onlineStatus = 'online-website-available';
	const calls: string[] = [];
	mockLocalPatch.mockImplementationOnce(async ({ data }) => {
		Object.assign(order.payload, data);
		await Promise.resolve();
		calls.push('patched');
		return { document: order };
	});
	mockPushDocument.mockImplementationOnce(async () => {
		await Promise.resolve();
		calls.push('pushed');
	});
	mockPost.mockImplementationOnce(async () => {
		calls.push('post');
		return { data: { order: { status: 'completed', balance: '0.00' } } };
	});
	const { result } = renderHook(() => useRecordManualPayment());

	await act(() => result.current(order, method, { session: gateSession(), amount: 100 }));

	expect(calls).toEqual(['patched', 'pushed', 'post']);
	expect(mockPushDocument).toHaveBeenCalledWith(order);
	expect(mockLocalPatch).toHaveBeenCalledTimes(1);
	// The tuple stays on the resident: the mirror upserts the row onto the latest order.
	expect(mockPatchEngineResident).toHaveBeenCalledWith(
		expect.objectContaining({
			changes: expect.objectContaining({ payment: expect.objectContaining({ amount: '100.00' }) }),
		})
	);
	expect(mockPatchEngineResident.mock.calls[0][0]).not.toHaveProperty('changes.meta_data');
});

it('does not post or enqueue a payment when the provenance push rejects', async () => {
	onlineStatus = 'online-website-available';
	mockPushDocument.mockRejectedValueOnce(new Error('push failed'));
	const { result } = renderHook(() => useRecordManualPayment());

	await expect(
		result.current(order, method, { session: gateSession(), amount: 100 })
	).resolves.toEqual({
		kind: 'failed',
		reason: 'provenance_save_failed',
	});

	expect(mockLocalPatch).toHaveBeenCalledTimes(1);
	expect(mockLocalPatch.mock.calls[0][0].data).not.toHaveProperty('status');
	expect(mockPost).not.toHaveBeenCalled();
	expect(mockPatchEngineResident).not.toHaveBeenCalled();
	expect(mockLoggerError).toHaveBeenCalledWith(
		'Checkout failed',
		expect.objectContaining({
			code: 'CHECKOUT101',
		})
	);
	// The push reports nothing itself: the one report carries its cause.
	expect(mockLoggerError).toHaveBeenCalledTimes(1);
	expect(mockLoggerError).toHaveBeenCalledWith(
		'Checkout failed',
		expect.objectContaining({
			context: { error: 'provenance_save_failed', cause: 'push failed' },
		})
	);
});

it('reports a provenance push refused for the session as AUTH101, once', async () => {
	const { WriteDeferredError } = jest.requireMock('@wcpos/query');
	onlineStatus = 'online-website-available';
	mockPushDocument.mockRejectedValueOnce(new WriteDeferredError('mutation-1', 401));
	const { result } = renderHook(() => useRecordManualPayment());

	await expect(
		result.current(order, method, { session: gateSession(), amount: 100 })
	).resolves.toEqual({ kind: 'failed', reason: 'provenance_save_failed' });

	expect(mockLoggerError).toHaveBeenCalledTimes(1);
	expect(mockLoggerError).toHaveBeenCalledWith(
		'Checkout failed',
		expect.objectContaining({ code: 'AUTH101' })
	);
});

it('mirrors a refused server status without allocating or patching provenance', async () => {
	const stamp = jest.requireMock('../sale-completion');
	const completion = jest.spyOn(stamp, 'completionMetaFor');
	onlineStatus = 'online-website-available';
	mockPost.mockRejectedValueOnce({
		response: {
			data: { code: 'wcpos_order_already_paid', data: { order: { status: 'completed' } } },
		},
	});
	const { result } = renderHook(() => useRecordManualPayment());
	await expect(
		result.current(order, method, { session: gateSession(), amount: 40 })
	).resolves.toMatchObject({
		kind: 'refused',
	});
	expect(mockPatchEngineResident).toHaveBeenCalledWith(
		expect.objectContaining({
			changes: expect.objectContaining({ order: { status: 'completed' } }),
		})
	);
	expect(completion).not.toHaveBeenCalled();
	expect(mockLocalPatch).not.toHaveBeenCalled();
});

it.each([false, true])(
	'rejects with the accepted outcome when the mirror fails, after pulling the store copy (throws=%s)',
	async (throws) => {
		// The store has answered 2xx: the money is on the order there. Swallowing this used
		// to report a generic "checkout failed" on a payment the store had taken, which is
		// an invitation to take it twice. The caller is told what actually happened instead.
		onlineStatus = 'online-website-available';
		mockEngineRequire.mockClear();
		mockPost.mockResolvedValueOnce({ data: { order: { status: 'completed' } } });
		if (throws) mockLocalPatch.mockRejectedValueOnce(new Error('storage failed'));
		else mockLocalPatch.mockResolvedValueOnce(undefined);
		const { result } = renderHook(() => useRecordManualPayment());
		await expect(
			result.current(order, method, { session: gateSession(), amount: 40 })
		).rejects.toMatchObject({
			name: 'RecordManualPaymentMirrorError',
			outcome: expect.objectContaining({ kind: 'recorded' }),
		});
		expect(mockEngineRequire).toHaveBeenCalledWith(
			expect.objectContaining({ collection: 'orders', forceRefresh: true })
		);
		expect(mockLoggerError).not.toHaveBeenCalled();
	}
);

let mockSessionsOn = false;
let mockSessionId: string | null = 'session';
beforeEach(() => {
	mockSessionsOn = false;
	mockSessionId = 'session';
});

it('stamps the session on manual payments', async () => {
	mockSessionsOn = true;
	onlineStatus = 'online-website-available';
	mockPost.mockResolvedValue({ data: { order: { status: 'pending', balance: '60.00' } } });
	const { result } = renderHook(() => useRecordManualPayment());
	await act(() => result.current(order, method, { session: gateSession(), amount: 40 }));
	expect(mockPost.mock.calls[0][1].payment.session_id).toBe('session');
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
				if (input.online) await ctx.pushDocument(input.order);
			}
		),
	};
});

jest.mock('../hooks/use-sale-context', () => ({
	useSaleContext: () => ({
		userDB: {},
		siteUuid: 'site',
		storeId: 1,
		runtime: manager,
		dp: 2,
		stampCompletion: (
			...[o, m]: Parameters<import('../sale-completion').SaleContext['stampCompletion']>
		) => mockLocalPatch({ document: o, data: { meta_data: m } }),
		pushDocument: mockPushDocument,
	}),
}));

it('does not fallback-stamp an accepted response whose status is still partial', async () => {
	onlineStatus = 'online-website-available';
	mockPost.mockResolvedValueOnce({ data: { order: { status: 'pos-partial', balance: '60.00' } } });
	const { result } = renderHook(() => useRecordManualPayment());
	await act(() => result.current(order, method, { session: gateSession(), amount: 40 }));
	expect(mockPatchEngineResident).toHaveBeenCalledTimes(1);
	expect(mockLocalPatch).not.toHaveBeenCalled();
	expect(jest.requireMock('../sale-completion').completionMetaFor).not.toHaveBeenCalled();
});

it('stamps the ids the tender gates handed over', async () => {
	onlineStatus = 'online-website-available';
	mockPost.mockResolvedValue({ data: { order: { status: 'pending', balance: '60.00' } } });
	const { result } = renderHook(() => useRecordManualPayment());
	await act(() =>
		result.current(order, method, {
			amount: 40,
			tendered: 50,
			session: { registerId: 'register-from-gate', sessionId: 'session-from-gate' },
		})
	);

	const row = mockPost.mock.calls[0][1].payment;
	expect(row.session_id).toBe('session-from-gate');
	expect(row.register_id).toBe('register-from-gate');
});

it.each([
	['USD', 'USD'],
	[undefined, 'EUR'],
])(
	'mints the row in the order currency (%s), the store currency only when it has none',
	async (orderCurrency, minted) => {
		// The store document says EUR; a saved cart opened in USD keeps USD.
		const payload = order.payload as typeof order.payload & { currency?: string };
		if (orderCurrency) payload.currency = orderCurrency;
		else delete payload.currency;
		onlineStatus = 'online-website-available';
		mockPost.mockResolvedValue({ data: { order: { status: 'pending', balance: '60.00' } } });
		const { result } = renderHook(() => useRecordManualPayment());
		await act(() => result.current(order, method, { session: gateSession(), amount: 40 }));
		delete payload.currency;

		expect(mockPost.mock.calls[0][1].payment.currency).toBe(minted);
	}
);

jest.mock('@wcpos/query/mutations', () => ({
	mirrorServerOrder: (manager: unknown, recordId: string, changes: unknown) =>
		mockPatchEngineResident({ manager, collection: 'orders', recordId, changes }),
}));

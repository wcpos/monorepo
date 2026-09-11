/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react';

import type { PaymentMethodDescriptor } from '@wcpos/order-math';
import type { EngineRecord } from '@wcpos/query';

import { useRecordManualPayment } from './use-record-manual-payment';

const mockPost = jest.fn();
const mockGet = jest.fn();
const mockLocalPatch = jest.fn();
const mockPatchEngineResident = jest.fn(async (_input: unknown) => undefined);
const mockLoggerError = jest.fn();
const mockT = jest.fn();
const manager = {};
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
		store: { id: 9, currency: 'EUR', price_num_decimals: 2 },
	}),
}));
jest.mock('../../../hooks/mutations/use-local-mutation', () => ({
	useLocalMutation: () => ({ localPatch: mockLocalPatch }),
	patchEngineResident: (input: unknown) => mockPatchEngineResident(input),
}));
jest.mock('@wcpos/query', () => ({ useQueryRuntime: () => manager }));
jest.mock('@wcpos/utils/logger', () => ({
	// Lazy: the hook module calls getLogger() at import time, before the const above initialises.
	getLogger: () => ({ error: (...args: unknown[]) => mockLoggerError(...args) }),
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
	getLatest: () => ({
		payload: {
			id: 1042,
			number: '1042',
			total: '100.00',
			meta_data: [{ key: '_pos_user', value: '7' }],
		},
	}),
} as EngineRecord<'orders'>;

beforeEach(() => {
	jest.clearAllMocks();
	mockLocalPatch.mockResolvedValue({ document: order });
	onlineStatus = 'offline';
});

it('routes an offline row through localPatch on the supplied order document', async () => {
	const { result } = renderHook(() => useRecordManualPayment());

	await act(() => result.current(order, method, { amount: 40, tendered: 50 }));

	expect(mockLocalPatch).toHaveBeenCalledWith({
		document: order,
		data: {
			status: 'pos-partial',
			meta_data: expect.arrayContaining([
				expect.objectContaining({
					key: '_wcpos_payments',
					value: expect.objectContaining({
						payments: [expect.objectContaining({ recorded_offline: true, change: '10.00' })],
					}),
				}),
			]),
		},
	});
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

	await act(() => result.current(order, method, { amount: 40 }));

	expect(mockGet).toHaveBeenCalledWith('orders/1042');
	expect(mockPatchEngineResident).toHaveBeenCalledWith(
		expect.objectContaining({ changes: expect.objectContaining({ status: 'completed' }) })
	);
});

it('rejects the payment when localPatch reports a failed write', async () => {
	mockLocalPatch.mockResolvedValue(undefined);
	const { result } = renderHook(() => useRecordManualPayment());

	await expect(result.current(order, method, { amount: 40 })).rejects.toThrow();
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

	await act(() => result.current(order, method, { amount: 40 }));

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
			terminal: { operationType: 'sync.record', outcome: 'failed' },
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

	await act(() => result.current(order, method, { amount: 40 }));

	expect(mockT).toHaveBeenCalledWith('payments.refusal.exceeds_balance_with_balance', {
		number: '1042',
		amount: '40.00',
		method: 'Cash',
		balance: '15.00',
	});
	expect(mockLoggerError).toHaveBeenCalledWith(
		'Order #1042 only had 15.00 outstanding; 40.00 Cash was taken at the till — refund the difference.',
		expect.any(Object)
	);
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
it('queues exactly one provenance-only patch after a full online manual payment mirror', async () => {
	onlineStatus = 'online-website-available';
	mockPost.mockResolvedValue({ data: { order: { status: 'completed', balance: '0.00' } } });
	const { result } = renderHook(() => useRecordManualPayment());
	await act(() => result.current(order, method, { amount: 100 }));
	expect(mockPatchEngineResident).toHaveBeenCalledTimes(1);
	expect(mockLocalPatch).toHaveBeenCalledTimes(1);
	expect(mockLocalPatch).toHaveBeenCalledWith({
		document: order,
		data: { meta_data: expect.arrayContaining([{ key: '_wcpos_sale_counter', value: '1' }]) },
	});
	expect(mockPost.mock.calls[0][1].payment).toMatchObject({
		register_id: 'register',
		session_id: null,
	});
});

const mockPushDocument = jest.fn(async () => undefined);
jest.mock('../../../contexts/use-push-document', () => ({
	usePushDocument: () => mockPushDocument,
}));

it('logs the cart-safe error without enqueueing a payment when the provenance patch fails', async () => {
	onlineStatus = 'online-website-available';
	mockLocalPatch.mockResolvedValue(undefined);
	const original = JSON.stringify(order.payload);
	const { result } = renderHook(() => useRecordManualPayment());

	await expect(result.current(order, method, { amount: 100 })).resolves.toEqual({
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

it('awaits the provenance push before posting and preserves the tuple in the mirror', async () => {
	onlineStatus = 'online-website-available';
	const calls: string[] = [];
	mockLocalPatch.mockImplementationOnce(async () => {
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

	await act(() => result.current(order, method, { amount: 100 }));

	expect(calls).toEqual(['patched', 'pushed', 'post']);
	expect(mockPushDocument).toHaveBeenCalledWith(order);
	expect(mockLocalPatch).toHaveBeenCalledTimes(1);
	expect(mockPatchEngineResident).toHaveBeenCalledWith(
		expect.objectContaining({
			changes: expect.objectContaining({
				meta_data: expect.arrayContaining([{ key: '_wcpos_sale_counter', value: '1' }]),
			}),
		})
	);
});

it('does not post or enqueue a payment when the provenance push rejects', async () => {
	onlineStatus = 'online-website-available';
	mockPushDocument.mockRejectedValueOnce(new Error('push failed'));
	const { result } = renderHook(() => useRecordManualPayment());

	await expect(result.current(order, method, { amount: 100 })).resolves.toEqual({
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
});

it('mirrors a refused server status without allocating or patching provenance', async () => {
	const stamp = jest.requireMock('../provenance/stamp-completion');
	const completion = jest.spyOn(stamp, 'completionMeta');
	onlineStatus = 'online-website-available';
	mockPost.mockRejectedValueOnce({
		response: {
			data: { code: 'wcpos_order_already_paid', data: { order: { status: 'completed' } } },
		},
	});
	const { result } = renderHook(() => useRecordManualPayment());
	await expect(result.current(order, method, { amount: 40 })).resolves.toMatchObject({
		kind: 'refused',
	});
	expect(mockPatchEngineResident).toHaveBeenCalledWith(
		expect.objectContaining({ changes: expect.objectContaining({ status: 'completed' }) })
	);
	expect(completion).not.toHaveBeenCalled();
	expect(mockLocalPatch).not.toHaveBeenCalled();
	completion.mockRestore();
});

it.each([false, true])(
	'logs a failed accepted mirror without throwing (throws=%s)',
	async (throws) => {
		onlineStatus = 'online-website-available';
		mockPost.mockResolvedValueOnce({ data: { order: { status: 'completed' } } });
		if (throws) mockLocalPatch.mockRejectedValueOnce(new Error('storage failed'));
		else mockLocalPatch.mockResolvedValueOnce(undefined);
		const { result } = renderHook(() => useRecordManualPayment());
		await expect(result.current(order, method, { amount: 40 })).resolves.toMatchObject({
			kind: 'recorded',
		});
		expect(mockLoggerError).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({ code: 'CHECKOUT101', showToast: true })
		);
	}
);

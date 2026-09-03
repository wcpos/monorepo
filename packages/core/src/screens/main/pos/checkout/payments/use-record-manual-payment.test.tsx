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

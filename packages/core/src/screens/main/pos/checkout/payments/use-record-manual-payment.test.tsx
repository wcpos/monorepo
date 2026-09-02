/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react';

import type { PaymentMethodDescriptor } from '@wcpos/order-math';
import type { EngineRecord } from '@wcpos/query';

import { useRecordManualPayment } from './use-record-manual-payment';

const mockPost = jest.fn();
const mockLocalPatch = jest.fn(async () => undefined);
const mockPatchEngineResident = jest.fn(async (_input: unknown) => undefined);
const mockLoggerError = jest.fn();
const manager = {};
let onlineStatus = 'offline';

jest.mock('uuid', () => ({ v4: () => 'payment-id' }));
jest.mock('../../../hooks/use-rest-http-client', () => ({
	useRestHttpClient: () => ({ post: mockPost }),
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
	payload: { id: 1042, number: '1042', meta_data: [{ key: '_pos_user', value: '7' }] },
	getLatest: () => ({
		payload: { id: 1042, number: '1042', meta_data: [{ key: '_pos_user', value: '7' }] },
	}),
} as EngineRecord<'orders'>;

beforeEach(() => {
	jest.clearAllMocks();
	onlineStatus = 'offline';
});

it('routes an offline row through localPatch on the supplied order document', async () => {
	const { result } = renderHook(() => useRecordManualPayment());

	await act(() => result.current(order, method, { amount: 40, tendered: 50 }));

	expect(mockLocalPatch).toHaveBeenCalledWith({
		document: order,
		data: {
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

it('logs a refused online payment as a failed sync record needing attention', async () => {
	onlineStatus = 'online-website-available';
	mockPost.mockRejectedValue({
		response: {
			status: 409,
			data: { code: 'wcpos_order_already_paid', message: 'Paid', data: {} },
		},
	});
	const { result } = renderHook(() => useRecordManualPayment());

	await act(() => result.current(order, method, { amount: 40 }));

	expect(mockPatchEngineResident).toHaveBeenCalledWith(
		expect.objectContaining({ manager, collection: 'orders', recordId: order.uuid })
	);
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
				reason: expect.stringMatching(
					/^Order #1042 was already paid online; 40\.00 Cash was also taken at the till — refund the cash\.$/
				),
				refusal: 'order_already_paid',
			}),
		})
	);
});

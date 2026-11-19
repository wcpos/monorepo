/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react';

import { type MetaDataEntry, withAwaitingCustomer } from '@wcpos/order-math';

import { useVoidOrder } from './use-void-order';

const mockVoidOrder = jest.fn();
const mockRefresh = jest.fn();
const mockCancel = jest.fn();
const mockSetCurrentOrderID = jest.fn();
const mockLogger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
const mockSuccess = jest.fn();
const mockEngine = { write: jest.fn() };
let mockPayload: Record<string, unknown> = {};
const mockOrder = {
	uuid: 'order-1',
	getLatest: () => ({ toMutableJSON: () => ({ payload: mockPayload }) }),
};

jest.mock('@wcpos/query', () => ({
	useQueryRuntime: () => ({ engine: mockEngine }),
	isRecordClosed: () => false,
}));
jest.mock('@wcpos/query/mutations', () => ({
	voidOrder: (...args: unknown[]) => mockVoidOrder(...args),
	restoreVoidedOrder: jest.fn(),
}));
jest.mock('@wcpos/query/record-readers', () => ({
	refreshOrderRecord: (...args: unknown[]) => mockRefresh(...args),
}));
jest.mock('@wcpos/query/register-session', () => ({
	getCurrentBoundRegisterId: () => 'r1',
	RegisterSessionRequiredError: class extends Error {},
}));
// The hook builds its logger at import, before the mocks above exist: every call reads them late.
jest.mock('@wcpos/utils/logger', () => ({
	getLogger: () => ({
		debug: (...args: unknown[]) => mockLogger.debug(...args),
		info: (...args: unknown[]) => mockLogger.info(...args),
		warn: (...args: unknown[]) => mockLogger.warn(...args),
		error: (...args: unknown[]) => mockLogger.error(...args),
		success: (...args: unknown[]) => mockSuccess(...args),
	}),
	getErrorMessage: (error: unknown) => String(error),
}));
jest.mock('./use-action-context', () => ({
	useActionContext: () => ({
		ctx: {
			log: jest.fn(),
			t: (key: string) => key,
			now: Date.now,
			read: { catalog: async () => null, paymentMethod: () => null },
			register: { resolveSession: async () => ({ registerId: 'r1', sessionId: null }) },
			store: { preventOverselling: false, priceDecimals: 2 },
		},
		actor: { userId: 7, registerId: 'r1', sessionId: null },
		cashier: null,
	}),
}));
jest.mock('../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('../../../../services/terminal-payments', () => ({
	getTerminalPaymentsService: () => null,
}));
jest.mock('../../hooks/use-storage-health', () => ({
	useStorageMoneyPathGuard: () => ({ storageDegraded: false, blockIfDegraded: () => false }),
}));
jest.mock('../checkout/payments/use-gateway-payment', () => ({
	useGatewayPayment: () => ({ cancel: (...args: unknown[]) => mockCancel(...args) }),
}));
jest.mock('../contexts/current-order', () => ({
	useCurrentOrderRecord: () => mockOrder,
	useCurrentOrderActions: () => ({
		getCurrentOrderRecord: () => mockOrder,
		setCurrentOrderID: mockSetCurrentOrderID,
	}),
}));

const stamp = {
	method_id: 'wcpos_email_invoice',
	destination: 'buyer@example.com',
	attempt_id: 'attempt-1',
	sent_at_gmt: '2026-11-19T10:00:00.000Z',
	cashier_id: 7,
};
const sent = (): MetaDataEntry[] => withAwaitingCustomer([], stamp);

async function pressVoid() {
	const { result } = renderHook(() => useVoidOrder());
	await act(() => result.current.voidOrder());
}
const toastAction = () =>
	(mockSuccess.mock.calls[0]?.[1] as { toast: { action?: unknown } }).toast.action;

beforeEach(() => {
	jest.clearAllMocks();
	mockVoidOrder.mockResolvedValue({ kind: 'kept-cancelled' });
	mockRefresh.mockResolvedValue('refreshed');
});

describe('a sent invoice', () => {
	beforeEach(() => {
		mockPayload = { id: 33, number: '33', status: 'pos-open', meta_data: sent() };
	});

	it('cancels the invoice first, then cancels the order: never a delete, no Undo', async () => {
		mockCancel.mockResolvedValue({
			kind: 'answered',
			reopened: true,
			order: { status: 'pos-open' },
			notMirrored: null,
		});
		await pressVoid();
		expect(mockCancel).toHaveBeenCalledWith(mockOrder, stamp);
		expect(mockVoidOrder).toHaveBeenCalledTimes(1);
		expect(mockVoidOrder).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ recordId: 'order-1', registerId: 'r1', keep: true })
		);
		expect(mockCancel.mock.invocationCallOrder[0]).toBeLessThan(
			mockVoidOrder.mock.invocationCallOrder[0]
		);
		expect(mockSuccess).toHaveBeenCalledWith('pos_cart.order_voided_cancelled', expect.anything());
		expect(toastAction()).toBeUndefined();
		expect(mockSetCurrentOrderID).toHaveBeenCalledWith('');
	});

	it('a cancel write that fails after the store reopened the order: the failure shown, the order refreshed, no retry', async () => {
		mockCancel.mockResolvedValue({
			kind: 'answered',
			reopened: true,
			order: { status: 'pos-open' },
			notMirrored: null,
		});
		mockVoidOrder.mockRejectedValue(new Error('disk full'));
		await pressVoid();
		expect(mockVoidOrder).toHaveBeenCalledTimes(1);
		expect(mockLogger.error).toHaveBeenCalledWith(
			'Failed to void order',
			expect.objectContaining({ showToast: true })
		);
		expect(mockRefresh).toHaveBeenCalledTimes(1);
		expect(mockRefresh).toHaveBeenCalledWith(mockEngine, 33);
		expect(mockSuccess).not.toHaveBeenCalled();
		expect(mockSetCurrentOrderID).not.toHaveBeenCalled();
	});

	it.each([
		[
			'an answer that leaves the order elsewhere',
			{ kind: 'answered', reopened: false, order: { status: 'processing' }, notMirrored: null },
			'pos_checkout.invoice_not_cancelled',
		],
		[
			'a refusal',
			{ kind: 'refused', code: 'wcpos_attempt_settled', message: 'Already paid' },
			'Already paid',
		],
	])(
		'stops on %s: nothing written, the order refreshed, the reason shown',
		async (_, answer, why) => {
			mockCancel.mockResolvedValue(answer);
			await pressVoid();
			expect(mockVoidOrder).not.toHaveBeenCalled();
			expect(mockEngine.write).not.toHaveBeenCalled();
			expect(mockRefresh).toHaveBeenCalledWith(mockEngine, 33);
			expect(mockLogger.warn).toHaveBeenCalledWith(why, expect.anything());
			expect(mockLogger.error).not.toHaveBeenCalled();
			expect(mockSuccess).not.toHaveBeenCalled();
			expect(mockSetCurrentOrderID).not.toHaveBeenCalled();
		}
	);
});

describe('an order with no stamp', () => {
	it('voids as before: no invoice cancel, no keep, the Undo offered', async () => {
		mockPayload = { id: 34, number: '34', status: 'pos-open', meta_data: [] };
		mockVoidOrder.mockResolvedValue({ kind: 'removed', confirmed: true, late: null });
		await pressVoid();
		expect(mockCancel).not.toHaveBeenCalled();
		expect(mockRefresh).not.toHaveBeenCalled();
		expect(mockVoidOrder).toHaveBeenCalledWith(expect.anything(), {
			recordId: 'order-1',
			registerId: 'r1',
			undone: expect.any(Function),
		});
		expect(mockSuccess).toHaveBeenCalledWith('pos_cart.order_removed', expect.anything());
		expect(toastAction()).toEqual(expect.objectContaining({ label: 'common.undo' }));
	});

	it('a failed void shows the failure and refreshes nothing, as before', async () => {
		mockPayload = { id: 34, number: '34', status: 'pos-open', meta_data: [] };
		mockVoidOrder.mockRejectedValue(new Error('disk full'));
		await pressVoid();
		expect(mockLogger.error).toHaveBeenCalledWith('Failed to void order', expect.anything());
		expect(mockRefresh).not.toHaveBeenCalled();
	});
});

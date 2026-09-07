/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';

import { enterCheckout, getCheckoutModeSnapshot, resetCheckoutMode } from '../checkout-mode';
import { useCompleteOrderFlow } from './use-complete-order-flow';

const mockReplace = jest.fn();
const mockRequire = jest.fn();
const mockStockAdjustment = jest.fn();
const mockSetCurrentOrderID = jest.fn();
let mockAutoShowReceipt = false;
let mockScreenSize = 'lg';
jest.mock('../../../../../contexts/theme', () => ({
	useTheme: () => ({ screenSize: mockScreenSize }),
}));

jest.mock('expo-router', () => ({
	useRouter: () => ({ replace: mockReplace }),
}));
jest.mock('@wcpos/query', () => ({
	useQueryRuntime: () => ({ engine: { require: mockRequire } }),
	useRecordField: (record: unknown, select: (value: unknown) => unknown) => select(record),
}));
jest.mock('../../../contexts/ui-settings', () => ({
	useUISettings: () => ({ uiSettings: { autoShowReceipt: mockAutoShowReceipt } }),
}));
jest.mock('../../../hooks/use-stock-adjustment', () => ({
	useStockAdjustment: () => ({ stockAdjustment: mockStockAdjustment }),
}));
jest.mock('../../contexts/current-order/context', () => ({
	useCurrentOrderActions: () => ({ setCurrentOrderID: mockSetCurrentOrderID }),
}));

function makeOrder(id: number | null = 42) {
	const reduced = { id: 1, meta_data: [{ key: '_reduced_stock', value: '1' }] };
	const untouched = { id: 2, meta_data: [] };
	const record = {
		uuid: 'uuid-42',
		payload: { id, line_items: [] },
		getLatest: () => ({ payload: { id, line_items: [reduced, untouched] } }),
	};
	return { record: record as never, reduced };
}

describe('useCompleteOrderFlow', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockAutoShowReceipt = false;
		mockScreenSize = 'lg';
		resetCheckoutMode();
		enterCheckout('uuid-42');
		mockRequire.mockReturnValue({ ready: Promise.resolve(), release: jest.fn() });
	});

	it('force-refreshes by default before adjusting stock and routing', async () => {
		const { record, reduced } = makeOrder();
		const { result } = renderHook(() => useCompleteOrderFlow(record));

		await act(async () => result.current());

		expect(mockRequire).toHaveBeenCalledWith({
			id: 'checkout:order-refresh:42',
			collection: 'orders',
			kind: 'targeted-records',
			remoteIds: ['42'],
			forceRefresh: true,
		});
		expect(mockRequire.mock.results[0]?.value.release).toHaveBeenCalledTimes(1);
		expect(mockStockAdjustment).toHaveBeenCalledWith([reduced]);
		expect(mockSetCurrentOrderID).toHaveBeenCalledWith('');
		expect(mockReplace).not.toHaveBeenCalled();
		expect(getCheckoutModeSnapshot().checkoutOrders.has('uuid-42')).toBe(false);
	});

	it('skips refresh for an unpersisted offline order and can route to its receipt', async () => {
		mockAutoShowReceipt = true;
		const { record, reduced } = makeOrder(null);
		const { result } = renderHook(() => useCompleteOrderFlow(record));

		await act(async () => result.current({ refresh: false }));

		expect(mockRequire).not.toHaveBeenCalled();
		expect(mockStockAdjustment).toHaveBeenCalledWith([reduced]);
		expect(mockSetCurrentOrderID).not.toHaveBeenCalled();
		expect(mockReplace).not.toHaveBeenCalled();
		expect(getCheckoutModeSnapshot().selectedReceiptOrder).toBe('uuid-42');
	});

	it('closes the phone sheet when receipts are disabled', async () => {
		mockScreenSize = 'sm';
		const { result } = renderHook(() => useCompleteOrderFlow(makeOrder().record));
		await act(async () => result.current());
		expect(mockSetCurrentOrderID).toHaveBeenCalledWith('');
		expect(getCheckoutModeSnapshot().checkoutOrders.size).toBe(0);
		expect(mockReplace).toHaveBeenCalledWith({ pathname: '/cart' });
	});

	it('rejects a default refresh when the order has no remote id', async () => {
		const { record } = makeOrder(null);
		const { result } = renderHook(() => useCompleteOrderFlow(record));

		await expect(result.current()).rejects.toThrow('checkout_refresh_requires_persisted_order');
		expect(mockRequire).not.toHaveBeenCalled();
		expect(mockStockAdjustment).not.toHaveBeenCalled();
	});

	it('releases a refresh that never settles and still routes the paid order', async () => {
		jest.useFakeTimers();
		const release = jest.fn();
		mockRequire.mockReturnValue({ ready: new Promise<void>(() => undefined), release });
		const { record } = makeOrder();
		const { result } = renderHook(() => useCompleteOrderFlow(record));
		const completion = result.current();

		await act(async () => {
			jest.advanceTimersByTime(10_000);
			await completion;
		});

		expect(release).toHaveBeenCalledTimes(1);
		expect(mockSetCurrentOrderID).toHaveBeenCalledWith('');
		expect(mockReplace).not.toHaveBeenCalled();
		expect(getCheckoutModeSnapshot().checkoutOrders.has('uuid-42')).toBe(false);
		jest.useRealTimers();
	});
});

it.each([true, false])(
	'preserves the legacy modal completion when autoShowReceipt=%s',
	async (autoShowReceipt) => {
		mockAutoShowReceipt = autoShowReceipt;
		mockScreenSize = 'lg';
		jest.clearAllMocks();
		resetCheckoutMode();
		mockRequire.mockReturnValue({ ready: Promise.resolve(), release: jest.fn() });
		const { result } = renderHook(() => useCompleteOrderFlow(makeOrder().record, 'modal'));
		await act(async () => result.current());
		expect(mockSetCurrentOrderID).toHaveBeenCalledWith('');
		expect(getCheckoutModeSnapshot().receiptOrders.size).toBe(0);
		expect(mockReplace).toHaveBeenCalledWith(
			autoShowReceipt
				? {
						pathname: '/(app)/(drawer)/(pos)/(modals)/cart/receipt/[orderId]',
						params: { orderId: 'uuid-42' },
					}
				: { pathname: '/cart' }
		);
	}
);

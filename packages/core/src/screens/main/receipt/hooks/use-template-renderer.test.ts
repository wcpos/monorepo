/**
 * @jest-environment jsdom
 */
import { renderHook } from '@testing-library/react';

import { useTemplateRenderer } from './use-template-renderer';

const mockUseReceiptData = jest.fn();
const mockUseActiveTemplates = jest.fn(() => []);
const mockUseAppState = jest.fn(() => ({ store: { name: 'Test Store' } }));
const mockUseOnlineStatus = jest.fn(() => ({ status: 'online-website-available' }));
const mockBuildReceiptData = jest.fn(
	(order: Record<string, unknown>, store: Record<string, unknown>) => ({
		source: 'local',
		order,
		store,
	})
);

jest.mock('./use-receipt-data', () => ({
	useReceiptData: (...args: unknown[]) => mockUseReceiptData(...args),
}));

jest.mock('./use-active-templates', () => ({
	useActiveTemplates: () => mockUseActiveTemplates(),
}));

jest.mock('../../../../contexts/app-state', () => ({
	useAppState: () => mockUseAppState(),
}));

jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => mockUseOnlineStatus(),
}));

jest.mock('../utils/build-receipt-data', () => ({
	buildReceiptData: (order: Record<string, unknown>, store: Record<string, unknown>) =>
		mockBuildReceiptData(order, store),
}));

const defaultOptions = {
	orderId: 42,
	baseReceiptURL: undefined,
	mode: 'live' as const,
	order: { id: 42, total: '10.00' },
};

describe('useTemplateRenderer', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockUseReceiptData.mockReturnValue({ data: null, isLoading: false });
		mockUseActiveTemplates.mockReturnValue([]);
		mockUseAppState.mockReturnValue({ store: { name: 'Test Store' } });
		mockUseOnlineStatus.mockReturnValue({ status: 'online-website-available' });
	});

	describe('receiptData selection', () => {
		it('uses API data when available', () => {
			const apiData = { source: 'api', meta: { order_number: '123' } };
			mockUseReceiptData.mockReturnValue({ data: apiData, isLoading: false });

			const { result } = renderHook(() => useTemplateRenderer(defaultOptions));

			expect(result.current.receiptData).toBe(apiData);
			expect(mockBuildReceiptData).not.toHaveBeenCalled();
		});

		it('falls back to local data when API data is null', () => {
			mockUseReceiptData.mockReturnValue({ data: null, isLoading: false });

			const { result } = renderHook(() => useTemplateRenderer(defaultOptions));

			expect(result.current.receiptData).toEqual({
				source: 'local',
				order: defaultOptions.order,
				store: { name: 'Test Store' },
			});
			expect(mockBuildReceiptData).toHaveBeenCalledWith(
				defaultOptions.order,
				{ name: 'Test Store' }
			);
		});

		it('returns null when no API data and no order', () => {
			mockUseReceiptData.mockReturnValue({ data: null, isLoading: false });

			const { result } = renderHook(() =>
				useTemplateRenderer({ ...defaultOptions, order: undefined })
			);

			expect(result.current.receiptData).toBeNull();
		});
	});

	describe('isSyncing', () => {
		it('is true when loading and no API data yet', () => {
			mockUseReceiptData.mockReturnValue({ data: null, isLoading: true });

			const { result } = renderHook(() => useTemplateRenderer(defaultOptions));

			expect(result.current.isSyncing).toBe(true);
		});

		it('is false when loading is complete', () => {
			const apiData = { source: 'api' };
			mockUseReceiptData.mockReturnValue({ data: apiData, isLoading: false });

			const { result } = renderHook(() => useTemplateRenderer(defaultOptions));

			expect(result.current.isSyncing).toBe(false);
		});

		it('is false when API data has arrived even if loading flag is stale', () => {
			const apiData = { source: 'api' };
			mockUseReceiptData.mockReturnValue({ data: apiData, isLoading: true });

			const { result } = renderHook(() => useTemplateRenderer(defaultOptions));

			expect(result.current.isSyncing).toBe(false);
		});

		it('is false when not loading and no data (offline)', () => {
			mockUseReceiptData.mockReturnValue({ data: null, isLoading: false });

			const { result } = renderHook(() => useTemplateRenderer(defaultOptions));

			expect(result.current.isSyncing).toBe(false);
		});
	});

	describe('isOffline', () => {
		it('is false when online', () => {
			mockUseOnlineStatus.mockReturnValue({ status: 'online-website-available' });

			const { result } = renderHook(() => useTemplateRenderer(defaultOptions));

			expect(result.current.isOffline).toBe(false);
		});

		it('is true when offline', () => {
			mockUseOnlineStatus.mockReturnValue({ status: 'offline' });

			const { result } = renderHook(() => useTemplateRenderer(defaultOptions));

			expect(result.current.isOffline).toBe(true);
		});
	});
});

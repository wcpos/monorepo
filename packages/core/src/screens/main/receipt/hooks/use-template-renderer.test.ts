/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import { renderOfflineTemplatePreview, useTemplateRenderer } from './use-template-renderer';

const mockUseReceiptData = jest.fn();
const mockUseActiveTemplates = jest.fn(() => []);
const createStore = (dp = 2) => ({
	name: 'Test Store',
	wc_price_decimals$: new BehaviorSubject(dp),
});
const mockUseAppState = jest.fn(() => ({ store: createStore() }));
const mockUseOnlineStatus = jest.fn(() => ({
	status: 'online-website-available',
}));
const mockBuildReceiptData = jest.fn(
	(
		order: Record<string, unknown>,
		store: Record<string, unknown>,
		dp?: number,
		_options?: Record<string, unknown>
	) => ({
		source: 'local',
		order,
		store,
		dp,
	})
);

jest.mock('@wcpos/query', () => ({
	useDocField: jest.requireActual('@wcpos/core-test/mock-use-doc-field').mockUseDocField,
}));

jest.mock('./use-receipt-data', () => ({
	useReceiptData: (...args: unknown[]) => mockUseReceiptData(...args),
}));

jest.mock('./use-active-templates', () => ({
	useActiveTemplates: () => mockUseActiveTemplates(),
}));

jest.mock('../../contexts/tax-rates', () => ({
	useTaxRates: () => {
		throw new Error('useTaxRates must be called within TaxRatesProvider');
	},
}));

jest.mock('../../contexts/tax-rates/provider', () => ({
	useTaxSettingsOptional: () => null,
}));

jest.mock('../../../../contexts/app-state', () => ({
	useAppState: () => mockUseAppState(),
}));

jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => mockUseOnlineStatus(),
}));

jest.mock('../utils/build-receipt-data', () => ({
	buildReceiptData: (
		order: Record<string, unknown>,
		store: Record<string, unknown>,
		dp?: number,
		options?: Record<string, unknown>
	) => mockBuildReceiptData(order, store, dp, options),
}));

jest.mock('@wcpos/printer', () => ({
	renderThermalPreview: jest.fn(() => '<div>thermal preview</div>'),
	mapReceiptData: jest.fn((data: Record<string, unknown>) => data),
	formatReceiptData: jest.fn((data: Record<string, unknown>) => data),
}));

jest.mock('../../hooks/use-order-status-label', () => ({
	useOrderStatusLabel: () => ({
		items: [],
		getLabel: (status: string) => status,
	}),
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
		mockUseAppState.mockReturnValue({ store: createStore() });
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
				store: expect.objectContaining({ name: 'Test Store' }),
				dp: 2,
			});
			expect(mockBuildReceiptData).toHaveBeenCalledWith(
				defaultOptions.order,
				{
					name: 'Test Store',
					wc_price_decimals$: expect.anything(),
				},
				2,
				expect.objectContaining({ getStatusLabel: expect.any(Function) })
			);
		});

		it('falls back to store wc_price_decimals when TaxRatesProvider is absent', () => {
			const store = createStore(3);
			mockUseAppState.mockReturnValue({ store });

			const { result } = renderHook(() => useTemplateRenderer(defaultOptions));

			expect(result.current.receiptData).toEqual({
				source: 'local',
				order: defaultOptions.order,
				store,
				dp: 3,
			});
			expect(mockBuildReceiptData).toHaveBeenCalledWith(
				defaultOptions.order,
				expect.objectContaining({ name: 'Test Store' }),
				3,
				expect.objectContaining({ getStatusLabel: expect.any(Function) })
			);
		});

		it('passes the store receipt label dictionary to the local builder', () => {
			const store = {
				...createStore(),
				receipt_i18n$: new BehaviorSubject({ order: 'Bestelling' }),
			};
			mockUseAppState.mockReturnValue({ store });

			renderHook(() => useTemplateRenderer(defaultOptions));

			expect(mockBuildReceiptData).toHaveBeenLastCalledWith(
				defaultOptions.order,
				expect.anything(),
				2,
				expect.objectContaining({ receiptI18n: { order: 'Bestelling' } })
			);
		});

		it('rebuilds the fallback render when the dictionary syncs in mid-screen', () => {
			// The store RxDocument identity is stable, so without the useDocField
			// subscription the memo would never recompute and a dictionary arriving
			// after mount would keep rendering English defaults (#1252).
			const receiptI18n$ = new BehaviorSubject<Record<string, string>>({});
			const store = { ...createStore(), receipt_i18n$: receiptI18n$ };
			mockUseAppState.mockReturnValue({ store });

			renderHook(() => useTemplateRenderer(defaultOptions));

			expect(mockBuildReceiptData).toHaveBeenLastCalledWith(
				defaultOptions.order,
				expect.anything(),
				2,
				expect.objectContaining({ receiptI18n: {} })
			);

			act(() => receiptI18n$.next({ order: 'Bestelling' }));

			expect(mockBuildReceiptData).toHaveBeenLastCalledWith(
				defaultOptions.order,
				expect.anything(),
				2,
				expect.objectContaining({ receiptI18n: { order: 'Bestelling' } })
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

		it('is false when loading completes without data', () => {
			mockUseReceiptData.mockReturnValue({ data: null, isLoading: false });

			const { result } = renderHook(() => useTemplateRenderer(defaultOptions));

			expect(result.current.isSyncing).toBe(false);
		});
	});

	describe('isOffline', () => {
		it('is false when online', () => {
			mockUseOnlineStatus.mockReturnValue({
				status: 'online-website-available',
			});

			const { result } = renderHook(() => useTemplateRenderer(defaultOptions));

			expect(result.current.isOffline).toBe(false);
		});

		it('is true when offline', () => {
			mockUseOnlineStatus.mockReturnValue({ status: 'offline' });

			const { result } = renderHook(() => useTemplateRenderer(defaultOptions));

			expect(result.current.isOffline).toBe(true);
		});

		it('is true when website is unavailable', () => {
			mockUseOnlineStatus.mockReturnValue({
				status: 'online-website-unavailable',
			});

			const { result } = renderHook(() => useTemplateRenderer(defaultOptions));

			expect(result.current.isOffline).toBe(true);
		});
	});

	describe('hasFinalData', () => {
		it.each([
			[
				'offline',
				{ status: 'offline', orderId: 42, data: null, error: null, hasResponded: false },
				true,
			],
			[
				'fetch error',
				{
					status: 'online-website-available',
					orderId: 42,
					data: null,
					error: new Error('fetch failed'),
					hasResponded: true,
				},
				true,
			],
			[
				'settled empty response',
				{
					status: 'online-website-available',
					orderId: 42,
					data: null,
					error: null,
					hasResponded: true,
				},
				true,
			],
			[
				'API data present',
				{
					status: 'online-website-available',
					orderId: 42,
					data: { source: 'api' },
					error: null,
					hasResponded: true,
				},
				true,
			],
			[
				'order ID undefined',
				{
					status: 'online-website-available',
					orderId: undefined,
					data: null,
					error: null,
					hasResponded: false,
				},
				true,
			],
		] as const)('is %s', (_case, { status, orderId, data, error, hasResponded }, expected) => {
			mockUseOnlineStatus.mockReturnValue({ status });
			mockUseReceiptData.mockReturnValue({ data, error, hasResponded, isLoading: false });

			const { result } = renderHook(() => useTemplateRenderer({ ...defaultOptions, orderId }));

			expect(result.current.hasFinalData).toBe(expected);
		});

		it('stops waiting for a pending fetch after the settle deadline', () => {
			jest.useFakeTimers();
			try {
				mockUseReceiptData.mockReturnValue({
					data: null,
					error: null,
					hasResponded: false,
					isLoading: true,
				});

				const { result } = renderHook(() => useTemplateRenderer(defaultOptions));

				expect(result.current.hasFinalData).toBe(false);
				expect(result.current.isSyncing).toBe(true);

				act(() => jest.advanceTimersByTime(8000));

				expect(result.current.hasFinalData).toBe(true);
				expect(result.current.isSyncing).toBe(false);
			} finally {
				jest.useRealTimers();
			}
		});
	});
});

describe('renderOfflineTemplatePreview', () => {
	it('renders logicless barcode elements through the canonical renderer', () => {
		const html = renderOfflineTemplatePreview({
			engine: 'logicless',
			content: '<div>Order <barcode type="code128" height="40">{{order.number}}</barcode></div>',
			receiptData: {
				order: { id: 1001, number: '1001', currency: 'USD' },
				store: { name: 'Demo Store' },
				lines: [],
				totals: {
					subtotal_incl: 0,
					subtotal_excl: 0,
					total_incl: 0,
					total_excl: 0,
					tax_total: 0,
					paid_total: 0,
					change_total: 0,
				},
				payments: [],
			},
		});

		expect(html).toContain('data-barcode-kind="barcode"');
		expect(html).toContain('data-barcode-value="1001"');
		expect(html).not.toContain('<barcode');
	});

	it('renders thermal barcode elements through the canonical renderer', () => {
		const html = renderOfflineTemplatePreview({
			engine: 'thermal',
			content: '<receipt><barcode type="code128">{{order.number}}</barcode></receipt>',
			receiptData: {
				order: { id: 1001, number: '1001', currency: 'USD' },
				store: { name: 'Demo Store' },
				lines: [],
				totals: {
					subtotal_incl: 0,
					subtotal_excl: 0,
					total_incl: 0,
					total_excl: 0,
					tax_total: 0,
					paid_total: 0,
					change_total: 0,
				},
				payments: [],
			},
		});

		expect(html).toContain("font-family: 'Courier New'");
		expect(html).toContain('data-barcode-value="1001"');
	});

	it.each([null, undefined])('defaults %s engines to the logicless preview path', (engine) => {
		const html = renderOfflineTemplatePreview({
			engine,
			content:
				'<div>Order {{order.number}}</div><barcode type="code128">{{order.number}}</barcode>',
			receiptData: {
				order: { id: 1001, number: '1001', currency: 'USD' },
				store: { name: 'Demo Store' },
				lines: [],
				totals: {
					subtotal_incl: 0,
					subtotal_excl: 0,
					total_incl: 0,
					total_excl: 0,
					tax_total: 0,
					paid_total: 0,
					change_total: 0,
				},
				payments: [],
			},
		});

		expect(html).toContain('Order 1001');
		expect(html).toContain('data-barcode-value="1001"');
		expect(html).not.toContain('<barcode');
	});

	it('passes formatted template data to logicless templates', () => {
		const html = renderOfflineTemplatePreview({
			engine: 'logicless',
			content: '<div>{{totals.total_incl_display}}</div>',
			receiptData: {
				order: { id: 1001, number: '1001', currency: 'USD' },
				store: { name: 'Demo Store' },
				lines: [],
				totals: {
					subtotal_incl: 12.5,
					subtotal_excl: 12.5,
					total_incl: 12.5,
					total_excl: 12.5,
					tax_total: 0,
					paid_total: 0,
					change_total: 0,
				},
				payments: [],
			},
		});

		expect(html).toContain('12.50');
	});

	it('throws for unsupported template engines', () => {
		expect(() =>
			renderOfflineTemplatePreview({
				engine: 'unsupported',
				content: '<div>{{order.number}}</div>',
				receiptData: {},
			})
		).toThrow('Unsupported template engine: unsupported');
	});
});

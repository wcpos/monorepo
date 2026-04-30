/**
 * @jest-environment jsdom
 */
import { act, renderHook, waitFor } from '@testing-library/react';

import { useCheckoutSession } from './use-checkout-session';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockReplace = jest.fn();
const mockHttp = { get: mockGet, post: mockPost };
const mockPullDocument = jest.fn();
const mockStockAdjustment = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));
jest.mock('../../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('../../../contexts/use-pull-document', () => ({
	usePullDocument: () => mockPullDocument,
}));
jest.mock('../../../contexts/ui-settings', () => ({
	useUISettings: () => ({ uiSettings: { autoShowReceipt: false } }),
}));
jest.mock('../../../hooks/use-rest-http-client', () => ({
	useRestHttpClient: () => mockHttp,
}));
jest.mock('../../../hooks/use-stock-adjustment', () => ({
	useStockAdjustment: () => ({ stockAdjustment: mockStockAdjustment }),
}));
jest.mock('@wcpos/utils/logger', () => ({
	getLogger: () => ({ success: jest.fn(), error: jest.fn() }),
}));
jest.mock('@wcpos/utils/logger/error-codes', () => ({
	ERROR_CODES: { PAYMENT_GATEWAY_ERROR: 'PAYMENT_GATEWAY_ERROR' },
}));

const order = {
	id: 42,
	number: '42',
	uuid: 'uuid-42',
	collection: {},
	payment_method: 'stripe_terminal_for_woocommerce',
	getLatest: () => ({ line_items: [] }),
} as never;

describe('useCheckoutSession', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		jest.useRealTimers();
	});

	it('uses contract mode whenever supports_checkout is true, even for non-wcpos providers', async () => {
		mockGet.mockResolvedValueOnce({
			data: [
				{
					id: 'stripe_terminal_for_woocommerce',
					provider: 'stripe',
					pos_type: 'terminal',
					capabilities: { supports_checkout: true },
				},
			],
		});

		const { result } = renderHook(() => useCheckoutSession(order));

		await waitFor(() => expect(result.current.gatewayResolved).toBe(true));
		expect(result.current.mode).toBe('contract');
	});

	it.each([
		['pos_cash', 'manual'],
		['pos_card', 'terminal'],
	])(
		'uses legacy webview mode for legacy POS gateway %s even when it advertises supports_checkout',
		async (gatewayId, posType) => {
			mockGet.mockResolvedValueOnce({
				data: [
					{
						id: gatewayId,
						provider: 'wcpos',
						pos_type: posType,
						capabilities: { supports_checkout: true },
					},
				],
			});

			const legacyOrder = {
				...(order as Record<string, unknown>),
				payment_method: gatewayId,
			} as never;
			const { result } = renderHook(() => useCheckoutSession(legacyOrder));

			await waitFor(() => expect(result.current.gatewayResolved).toBe(true));
			expect(result.current.mode).toBe('webview');
		}
	);

	it('falls back to webview mode if the gateway fetch fails', async () => {
		mockGet.mockRejectedValueOnce(new Error('boom'));

		const { result } = renderHook(() => useCheckoutSession(order));

		await waitFor(() => expect(result.current.gatewayResolved).toBe(true));
		expect(result.current.mode).toBe('webview');
		expect(result.current.error).toBe('payment_gateways_fetch_failed');
	});

	it('polls contract checkout to completed and refreshes the order', async () => {
		jest.useFakeTimers();
		mockGet
			.mockResolvedValueOnce({
				data: [
					{
						id: 'stripe_terminal_for_woocommerce',
						provider: 'stripe',
						pos_type: 'terminal',
						capabilities: { supports_checkout: true },
					},
				],
			})
			.mockResolvedValueOnce({
				data: {
					status: 'completed',
					checkout_id: 'chk_123',
					order_id: 42,
					gateway_id: 'stripe_terminal_for_woocommerce',
					terminal: true,
					provider_data: {},
				},
			});
		mockPost.mockResolvedValueOnce({ data: { status: 'ready' } }).mockResolvedValueOnce({
			data: {
				status: 'processing',
				checkout_id: 'chk_123',
				order_id: 42,
				gateway_id: 'stripe_terminal_for_woocommerce',
				terminal: false,
				provider_data: {},
			},
		});

		const { result } = renderHook(() => useCheckoutSession(order));
		await waitFor(() => expect(result.current.gatewayResolved).toBe(true));

		await act(async () => {
			const promise = result.current.startCheckout();
			await jest.advanceTimersByTimeAsync(750);
			await promise;
		});

		expect(mockPost).toHaveBeenNthCalledWith(
			1,
			expect.stringContaining('payment-gateways/stripe_terminal_for_woocommerce/bootstrap'),
			expect.anything()
		);
		expect(mockPullDocument).toHaveBeenCalled();
		expect(mockReplace).toHaveBeenCalled();
		jest.useRealTimers();
	});

	it('surfaces checkout_poll_timeout when polling never reaches a terminal status', async () => {
		jest.useFakeTimers();
		mockGet
			.mockResolvedValueOnce({
				data: [
					{
						id: 'stripe_terminal_for_woocommerce',
						provider: 'stripe',
						pos_type: 'terminal',
						capabilities: { supports_checkout: true },
					},
				],
			})
			.mockResolvedValue({
				data: {
					status: 'processing',
					checkout_id: 'chk_123',
					order_id: 42,
					gateway_id: 'stripe_terminal_for_woocommerce',
					terminal: false,
					provider_data: {},
				},
			});
		mockPost.mockResolvedValueOnce({ data: { status: 'ready' } }).mockResolvedValueOnce({
			data: {
				status: 'processing',
				checkout_id: 'chk_123',
				order_id: 42,
				gateway_id: 'stripe_terminal_for_woocommerce',
				terminal: false,
				provider_data: {},
			},
		});

		const { result } = renderHook(() => useCheckoutSession(order));
		await waitFor(() => expect(result.current.gatewayResolved).toBe(true));

		await act(async () => {
			const promise = result.current.startCheckout();
			await jest.advanceTimersByTimeAsync(41 * 750);
			await promise;
		});

		expect(result.current.error).toBe('checkout_poll_timeout');
		jest.useRealTimers();
	});
});

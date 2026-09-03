/**
 * @jest-environment jsdom
 */
import { act, renderHook, waitFor } from '@testing-library/react';

import {
	clearStorageDegradation,
	wrappedErrorHandlerStorage,
} from '@wcpos/database/plugins/wrapped-error-handler-storage';

import { useCheckoutSession } from './use-checkout-session';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockReplace = jest.fn();
const mockHttp = { get: mockGet, post: mockPost };
const mockStockAdjustment = jest.fn();
const mockSetCurrentOrderID = jest.fn();
const mockEngineRequire = jest.fn();
const mockResolveStockOwnerId = jest.fn((productId: number, variationId: number) =>
	Promise.resolve(variationId || productId)
);

jest.mock('expo-router', () => ({
	useRouter: () => ({ replace: mockReplace }),
}));
jest.mock('../../../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));
jest.mock('@wcpos/query', () => ({
	useQueryRuntime: () => ({ engine: { require: mockEngineRequire } }),
	useRecordField: (record: unknown, select: (value: unknown) => unknown) => select(record),
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
jest.mock('../../contexts/current-order/context', () => ({
	useCurrentOrderActions: () => ({ setCurrentOrderID: mockSetCurrentOrderID }),
}));
jest.mock('../../hooks/use-cart-stock-guard', () => ({
	useCartStockGuard: () => ({ resolveStockOwnerId: mockResolveStockOwnerId }),
}));
jest.mock('@wcpos/utils/logger', () => ({
	getLogger: () => ({ success: jest.fn(), error: jest.fn() }),
}));

const makeOrder = (paymentMethod = 'stripe_terminal_for_woocommerce') => {
	const record = {
		uuid: 'uuid-42',
		payload: {
			id: 42,
			number: '42',
			payment_method: paymentMethod,
			line_items: [],
		},
		getLatest: () => record,
	};
	return record;
};
const order = makeOrder() as never;

describe('useCheckoutSession', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		jest.useRealTimers();
		mockEngineRequire.mockReturnValue({
			ready: Promise.resolve(),
			release: jest.fn(),
		});
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
		['wcpos_cash', 'manual'],
		['wcpos_card', 'terminal'],
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

			const legacyOrder = makeOrder(gatewayId) as never;
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
		expect(mockEngineRequire).toHaveBeenCalledWith({
			id: 'checkout:order-refresh:42',
			collection: 'orders',
			kind: 'targeted-records',
			remoteIds: ['42'],
			forceRefresh: true,
		});
		expect(mockEngineRequire.mock.results[0]?.value.release).toHaveBeenCalledTimes(1);
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

	it('handles a stock rejection even when its best-effort refresh fails', async () => {
		const release = jest.fn();
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
		mockPost.mockResolvedValueOnce({ data: { status: 'ready' } }).mockRejectedValueOnce({
			response: {
				data: {
					code: 'wcpos_insufficient_stock',
					data: {
						items: [{ product_id: 10, variation_id: 0, available: 0 }],
					},
				},
			},
		});
		mockEngineRequire.mockImplementation(() => ({
			ready: Promise.reject(new Error('refresh failed')),
			release,
		}));

		const { result } = renderHook(() => useCheckoutSession(order));
		await waitFor(() => expect(result.current.gatewayResolved).toBe(true));
		await act(async () => {
			await result.current.startCheckout();
			await Promise.resolve();
		});

		expect(result.current.error).toBe('insufficient_stock');
		expect(release).toHaveBeenCalledTimes(1);
		await waitFor(() => expect(mockResolveStockOwnerId).toHaveBeenCalledWith(10, 0));
	});

	/**
	 * #163 ruling R5, the narrowest window that matters: Process Payment was
	 * pressed while storage was healthy and the worker died during the gateway
	 * bootstrap round-trip. The payment-start POST is the last point at which no
	 * money has moved, so the guard must be re-read there.
	 */
	describe('degraded storage', () => {
		afterEach(() => {
			// Still mounted here (RTL's cleanup runs after this hook), so the latch
			// reset re-renders subscribed components.
			act(() => clearStorageDegradation());
		});

		async function killStorageWorker(databaseName: string) {
			const instance = {
				schema: {
					version: 0,
					type: 'object',
					properties: {},
					primaryKey: 'id',
				},
				findDocumentsById: jest.fn(),
				bulkWrite: jest
					.fn()
					.mockRejectedValue(
						new Error(
							'could not requestRemote: {"methodName":"bulkWrite","error":{"message":"worker gone"}}'
						)
					),
				query: jest.fn(),
				count: jest.fn(),
				getAttachmentData: jest.fn(),
				getChangedDocumentsSince: jest.fn(),
				changeStream: jest.fn(),
				cleanup: jest.fn(),
				close: jest.fn().mockResolvedValue(undefined),
				remove: jest.fn(),
				collectionName: 'orders',
				databaseName,
				internals: {},
				options: {},
			};
			const wrapped = await wrappedErrorHandlerStorage({
				storage: {
					name: 'mock-storage',
					rxdbVersion: '17.4.0',
					createStorageInstance: jest.fn().mockResolvedValue(instance),
				} as never,
			}).createStorageInstance({ databaseName } as never);
			await expect(
				wrapped.bulkWrite([{ document: { id: '1' } }] as never, 'test')
			).rejects.toThrow();
		}

		const contractGateway = {
			data: [
				{
					id: 'stripe_terminal_for_woocommerce',
					provider: 'stripe',
					pos_type: 'terminal',
					capabilities: { supports_checkout: true },
				},
			],
		};

		it('never posts the payment start when the worker dies during bootstrap', async () => {
			mockGet.mockResolvedValueOnce(contractGateway);
			// The bootstrap POST resolves, but the worker dies while it is in flight.
			mockPost.mockImplementationOnce(async () => {
				await killStorageWorker('degraded-during-bootstrap');
				return { data: {} };
			});

			const { result } = renderHook(() => useCheckoutSession(order));
			await waitFor(() => expect(result.current.gatewayResolved).toBe(true));
			await act(async () => {
				await result.current.startCheckout();
			});

			// Only the bootstrap call happened — no `orders/42/checkout` start.
			expect(mockPost).toHaveBeenCalledTimes(1);
			expect(mockPost.mock.calls[0][0]).toBe(
				'payment-gateways/stripe_terminal_for_woocommerce/bootstrap'
			);
			expect(result.current.loading).toBe(false);
		});

		it('refuses to start a checkout that begins while already degraded', async () => {
			mockGet.mockResolvedValueOnce(contractGateway);

			const { result } = renderHook(() => useCheckoutSession(order));
			await waitFor(() => expect(result.current.gatewayResolved).toBe(true));
			await killStorageWorker('degraded-before-start');

			await act(async () => {
				await result.current.startCheckout();
			});

			expect(mockPost).not.toHaveBeenCalled();
		});
	});
});

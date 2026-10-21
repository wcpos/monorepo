/**
 * @jest-environment jsdom
 */
import { act, renderHook, waitFor } from '@testing-library/react';

import {
	clearStorageDegradation,
	wrappedErrorHandlerStorage,
} from '@wcpos/database/plugins/wrapped-error-handler-storage';

import { classifyCheckoutFailure, useCheckoutSession } from './use-checkout-session';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockReplace = jest.fn();
const mockHttp = { get: mockGet, post: mockPost };
const mockStockAdjustment = jest.fn();
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
const mockSetCurrentOrderID = jest.fn();
jest.mock('../../contexts/current-order', () => ({
	useCurrentOrderActions: () => ({ setCurrentOrderID: mockSetCurrentOrderID }),
}));
jest.mock('../../hooks/use-cart-stock-guard', () => ({
	useCartStockGuard: () => ({ resolveStockOwnerId: mockResolveStockOwnerId }),
}));
const mockCheckoutError = jest.fn();
const mockCheckoutWarn = jest.fn();
jest.mock('@wcpos/utils/logger', () => ({
	getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
	getLogger: () => ({
		debug: jest.fn(),
		info: jest.fn(),
		success: jest.fn(),
		error: (...args: unknown[]) => mockCheckoutError(...args),
		warn: (...args: unknown[]) => mockCheckoutWarn(...args),
	}),
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

	it('keeps the gateway unresolved through an auth-cancelled catalog load, then resolves it after auth', async () => {
		const { requestStateManager } = jest.requireActual('@wcpos/hooks/use-http-client') as {
			requestStateManager: { setAuthFailed(failed: boolean): void };
		};
		requestStateManager.setAuthFailed(true);
		mockGet
			.mockRejectedValueOnce(
				Object.assign(new Error('canceled'), { name: 'CanceledError', code: 'ERR_CANCELED' })
			)
			.mockResolvedValueOnce({
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
		await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1));
		await act(async () => {
			await Promise.resolve();
		});
		// Not resolved, so no fall-back to the legacy webview for a contract gateway.
		expect(result.current.gatewayResolved).toBe(false);
		expect(result.current.mode).toBe('pending');

		act(() => requestStateManager.setAuthFailed(false));

		await waitFor(() => expect(result.current.gatewayResolved).toBe(true));
		expect(result.current.mode).toBe('contract');
	});

	it('maps every catalog entry to its stored settled status, keyed by gateway id', async () => {
		// The pay page can settle the order through any POS gateway, so the webview
		// needs the whole catalog: id -> stored status, null where nothing is stored
		// or the store predates the field.
		mockGet.mockResolvedValueOnce({
			data: [
				{ id: 'pos_cash', title: 'Cash', settled_order_status: 'completed' },
				{ id: 'bacs', title: 'Bank transfer', settled_order_status: 'pending' },
				{ id: 'pos_card', title: 'Card', settled_order_status: null },
				{ id: 'cheque', title: 'Cheque' },
			],
		});

		const { result } = renderHook(() => useCheckoutSession(order));

		await waitFor(() => expect(result.current.gatewayResolved).toBe(true));
		expect(result.current.settledOrderStatuses).toEqual({
			pos_cash: 'completed',
			bacs: 'pending',
			pos_card: null,
			cheque: null,
		});
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

	it('routes a completed contract checkout without waiting on a refresh that never settles, then releases it at the bound', async () => {
		// #1685's failure class on the contract path: a require whose `ready` never
		// settles (queued plane, dirty-row protection) must not keep the cashier off
		// the receipt. Route first; the refresh is catch-up, bounded at 10 s.
		jest.useFakeTimers();
		const release = jest.fn();
		mockEngineRequire.mockReturnValue({ ready: new Promise<void>(() => {}), release });
		const reducedItem = { id: 7, meta_data: [{ key: '_reduced_stock', value: '1' }] };
		const paidOrder = makeOrder();
		paidOrder.payload.line_items = [reducedItem, { id: 8, meta_data: [] }] as never;
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
		mockPost
			.mockResolvedValueOnce({ data: { status: 'ready' } })
			.mockResolvedValueOnce({ data: { status: 'completed', terminal: true } });

		const { result } = renderHook(() => useCheckoutSession(paidOrder as never));
		await waitFor(() => expect(result.current.gatewayResolved).toBe(true));

		let settled = false;
		await act(async () => {
			void result.current.startCheckout().then(() => {
				settled = true;
			});
			await jest.advanceTimersByTimeAsync(0);
		});

		expect(mockReplace).toHaveBeenCalledWith({ pathname: '/cart' });
		// The paid order is still pos-open locally until the refresh lands, so the cart
		// must drop it BEFORE routing or new items would be added to the paid sale.
		expect(mockSetCurrentOrderID).toHaveBeenCalledWith('');
		expect(mockSetCurrentOrderID.mock.invocationCallOrder[0]).toBeLessThan(
			mockReplace.mock.invocationCallOrder[0]
		);
		expect(release).not.toHaveBeenCalled();
		expect(mockStockAdjustment).not.toHaveBeenCalled();

		await act(async () => {
			await jest.advanceTimersByTimeAsync(10_000);
		});

		expect(release).toHaveBeenCalledTimes(1);
		// Stock adjustment runs after the (bounded) refresh, from the latest order.
		expect(mockStockAdjustment).toHaveBeenCalledWith([reducedItem]);
		expect(settled).toBe(true);
		expect(mockCheckoutWarn).not.toHaveBeenCalled();
		jest.useRealTimers();
	});

	it('reports a refresh that rejects after a paid sale as PAYMENT101 at warn, already routed', async () => {
		const release = jest.fn();
		mockEngineRequire.mockReturnValue({
			ready: Promise.reject(new Error('refresh failed')),
			release,
		});
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
		mockPost
			.mockResolvedValueOnce({ data: { status: 'ready' } })
			.mockResolvedValueOnce({ data: { status: 'completed', terminal: true } });

		const { result } = renderHook(() => useCheckoutSession(order));
		await waitFor(() => expect(result.current.gatewayResolved).toBe(true));
		await act(async () => {
			await result.current.startCheckout();
		});

		expect(mockReplace).toHaveBeenCalledWith({ pathname: '/cart' });
		expect(release).toHaveBeenCalledTimes(1);
		expect(mockStockAdjustment).not.toHaveBeenCalled();
		expect(mockCheckoutWarn).toHaveBeenCalledWith(
			'Contract checkout failed: refresh failed',
			expect.objectContaining({
				code: 'PAYMENT101',
				context: expect.objectContaining({ phase: 'completed' }),
			})
		);
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
		// The start was sent and never settled: genuinely outcome-unknown.
		expect(mockCheckoutError).toHaveBeenCalledWith(
			'Contract checkout failed: checkout_poll_timeout',
			expect.objectContaining({
				code: 'CHECKOUT201',
				context: expect.objectContaining({ phase: 'poll' }),
			})
		);
		jest.useRealTimers();
	});

	it('shows the gateway’s own sentence for a definitive failed status, at warn, cart safe', async () => {
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
		mockPost.mockResolvedValueOnce({ data: { status: 'ready' } }).mockResolvedValueOnce({
			data: {
				status: 'failed',
				terminal: true,
				provider_data: { message: 'Your card was declined.' },
			},
		});

		const { result } = renderHook(() => useCheckoutSession(order));
		await waitFor(() => expect(result.current.gatewayResolved).toBe(true));
		await act(async () => {
			await result.current.startCheckout();
		});

		expect(mockCheckoutError).not.toHaveBeenCalled();
		expect(mockCheckoutWarn).toHaveBeenCalledWith(
			'Contract checkout failed: failed',
			expect.objectContaining({
				showToast: true,
				code: 'CHECKOUT101',
				toast: { title: 'Your card was declined.' },
			})
		);
	});

	it('tells the cashier the cart is safe when the gateway bootstrap fails', async () => {
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
		mockPost.mockRejectedValueOnce(
			Object.assign(new Error('Request failed with status code 500'), {
				response: { status: 500 },
			})
		);

		const { result } = renderHook(() => useCheckoutSession(order));
		await waitFor(() => expect(result.current.gatewayResolved).toBe(true));
		await act(async () => {
			await result.current.startCheckout();
		});

		// Nothing was sent to the gateway yet, so not "could not confirm… don't charge again".
		expect(mockPost).toHaveBeenCalledTimes(1);
		expect(mockCheckoutError).toHaveBeenCalledWith(
			'Contract checkout failed: Request failed with status code 500',
			expect.objectContaining({
				code: 'CHECKOUT101',
				context: expect.objectContaining({ phase: 'bootstrap', status: 500 }),
			})
		);
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

describe('classifyCheckoutFailure', () => {
	const t = (key: string) => key;
	const offline = Object.assign(new Error('offline'), { blockCode: 'preflight-offline' });
	const asleep = Object.assign(new Error('asleep'), { isSleeping: true });

	it('says nothing was charged — and not "offline" — when the app was only backgrounded', () => {
		expect(classifyCheckoutFailure(asleep, 'start', t)).toEqual({
			level: 'info',
			title: 'pos_checkout.background_nothing_charged',
			text2: 'common.try_again_now',
		});
	});

	it('says nothing was charged when offline before the start was sent', () => {
		for (const phase of ['bootstrap', 'start'] as const) {
			expect(classifyCheckoutFailure(offline, phase, t)).toEqual({
				level: 'warn',
				code: 'SYNC121',
				title: 'pos_checkout.offline_nothing_charged',
				text2: 'common.reconnect_then_retry',
			});
		}
	});

	it('never says "nothing was charged" once the start went out', () => {
		expect(classifyCheckoutFailure(offline, 'poll', t)).toEqual({
			level: 'error',
			code: 'CHECKOUT201',
		});
	});

	it('treats a store refusal of the start as cart-safe, with the store’s sentence', () => {
		const refused = Object.assign(new Error('400'), {
			response: { status: 400 },
			wpMessage: 'Payment gateway is not available for POS checkout.',
		});
		expect(classifyCheckoutFailure(refused, 'start', t)).toEqual({
			level: 'error',
			code: 'CHECKOUT101',
			title: 'Payment gateway is not available for POS checkout.',
		});
	});

	it('says nothing was charged when sign-in cancelled a refused start (never CHECKOUT201)', () => {
		const cancelled = Object.assign(new Error('canceled'), {
			name: 'CanceledError',
			code: 'ERR_CANCELED',
		});
		expect(classifyCheckoutFailure(cancelled, 'start', t)).toEqual({
			level: 'warn',
			code: 'AUTH101',
			title: 'pos_checkout.sign_in_nothing_charged',
		});
	});

	it('keeps a refused start’s mapped WordPress code at its own severity', () => {
		const forbidden = Object.assign(new Error('403'), {
			response: { status: 403 },
			wpCode: 'AUTH201',
			wpMessage: 'Sorry, you are not allowed to create orders.',
		});
		expect(classifyCheckoutFailure(forbidden, 'start', t)).toEqual({
			level: 'error',
			code: 'AUTH201',
			title: 'Sorry, you are not allowed to create orders.',
		});
		const noRoute = Object.assign(new Error('404'), {
			response: { status: 404 },
			wpCode: 'AUTH311',
		});
		expect(classifyCheckoutFailure(noRoute, 'start', t).code).toBe('AUTH311');
	});

	it('keeps a lost reply or a server error on the start as outcome-unknown', () => {
		const lost = new Error('Network Error');
		const crashed = Object.assign(new Error('500'), { response: { status: 500 } });
		const inFlight = Object.assign(new Error('409'), { response: { status: 409 } });
		const timedOut = Object.assign(new Error('408'), { response: { status: 408 } });
		const throttled = Object.assign(new Error('429'), { response: { status: 429 } });
		for (const error of [lost, crashed, inFlight, timedOut, throttled]) {
			expect(classifyCheckoutFailure(error, 'start', t).code).toBe('CHECKOUT201');
		}
	});

	it('reports a paid sale whose follow-up threw as PAYMENT101 at warn', () => {
		expect(classifyCheckoutFailure(new Error('route'), 'completed', t)).toEqual({
			level: 'warn',
			code: 'PAYMENT101',
		});
	});

	it('falls back to translated copy when a failed status carries no message', () => {
		expect(classifyCheckoutFailure(new Error('failed'), 'settled', t)).toEqual({
			level: 'warn',
			code: 'CHECKOUT101',
			title: 'pos_checkout.payment_not_completed',
		});
	});
});

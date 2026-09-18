/**
 * @jest-environment jsdom
 */
import { act, renderHook, waitFor } from '@testing-library/react';

import {
	clearStorageDegradation,
	wrappedErrorHandlerStorage,
} from '@wcpos/database/plugins/wrapped-error-handler-storage';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { persistSaleProvenance } from '../sale-completion';
import { recordCompletionAttempt } from '../completion-journal';
import { useCheckoutSession } from './use-checkout-session';

const mockCheckoutError = jest.fn();
const mockCheckoutInfo = jest.fn();
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

jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status: 'online-website-available' }),
}));
jest.mock('../../../../../contexts/theme', () => ({ useTheme: () => ({ screenSize: 'sm' }) }));
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
	getLogger: () => ({
		debug: jest.fn(),
		info: (...args: unknown[]) => mockCheckoutInfo(...args),
		success: jest.fn(),
		warn: jest.fn(),
		error: (...args: unknown[]) => mockCheckoutError(...args),
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

	it.each(['succeeded', 'rejected', 'synchronously thrown'] as const)(
		'polls contract checkout to completed with refresh %s',
		async (refresh) => {
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

			const release = jest.fn();
			const refreshError = new Error('refresh failed');
			mockEngineRequire.mockImplementationOnce(() => {
				if (refresh === 'synchronously thrown') throw refreshError;
				return {
					ready: refresh === 'rejected' ? Promise.reject(refreshError) : Promise.resolve(),
					release,
				};
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
			if (refresh === 'synchronously thrown') {
				expect(release).not.toHaveBeenCalled();
				expect(mockReplace).not.toHaveBeenCalled();
				expect(result.current.error).toBe('refresh failed');
				expect(mockCheckoutError).toHaveBeenCalledWith(
					'refresh failed',
					expect.objectContaining({ code: ERROR_CODES.CHECKOUT_OUTCOME_UNKNOWN, showToast: true })
				);
			} else {
				expect(release).toHaveBeenCalledTimes(1);
				expect(mockReplace).toHaveBeenCalled();
				expect(mockCheckoutError).not.toHaveBeenCalled();
				expect(result.current.error).toBeNull();
			}
			expect(result.current.loading).toBe(false);
			jest.useRealTimers();
		}
	);

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

const mockProvenancePatch = jest.fn(
	async (_input: {
		document: unknown;
		data: { meta_data: { key: string; value: unknown }[] };
	}) => ({ document: order })
);
const mockProvenancePush = jest.fn(async (_order: unknown): Promise<void> => undefined);
jest.mock('../../../hooks/mutations/use-local-mutation', () => ({
	useLocalMutation: () => ({ localPatch: mockProvenancePatch }),
}));
jest.mock('../../../contexts/use-push-document', () => ({
	usePushDocument: () => mockProvenancePush,
}));
let mockBindingStatus: 'bound' | 'choose' | 'none' | 'unknown' = 'bound';
jest.mock('../../../../../services/register/use-register-binding', () => ({
	useRegisterBinding: () => ({
		status: mockBindingStatus,
		registerId: null,
		registerName: null,
		registers: [],
		bind: jest.fn(),
	}),
}));
jest.mock('../../../../../contexts/app-state', () => ({
	useStoreSession: () => ({
		userDB: {},
		site: { uuid: 'site' },
		store: { id: 1 },
		wpCredentials: { id: 7, username: 'pat' },
	}),
}));

describe('contract provenance preparation', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockGet.mockReset().mockResolvedValue({
			data: [{ id: 'stripe_terminal_for_woocommerce', capabilities: { supports_checkout: true } }],
		});
		mockPost.mockReset().mockResolvedValue({ data: { status: 'awaiting_customer' } });
	});
	it('awaits the local patch and push before posting checkout', async () => {
		let release!: () => void;
		mockProvenancePush.mockImplementationOnce(
			() =>
				new Promise<void>((resolve) => {
					release = resolve;
				})
		);
		const { result } = renderHook(() => useCheckoutSession(order));
		await waitFor(() => expect(result.current.gatewayResolved).toBe(true));
		let pending!: Promise<void>;
		act(() => {
			pending = result.current.startCheckout();
		});
		await waitFor(() => expect(mockProvenancePush).toHaveBeenCalledWith(order));
		expect(mockProvenancePatch).toHaveBeenCalledWith({
			document: order,
			data: { meta_data: [{ key: '_wcpos_sale_counter', value: '1' }] },
		});
		expect(mockPost).not.toHaveBeenCalled();
		await act(async () => {
			release();
			await pending;
		});
		expect(mockPost).toHaveBeenCalledWith(
			'orders/42/checkout',
			expect.anything(),
			expect.anything()
		);
		expect(jest.mocked(recordCompletionAttempt).mock.invocationCallOrder[0]).toBeLessThan(
			mockProvenancePatch.mock.invocationCallOrder[0]
		);
	});
	it('reports a journal failure without rejecting or posting checkout', async () => {
		jest.mocked(recordCompletionAttempt).mockRejectedValueOnce(new Error('journal unavailable'));
		const { result } = renderHook(() => useCheckoutSession(order));
		await waitFor(() => expect(result.current.gatewayResolved).toBe(true));
		await act(async () => {
			await expect(result.current.startCheckout()).resolves.toBeUndefined();
		});
		expect(result.current.error).toBe('pos_cart.checkout_failed');
		expect(result.current.loading).toBe(false);
		expect(mockCheckoutError).toHaveBeenCalledWith('pos_cart.checkout_failed', {
			code: ERROR_CODES.CHECKOUT_FAILED_CART_SAFE,
			showToast: true,
		});
		expect(mockProvenancePatch).not.toHaveBeenCalled();
		expect(mockProvenancePush).not.toHaveBeenCalled();
		expect(mockPost).not.toHaveBeenCalled();
	});
	it.each(['patch', 'push'])('posts nothing if the provenance %s fails', async (failure) => {
		if (failure === 'patch') mockProvenancePatch.mockResolvedValueOnce(undefined as never);
		else mockProvenancePush.mockRejectedValueOnce(new Error('push failed'));
		const { result } = renderHook(() => useCheckoutSession(order));
		await waitFor(() => expect(result.current.gatewayResolved).toBe(true));
		await act(() => result.current.startCheckout());
		expect(mockPost).not.toHaveBeenCalled();
		expect(result.current.error).toBe('pos_cart.checkout_failed');
	});
});

describe('useCheckoutSession register gate', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockEngineRequire.mockReturnValue({ ready: Promise.resolve(), release: jest.fn() });
	});
	afterEach(() => {
		mockBindingStatus = 'bound';
	});
	it('refuses to start a gateway sale while a register is still to be chosen', async () => {
		mockBindingStatus = 'choose';
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
		await act(async () => result.current.startCheckout());
		// No provenance write, no checkout post: the sale never started.
		expect(mockProvenancePatch).not.toHaveBeenCalled();
		expect(mockProvenancePush).not.toHaveBeenCalled();
		expect(mockPost).not.toHaveBeenCalled();
		expect(result.current.loading).toBe(false);
	});
});

jest.mock('../sale-completion', () => {
	const actual = jest.requireActual<typeof import('../sale-completion')>('../sale-completion');
	const { withMetaReplaced } =
		jest.requireActual<typeof import('@wcpos/order-math')>('@wcpos/order-math');
	const completionMetaFor = jest.fn<
		ReturnType<typeof actual.completionMetaFor>,
		Parameters<typeof actual.completionMetaFor>
	>();
	completionMetaFor.mockImplementation(async (_ctx, meta, facts) =>
		withMetaReplaced(meta, [{ key: '_wcpos_sale_counter', value: '1' }, ...(facts.extraMeta ?? [])])
	);
	return {
		...actual,
		completionMetaFor,
		persistSaleProvenance: jest.fn(
			async (
				ctx: import('../sale-completion').SaleContext,
				input: Parameters<typeof actual.persistSaleProvenance>[1]
			) => {
				const meta_data = input.online
					? await completionMetaFor(ctx, input.order.getLatest().payload.meta_data, input)
					: withMetaReplaced(input.order.getLatest().payload.meta_data, input.extraMeta ?? []);
				if (!input.online && !input.extraMeta) return;
				if (!(await ctx.localPatch({ document: input.order, data: { meta_data } })))
					throw new Error('provenance_save_failed');
				if (input.online) await ctx.pushDocument(input.order);
			}
		),
		prepareSale: jest.fn(actual.prepareSale),
	};
});

jest.mock('../hooks/use-sale-context', () => ({
	useSaleContext: () => ({
		userDB: { getLocal: async () => null },
		sessionsOn: mockSessionsOn,
		sessions: mockSessions,
		siteUuid: 'site',
		storeId: 1,
		runtime: { engine: { require: mockEngineRequire } },
		dp: 2,
		localPatch: mockProvenancePatch,
		pushDocument: mockProvenancePush,
		stockAdjustment: mockStockAdjustment,
	}),
}));

// Journal storage is exercised against RxDB in the owner/journal suites.
jest.mock('../completion-journal', () => ({
	recordCompletionAttempt: jest.fn(async () => {}),
	resolveCompletionAttempt: jest.fn(async () => {}),
	failCompletionAttempt: jest.fn(async () => {}),
}));

let mockSessionsOn = false;
const mockSessions = { findOne: jest.fn() };
describe('contract session gate', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockSessionsOn = true;
		mockSessions.findOne.mockReturnValue({ exec: async () => null });
		mockGet.mockReset().mockResolvedValue({
			data: [{ id: 'stripe_terminal_for_woocommerce', capabilities: { supports_checkout: true } }],
		});
		mockPost.mockReset().mockResolvedValue({ data: { status: 'awaiting_customer' } });
		jest
			.mocked(persistSaleProvenance)
			.mockImplementationOnce(jest.requireActual('../sale-completion').persistSaleProvenance);
	});
	afterEach(() => {
		mockSessionsOn = false;
		// A refused preparation leaves the one-shot provenance implementation unused.
		jest.mocked(persistSaleProvenance).mockReset();
	});
	it('no open session: toasts without POST, provenance, generic error or stuck loading', async () => {
		const { result } = renderHook(() => useCheckoutSession(order));
		await waitFor(() => expect(result.current.gatewayResolved).toBe(true));
		await act(async () => {
			await expect(result.current.startCheckout()).resolves.toBeUndefined();
		});
		expect(mockCheckoutInfo).toHaveBeenCalledWith(
			'pos_checkout.open_register_first',
			expect.objectContaining({ showToast: true })
		);
		expect(mockPost).not.toHaveBeenCalled();
		expect(mockProvenancePatch).not.toHaveBeenCalled();
		expect(mockProvenancePush).not.toHaveBeenCalled();
		expect(recordCompletionAttempt).not.toHaveBeenCalled();
		expect(result.current.error).toBeNull();
		expect(result.current.loading).toBe(false);
		expect(mockCheckoutError).not.toHaveBeenCalled();
	});
	it('session closes during bootstrap: refuses the payment POST with a toast and no second journal write', async () => {
		mockSessions.findOne.mockReturnValue({
			exec: async () => ({ id: 'session-A', incrementalPatch: async () => undefined }),
		});
		mockPost.mockImplementationOnce(async () => {
			mockSessions.findOne.mockReturnValue({ exec: async () => null });
			return { data: { status: 'ready' } };
		});
		const { result } = renderHook(() => useCheckoutSession(order));
		await waitFor(() => expect(result.current.gatewayResolved).toBe(true));
		await act(async () => result.current.startCheckout());
		expect(mockPost.mock.calls.map(([url]) => url)).toEqual([
			'payment-gateways/stripe_terminal_for_woocommerce/bootstrap',
		]);
		expect(mockCheckoutInfo).toHaveBeenCalledTimes(1);
		expect(mockCheckoutInfo).toHaveBeenCalledWith(
			'pos_checkout.open_register_first',
			expect.objectContaining({ showToast: true })
		);
		expect(recordCompletionAttempt).toHaveBeenCalledTimes(1);
		expect(result.current.error).toBeNull();
		expect(result.current.loading).toBe(false);
		expect(mockCheckoutError).not.toHaveBeenCalled();
	});
	it.each(['session-B', 'session-A'])(
		'bootstrap recheck returns %s: only the stamped session may POST',
		async (sessionId) => {
			mockSessions.findOne.mockReturnValue({
				exec: async () => ({ id: 'session-A', incrementalPatch: async () => undefined }),
			});
			mockPost.mockImplementationOnce(async () => {
				mockSessions.findOne.mockReturnValue({
					exec: async () => ({ id: sessionId, incrementalPatch: async () => undefined }),
				});
				return { data: { status: 'ready' } };
			});
			const { result } = renderHook(() => useCheckoutSession(order));
			await waitFor(() => expect(result.current.gatewayResolved).toBe(true));
			await act(async () => result.current.startCheckout());
			const same = sessionId === 'session-A';
			expect(mockPost.mock.calls.map(([url]) => url)).toEqual([
				'payment-gateways/stripe_terminal_for_woocommerce/bootstrap',
				...(same ? ['orders/42/checkout'] : []),
			]);
			expect(mockProvenancePatch.mock.calls[0][0].data.meta_data).toContainEqual({
				key: '_wcpos_session',
				value: 'session-A',
			});
			expect(mockProvenancePatch).toHaveBeenCalledTimes(1);
			expect(recordCompletionAttempt).toHaveBeenCalledTimes(1);
			expect(mockCheckoutInfo).toHaveBeenCalledTimes(same ? 0 : 1);
			if (!same) {
				expect(mockCheckoutInfo).toHaveBeenCalledWith(
					'pos_checkout.open_register_first',
					expect.objectContaining({ showToast: true })
				);
				expect(result.current.error).toBeNull();
			}
			expect(result.current.loading).toBe(false);
			expect(mockCheckoutError).not.toHaveBeenCalled();
		}
	);
	it('retrying a pre-stamped unpaid contract order attributes it to the newly open session', async () => {
		const retryOrder = makeOrder();
		const identity = [
			{ key: '_wcpos_sale_counter', value: '7' },
			{ key: '_wcpos_sale_time', value: '2026-09-18T08:00:00Z' },
			{ key: '_wcpos_register', value: 'register-A' },
		];
		Object.assign(retryOrder.payload, {
			status: 'failed',
			meta_data: [...identity, { key: '_wcpos_session', value: 'session-A' }],
		});
		mockSessions.findOne.mockReturnValue({
			exec: async () => ({ id: 'session-B', incrementalPatch: async () => undefined }),
		});
		const { result } = renderHook(() => useCheckoutSession(retryOrder as never));
		await waitFor(() => expect(result.current.gatewayResolved).toBe(true));
		await act(async () => result.current.startCheckout());
		expect(mockProvenancePatch.mock.calls[0][0].data.meta_data).toEqual([
			...identity,
			{ key: '_wcpos_session', value: 'session-B' },
		]);
	});
	it.each([true, false])(
		'stamps the open session only with sessions enabled: %s',
		async (enabled) => {
			mockSessionsOn = enabled;
			mockSessions.findOne.mockReturnValue({
				exec: async () => ({ id: 'session-42', incrementalPatch: async () => undefined }),
			});
			const { result } = renderHook(() => useCheckoutSession(order));
			await waitFor(() => expect(result.current.gatewayResolved).toBe(true));
			await act(async () => result.current.startCheckout());
			const meta = mockProvenancePatch.mock.calls[0][0].data.meta_data;
			expect(meta.filter(({ key }) => key === '_wcpos_session')).toEqual(
				enabled ? [{ key: '_wcpos_session', value: 'session-42' }] : []
			);
			expect(mockPost).toHaveBeenCalledWith(
				'orders/42/checkout',
				expect.anything(),
				expect.anything()
			);
			expect(mockCheckoutInfo).not.toHaveBeenCalledWith(
				'pos_checkout.open_register_first',
				expect.anything()
			);
			expect(result.current.loading).toBe(false);
		}
	);
});

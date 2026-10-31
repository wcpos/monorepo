/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, render, waitFor } from '@testing-library/react';
import { BehaviorSubject, map } from 'rxjs';

import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { enterCheckout, getCheckoutModeSnapshot, resetCheckoutMode } from '../checkout-mode';
import { usePayPagePreparation } from '../pay-page/use-pay-page-preparation';
import { PaymentWebview } from './payment-webview';

// Capture the props handed to the (mocked) WebView so the test can drive the
// `onLoad` lifecycle the same way the real iframe/native webview would.
let webViewProps: Record<string, any> = {};
// Every mount of the (mocked) WebView: a reload is a remount (new `key`).
let webViewMounts = 0;
const mockPostMessage = jest.fn();
const mockGet = jest.fn();
const mockReplace = jest.fn();
const mockDismiss = jest.fn();
const mockDismissTo = jest.fn();
const mockSetCurrentOrderID = jest.fn();
const mockStockAdjustment = jest.fn();
const mockEngineRequire = jest.fn();
const mockAdoptOrderSnapshot = jest.fn();
const mockSite = { uuid: 'site', wcpos_api_url: 'https://shop.example.com/wp-json/wcpos/v2/' };
const mockRefreshFetch = jest.fn();
const mockCredentials$ = new BehaviorSubject({
	access_token: 'jwt-token',
	refresh_token: 'refresh',
});
const mockCredentials = {
	collection: {},
	$: mockCredentials$.pipe(map((data) => ({ toJSON: () => data }))),
	getLatest: () => mockCredentials$.value,
	incrementalPatch: jest.fn(async (patch) => {
		mockCredentials$.next({ ...mockCredentials$.value, ...patch });
	}),
};
const mockPushDocument = jest.fn();
const mockLocalPatch = jest.fn();

let autoShowReceipt = false;
const ORDER_UUID = '5b8e1a3c-2f4d-4a6b-9c8e-000000000042';

jest.mock('@wcpos/components/webview', () => {
	const R = jest.requireActual('react');
	return {
		WebView: (props: Record<string, unknown>) => {
			webViewProps = props;
			R.useEffect(() => {
				webViewMounts += 1;
				webViewProps = props;
				return () => {
					webViewProps = {};
				};
			}, []);
			R.useImperativeHandle(props.ref, () => ({ postMessage: mockPostMessage }));
			return null;
		},
	};
});
jest.mock('@wcpos/components/error-boundary', () => ({
	ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('expo-router', () => ({
	useRouter: () => ({
		replace: mockReplace,
		dismissTo: mockDismissTo,
		canDismiss: () => true,
		dismiss: mockDismiss,
	}),
}));
jest.mock('@wcpos/query', () => ({
	adoptStoreOrderSnapshot: jest.requireActual(
		'../../../../../../../query/src/commands/adopt-store-order'
	).adoptStoreOrderSnapshot,
	useDocField: jest.requireActual('../../../../../../../query/src/records/use-record-field')
		.useDocField,
	useQueryRuntime: () => ({
		engine: { require: mockEngineRequire, adoptOrderSnapshot: mockAdoptOrderSnapshot },
	}),
	useRecordField: (record: unknown, select: (value: unknown) => unknown) => select(record),
	// pushFailureCode tests these with instanceof and reads `status`.
	WriteDeferredError: class WriteDeferredError extends Error {
		status?: number;
		constructor(mutationId: string, status?: number) {
			super(`write-deferred (${status}) for mutation "${mutationId}"`);
			this.status = status;
		}
	},
	WriteOutcomeError: class WriteOutcomeError extends Error {},
}));
// By default as offline with sessions off: preparation exposes the link at once, no commit, no gate.
jest.mock('../pay-page/use-pay-page-preparation', () => ({
	usePayPagePreparation: jest.fn(({ rawPaymentURL }: { rawPaymentURL?: string }) => ({
		prepared: null,
		paymentURL: rawPaymentURL,
	})),
}));
jest.mock('../../../../../contexts/app-state', () => ({
	useStoreSession: () => ({ site: mockSite, wpCredentials: mockCredentials }),
	useAppState: () => ({
		site: mockSite,
		wpCredentials: mockCredentials,
	}),
}));
jest.mock('../../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('../../../contexts/ui-settings', () => ({
	useUISettings: () => ({ uiSettings: { autoShowReceipt } }),
}));
jest.mock('../../../hooks/use-rest-http-client', () => ({
	useRestHttpClient: () => ({ get: mockGet }),
}));

const makeOrder = (
	href = 'https://shop.example.com/wcpos-checkout/order-pay/42',
	meta_data: { key: string; value: string }[] = []
) => {
	const order = {
		uuid: 'uuid-42',
		payload: {
			id: 42,
			number: '42',
			status: 'pos-open',
			links: { payment: [{ href }] },
			line_items: [],
			meta_data,
		},
		getLatest: () => order,
	};
	return order as never;
};

describe('PaymentWebview fallback order refresh', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		resetCheckoutMode();
		jest.useRealTimers();
		webViewProps = {};
		autoShowReceipt = false;
		mockEngineRequire.mockReturnValue({
			ready: Promise.resolve({ action: 'fetched', appliedRecordIds: ['42'] }),
			release: jest.fn(),
		});
		mockAdoptOrderSnapshot.mockResolvedValue('protected');
	});
	afterEach(() => {
		jest.useRealTimers();
	});

	it('routes a successful payment to its receipt WITHOUT waiting for the engine refresh', async () => {
		// Orders #117902 / #118391 (2026-08-29): "payment completed" was logged, the
		// server had the order paid, and the receipt never opened because the
		// refresh's `ready` never settled and the handler awaited it. Routing must
		// not depend on the refresh; the refresh is bounded so its handle is
		// always released.
		jest.useFakeTimers();
		try {
			autoShowReceipt = true;
			const release = jest.fn();
			mockEngineRequire.mockReturnValue({
				ready: new Promise<void>(() => {
					/* never settles */
				}),
				release,
			});
			const logger = getLogger(['wcpos', 'pos', 'checkout', 'payment']);
			const setLoading = jest.fn();

			render(
				<PaymentWebview
					order={makeOrder()}
					setLoading={setLoading}
					setFrameStatus={jest.fn()}
					onStockRejection={() => false}
				/>
			);

			await act(async () => {
				webViewProps.onMessage({
					nativeEvent: {
						data: {
							action: 'wcpos-payment-received',
							payload: {
								id: 42,
								number: '42',
								status: 'completed',
								meta_data: [{ key: '_woocommerce_pos_uuid', value: ORDER_UUID }],
								line_items: [],
							},
						},
					},
				});
				await Promise.resolve();
			});

			expect(logger.success).toHaveBeenCalled();
			expect(mockEngineRequire).toHaveBeenCalledWith({
				id: 'checkout:order-refresh:42',
				collection: 'orders',
				kind: 'targeted-records',
				remoteIds: ['42'],
				forceRefresh: true,
			});
			// Routed and un-spun immediately — the refresh is still pending.
			expect(mockReplace).toHaveBeenCalledWith({
				pathname: '/(app)/(drawer)/(pos)/(modals)/cart/receipt/[orderId]',
				params: { orderId: 'uuid-42' },
			});
			expect(setLoading).toHaveBeenCalledWith(false);
			expect(mockSetCurrentOrderID).toHaveBeenCalledWith('');
			expect(release).not.toHaveBeenCalled();

			// A refresh that never settles is released at the bound, not held forever.
			await act(async () => {
				jest.advanceTimersByTime(10_000);
				await Promise.resolve();
			});
			expect(release).toHaveBeenCalledTimes(1);
		} finally {
			jest.useRealTimers();
		}
	});

	it('stage host with auto-show enters the in-pane receipt and never routes', async () => {
		jest.useFakeTimers();
		autoShowReceipt = true;
		const release = jest.fn();
		mockEngineRequire.mockReturnValue({
			ready: new Promise<void>(() => {
				/* never settles */
			}),
			release,
		});
		const setLoading = jest.fn();
		const payload = {
			id: 42,
			number: '42',
			status: 'completed',
			meta_data: [{ key: '_woocommerce_pos_uuid', value: ORDER_UUID }],
			line_items: [],
		};
		render(
			<PaymentWebview
				order={makeOrder()}
				receiptHost="stage"
				setLoading={setLoading}
				setFrameStatus={jest.fn()}
				onStockRejection={() => false}
			/>
		);
		await act(async () => {
			webViewProps.onMessage({
				nativeEvent: { data: { action: 'wcpos-payment-received', payload } },
			});
			await Promise.resolve();
		});
		expect(getCheckoutModeSnapshot().receiptOrders.has('uuid-42')).toBe(true);
		expect(getCheckoutModeSnapshot().selectedReceiptOrder).toBe('uuid-42');
		expect(mockReplace).not.toHaveBeenCalled();
		expect(mockDismiss).not.toHaveBeenCalled();
		expect(mockDismissTo).not.toHaveBeenCalled();
		expect(mockSetCurrentOrderID).not.toHaveBeenCalledWith('');
		expect(setLoading).toHaveBeenCalledWith(false);
		expect(mockEngineRequire).toHaveBeenCalled();
		expect(release).not.toHaveBeenCalled();
		await act(async () => {
			jest.advanceTimersByTime(10_000);
			await Promise.resolve();
		});
	});

	it('stage host without auto-show leaves checkout and clears the current order, without routing', async () => {
		autoShowReceipt = false;
		enterCheckout('uuid-42');
		const payload = {
			id: 42,
			number: '42',
			status: 'completed',
			meta_data: [{ key: '_woocommerce_pos_uuid', value: ORDER_UUID }],
			line_items: [],
		};
		render(
			<PaymentWebview
				order={makeOrder()}
				receiptHost="stage"
				setLoading={jest.fn()}
				setFrameStatus={jest.fn()}
				onStockRejection={() => false}
			/>
		);
		await act(async () => {
			webViewProps.onMessage({
				nativeEvent: { data: { action: 'wcpos-payment-received', payload } },
			});
			await Promise.resolve();
		});
		expect(getCheckoutModeSnapshot().checkoutOrders.has('uuid-42')).toBe(false);
		expect(getCheckoutModeSnapshot().receiptOrders.has('uuid-42')).toBe(false);
		expect(mockSetCurrentOrderID).toHaveBeenCalledWith('');
		expect(mockReplace).not.toHaveBeenCalled();
		expect(mockDismiss).not.toHaveBeenCalled();
		expect(mockDismissTo).not.toHaveBeenCalled();
	});

	it('adopts a valid payment payload and skips the redundant refresh when applied', async () => {
		mockAdoptOrderSnapshot.mockResolvedValue('applied');
		const payload = {
			id: 42,
			number: '42',
			status: 'completed',
			meta_data: [{ key: '_woocommerce_pos_uuid', value: ORDER_UUID }],
			line_items: [],
		};

		render(
			<PaymentWebview
				order={makeOrder()}
				setLoading={jest.fn()}
				setFrameStatus={jest.fn()}
				onStockRejection={() => false}
			/>
		);

		await act(async () => {
			webViewProps.onMessage({
				nativeEvent: { data: { action: 'wcpos-payment-received', payload } },
			});
			await Promise.resolve();
		});

		expect(mockAdoptOrderSnapshot).toHaveBeenCalledWith(payload);
		expect(mockEngineRequire).not.toHaveBeenCalled();
	});

	it('warns, releases the spinner, and polls server truth for a malformed payload', async () => {
		const logger = getLogger(['wcpos', 'pos', 'checkout', 'payment']);
		const setLoading = jest.fn();
		mockGet.mockResolvedValue({
			data: [{ id: 42, status: 'pos-open', number: '42', line_items: [] }],
		});

		render(
			<PaymentWebview
				order={makeOrder()}
				setLoading={setLoading}
				setFrameStatus={jest.fn()}
				onStockRejection={() => false}
			/>
		);

		await act(async () => {
			webViewProps.onMessage({
				nativeEvent: {
					data: {
						action: 'wcpos-payment-received',
						payload: { id: '42', status: '', data: { malformed: true } },
					},
				},
			});
			await Promise.resolve();
		});

		expect(logger.info).toHaveBeenCalled();
		expect(logger.warn).not.toHaveBeenCalled();
		expect(setLoading).toHaveBeenCalledWith(false);
		expect(mockGet).toHaveBeenCalledWith('orders', { params: { include: 42, per_page: 1 } });
		expect(mockAdoptOrderSnapshot).not.toHaveBeenCalled();
	});

	it.each([
		['missing', undefined],
		['empty', ''],
		['whitespace', '   '],
		['malformed', 'not-a-uuid'],
	])(
		'polls server truth when a plausible payment payload has a %s stamped UUID',
		async (_, uuid) => {
			const serverOrder = {
				id: 42,
				status: 'completed',
				number: '42',
				meta_data: [{ key: '_woocommerce_pos_uuid', value: ORDER_UUID }],
				line_items: [],
			};
			mockGet.mockResolvedValue({ data: [serverOrder] });
			mockAdoptOrderSnapshot.mockResolvedValue('applied');

			render(
				<PaymentWebview
					order={makeOrder()}
					setLoading={jest.fn()}
					setFrameStatus={jest.fn()}
					onStockRejection={() => false}
				/>
			);

			const payload = { id: 42, number: '42', status: 'completed', line_items: [] } as Record<
				string,
				unknown
			>;
			if (uuid !== undefined) {
				payload.meta_data = [{ key: '_woocommerce_pos_uuid', value: uuid }];
			}

			await act(async () => {
				webViewProps.onMessage({
					nativeEvent: {
						data: {
							action: 'wcpos-payment-received',
							payload,
						},
					},
				});
				await Promise.resolve();
			});

			expect(mockGet).toHaveBeenCalledWith('orders', { params: { include: 42, per_page: 1 } });
			expect(mockAdoptOrderSnapshot).toHaveBeenCalledTimes(1);
			expect(mockAdoptOrderSnapshot).toHaveBeenCalledWith(serverOrder);
			expect(mockDismiss).toHaveBeenCalledTimes(1);
			expect(mockReplace).not.toHaveBeenCalled();
		}
	);

	it('a later document reads server truth once, a second after it loads', async () => {
		jest.useFakeTimers();
		mockGet.mockResolvedValue({ data: [{ id: 42, status: 'pos-open', number: '42' }] });
		render(
			<PaymentWebview
				order={makeOrder()}
				setLoading={jest.fn()}
				setFrameStatus={jest.fn()}
				onStockRejection={() => false}
			/>
		);

		await act(async () => {
			webViewProps.onLoad({}); // the order-pay page
			webViewProps.onLoad({}); // a later document: the grace starts
			await jest.advanceTimersByTimeAsync(999);
		});
		expect(mockGet).not.toHaveBeenCalled();

		await act(async () => {
			await jest.advanceTimersByTimeAsync(1);
		});
		expect(mockGet).toHaveBeenCalledTimes(1);
		expect(mockGet).toHaveBeenCalledWith('orders', { params: { include: 42, per_page: 1 } });
	});

	it('does not poll on the initial page load (payment cannot have completed yet)', async () => {
		jest.useFakeTimers();
		render(
			<PaymentWebview
				order={makeOrder()}
				setLoading={jest.fn()}
				setFrameStatus={jest.fn()}
				onStockRejection={() => false}
			/>
		);

		await act(async () => {
			webViewProps.onLoad({});
			await jest.advanceTimersByTimeAsync(1000);
		});

		expect(mockEngineRequire).not.toHaveBeenCalled();
		expect(mockGet).not.toHaveBeenCalled();
	});

	it('routes structured stock errors to the shared rejection handler', async () => {
		const setLoading = jest.fn();
		const onStockRejection = jest.fn(() => true);
		const logger = getLogger(['wcpos', 'pos', 'checkout', 'payment']);
		const payload = {
			code: 'wcpos_insufficient_stock',
			data: { items: [{ product_id: 10, variation_id: 0, available: 0 }] },
		};
		render(
			<PaymentWebview
				order={makeOrder()}
				setLoading={setLoading}
				setFrameStatus={jest.fn()}
				onStockRejection={onStockRejection}
			/>
		);

		await act(async () => {
			webViewProps.onMessage({ nativeEvent: { data: { payload } } });
		});

		expect(onStockRejection).toHaveBeenCalledWith(payload);
		expect(logger.error).not.toHaveBeenCalled();
		expect(setLoading).toHaveBeenCalledWith(false);
	});

	it('stops loading and logs the action when the payment frame reports a blocked submit', async () => {
		const setLoading = jest.fn();
		const logger = getLogger(['wcpos', 'pos', 'checkout', 'payment']);
		const payload = {
			message: 'Payment failed. Please try again.',
			data: {
				notices: ['Payment failed. Please try again.'],
				payment_method: 'pos_cash',
				scripts: ['wc-stripe-upe-classic-js'],
			},
		};
		render(
			<PaymentWebview
				order={makeOrder()}
				setLoading={setLoading}
				setFrameStatus={jest.fn()}
				onStockRejection={() => false}
			/>
		);

		await act(async () => {
			webViewProps.onMessage({
				nativeEvent: { data: { action: 'wcpos-payment-blocked', payload } },
			});
		});

		expect(setLoading).toHaveBeenCalledWith(false);
		// A decline is not "confirm whether the payment went through": the gateway's own
		// sentence is the toast, the sale is not paid, and the cart is safe to retry.
		expect(logger.error).not.toHaveBeenCalled();
		expect(logger.warn).toHaveBeenCalledWith('Payment was not completed by the gateway', {
			showToast: true,
			code: ERROR_CODES.CHECKOUT_FAILED_CART_SAFE,
			toast: { title: 'Payment failed. Please try again.' },
			context: {
				gatewayMessage: 'Payment failed. Please try again.',
				action: 'wcpos-payment-blocked',
				payloadData: payload.data,
			},
		});
	});

	it('warns (never errors) when the follow-up to a successful payment throws', async () => {
		const logger = getLogger(['wcpos', 'pos', 'checkout', 'payment']);
		mockStockAdjustment.mockImplementationOnce(() => {
			throw new Error('stock adjust broke');
		});
		render(
			<PaymentWebview
				order={makeOrder()}
				setLoading={jest.fn()}
				setFrameStatus={jest.fn()}
				onStockRejection={() => false}
			/>
		);

		await act(async () => {
			webViewProps.onMessage({
				nativeEvent: {
					data: {
						action: 'wcpos-payment-received',
						payload: {
							id: 42,
							status: 'completed',
							number: '42',
							meta_data: [{ key: '_woocommerce_pos_uuid', value: ORDER_UUID }],
							line_items: [],
						},
					},
				},
			});
		});

		// The payment was taken: a red error toast reads as "charge again" (PAYMENT101, owner).
		expect(logger.error).not.toHaveBeenCalled();
		expect(logger.warn).toHaveBeenCalledWith(
			'stock adjust broke',
			expect.objectContaining({
				showToast: true,
				code: ERROR_CODES.PAYMENT_OK_STATUS_CHECK_FAILED,
			})
		);
	});

	it('logs a failed follow-up on the poll path as the fallback-refresh debug row, never a warning', async () => {
		// The poll-path half of the row above (design §5, open with Paul): the same paid sale
		// whose completion fails is a quiet debug row when the poll settled it.
		jest.useFakeTimers();
		const logger = getLogger(['wcpos', 'pos', 'checkout', 'payment']);
		mockStockAdjustment.mockImplementationOnce(() => {
			throw new Error('stock adjust broke');
		});
		mockGet.mockResolvedValue({
			data: [
				{
					id: 42,
					status: 'completed',
					number: '42',
					meta_data: [{ key: '_woocommerce_pos_uuid', value: ORDER_UUID }],
					line_items: [],
				},
			],
		});
		render(
			<PaymentWebview
				order={makeOrder()}
				setLoading={jest.fn()}
				setFrameStatus={jest.fn()}
				onStockRejection={() => false}
			/>
		);

		await act(async () => {
			webViewProps.onLoad({});
			webViewProps.onLoad({});
			await jest.advanceTimersByTimeAsync(1000);
		});

		expect(mockStockAdjustment).toHaveBeenCalledTimes(1);
		expect(logger.error).not.toHaveBeenCalled();
		// (The harness binds no register, so a provenance warn is logged too; not this row's subject.)
		expect(logger.warn).not.toHaveBeenCalledWith('stock adjust broke', expect.anything());
		expect(logger.debug).toHaveBeenCalledWith('Fallback order status refresh did not complete', {
			context: { error: 'stock adjust broke', source: 'fallback-refresh' },
		});
	});

	it('falls back to translated copy when a blocked submit carries no gateway sentence', async () => {
		const logger = getLogger(['wcpos', 'pos', 'checkout', 'payment']);
		render(
			<PaymentWebview
				order={makeOrder()}
				setLoading={jest.fn()}
				setFrameStatus={jest.fn()}
				onStockRejection={() => false}
			/>
		);

		await act(async () => {
			webViewProps.onMessage({
				nativeEvent: {
					data: { action: 'wcpos-payment-blocked', payload: { message: ' ', data: {} } },
				},
			});
		});

		expect(logger.warn).toHaveBeenCalledWith(
			'Payment was not completed by the gateway',
			expect.objectContaining({ toast: { title: 'pos_checkout.payment_not_completed' } })
		);
	});

	it('defers to server truth when the postMessage payload reports an unpaid status', async () => {
		// A pre-hardening store's received page emits whenever the CONFIGURED gateway
		// status is not pos-open — for an async gateway that can be before the provider
		// confirms. The message's say-so must not complete the sale.
		const logger = getLogger(['wcpos', 'pos', 'checkout', 'payment']);
		const setLoading = jest.fn();
		mockGet.mockResolvedValue({
			data: [{ id: 42, status: 'pos-open', number: '42', line_items: [] }],
		});

		render(
			<PaymentWebview
				order={makeOrder()}
				setLoading={setLoading}
				setFrameStatus={jest.fn()}
				onStockRejection={() => false}
			/>
		);

		await act(async () => {
			webViewProps.onMessage({
				nativeEvent: {
					data: {
						action: 'wcpos-payment-received',
						payload: {
							id: 42,
							number: '42',
							status: 'pending',
							meta_data: [{ key: '_woocommerce_pos_uuid', value: ORDER_UUID }],
							line_items: [],
						},
					},
				},
			});
			await Promise.resolve();
		});

		expect(logger.info).toHaveBeenCalled();
		expect(logger.warn).not.toHaveBeenCalled();
		expect(logger.success).not.toHaveBeenCalled();
		expect(setLoading).toHaveBeenCalledWith(false);
		expect(mockReplace).not.toHaveBeenCalled();
		expect(mockDismiss).not.toHaveBeenCalled();
		expect(mockSetCurrentOrderID).not.toHaveBeenCalled();
		expect(mockAdoptOrderSnapshot).not.toHaveBeenCalled();
		// The poll ran and, with server truth still pos-open, left everything alone.
		expect(mockGet).toHaveBeenCalledWith('orders', { params: { include: 42, per_page: 1 } });
	});

	it('does not duplicate completion when postMessage wins an in-flight fallback poll', async () => {
		jest.useFakeTimers();
		let resolveGet!: (value: unknown) => void;
		mockGet.mockReturnValue(new Promise((resolve) => (resolveGet = resolve)));
		mockAdoptOrderSnapshot.mockResolvedValue('applied');
		const postMessageOrder = {
			id: 42,
			status: 'completed',
			number: 'post-message',
			meta_data: [{ key: '_woocommerce_pos_uuid', value: ORDER_UUID }],
			line_items: [],
		};
		const polledOrder = { ...postMessageOrder, number: 'poll' };

		render(
			<PaymentWebview
				order={makeOrder()}
				setLoading={jest.fn()}
				setFrameStatus={jest.fn()}
				onStockRejection={() => false}
			/>
		);

		await act(async () => {
			webViewProps.onLoad({});
			webViewProps.onLoad({});
			await jest.advanceTimersByTimeAsync(1000);
			// The poll's read is in flight when the message lands.
			expect(mockGet).toHaveBeenCalledTimes(1);
			webViewProps.onMessage({
				nativeEvent: {
					data: { action: 'wcpos-payment-received', payload: postMessageOrder },
				},
			});
			resolveGet({ data: [polledOrder] });
			await Promise.resolve();
		});

		expect(mockAdoptOrderSnapshot).toHaveBeenCalledTimes(1);
		expect(mockAdoptOrderSnapshot).toHaveBeenCalledWith(postMessageOrder);
		expect(mockStockAdjustment).toHaveBeenCalledTimes(1);
		expect(mockSetCurrentOrderID).toHaveBeenCalledTimes(1);
		expect(mockDismiss).toHaveBeenCalledTimes(1);
		expect(mockReplace).not.toHaveBeenCalled();
	});
});

/**
 * A merchant's "pay by invoice" workflow: BACS configured through POS settings to
 * land on `pending`, so the customer can still pay through the web pay link. The
 * store's gateway catalog serves that choice as `settled_order_status`; reaching it
 * is the sale finishing, even though WooCommerce never calls the order paid. Before
 * this, the cashier was left on a hung pay window with the order still in the cart.
 */
describe('PaymentWebview settled order status', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		resetCheckoutMode();
		jest.useRealTimers();
		webViewProps = {};
		autoShowReceipt = false;
		mockEngineRequire.mockReturnValue({
			ready: Promise.resolve({ action: 'fetched', appliedRecordIds: ['42'] }),
			release: jest.fn(),
		});
		mockAdoptOrderSnapshot.mockResolvedValue('applied');
	});

	const pendingPayload = {
		id: 42,
		number: '42',
		status: 'pending',
		payment_method: 'bacs',
		meta_data: [{ key: '_woocommerce_pos_uuid', value: ORDER_UUID }],
		line_items: [],
	};

	const postReceived = async (payload: unknown) => {
		await act(async () => {
			webViewProps.onMessage({
				nativeEvent: { data: { action: 'wcpos-payment-received', payload } },
			});
			await Promise.resolve();
		});
	};

	it('does not honour the stored status for an order paid through a different gateway', async () => {
		// The pay page can finish with a gateway other than the one the cart was
		// opened with. BACS stores `pending`; a card gateway sitting `pending` while
		// its provider confirms must not borrow that.
		const logger = getLogger(['wcpos', 'pos', 'checkout', 'payment']);
		mockGet.mockResolvedValue({
			data: [{ id: 42, status: 'pos-open', number: '42', line_items: [] }],
		});

		render(
			<PaymentWebview
				order={makeOrder()}
				setLoading={jest.fn()}
				setFrameStatus={jest.fn()}
				onStockRejection={() => false}
				settledOrderStatuses={{ bacs: 'pending' }}
			/>
		);

		await postReceived({ ...pendingPayload, payment_method: 'pos_card' });

		expect(logger.info).toHaveBeenCalled();
		expect(logger.warn).not.toHaveBeenCalled();
		expect(logger.success).not.toHaveBeenCalled();
		expect(mockReplace).not.toHaveBeenCalled();
		expect(mockDismiss).not.toHaveBeenCalled();
		expect(mockAdoptOrderSnapshot).not.toHaveBeenCalled();
	});

	// The merchant's report (woocommerce-pos#2164): the window opened for the
	// default terminal gateway, the cashier picked bank transfer on the pay page
	// inside it, and the order came back `bacs`/`pending` — BACS's stored status.
	// Knowing only the terminal's status left the pay window hung on the tick.
	const merchantCatalog = { sumup_terminal_for_woocommerce: 'completed', bacs: 'pending' };

	it('honours the stored status of the gateway the pay page settled with, not the one the window opened for', async () => {
		const logger = getLogger(['wcpos', 'pos', 'checkout', 'payment']);
		const setLoading = jest.fn();

		render(
			<PaymentWebview
				order={makeOrder()}
				setLoading={setLoading}
				setFrameStatus={jest.fn()}
				onStockRejection={() => false}
				settledOrderStatuses={merchantCatalog}
			/>
		);

		await postReceived({ ...pendingPayload, payment_method: 'bacs', status: 'pending' });

		// Not deferred to the poll. (next's completion flow also logs a provenance
		// warn when the harness binds no register; that is not this test's subject.)
		expect(logger.warn).not.toHaveBeenCalledWith(
			'Payment received but the order is not paid; deferring to server truth',
			expect.anything()
		);
		expect(logger.success).toHaveBeenCalledTimes(1);
		expect(mockSetCurrentOrderID).toHaveBeenCalledWith('');
		expect(mockDismiss).toHaveBeenCalledTimes(1);
		expect(mockReplace).not.toHaveBeenCalled();
		expect(mockAdoptOrderSnapshot).toHaveBeenCalledWith(
			expect.objectContaining({ payment_method: 'bacs', status: 'pending' })
		);
		expect(mockGet).not.toHaveBeenCalled();
	});

	it('honours the settling gateway from the fallback poll too', async () => {
		const logger = getLogger(['wcpos', 'pos', 'checkout', 'payment']);
		const serverOrder = { ...pendingPayload, total: '75.00', payment_method: 'bacs' };
		mockGet.mockResolvedValue({ data: [serverOrder] });

		render(
			<PaymentWebview
				order={makeOrder()}
				setLoading={jest.fn()}
				setFrameStatus={jest.fn()}
				onStockRejection={() => false}
				settledOrderStatuses={merchantCatalog}
			/>
		);

		await postReceived({ not: 'an order' });
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
		});

		expect(mockGet).toHaveBeenCalledTimes(1);
		expect(logger.success).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				context: expect.objectContaining({
					paymentMethod: 'bacs',
					status: 'pending',
					source: 'fallback-refresh',
				}),
			})
		);
		expect(mockAdoptOrderSnapshot).toHaveBeenCalledWith(serverOrder);
		expect(mockDismiss).toHaveBeenCalledTimes(1);
		expect(mockReplace).not.toHaveBeenCalled();
	});

	it('ignores a late payment message once the poll has already settled the sale', async () => {
		const serverOrder = { ...pendingPayload, total: '75.00' };
		mockGet.mockResolvedValue({ data: [serverOrder] });

		render(
			<PaymentWebview
				order={makeOrder()}
				setLoading={jest.fn()}
				setFrameStatus={jest.fn()}
				onStockRejection={() => false}
				settledOrderStatuses={{ bacs: 'pending' }}
			/>
		);

		await postReceived({ not: 'an order' });
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
		expect(mockDismiss).toHaveBeenCalledTimes(1);
		expect(mockReplace).not.toHaveBeenCalled();

		await postReceived(pendingPayload);

		expect(mockDismiss).toHaveBeenCalledTimes(1);
		expect(mockReplace).not.toHaveBeenCalled();
		expect(mockAdoptOrderSnapshot).toHaveBeenCalledTimes(1);
	});

	it("completes a pending sale from the postMessage when pending is the gateway's stored status", async () => {
		const logger = getLogger(['wcpos', 'pos', 'checkout', 'payment']);
		const setLoading = jest.fn();

		render(
			<PaymentWebview
				order={makeOrder()}
				setLoading={setLoading}
				setFrameStatus={jest.fn()}
				onStockRejection={() => false}
				settledOrderStatuses={{ bacs: 'pending' }}
			/>
		);

		await postReceived(pendingPayload);

		// Not deferred to the poll. (next's completion flow also logs a provenance
		// warn when the harness binds no register; that is not this test's subject.)
		expect(logger.warn).not.toHaveBeenCalledWith(
			'Payment received but the order is not paid; deferring to server truth',
			expect.anything()
		);
		expect(logger.success).toHaveBeenCalledTimes(1);
		expect(mockSetCurrentOrderID).toHaveBeenCalledWith('');
		expect(mockDismiss).toHaveBeenCalledTimes(1);
		expect(mockReplace).not.toHaveBeenCalled();
		expect(mockAdoptOrderSnapshot).toHaveBeenCalledWith(pendingPayload);
		expect(setLoading).toHaveBeenCalledWith(false);
		// Settled on the message's say-so, so no server poll was armed.
		expect(mockGet).not.toHaveBeenCalled();
	});

	it("still defers a pending postMessage when the gateway's stored status is something else", async () => {
		// An async gateway configured for `completed` that redirected before its
		// provider confirmed: pending is not ITS status, so the sale is not done.
		const logger = getLogger(['wcpos', 'pos', 'checkout', 'payment']);
		mockGet.mockResolvedValue({
			data: [{ id: 42, status: 'pos-open', number: '42', line_items: [] }],
		});

		render(
			<PaymentWebview
				order={makeOrder()}
				setLoading={jest.fn()}
				setFrameStatus={jest.fn()}
				onStockRejection={() => false}
				settledOrderStatuses={{ bacs: 'completed' }}
			/>
		);

		await postReceived(pendingPayload);

		expect(logger.info).toHaveBeenCalled();
		expect(logger.warn).not.toHaveBeenCalled();
		expect(logger.success).not.toHaveBeenCalled();
		expect(mockReplace).not.toHaveBeenCalled();
		expect(mockDismiss).not.toHaveBeenCalled();
		expect(mockAdoptOrderSnapshot).not.toHaveBeenCalled();
		expect(mockGet).toHaveBeenCalledWith('orders', { params: { include: 42, per_page: 1 } });
	});

	it("stage host: a pending sale on the gateway's stored status reaches finishSale as completed", async () => {
		// next re-gates the outcome inside completeSale → finishSale with the same
		// isSaleComplete the webview just used, so the stored status has to travel
		// on the outcome itself. Without it the webview would route the cashier off
		// the pay window while finishSale returned not-completed: no receipt entered
		// on the stage host, and no stock adjustment for the paid snapshot.
		autoShowReceipt = true;

		render(
			<PaymentWebview
				order={makeOrder()}
				receiptHost="stage"
				setLoading={jest.fn()}
				setFrameStatus={jest.fn()}
				onStockRejection={() => false}
				settledOrderStatuses={{ bacs: 'pending' }}
			/>
		);

		await postReceived(pendingPayload);

		await waitFor(() => expect(mockStockAdjustment).toHaveBeenCalledTimes(1));
		expect(getCheckoutModeSnapshot().receiptOrders.has('uuid-42')).toBe(true);
		expect(getCheckoutModeSnapshot().selectedReceiptOrder).toBe('uuid-42');
		expect(mockReplace).not.toHaveBeenCalled();
		expect(mockDismiss).not.toHaveBeenCalled();
		expect(mockGet).not.toHaveBeenCalled();
	});

	it('never settles a parked status even when it is the stored status', async () => {
		const logger = getLogger(['wcpos', 'pos', 'checkout', 'payment']);
		mockGet.mockResolvedValue({
			data: [{ id: 42, status: 'pos-open', number: '42', line_items: [] }],
		});

		render(
			<PaymentWebview
				order={makeOrder()}
				setLoading={jest.fn()}
				setFrameStatus={jest.fn()}
				onStockRejection={() => false}
				settledOrderStatuses={{ bacs: 'pos-open' }}
			/>
		);

		await postReceived({ ...pendingPayload, status: 'pos-open' });

		expect(logger.info).toHaveBeenCalled();
		expect(logger.warn).not.toHaveBeenCalled();
		expect(logger.success).not.toHaveBeenCalled();
		expect(mockReplace).not.toHaveBeenCalled();
		expect(mockDismiss).not.toHaveBeenCalled();
		expect(mockAdoptOrderSnapshot).not.toHaveBeenCalled();
	});
});

jest.mock('../hooks/use-sale-context', () => ({
	useSaleContext: () => ({
		actionActor: { userId: 7, registerId: null, sessionId: null },
		actionCtx: jest
			.requireActual<typeof import('../../../../../extensions/actions')>(
				'../../../../../extensions/actions'
			)
			.createActionContext({
				log: () => undefined,
				t: (key) => key,
				readCatalog: async () => null,
				readPaymentMethod: () => null,
				preventOverselling: false,
				priceDecimals: 2,
				// No register is bound in this suite; nothing here commits a tender.
				resolveSession: async () => ({ registerId: null, sessionId: null }),
			}),
		storeDB: {},
		runtime: { engine: { require: mockEngineRequire } },
		dp: 2,
		stampCompletion: (
			...[o, m]: Parameters<import('../sale-completion').SaleContext['stampCompletion']>
		) => mockLocalPatch({ document: o, data: { meta_data: m } }),
		pushDocument: mockPushDocument,
		stockAdjustment: mockStockAdjustment,
	}),
}));

jest.mock('@wcpos/components/lib/device', () => ({
	...jest.requireActual('@wcpos/components/lib/device'),
	useIsPhone: () => false,
}));

jest.mock('../../contexts/current-order/context', () => ({
	useCurrentOrderActions: () => ({
		setCurrentOrderID: mockSetCurrentOrderID,
		getCurrentOrderID: () => 'uuid-42',
	}),
}));

// Journal storage is exercised against RxDB in the owner/journal suites.
jest.mock('@wcpos/query/store-local', () => ({
	...jest.requireActual('@wcpos/query/store-local'),
	recordCompletionAttempt: jest.fn(async () => {}),
	resolveCompletionAttempt: jest.fn(async () => {}),
	awaitAdoption: jest.fn(async () => {}),
	retainCompletionAttempt: jest.fn(async () => {}),
}));

describe('PaymentWebview session expiry', () => {
	const originalFetch = globalThis.fetch;
	const response = (access_token = 'fresh-token') => ({
		ok: true,
		status: 200,
		statusText: 'OK',
		json: async () => ({ access_token, expires_at: 12345 }),
	});
	const sendExpiry = (orderId: number | string = 42) =>
		webViewProps.onMessage({ nativeEvent: { data: { action: 'wcpos-session-expired', orderId } } });
	const renderFrame = () => {
		const setFrameStatus = jest.fn();
		render(
			<PaymentWebview
				order={makeOrder()}
				setLoading={jest.fn()}
				setFrameStatus={setFrameStatus}
				onStockRejection={() => false}
			/>
		);
		act(() => webViewProps.onLoad({}));
		return { setFrameStatus };
	};
	beforeEach(() => {
		jest.clearAllMocks();
		jest.useFakeTimers();
		jest
			.requireActual('@wcpos/hooks/use-http-client/request-state-manager')
			.requestStateManager.reset();
		jest.requireActual('@wcpos/hooks/use-http-client/refresh-access-token').resetRefreshCooldown();
		mockCredentials$.next({ access_token: 'jwt-token', refresh_token: 'refresh' });
		webViewMounts = 0;
		globalThis.fetch = mockRefreshFetch;
		mockRefreshFetch.mockResolvedValue(response());
		mockGet.mockResolvedValue({ data: [] });
	});
	afterEach(() => {
		globalThis.fetch = originalFetch;
		jest.useRealTimers();
	});

	it('refreshes the matching order and remounts with the reactive new token, never the old token', async () => {
		let finish!: (response: unknown) => void;
		mockRefreshFetch.mockReturnValue(
			new Promise((resolve) => {
				finish = resolve;
			})
		);
		const { setFrameStatus } = renderFrame();
		expect(new URL(webViewProps.src).searchParams.get('token')).toBe('jwt-token');
		await act(async () => {
			sendExpiry('42');
			sendExpiry('42');
		});
		expect(mockRefreshFetch).toHaveBeenCalledTimes(1);
		expect(webViewMounts).toBe(1);
		expect(setFrameStatus).toHaveBeenLastCalledWith('loading');
		await act(async () => {
			finish(response());
		});
		expect(webViewMounts).toBe(2);
		expect(new URL(webViewProps.src).searchParams.getAll('token')).toEqual(['fresh-token']);
		expect(webViewProps.src).not.toContain('jwt-token');
		expect(mockCredentials.incrementalPatch).toHaveBeenCalledWith({
			access_token: 'fresh-token',
			expires_at: 12345,
		});
	});

	it('a payment that settles during the refresh is seen by the poll after the remount', async () => {
		const serverOrder = {
			id: 42,
			status: 'completed',
			number: '42',
			meta_data: [{ key: '_woocommerce_pos_uuid', value: ORDER_UUID }],
			line_items: [],
		};
		mockGet.mockResolvedValue({ data: [serverOrder] });
		mockEngineRequire.mockReturnValue({
			ready: Promise.resolve({ action: 'fetched', appliedRecordIds: ['42'] }),
			release: jest.fn(),
		});
		mockAdoptOrderSnapshot.mockResolvedValue('protected');
		autoShowReceipt = false;
		renderFrame();
		await act(async () => {
			sendExpiry(42);
		});
		expect(webViewMounts).toBe(2);
		await act(async () => {
			webViewProps.onLoad({});
			await jest.advanceTimersByTimeAsync(1000);
		});
		expect(mockGet).toHaveBeenCalledWith('orders', { params: { include: 42, per_page: 1 } });
		expect(mockAdoptOrderSnapshot).toHaveBeenCalledWith(serverOrder);
	});

	it('a refresh that resolves after checkout closed neither remounts nor polls', async () => {
		let resolveRefresh: (value: unknown) => void = () => {};
		mockRefreshFetch.mockReturnValue(new Promise((resolve) => (resolveRefresh = resolve)));
		mockGet.mockResolvedValue({
			data: [{ id: 42, status: 'completed', number: '42', line_items: [] }],
		});
		const setFrameStatus = jest.fn();
		const view = render(
			<PaymentWebview
				order={makeOrder()}
				setLoading={jest.fn()}
				setFrameStatus={setFrameStatus}
				onStockRejection={() => false}
			/>
		);
		act(() => webViewProps.onLoad({}));
		act(() => {
			sendExpiry(42);
		});
		view.unmount();
		await act(async () => {
			resolveRefresh(response());
			// Past two poll intervals (3 s each): a chain armed after unmount would have fetched by now.
			await jest.advanceTimersByTimeAsync(6_000);
		});
		expect(webViewMounts).toBe(1);
		expect(mockGet).not.toHaveBeenCalled();
		expect(mockAdoptOrderSnapshot).not.toHaveBeenCalled();
	});

	it('a failed refresh does not arm the server-status poll', async () => {
		mockRefreshFetch.mockResolvedValue({ ok: false, status: 401, statusText: 'Unauthorized' });
		renderFrame();
		await act(async () => {
			sendExpiry();
			await jest.advanceTimersByTimeAsync(1000);
		});
		expect(mockGet).not.toHaveBeenCalled();
	});

	it('pins the frame message origin to the store', () => {
		renderFrame();
		expect(webViewProps.targetOrigin).toBe(new URL(webViewProps.src).origin);
	});

	it('ignores expiry for another order', async () => {
		renderFrame();
		await act(async () => {
			sendExpiry(99);
		});
		expect(mockRefreshFetch).not.toHaveBeenCalled();
		expect(webViewMounts).toBe(1);
		expect(getLogger(['wcpos', 'pos', 'checkout', 'payment']).debug).toHaveBeenCalledWith(
			'Ignoring session expiry for another order'
		);
	});

	it('allows only two session reloads per mount and warns on the third message', async () => {
		const { setFrameStatus } = renderFrame();
		await act(async () => {
			sendExpiry();
		});
		mockRefreshFetch.mockResolvedValue(response('fresh-token-2'));
		await act(async () => {
			sendExpiry();
		});
		await act(async () => {
			sendExpiry();
		});
		expect(mockRefreshFetch).toHaveBeenCalledTimes(2);
		expect(webViewMounts).toBe(3);
		expect(getLogger(['wcpos', 'pos', 'checkout', 'payment']).warn).toHaveBeenCalledWith(
			'pos_checkout.reopen_payment',
			{ showToast: true }
		);
		// The gate closes: the third expiry marks the frame failed and a load cannot reopen it.
		expect(setFrameStatus).toHaveBeenLastCalledWith('failed');
		await act(async () => {
			webViewProps.onLoadStart?.();
			webViewProps.onLoad?.();
		});
		expect(setFrameStatus).toHaveBeenLastCalledWith('failed');
	});

	it('does not remount on a refused refresh and shows only one warning', async () => {
		mockRefreshFetch.mockResolvedValue({ ok: false, status: 401, statusText: 'Unauthorized' });
		const { setFrameStatus } = renderFrame();
		await act(async () => {
			sendExpiry();
		});
		await act(async () => {
			sendExpiry();
		});
		expect(webViewMounts).toBe(1);
		expect(new URL(webViewProps.src).searchParams.get('token')).toBe('jwt-token');
		expect(setFrameStatus).toHaveBeenLastCalledWith('failed');
		expect(getLogger(['wcpos', 'pos', 'checkout', 'payment']).warn).toHaveBeenCalledTimes(1);
		expect(getLogger(['wcpos', 'pos', 'checkout', 'payment']).warn).toHaveBeenCalledWith(
			'pos_checkout.reopen_payment',
			{ showToast: true }
		);
		// The frame holds an expired token: a later navigation must not reopen the gate.
		await act(async () => {
			webViewProps.onLoadStart?.();
			webViewProps.onLoad?.();
		});
		expect(setFrameStatus).toHaveBeenLastCalledWith('failed');
	});

	it('a new token clears a terminal refusal: the frame reports again', async () => {
		mockRefreshFetch.mockResolvedValue({ ok: false, status: 401, statusText: 'Unauthorized' });
		const { setFrameStatus } = renderFrame();
		await act(async () => {
			sendExpiry();
		});
		expect(setFrameStatus).toHaveBeenLastCalledWith('failed');
		// A background refresh elsewhere in the app patches the credentials.
		await act(async () => {
			mockCredentials$.next({ ...mockCredentials$.value, access_token: 'reauth-token' });
		});
		expect(new URL(webViewProps.src).searchParams.get('token')).toBe('reauth-token');
		await act(async () => {
			webViewProps.onLoadStart?.();
			webViewProps.onLoad?.();
		});
		expect(setFrameStatus).toHaveBeenLastCalledWith('ready');
	});

	it('does not latch a transient refresh failure: a later message may retry', async () => {
		mockRefreshFetch.mockResolvedValueOnce({ ok: false, status: 503, statusText: 'Unavailable' });
		const { setFrameStatus } = renderFrame();
		await act(async () => {
			sendExpiry();
		});
		expect(webViewMounts).toBe(1);
		expect(setFrameStatus).toHaveBeenLastCalledWith('failed');
		// The frame still holds the expired token: a navigation must not reopen the gate.
		await act(async () => {
			webViewProps.onLoadStart?.();
			webViewProps.onLoad?.();
		});
		expect(setFrameStatus).toHaveBeenLastCalledWith('failed');
		// The refresher backs off after a transient failure; a real retry comes after that cooldown.
		jest.requireActual('@wcpos/hooks/use-http-client/refresh-access-token').resetRefreshCooldown();
		mockRefreshFetch.mockResolvedValueOnce(response('fresh-token'));
		await act(async () => {
			sendExpiry();
		});
		expect(webViewMounts).toBe(2);
		expect(new URL(webViewProps.src).searchParams.get('token')).toBe('fresh-token');
		// One reopen warning per mount, however many messages follow (the shared logger mock also
		// records the refresher's own transient-failure warning, so count by message).
		const reopenWarnings = (
			getLogger(['wcpos', 'pos', 'checkout', 'payment']).warn as jest.Mock
		).mock.calls.filter(([message]) => message === 'pos_checkout.reopen_payment');
		expect(reopenWarnings).toHaveLength(1);
	});
});

describe('PaymentWebview refused preparation', () => {
	it('reports the frame stalled and mounts no WebView while preparation is refused', () => {
		jest.clearAllMocks();
		webViewMounts = 0;
		const preparation = jest.mocked(usePayPagePreparation);
		const exposeLink = preparation.getMockImplementation()!;
		preparation.mockReturnValue({ prepared: 'failed', paymentURL: undefined });
		try {
			const setFrameStatus = jest.fn();
			render(
				<PaymentWebview
					order={makeOrder()}
					setLoading={jest.fn()}
					setFrameStatus={setFrameStatus}
					onStockRejection={() => false}
				/>
			);
			expect(setFrameStatus).toHaveBeenLastCalledWith('stalled');
			expect(webViewMounts).toBe(0);
		} finally {
			preparation.mockImplementation(exposeLink);
		}
	});
});

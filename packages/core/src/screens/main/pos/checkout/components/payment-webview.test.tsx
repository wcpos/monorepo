/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, render, waitFor } from '@testing-library/react';
import { BehaviorSubject, map, take } from 'rxjs';

import { getLogger } from '@wcpos/utils/logger';

import { enterCheckout, getCheckoutModeSnapshot, resetCheckoutMode } from '../checkout-mode';
import { LegacyTab } from '../tender/legacy-tab';
import { commitGatewaySale } from '../commit-gateway-sale';
import { isSettledOrderStatus, persistSaleProvenance } from '../sale-completion';
import { recordCompletionAttempt } from '../completion-journal';
import { PAYMENT_FRAME_LOAD_TIMEOUT_MS, PaymentWebview } from './payment-webview';

// Capture the props handed to the (mocked) WebView so the test can drive the
// `onLoad` lifecycle the same way the real iframe/native webview would.
let webViewProps: Record<string, any> = {};
// Every mount of the (mocked) WebView: a reload is a remount (new `key`).
let webViewMounts = 0;
const mockPostMessage = jest.fn();
const mockGet = jest.fn();
const mockReplace = jest.fn();
const mockDismissTo = jest.fn();
const mockSetCurrentOrderID = jest.fn();
const mockStockAdjustment = jest.fn();
const mockEngineRequire = jest.fn();
const mockAdoptOrderSnapshot = jest.fn();
const mockUserDB = {};
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
let mockOnlineStatus = 'offline';
const mockPushDocument = jest.fn();
const mockLocalPatch = jest.fn();
jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status: mockOnlineStatus }),
}));
jest.mock('../../../contexts/use-push-document', () => ({
	usePushDocument: () => mockPushDocument,
}));
jest.mock('../../../hooks/mutations/use-local-mutation', () => ({
	useLocalMutation: () => ({ localPatch: mockLocalPatch }),
}));

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
// Resolved, with an empty catalog, unless a test says otherwise.
const MOCK_CHECKOUT_SESSION = {
	handleStockRejection: () => false,
	gatewayResolved: true,
	settledOrderStatuses: {} as Record<string, string | null>,
};
let mockCheckoutSession = MOCK_CHECKOUT_SESSION;
jest.mock('../hooks/use-checkout-session', () => ({
	useCheckoutSession: () => mockCheckoutSession,
}));
jest.mock('@wcpos/components/button', () => ({
	Button: ({
		children,
		testID,
		onPress,
		disabled,
	}: {
		children: React.ReactNode;
		testID: string;
		onPress: () => void;
		disabled: boolean;
	}) => (
		<button data-testid={testID} onClick={onPress} disabled={disabled}>
			{children}
		</button>
	),
	ButtonText: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@wcpos/components/error-boundary', () => ({
	ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('observable-hooks', () => ({
	...jest.requireActual('observable-hooks'),
	// Return the synchronous default; the component only needs the resolved value.
	useObservableState: (_observable: unknown, defaultValue: unknown) => defaultValue,
}));
jest.mock('expo-router', () => ({
	useRouter: () => ({ replace: mockReplace, dismissTo: mockDismissTo }),
}));
jest.mock('@wcpos/query', () => ({
	useDocField: jest.requireActual('../../../../../../../query/src/records/use-record-field')
		.useDocField,
	useQueryRuntime: () => ({
		engine: { require: mockEngineRequire, adoptOrderSnapshot: mockAdoptOrderSnapshot },
	}),
	useRecordField: (record: unknown, select: (value: unknown) => unknown) => select(record),
}));
let mockRegisterId: string | null = null;
let mockBindingStatus: 'bound' | 'choose' | 'none' | 'unknown' = 'bound';
jest.mock('../../../../../services/register/use-register-binding', () => ({
	useRegisterBinding: () => ({
		status: mockBindingStatus,
		registerId: mockRegisterId,
		registerName: null,
		registers: [],
		bind: jest.fn(),
	}),
}));
jest.mock('../../../../../contexts/app-state', () => ({
	useStoreSession: () => ({
		userDB: mockUserDB,
		site: mockSite,
		wpCredentials: mockCredentials,
		store: { id: 1 },
	}),
	useAppState: () => ({
		site: mockSite,
		wpCredentials: mockCredentials,
	}),
}));
jest.mock('../../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('../../../contexts/ui-settings', () => ({
	useUISettings: () => ({ uiSettings: { autoShowReceipt } }),
}));
jest.mock('../../contexts/current-order', () => ({
	useCurrentOrderActions: () => ({ setCurrentOrderID: mockSetCurrentOrderID }),
}));
jest.mock('../../../hooks/use-rest-http-client', () => ({
	useRestHttpClient: () => ({ get: mockGet }),
}));
jest.mock('../../../hooks/use-stock-adjustment', () => ({
	useStockAdjustment: () => ({ stockAdjustment: mockStockAdjustment }),
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

describe('PaymentWebview load watchdog', () => {
	const renderFrame = (retryToken = 0) => {
		const setFrameStatus = jest.fn();
		const utils = render(
			<PaymentWebview
				order={makeOrder()}
				setLoading={jest.fn()}
				setFrameStatus={setFrameStatus}
				onStockRejection={() => false}
				retryToken={retryToken}
			/>
		);
		return { ...utils, setFrameStatus };
	};

	beforeEach(() => {
		jest.clearAllMocks();
		jest.useFakeTimers();
		webViewProps = {};
		webViewMounts = 0;
	});
	afterEach(() => {
		jest.useRealTimers();
	});

	it('reloads the frame once when no load event arrives, then reports the stall as failed', () => {
		// iOS simulators on the CI runners (runs 33750030091 tablet, 33758920470
		// phone): the pay page reached the store five minutes late, or never,
		// and the footer spun for the whole 180 s flow budget.
		const { setFrameStatus } = renderFrame();
		expect(webViewMounts).toBe(1);

		act(() => {
			jest.advanceTimersByTime(PAYMENT_FRAME_LOAD_TIMEOUT_MS);
		});
		expect(webViewMounts).toBe(2);
		expect(setFrameStatus).not.toHaveBeenCalledWith('failed');
		expect(setFrameStatus).toHaveBeenLastCalledWith('loading');

		act(() => {
			jest.advanceTimersByTime(PAYMENT_FRAME_LOAD_TIMEOUT_MS);
		});
		expect(webViewMounts).toBe(2);
		expect(setFrameStatus).toHaveBeenLastCalledWith('stalled');
	});

	it('does not watch a frame that has no payment link — there is no navigation to time', () => {
		const setFrameStatus = jest.fn();
		const order = {
			uuid: 'uuid-42',
			payload: { id: 42, number: '42', status: 'pos-open', links: {}, line_items: [] },
			getLatest: () => order,
		};
		render(
			<PaymentWebview
				order={order as never}
				setLoading={jest.fn()}
				setFrameStatus={setFrameStatus}
				onStockRejection={() => false}
			/>
		);
		expect(webViewMounts).toBe(0);

		act(() => {
			jest.advanceTimersByTime(PAYMENT_FRAME_LOAD_TIMEOUT_MS * 3);
		});
		expect(webViewMounts).toBe(0);
		expect(setFrameStatus).not.toHaveBeenCalledWith('stalled');
		expect(setFrameStatus).not.toHaveBeenCalledWith('failed');
	});

	it('an error on the first document is a stall (retryable); on a later navigation it is a failure', () => {
		const { setFrameStatus } = renderFrame();

		act(() => {
			webViewProps.onError({ nativeEvent: { code: -1001, description: 'timed out' } });
		});
		expect(setFrameStatus).toHaveBeenLastCalledWith('stalled');

		// The document loads on the reload; the gateway's redirect then errors.
		act(() => {
			webViewProps.onLoad({});
		});
		act(() => {
			webViewProps.onLoadStart();
			webViewProps.onError({ nativeEvent: { code: -1009, description: 'offline' } });
		});
		expect(setFrameStatus).toHaveBeenLastCalledWith('failed');
	});

	// react-native-webview 13.16.1 on Android (RNCWebViewClient.onReceivedError)
	// emits a FINISH before the error "to simulate" iOS, so `onLoad` fires for a
	// document that never loaded, then `onError`; the error page's history entry
	// then fires `onLoadStart` for the same URL (doUpdateVisitedHistory). Run
	// 38478468639 (Android phone, flow 04): net::ERR_SOCKET_NOT_CONNECTED on the
	// pay page left Process Payment spinning with no Retry for 8 minutes.
	describe('Android: a load that ends in an error', () => {
		const PAY_URL = 'https://shop.example.com/wcpos-checkout/order-pay/42?token=jwt-token';
		const failedNavigation = (url: string) => {
			act(() => {
				webViewProps.onLoad({ nativeEvent: { url, loading: false } });
			});
			act(() => {
				webViewProps.onError({
					nativeEvent: { url, code: -6, description: 'net::ERR_SOCKET_NOT_CONNECTED' },
				});
			});
			act(() => {
				webViewProps.onLoadStart({ nativeEvent: { url } });
			});
		};

		it('on the first document is a stall the cashier can retry, not a spinner', () => {
			const { setFrameStatus, rerender } = renderFrame();

			failedNavigation(PAY_URL);

			expect(setFrameStatus).toHaveBeenLastCalledWith('stalled');

			// The cashier's Retry is a fresh navigation that loads.
			rerender(
				<PaymentWebview
					order={makeOrder()}
					setLoading={jest.fn()}
					setFrameStatus={setFrameStatus}
					onStockRejection={() => false}
					retryToken={1}
				/>
			);
			expect(setFrameStatus).toHaveBeenLastCalledWith('loading');
			act(() => {
				webViewProps.onLoad({ nativeEvent: { url: PAY_URL, loading: false } });
			});
			expect(setFrameStatus).toHaveBeenLastCalledWith('ready');
		});

		it('on a later navigation is a failure, not a spinner, and offers no reload', () => {
			const { setFrameStatus } = renderFrame();
			act(() => {
				webViewProps.onLoad({ nativeEvent: { url: PAY_URL, loading: false } });
			});
			expect(setFrameStatus).toHaveBeenLastCalledWith('ready');

			// Android sends no load-start before a navigation fails (it comes from
			// the history update): the synthetic finish and the error arrive first.
			const gateway = 'https://gateway.example.com/hosted/abc';
			failedNavigation(gateway);

			expect(setFrameStatus).toHaveBeenLastCalledWith('failed');
			act(() => {
				jest.advanceTimersByTime(PAYMENT_FRAME_LOAD_TIMEOUT_MS * 3);
			});
			expect(webViewMounts).toBe(1);
			expect(setFrameStatus).toHaveBeenLastCalledWith('failed');
		});
	});

	// iOS (WKWebView) and web (<iframe>) never fire `onLoad` for a failed document,
	// so the Android fix must leave their sequences exactly as they were.
	describe('iOS and web sequences are unchanged', () => {
		it('iOS: a first-document error is a stall; a loaded document then gates ready', () => {
			const { setFrameStatus } = renderFrame();
			const url = 'https://shop.example.com/wcpos-checkout/order-pay/42?token=jwt-token';
			act(() => {
				webViewProps.onLoadStart({ nativeEvent: { url } });
				webViewProps.onError({ nativeEvent: { url, code: -1009, description: 'offline' } });
			});
			expect(setFrameStatus.mock.calls.map(([status]) => status)).toEqual([
				'loading',
				'loading',
				'stalled',
			]);
		});

		it('iOS: a new navigation after a failed redirect re-gates the frame', () => {
			const { setFrameStatus } = renderFrame();
			act(() => {
				webViewProps.onLoad({ nativeEvent: { url: 'https://shop.example.com/pay' } });
			});
			act(() => {
				webViewProps.onLoadStart({ nativeEvent: { url: 'https://gateway.example.com/a' } });
				webViewProps.onError({
					nativeEvent: { url: 'https://gateway.example.com/a', code: -1009, description: 'x' },
				});
			});
			expect(setFrameStatus).toHaveBeenLastCalledWith('failed');
			act(() => {
				webViewProps.onLoadStart({ nativeEvent: { url: 'https://shop.example.com/received' } });
			});
			expect(setFrameStatus).toHaveBeenLastCalledWith('loading');
			act(() => {
				webViewProps.onLoad({ nativeEvent: { url: 'https://shop.example.com/received' } });
			});
			expect(setFrameStatus).toHaveBeenLastCalledWith('ready');
		});

		it('iOS: a form post back to the loaded URL that errors stays a failure, never a Retry', () => {
			// The pay page loaded, the cashier pressed, the order-pay form POSTed back
			// to its own URL and that navigation failed: a sale may be paid, so the
			// load-start in between must keep the earlier load counted.
			const { setFrameStatus } = renderFrame();
			const pay = 'https://shop.example.com/wcpos-checkout/order-pay/42?token=jwt-token';
			act(() => {
				webViewProps.onLoad({ nativeEvent: { url: pay } });
			});
			act(() => {
				webViewProps.onLoadStart({ nativeEvent: { url: pay } });
				webViewProps.onError({ nativeEvent: { url: pay, code: -1005, description: 'lost' } });
			});
			expect(setFrameStatus).toHaveBeenLastCalledWith('failed');
			act(() => {
				jest.advanceTimersByTime(PAYMENT_FRAME_LOAD_TIMEOUT_MS * 3);
			});
			expect(webViewMounts).toBe(1);
			expect(setFrameStatus).toHaveBeenLastCalledWith('failed');
		});

		it('a load after an error clears it: a later navigation to that URL re-gates the frame', () => {
			const { setFrameStatus } = renderFrame();
			const url = 'https://shop.example.com/wcpos-checkout/order-pay/42?token=jwt-token';
			act(() => {
				webViewProps.onError({ nativeEvent: { url, code: -1009, description: 'offline' } });
			});
			act(() => {
				webViewProps.onLoad({ nativeEvent: { url } });
			});
			expect(setFrameStatus).toHaveBeenLastCalledWith('ready');
			act(() => {
				webViewProps.onLoadStart({ nativeEvent: { url } });
			});
			expect(setFrameStatus).toHaveBeenLastCalledWith('loading');
		});

		it('web: an iframe error after a load stays a failure (the iframe names no URL)', () => {
			const { setFrameStatus } = renderFrame();
			act(() => {
				webViewProps.onLoad({});
			});
			act(() => {
				webViewProps.onError({});
			});
			expect(setFrameStatus).toHaveBeenLastCalledWith('failed');
		});

		it('iOS: an error naming another URL than the loaded document stays a failure', () => {
			const { setFrameStatus } = renderFrame();
			act(() => {
				webViewProps.onLoad({ nativeEvent: { url: 'https://shop.example.com/pay' } });
			});
			act(() => {
				webViewProps.onError({
					nativeEvent: { url: 'https://gateway.example.com/a', code: -1009, description: 'x' },
				});
			});
			expect(setFrameStatus).toHaveBeenLastCalledWith('failed');
		});

		it('web: an iframe load with no navigation events still gates ready', () => {
			const { setFrameStatus } = renderFrame();
			act(() => {
				webViewProps.onLoad({});
			});
			expect(setFrameStatus.mock.calls.map(([status]) => status)).toEqual(['loading', 'ready']);
		});
	});

	it('a load event before the deadline disarms the watchdog', () => {
		const { setFrameStatus } = renderFrame();

		act(() => {
			webViewProps.onLoad({});
		});
		expect(setFrameStatus).toHaveBeenLastCalledWith('ready');

		act(() => {
			jest.advanceTimersByTime(PAYMENT_FRAME_LOAD_TIMEOUT_MS * 3);
		});
		expect(webViewMounts).toBe(1);
		expect(setFrameStatus).not.toHaveBeenCalledWith('stalled');
	});

	it("the cashier's Retry remounts the frame, re-gates it, and reports a second stall", () => {
		const { setFrameStatus, rerender } = renderFrame();
		// One deadline per act: the reload's re-arm is a render, and React flushes
		// it when the act ends, not between two timers advanced in one go.
		act(() => {
			jest.advanceTimersByTime(PAYMENT_FRAME_LOAD_TIMEOUT_MS);
		});
		act(() => {
			jest.advanceTimersByTime(PAYMENT_FRAME_LOAD_TIMEOUT_MS);
		});
		expect(setFrameStatus).toHaveBeenLastCalledWith('stalled');
		expect(webViewMounts).toBe(2);

		rerender(
			<PaymentWebview
				order={makeOrder()}
				setLoading={jest.fn()}
				setFrameStatus={setFrameStatus}
				onStockRejection={() => false}
				retryToken={1}
			/>
		);
		expect(webViewMounts).toBe(3);
		expect(setFrameStatus).toHaveBeenLastCalledWith('loading');

		// The retry is the attempt: a stall now is reported, not reloaded again quietly.
		act(() => {
			jest.advanceTimersByTime(PAYMENT_FRAME_LOAD_TIMEOUT_MS);
		});
		expect(webViewMounts).toBe(3);
		expect(setFrameStatus).toHaveBeenLastCalledWith('stalled');
	});
});

describe('PaymentWebview fallback order refresh', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		resetCheckoutMode();
		jest.useRealTimers();
		webViewProps = {};
		autoShowReceipt = false;
		mockEngineRequire.mockReturnValue({ ready: Promise.resolve(), release: jest.fn() });
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
		expect(mockDismissTo).not.toHaveBeenCalled();
	});

	it('stage host fallback poll success enters the receipt without routing', async () => {
		jest.useFakeTimers();
		autoShowReceipt = true;
		const serverOrder = {
			id: 42,
			status: 'completed',
			number: '42',
			meta_data: [{ key: '_woocommerce_pos_uuid', value: ORDER_UUID }],
			line_items: [],
		};
		mockGet.mockResolvedValue({ data: [serverOrder] });
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
			webViewProps.onLoad({});
			webViewProps.onLoad({});
			await jest.advanceTimersByTimeAsync(1000);
		});
		expect(mockAdoptOrderSnapshot).toHaveBeenCalledWith(serverOrder);
		expect(getCheckoutModeSnapshot().receiptOrders.has('uuid-42')).toBe(true);
		expect(mockReplace).not.toHaveBeenCalled();
		expect(mockDismissTo).not.toHaveBeenCalled();
		expect(mockSetCurrentOrderID).not.toHaveBeenCalledWith('');
	});

	it('stage host fallback poll success without auto-show leaves checkout and clears the current order, without routing', async () => {
		jest.useFakeTimers();
		autoShowReceipt = false;
		enterCheckout('uuid-42');
		const serverOrder = {
			id: 42,
			status: 'completed',
			number: '42',
			meta_data: [{ key: '_woocommerce_pos_uuid', value: ORDER_UUID }],
			line_items: [],
		};
		mockGet.mockResolvedValue({ data: [serverOrder] });
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
			webViewProps.onLoad({});
			webViewProps.onLoad({});
			await jest.advanceTimersByTimeAsync(1000);
		});
		expect(mockAdoptOrderSnapshot).toHaveBeenCalledWith(serverOrder);
		expect(getCheckoutModeSnapshot().checkoutOrders.has('uuid-42')).toBe(false);
		expect(getCheckoutModeSnapshot().receiptOrders.has('uuid-42')).toBe(false);
		expect(mockSetCurrentOrderID).toHaveBeenCalledWith('');
		expect(mockReplace).not.toHaveBeenCalled();
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

		expect(logger.warn).toHaveBeenCalled();
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
			expect(mockReplace).toHaveBeenCalledTimes(1);
		}
	);

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

	it('does not log a payment-gateway error when the fallback server probe fails', async () => {
		jest.useFakeTimers();
		mockGet.mockRejectedValue(new Error('Request failed with status code 404'));
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
			webViewProps.onLoad({}); // initial order-pay load — gated, no poll
			webViewProps.onLoad({}); // post-payment navigation — schedules the poll
			await jest.advanceTimersByTimeAsync(1000);
		});

		expect(mockGet).toHaveBeenCalledWith('orders', { params: { include: 42, per_page: 1 } });
		// The probe failed before any local catch-up was warranted.
		expect(mockEngineRequire).not.toHaveBeenCalled();
		// The regression: a failed safety-net poll must NOT be raised as an error
		// (which is what surfaced the spurious PY02001 payment-gateway error).
		expect(logger.error).not.toHaveBeenCalled();
		expect(logger.debug).toHaveBeenCalled();
	});

	it('stays quiet when the fallback server status still matches the local status', async () => {
		jest.useFakeTimers();
		mockGet.mockResolvedValue({
			data: [{ status: 'pos-open', number: '42', line_items: [] }],
		});
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
			webViewProps.onLoad({});
			webViewProps.onLoad({});
			await jest.advanceTimersByTimeAsync(1000);
		});

		expect(mockGet).toHaveBeenCalledWith('orders', { params: { include: 42, per_page: 1 } });
		expect(logger.error).not.toHaveBeenCalled();
		expect(logger.success).not.toHaveBeenCalled();
		expect(mockEngineRequire).not.toHaveBeenCalled();
		expect(mockReplace).not.toHaveBeenCalled();
	});

	it.each(['pending', 'failed', 'cancelled'])(
		'does not complete checkout when the fallback server status is %s',
		async (status) => {
			jest.useFakeTimers();
			mockGet.mockResolvedValue({
				data: [
					{
						id: 42,
						status,
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

			expect(mockAdoptOrderSnapshot).not.toHaveBeenCalled();
			expect(mockStockAdjustment).not.toHaveBeenCalled();
			expect(mockSetCurrentOrderID).not.toHaveBeenCalled();
			expect(mockReplace).not.toHaveBeenCalled();
		}
	);

	it.each(['on-hold', 'processing', 'completed', 'custom-gateway-status'])(
		'completes checkout when the fallback server status is the paid status %s',
		async (status) => {
			// A cheque/BACS gateway configured through POS settings lands on on-hold, and
			// a gateway can be configured to land on any custom status. The paid check is a
			// blocklist of unpaid statuses (mirroring the store's needs_payment() gate) —
			// an allowlist of processing/completed would strand these sales as open carts.
			jest.useFakeTimers();
			const serverOrder = {
				id: 42,
				status,
				number: '42',
				meta_data: [{ key: '_woocommerce_pos_uuid', value: ORDER_UUID }],
				line_items: [],
			};
			mockGet.mockResolvedValue({ data: [serverOrder] });

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

			expect(mockAdoptOrderSnapshot).toHaveBeenCalledWith(serverOrder);
			expect(mockSetCurrentOrderID).toHaveBeenCalledWith('');
			expect(mockReplace).toHaveBeenCalledWith({ pathname: '/cart' });
		}
	);

	it('keeps polling after an early unpaid answer and completes when the webhook lands', async () => {
		// The reviewer scenario: a pre-hardening store posts `pending`, the one-shot
		// poll sees "still unpaid", and the provider's webhook confirms a minute
		// later. Without a re-poll nothing ever noticed — the paid order stayed an
		// open cart, the original bug through a new door.
		jest.useFakeTimers();
		const paidOrder = {
			id: 42,
			status: 'completed',
			number: '42',
			meta_data: [{ key: '_woocommerce_pos_uuid', value: ORDER_UUID }],
			line_items: [],
		};
		mockGet
			.mockResolvedValueOnce({ data: [{ ...paidOrder, status: 'pending' }] })
			.mockResolvedValueOnce({ data: [{ ...paidOrder, status: 'pending' }] })
			.mockResolvedValue({ data: [paidOrder] });

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
						payload: { ...paidOrder, status: 'pending' },
					},
				},
			});
			await Promise.resolve();
		});
		expect(mockGet).toHaveBeenCalledTimes(1);
		expect(mockReplace).not.toHaveBeenCalled();

		// Two cadence ticks: still pending, then the webhook has landed.
		await act(async () => {
			await jest.advanceTimersByTimeAsync(3_000);
		});
		expect(mockGet).toHaveBeenCalledTimes(2);
		expect(mockReplace).not.toHaveBeenCalled();

		await act(async () => {
			await jest.advanceTimersByTimeAsync(3_000);
		});
		expect(mockGet).toHaveBeenCalledTimes(3);
		expect(mockAdoptOrderSnapshot).toHaveBeenCalledWith(paidOrder);
		expect(mockSetCurrentOrderID).toHaveBeenCalledWith('');
		expect(mockReplace).toHaveBeenCalledTimes(1);

		// Settled: no further polls.
		await act(async () => {
			await jest.advanceTimersByTimeAsync(30_000);
		});
		expect(mockGet).toHaveBeenCalledTimes(3);
	});

	it('stops re-polling at the async window bound and leaves the cart open', async () => {
		jest.useFakeTimers();
		mockGet.mockResolvedValue({
			data: [{ id: 42, status: 'pending', number: '42', line_items: [] }],
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
			await jest.advanceTimersByTimeAsync(1_000);
		});
		expect(mockGet).toHaveBeenCalledTimes(1);

		// Well past the 120 s window: polling has ceased rather than run forever.
		await act(async () => {
			await jest.advanceTimersByTimeAsync(300_000);
		});
		const callsAtBound = mockGet.mock.calls.length;
		expect(callsAtBound).toBeGreaterThan(1);
		expect(callsAtBound).toBeLessThanOrEqual(1 + 120_000 / 3_000);

		await act(async () => {
			await jest.advanceTimersByTimeAsync(60_000);
		});
		expect(mockGet).toHaveBeenCalledTimes(callsAtBound);
		expect(mockReplace).not.toHaveBeenCalled();
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

		expect(logger.warn).toHaveBeenCalled();
		expect(logger.success).not.toHaveBeenCalled();
		expect(setLoading).toHaveBeenCalledWith(false);
		expect(mockReplace).not.toHaveBeenCalled();
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
		expect(mockReplace).toHaveBeenCalledTimes(1);
	});

	it.each(['completed', 'processing'])(
		'routes on %s SERVER truth even when the local document never updates',
		async (status) => {
			// The review scenario: an engine require can settle without applying a
			// newer revision (skip-coalesced resident task, dirty-row protection) —
			// the local doc stays pos-open forever. The decision must come from the
			// direct server probe, with the engine refresh as best-effort catch-up.
			jest.useFakeTimers();
			mockGet.mockResolvedValue({
				data: [
					{
						id: 42,
						status,
						number: '42',
						meta_data: [{ key: '_woocommerce_pos_uuid', value: ORDER_UUID }],
						line_items: [],
					},
				],
			});
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
				webViewProps.onLoad({});
				webViewProps.onLoad({});
				await jest.advanceTimersByTimeAsync(1000);
			});

			expect(mockGet).toHaveBeenCalledWith('orders', { params: { include: 42, per_page: 1 } });
			expect(mockAdoptOrderSnapshot).toHaveBeenCalledWith({
				id: 42,
				status,
				number: '42',
				meta_data: [{ key: '_woocommerce_pos_uuid', value: ORDER_UUID }],
				line_items: [],
			});
			expect(mockEngineRequire).toHaveBeenCalledTimes(1); // best-effort local catch-up
			expect(logger.error).not.toHaveBeenCalled();
			expect(mockSetCurrentOrderID).toHaveBeenCalledWith('');
			expect(mockReplace).toHaveBeenCalledWith({ pathname: '/cart' });
		}
	);
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
		mockEngineRequire.mockReturnValue({ ready: Promise.resolve(), release: jest.fn() });
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

	describe('isSettledOrderStatus', () => {
		it.each(['processing', 'completed', 'on-hold', 'invoiced'])(
			'treats %s as settled with no stored status (the blocklist it always was)',
			(status) => {
				expect(isSettledOrderStatus(status, null)).toBe(true);
				expect(isSettledOrderStatus(status, undefined)).toBe(true);
			}
		);

		it.each(['pending', 'failed', 'cancelled'])(
			'treats %s as unpaid with no stored status',
			(status) => {
				expect(isSettledOrderStatus(status, null)).toBe(false);
				expect(isSettledOrderStatus(status, undefined)).toBe(false);
			}
		);

		it('treats an unpaid status as settled only when it is the stored status', () => {
			expect(isSettledOrderStatus('pending', 'pending')).toBe(true);
			expect(isSettledOrderStatus('pending', 'completed')).toBe(false);
			expect(isSettledOrderStatus('failed', 'pending')).toBe(false);
		});

		it.each(['pos-open', 'pos-partial', 'failed', 'cancelled'])(
			'never settles %s, even when it is the stored status',
			(status) => {
				// The settings picker offers every registered status; a stored `failed`
				// must not turn a failed payment into a finished sale.
				expect(isSettledOrderStatus(status, status)).toBe(false);
				expect(isSettledOrderStatus(status, null)).toBe(false);
			}
		);
	});

	it('completes from the fallback poll when background sync already moved the local order to the stored status', async () => {
		// Sync can apply the server's `pending` to the local document before the poll
		// runs. The order is settled, but nothing has routed the cashier off the pay
		// window; the poll must still read server truth and close the sale rather than
		// bail on "local status is not pos-open".
		const logger = getLogger(['wcpos', 'pos', 'checkout', 'payment']);
		const serverOrder = { ...pendingPayload, total: '75.00', payment_method: 'bacs' };
		mockGet.mockResolvedValue({ data: [serverOrder] });
		const localOrder = {
			uuid: 'uuid-42',
			payload: {
				id: 42,
				number: '42',
				status: 'pending',
				payment_method: 'bacs',
				links: { payment: [{ href: 'https://shop.example.com/wcpos-checkout/order-pay/42' }] },
				line_items: [],
			},
			getLatest: () => localOrder,
		};

		render(
			<PaymentWebview
				order={localOrder as never}
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

		expect(mockGet).toHaveBeenCalledTimes(1);
		expect(logger.success).toHaveBeenCalledTimes(1);
		expect(mockAdoptOrderSnapshot).toHaveBeenCalledWith(serverOrder);
		expect(mockSetCurrentOrderID).toHaveBeenCalledWith('');
		expect(mockReplace).toHaveBeenCalledWith({ pathname: '/cart' });
	});

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

		expect(logger.warn).toHaveBeenCalled();
		expect(logger.success).not.toHaveBeenCalled();
		expect(mockReplace).not.toHaveBeenCalled();
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
		expect(mockReplace).toHaveBeenCalledWith({ pathname: '/cart' });
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
		expect(mockReplace).toHaveBeenCalledWith({ pathname: '/cart' });
	});

	it('sees a gateway catalog that arrives after the poll has started', async () => {
		// The poll re-arms itself from the closure it started in. The catalog can
		// still be loading at that moment; a later tick must read the status that
		// arrived, or a pay-by-invoice sale never closes.
		jest.useFakeTimers();
		const serverOrder = { ...pendingPayload, total: '75.00' };
		mockGet.mockResolvedValue({ data: [serverOrder] });

		const { rerender } = render(
			<PaymentWebview
				order={makeOrder()}
				setLoading={jest.fn()}
				setFrameStatus={jest.fn()}
				onStockRejection={() => false}
				settledOrderStatuses={{}}
			/>
		);

		// Arms the poll with no catalog: pending reads as unpaid, so it re-arms.
		await postReceived({ not: 'an order' });
		await act(async () => {
			await Promise.resolve();
		});
		expect(mockGet).toHaveBeenCalledTimes(1);
		expect(mockReplace).not.toHaveBeenCalled();

		rerender(
			<PaymentWebview
				order={makeOrder()}
				setLoading={jest.fn()}
				setFrameStatus={jest.fn()}
				onStockRejection={() => false}
				settledOrderStatuses={{ bacs: 'pending' }}
			/>
		);

		await act(async () => {
			await jest.advanceTimersByTimeAsync(3_000);
		});
		expect(mockGet).toHaveBeenCalledTimes(2);
		expect(mockAdoptOrderSnapshot).toHaveBeenCalledWith(serverOrder);
		expect(mockReplace).toHaveBeenCalledTimes(1);
	});

	it('keeps polling a local pending order until the gateway catalog arrives, then completes', async () => {
		// Sync landed `pending` locally before the catalog loaded. Without a catalog
		// nothing says it is settled, but bailing would skip the re-arm, and the
		// catalog arriving later would find no poll to close the pay window.
		jest.useFakeTimers();
		const serverOrder = { ...pendingPayload, total: '75.00' };
		mockGet.mockResolvedValue({ data: [serverOrder] });
		const localOrder = {
			uuid: 'uuid-42',
			payload: {
				id: 42,
				number: '42',
				status: 'pending',
				payment_method: 'bacs',
				links: { payment: [{ href: 'https://shop.example.com/wcpos-checkout/order-pay/42' }] },
				line_items: [],
			},
			getLatest: () => localOrder,
		};
		const props = {
			order: localOrder as never,
			setLoading: jest.fn(),
			setFrameStatus: jest.fn(),
			onStockRejection: () => false,
		};

		const { rerender } = render(<PaymentWebview {...props} settledOrderStatuses={{}} />);

		await postReceived({ not: 'an order' });
		await act(async () => {
			await Promise.resolve();
		});
		expect(mockGet).toHaveBeenCalledTimes(1);
		expect(mockReplace).not.toHaveBeenCalled();

		// Still no catalog: the poll re-arms rather than giving up.
		await act(async () => {
			await jest.advanceTimersByTimeAsync(3_000);
		});
		expect(mockGet).toHaveBeenCalledTimes(2);
		expect(mockReplace).not.toHaveBeenCalled();

		rerender(<PaymentWebview {...props} settledOrderStatuses={{ bacs: 'pending' }} />);
		await act(async () => {
			await jest.advanceTimersByTimeAsync(3_000);
		});
		expect(mockGet).toHaveBeenCalledTimes(3);
		expect(mockAdoptOrderSnapshot).toHaveBeenCalledWith(serverOrder);
		expect(mockReplace).toHaveBeenCalledTimes(1);
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
		expect(mockReplace).toHaveBeenCalledTimes(1);

		await postReceived(pendingPayload);

		expect(mockReplace).toHaveBeenCalledTimes(1);
		expect(mockAdoptOrderSnapshot).toHaveBeenCalledTimes(1);
	});

	it('does not navigate or re-arm after the modal has unmounted', async () => {
		jest.useFakeTimers();
		let resolveGet: (value: unknown) => void = () => {};
		mockGet.mockReturnValue(
			new Promise((resolve) => {
				resolveGet = resolve;
			})
		);

		const { unmount } = render(
			<PaymentWebview
				order={makeOrder()}
				setLoading={jest.fn()}
				setFrameStatus={jest.fn()}
				onStockRejection={() => false}
				settledOrderStatuses={{ bacs: 'pending' }}
			/>
		);

		await postReceived({ not: 'an order' });
		expect(mockGet).toHaveBeenCalledTimes(1);
		unmount();

		await act(async () => {
			resolveGet({ data: [{ ...pendingPayload, total: '75.00' }] });
			await Promise.resolve();
			await Promise.resolve();
		});
		await act(async () => {
			await jest.advanceTimersByTimeAsync(10_000);
		});

		expect(mockReplace).not.toHaveBeenCalled();
		expect(mockGet).toHaveBeenCalledTimes(1);
	});

	it('still ignores a local order that is not open and not settled', async () => {
		// A partial tender locally: still owed money, not this poll's to close —
		// exactly as before.
		mockGet.mockResolvedValue({ data: [{ ...pendingPayload, status: 'pos-partial' }] });
		const localOrder = {
			uuid: 'uuid-42',
			payload: {
				id: 42,
				number: '42',
				status: 'pos-partial',
				links: { payment: [{ href: 'https://shop.example.com/wcpos-checkout/order-pay/42' }] },
				line_items: [],
			},
			getLatest: () => localOrder,
		};

		render(
			<PaymentWebview
				order={localOrder as never}
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

		expect(mockGet).not.toHaveBeenCalled();
		expect(mockReplace).not.toHaveBeenCalled();
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
		expect(mockReplace).toHaveBeenCalledWith({ pathname: '/cart' });
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

		expect(logger.warn).toHaveBeenCalled();
		expect(logger.success).not.toHaveBeenCalled();
		expect(mockReplace).not.toHaveBeenCalled();
		expect(mockAdoptOrderSnapshot).not.toHaveBeenCalled();
		expect(mockGet).toHaveBeenCalledWith('orders', { params: { include: 42, per_page: 1 } });
	});

	it("completes a pending sale from the fallback poll when pending is the gateway's stored status", async () => {
		// A hardened store emits nothing it does not call paid, so the only signal is
		// the poll: server truth says pending, and pending is what the merchant chose.
		const logger = getLogger(['wcpos', 'pos', 'checkout', 'payment']);
		const serverOrder = { ...pendingPayload, total: '75.00', payment_method: 'bacs' };
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

		// A malformed message arms the poll immediately, with no timer to advance.
		await postReceived({ not: 'an order' });
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
		});

		expect(mockGet).toHaveBeenCalledTimes(1);
		expect(logger.success).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				context: expect.objectContaining({ status: 'pending', source: 'fallback-refresh' }),
			})
		);
		expect(mockAdoptOrderSnapshot).toHaveBeenCalledWith(serverOrder);
		expect(mockSetCurrentOrderID).toHaveBeenCalledWith('');
		expect(mockReplace).toHaveBeenCalledWith({ pathname: '/cart' });
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
		expect(mockGet).not.toHaveBeenCalled();
	});

	it("stage host: the fallback poll's pending read on the gateway's stored status reaches finishSale as completed", async () => {
		// The message case above covers the outcome handed over by
		// handlePaymentReceived; pollServerTruth builds its own outcome from server
		// truth, and that one has to carry the stored status too. No received
		// message here: the second frame load arms the poll, the poll reads the
		// order at the stored status, and the same downstream facts must follow.
		jest.useFakeTimers();
		autoShowReceipt = true;
		const serverOrder = { ...pendingPayload, total: '75.00' };
		mockGet.mockResolvedValue({ data: [serverOrder] });

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

		await act(async () => {
			webViewProps.onLoad({});
			webViewProps.onLoad({});
			await jest.advanceTimersByTimeAsync(1000);
		});

		// The poll was the completion path.
		expect(mockGet).toHaveBeenCalledTimes(1);
		expect(mockGet).toHaveBeenCalledWith('orders', { params: { include: 42, per_page: 1 } });
		expect(mockAdoptOrderSnapshot).toHaveBeenCalledWith(serverOrder);
		await waitFor(() => expect(mockStockAdjustment).toHaveBeenCalledTimes(1));
		expect(getCheckoutModeSnapshot().receiptOrders.has('uuid-42')).toBe(true);
		expect(getCheckoutModeSnapshot().selectedReceiptOrder).toBe('uuid-42');
		expect(mockReplace).not.toHaveBeenCalled();
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

		expect(logger.warn).toHaveBeenCalled();
		expect(logger.success).not.toHaveBeenCalled();
		expect(mockReplace).not.toHaveBeenCalled();
		expect(mockAdoptOrderSnapshot).not.toHaveBeenCalled();
	});
});

/**
 * The app posts `wcpos-process-payment` fire-and-forget, with no ack and no
 * retry — so the checkout footer has to know when the store document is there
 * to receive it. The frame's load event is the strongest readiness signal
 * either platform exposes (#1024 follow-up).
 */
describe('PaymentWebview frame-status signal', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		jest.useRealTimers();
		webViewProps = {};
		autoShowReceipt = false;
		mockEngineRequire.mockReturnValue({ ready: Promise.resolve(), release: jest.fn() });
	});

	it('reports the frame as loading on mount, then ready on the load event', async () => {
		const setFrameStatus = jest.fn();

		render(
			<PaymentWebview
				order={makeOrder()}
				setLoading={jest.fn()}
				setFrameStatus={setFrameStatus}
				onStockRejection={() => false}
			/>
		);

		expect(setFrameStatus).toHaveBeenCalledWith('loading');
		expect(setFrameStatus).not.toHaveBeenCalledWith('ready');

		await act(async () => {
			webViewProps.onLoad({});
		});

		expect(setFrameStatus).toHaveBeenLastCalledWith('ready');
	});

	it('re-gates when the frame starts navigating away from the order-pay page', async () => {
		const setFrameStatus = jest.fn();

		render(
			<PaymentWebview
				order={makeOrder()}
				setLoading={jest.fn()}
				setFrameStatus={setFrameStatus}
				onStockRejection={() => false}
			/>
		);

		await act(async () => {
			webViewProps.onLoad({});
		});
		expect(setFrameStatus).toHaveBeenLastCalledWith('ready');

		// A gateway redirect swaps the document under the frame; the new one has no
		// `wcpos-process-payment` listener until it, too, has loaded.
		await act(async () => {
			webViewProps.onLoadStart({});
		});

		expect(setFrameStatus).toHaveBeenLastCalledWith('loading');
	});

	it('re-gates when the payment URL changes', async () => {
		const setFrameStatus = jest.fn();

		const { rerender } = render(
			<PaymentWebview
				order={makeOrder()}
				setLoading={jest.fn()}
				setFrameStatus={setFrameStatus}
				onStockRejection={() => false}
			/>
		);

		await act(async () => {
			webViewProps.onLoad({});
		});
		expect(setFrameStatus).toHaveBeenLastCalledWith('ready');

		await act(async () => {
			rerender(
				<PaymentWebview
					order={makeOrder('https://shop.example.com/wcpos-checkout/order-pay/43')}
					setLoading={jest.fn()}
					setFrameStatus={setFrameStatus}
					onStockRejection={() => false}
				/>
			);
		});

		expect(setFrameStatus).toHaveBeenLastCalledWith('loading');
	});

	it('re-gates on unmount so a remounted frame never starts enabled', async () => {
		const setFrameStatus = jest.fn();

		const { unmount } = render(
			<PaymentWebview
				order={makeOrder()}
				setLoading={jest.fn()}
				setFrameStatus={setFrameStatus}
				onStockRejection={() => false}
			/>
		);

		await act(async () => {
			webViewProps.onLoad({});
		});
		expect(setFrameStatus).toHaveBeenLastCalledWith('ready');

		await act(async () => {
			unmount();
		});

		expect(setFrameStatus).toHaveBeenLastCalledWith('loading');
	});

	it('reports a failed load instead of waiting for a load event that will never arrive', async () => {
		const setFrameStatus = jest.fn();

		render(
			<PaymentWebview
				order={makeOrder()}
				setLoading={jest.fn()}
				setFrameStatus={setFrameStatus}
				onStockRejection={() => false}
			/>
		);

		await act(async () => {
			webViewProps.onLoadStart({});
			webViewProps.onError({ nativeEvent: { description: 'net::ERR_NAME_NOT_RESOLVED' } });
		});

		// Without this the gate would close on load start and never reopen, leaving
		// the cashier with a button that spins forever — the exact failure the gate
		// exists to prevent, moved one step earlier.
		// On the FIRST document the error is a stall: nothing was posted, so the
		// checkout may offer a retry that navigates to the pay page again.
		expect(setFrameStatus).toHaveBeenLastCalledWith('stalled');
	});
});

it("journals the whole stored-status catalog at commit, not the opened gateway's entry", async () => {
	// The commit runs before the pay page opens, so the order still carries the gateway
	// the sale was OPENED with (pos_cash here); the pay page can settle through another
	// (bacs). Replay looks the status up for the gateway the resident order comes back
	// carrying, so the journal must hold every gateway's entry (#2475 review).
	jest.clearAllMocks();
	mockOnlineStatus = 'online-website-available';
	const order = makeOrder();
	(order as unknown as { payload: Record<string, unknown> }).payload.payment_method = 'pos_cash';
	mockLocalPatch.mockResolvedValue(order);
	mockPushDocument.mockResolvedValue(undefined);
	const catalog = { pos_cash: null, bacs: 'pending' };

	render(
		<PaymentWebview
			order={order}
			setLoading={jest.fn()}
			setFrameStatus={jest.fn()}
			onStockRejection={() => false}
			settledOrderStatuses={catalog}
		/>
	);

	await waitFor(() => expect(recordCompletionAttempt).toHaveBeenCalledTimes(1));
	const [, facts] = jest.mocked(recordCompletionAttempt).mock.calls[0];
	expect(facts).toMatchObject({
		orderUuid: 'uuid-42',
		source: 'gateway-snapshot',
		settledOrderStatuses: catalog,
	});
	expect(facts).not.toHaveProperty('settledOrderStatus');
});

it.each([false, true])(
	'awaits provenance before opening online webview (save fails: %s)',
	async (fails) => {
		jest.clearAllMocks();
		mockOnlineStatus = 'online-website-available';
		webViewMounts = 0;
		const order = makeOrder();
		mockLocalPatch.mockResolvedValue(order);
		let finish!: () => void;
		mockPushDocument.mockImplementationOnce(
			() =>
				new Promise<void>((resolve, reject) => {
					finish = () => (fails ? reject(new Error('save failed')) : resolve());
				})
		);
		const view = render(
			<PaymentWebview
				order={order}
				setLoading={jest.fn()}
				setFrameStatus={jest.fn()}
				onStockRejection={() => false}
			/>
		);
		try {
			await act(async () => {});
			expect(mockLocalPatch).toHaveBeenLastCalledWith({
				document: order,
				data: { meta_data: [{ key: '_wcpos_sale_counter', value: '1' }] },
			});
			expect(mockPushDocument).toHaveBeenLastCalledWith(order);
			expect(jest.mocked(recordCompletionAttempt).mock.invocationCallOrder[0]).toBeLessThan(
				mockLocalPatch.mock.invocationCallOrder[0]
			);
			expect(webViewMounts).toBe(0);
			await act(async () => finish());
			expect(webViewMounts).toBe(fails ? 0 : 1);
			expect(mockPushDocument).toHaveBeenCalledTimes(1);
			if (fails) {
				mockOnlineStatus = 'offline';
				view.rerender(
					<PaymentWebview
						order={order}
						setLoading={jest.fn()}
						setFrameStatus={jest.fn()}
						onStockRejection={() => false}
					/>
				);
				expect(webViewMounts).toBe(0);
			}
		} finally {
			view.unmount();
			mockOnlineStatus = 'offline';
		}
	}
);

describe('PaymentWebview register gate', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		webViewProps = {};
		mockOnlineStatus = 'online-website-available';
		mockLocalPatch.mockResolvedValue(true);
	});
	afterEach(() => {
		mockBindingStatus = 'bound';
		mockOnlineStatus = 'offline';
	});
	it('does not expose the pay page while a register is still to be chosen', async () => {
		mockBindingStatus = 'choose';
		const setFrameStatus = jest.fn();
		render(
			<PaymentWebview
				order={makeOrder()}
				setLoading={jest.fn()}
				setFrameStatus={setFrameStatus}
				onStockRejection={() => false}
				retryToken={0}
			/>
		);
		await waitFor(() => expect(setFrameStatus).toHaveBeenCalledWith('stalled'));
		// The pay page completes the whole balance: no provenance write, no URL.
		expect(mockLocalPatch).not.toHaveBeenCalled();
		expect(webViewProps.src).toBeUndefined();
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
	};
});

jest.mock('../commit-gateway-sale', () => {
	const actual =
		jest.requireActual<typeof import('../commit-gateway-sale')>('../commit-gateway-sale');
	return { ...actual, commitGatewaySale: jest.fn(actual.commitGatewaySale) };
});

const mockRegisterDB = {
	getLocal: async () =>
		mockRegisterId
			? {
					toJSON: () => ({
						data: { sites: { site: { register_id: mockRegisterId, register_store_id: 1 } } },
					}),
				}
			: null,
};
jest.mock('../hooks/use-sale-context', () => ({
	useSaleContext: () => ({
		actionActor: { userId: 7, registerId: mockRegisterId, sessionId: null },
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
				// The session gate reads the bound register and its open session the way the app does.
				resolveSession: async () => {
					const { readBoundRegister } = jest.requireActual<
						typeof import('../../../../../services/register/register-document')
					>('../../../../../services/register/register-document');
					const { findOpenSession } = jest.requireActual<
						typeof import('../../../../../services/register-session/session-store')
					>('../../../../../services/register-session/session-store');
					const registerId =
						(await readBoundRegister(mockRegisterDB as never, 'site', 1))?.id ?? null;
					const session = await findOpenSession(mockSessions as never, registerId, mockSessionsOn);
					return { registerId, sessionId: session?.id ?? null };
				},
			}),
		userDB: mockRegisterDB,
		sessionsOn: mockSessionsOn,
		sessions: mockSessions,
		siteUuid: 'site',
		storeId: 1,
		runtime: { engine: { require: mockEngineRequire } },
		dp: 2,
		localPatch: mockLocalPatch,
		pushDocument: mockPushDocument,
		stockAdjustment: mockStockAdjustment,
	}),
}));

jest.mock('../../../../../contexts/theme', () => ({ useTheme: () => ({ screenSize: 'lg' }) }));

jest.mock('../../contexts/current-order/context', () => ({
	useCurrentOrderActions: () => ({ setCurrentOrderID: mockSetCurrentOrderID }),
}));

// Journal storage is exercised against RxDB in the owner/journal suites.
jest.mock('../completion-journal', () => ({
	recordCompletionAttempt: jest.fn(async () => {}),
	resolveCompletionAttempt: jest.fn(async () => {}),
	failCompletionAttempt: jest.fn(async () => {}),
}));

let mockSessionsOn = false;
const mockOpenSession = new BehaviorSubject<{ id: string; status?: string } | null>(null);
const mockSessions = { findOne: jest.fn() };
type SessionFixture = {
	id: string;
	register_id: string;
	status: string;
	sync_status: string;
	incrementalPatch: () => Promise<void>;
};
function observeSessions(rows: BehaviorSubject<SessionFixture[]>) {
	mockSessions.findOne.mockImplementation(
		(query: string | { selector: Record<string, unknown> }) => {
			const selector = typeof query === 'string' ? { id: query } : query.selector;
			const selected = rows.pipe(
				map(
					(values) =>
						values.find((row) =>
							Object.entries(selector).every(([key, value]) => {
								const actual = row[key as keyof SessionFixture];
								return typeof value === 'object' && value !== null && '$ne' in value
									? actual !== value.$ne
									: actual === value;
							})
						) ?? null
				)
			);
			return {
				$: selected,
				exec: async () => new Promise((resolve) => selected.pipe(take(1)).subscribe(resolve)),
			};
		}
	);
}
describe('pay-page session gate', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		jest.mocked(recordCompletionAttempt).mockReset().mockResolvedValue(undefined);
		mockSessionsOn = true;
		mockOnlineStatus = 'online-website-available';
		webViewMounts = 0;
		webViewProps = {};
		mockLocalPatch.mockResolvedValue(true);
		mockOpenSession.next(null);
		mockSessions.findOne.mockReturnValue({ exec: async () => null, $: mockOpenSession });
		jest
			.mocked(persistSaleProvenance)
			.mockImplementation(jest.requireActual('../sale-completion').persistSaleProvenance);
	});
	afterEach(() => {
		mockSessionsOn = false;
		mockRegisterId = null;
		mockOnlineStatus = 'offline';
		jest.mocked(persistSaleProvenance).mockReset();
	});
	it('sync rejection hides and stalls ready A once, then re-prepares and stamps B', async () => {
		mockRegisterId = 'register-A';
		const sessionA = {
			id: 'session-A',
			register_id: 'register-A',
			status: 'open',
			sync_status: 'pending',
			incrementalPatch: async () => undefined,
		};
		const rows = new BehaviorSubject<SessionFixture[]>([sessionA]);
		observeSessions(rows);
		const props = {
			order: makeOrder(undefined, [{ key: '_wcpos_sale_counter', value: '7' }]),
			setLoading: jest.fn(),
			setFrameStatus: jest.fn(),
			onStockRejection: () => false,
		};
		const view = render(<PaymentWebview {...props} />);
		await act(async () => {});
		act(() => webViewProps.onLoad({}));
		expect(props.setFrameStatus).toHaveBeenLastCalledWith('ready');
		mockLocalPatch.mockClear();
		await act(async () => rows.next([{ ...sessionA, sync_status: 'failed' }]));
		expect(webViewProps.src).toBeUndefined();
		expect(props.setFrameStatus).toHaveBeenLastCalledWith('stalled');
		await act(async () => rows.next([{ ...sessionA, sync_status: 'failed' }]));
		const logger = getLogger(['wcpos', 'pos', 'checkout', 'payment']);
		expect(logger.info).toHaveBeenCalledTimes(1);
		expect(logger.info).toHaveBeenCalledWith(
			'pos_checkout.open_register_first',
			expect.objectContaining({ showToast: true })
		);
		expect(mockLocalPatch).not.toHaveBeenCalled();
		await act(async () =>
			rows.next([...rows.value, { ...sessionA, id: 'session-B', sync_status: 'synced' }])
		);
		expect(commitGatewaySale).toHaveBeenCalledTimes(2);
		expect(mockLocalPatch.mock.calls[0][0].data.meta_data).toContainEqual({
			key: '_wcpos_session',
			value: 'session-B',
		});
		expect(webViewProps.src).toContain('/order-pay/42');
		expect(logger.info).toHaveBeenCalledTimes(1);
		view.unmount();
		expect(rows.observed).toBe(false);
	});
	it.each([false, true])(
		'switching bound A to B invalidates A before preparing B (open: %s)',
		async (open) => {
			mockRegisterId = 'register-A';
			const sessionA = {
				id: 'session-A',
				register_id: 'register-A',
				status: 'open',
				sync_status: 'synced',
				incrementalPatch: async () => undefined,
			};
			const sessionB = { ...sessionA, id: 'session-B', register_id: 'register-B' };
			const rows = new BehaviorSubject<SessionFixture[]>(open ? [sessionA, sessionB] : [sessionA]);
			observeSessions(rows);
			const props = {
				order: makeOrder(undefined, [{ key: '_wcpos_sale_counter', value: '7' }]),
				setLoading: jest.fn(),
				setFrameStatus: jest.fn(),
				onStockRejection: () => false,
			};
			const view = render(<PaymentWebview {...props} />);
			await act(async () => {});
			act(() => webViewProps.onLoad({}));
			expect(props.setFrameStatus).toHaveBeenLastCalledWith('ready');
			mockLocalPatch.mockClear();
			let finish!: () => void;
			const pending = new Promise<void>((resolve) => {
				finish = resolve;
			});
			jest.mocked(recordCompletionAttempt).mockReturnValueOnce(pending);
			mockRegisterId = 'register-B';
			view.rerender(<PaymentWebview {...props} />);
			expect(webViewProps.src).toBeUndefined();
			expect(props.setFrameStatus).toHaveBeenLastCalledWith('loading');
			await act(async () => {});
			const logger = getLogger(['wcpos', 'pos', 'checkout', 'payment']);
			if (!open) {
				expect(props.setFrameStatus).toHaveBeenLastCalledWith('stalled');
				expect(logger.info).toHaveBeenCalledTimes(1);
				expect(logger.info).toHaveBeenCalledWith(
					'pos_checkout.open_register_first',
					expect.objectContaining({ showToast: true })
				);
				expect(mockLocalPatch).not.toHaveBeenCalled();
				await act(async () => rows.next([sessionA, sessionB]));
			}
			expect(webViewProps.src).toBeUndefined();
			await act(async () => finish());
			expect(commitGatewaySale).toHaveBeenCalledTimes(open ? 2 : 3);
			expect(mockLocalPatch.mock.calls[0][0].data.meta_data).toContainEqual({
				key: '_wcpos_session',
				value: 'session-B',
			});
			expect(webViewProps.src).toContain('/order-pay/42');
			expect(logger.info).toHaveBeenCalledTimes(open ? 0 : 1);
			view.unmount();
			expect(rows.observed).toBe(false);
		}
	);
	it.each(['counting', 'closed', 'missing'])(
		'ready session A becomes %s: hides and stalls once, then re-prepares in B',
		async (status) => {
			const sessionA = { id: 'session-A', status: 'open', incrementalPatch: async () => undefined };
			const preparedSession = new BehaviorSubject<typeof sessionA | null>(sessionA);
			mockOpenSession.next(sessionA);
			mockSessions.findOne.mockImplementation((query: string | { selector: { id?: string } }) =>
				typeof query === 'string' || query.selector.id
					? {
							$: preparedSession.pipe(
								map((session) => (session?.status === 'open' ? session : null))
							),
						}
					: { exec: async () => mockOpenSession.value, $: mockOpenSession }
			);
			const order = makeOrder(undefined, [
				{ key: '_wcpos_sale_counter', value: '7' },
				{ key: '_wcpos_session', value: 'session-A' },
			]);
			const setFrameStatus = jest.fn();
			const view = render(
				<PaymentWebview
					order={order}
					setLoading={jest.fn()}
					setFrameStatus={setFrameStatus}
					onStockRejection={() => false}
				/>
			);
			await act(async () => {});
			act(() => webViewProps.onLoad({}));
			expect(setFrameStatus).toHaveBeenLastCalledWith('ready');
			jest.mocked(persistSaleProvenance).mockClear();
			mockLocalPatch.mockClear();
			mockPushDocument.mockClear();
			await act(async () => {
				mockOpenSession.next(null);
				preparedSession.next(status === 'missing' ? null : { ...sessionA, status });
				preparedSession.next(status === 'missing' ? null : { ...sessionA, status });
			});
			expect(webViewProps.src).toBeUndefined();
			expect(setFrameStatus).toHaveBeenLastCalledWith('stalled');
			expect(preparedSession.observed).toBe(false);
			expect(persistSaleProvenance).not.toHaveBeenCalled();
			expect(mockLocalPatch).not.toHaveBeenCalled();
			expect(mockPushDocument).not.toHaveBeenCalled();
			const logger = getLogger(['wcpos', 'pos', 'checkout', 'payment']);
			expect(logger.info).toHaveBeenCalledTimes(1);
			expect(logger.info).toHaveBeenCalledWith(
				'pos_checkout.open_register_first',
				expect.objectContaining({ showToast: true })
			);
			const sessionB = { ...sessionA, id: 'session-B' };
			await act(async () => {
				preparedSession.next(sessionB);
				mockOpenSession.next(sessionB);
			});
			expect(commitGatewaySale).toHaveBeenCalledTimes(2);
			expect(persistSaleProvenance).toHaveBeenCalledTimes(1);
			expect(mockSessions.findOne).toHaveBeenCalledWith({
				selector: { id: 'session-B', status: 'open', sync_status: { $ne: 'failed' } },
			});
			expect(webViewProps.src).toContain('/order-pay/42');
			expect(mockLocalPatch.mock.calls[0][0].data.meta_data).toContainEqual({
				key: '_wcpos_session',
				value: 'session-B',
			});
			await act(async () => mockOpenSession.next({ ...sessionB }));
			expect(commitGatewaySale).toHaveBeenCalledTimes(2);
			view.unmount();
			expect(preparedSession.observed).toBe(false);
		}
	);
	it('closing ready session A leaves LegacyTab Process Payment disabled without a new session', async () => {
		const session = { id: 'session-A', status: 'open', incrementalPatch: async () => undefined };
		const preparedSession = new BehaviorSubject(session);
		mockOpenSession.next(session);
		mockSessions.findOne.mockImplementation((query: string | { selector: { id?: string } }) =>
			typeof query === 'string' || query.selector.id
				? {
						$: preparedSession.pipe(
							map((session) => (session?.status === 'open' ? session : null))
						),
					}
				: { exec: async () => mockOpenSession.value, $: mockOpenSession }
		);
		const view = render(
			<LegacyTab
				order={makeOrder()}
				flow={
					{
						hasLiveLeg: false,
						legacyMethods: [{ id: 'legacy', title: 'Legacy' }],
						saveState: null,
					} as never
				}
			/>
		);
		await act(async () => {});
		act(() => webViewProps.onLoad({}));
		const button = view.getByTestId('checkout-legacy-process-payment') as HTMLButtonElement;
		expect(button.disabled).toBe(false);
		await act(async () => {
			mockOpenSession.next(null);
			preparedSession.next({ ...session, status: 'closed' });
		});
		expect(button.disabled).toBe(true);
		expect(webViewProps.src).toBeUndefined();
		act(() => button.click());
		expect(mockPostMessage).not.toHaveBeenCalled();
		expect(commitGatewaySale).toHaveBeenCalledTimes(1);
	});
	it('LegacyTab waits for the gateway catalog, so the commit journals the LOADED catalog', async () => {
		// The tender pane mounts LegacyTab before useCheckoutSession has loaded the catalog. The
		// commit journals the catalog once, at mount, for replay: a frame mounted early would
		// journal {} and a BACS-at-pending sale would never replay (#2482 review).
		const session = { id: 'session-A', status: 'open', incrementalPatch: async () => undefined };
		const preparedSession = new BehaviorSubject(session);
		mockOpenSession.next(session);
		mockSessions.findOne.mockImplementation((query: string | { selector: { id?: string } }) =>
			typeof query === 'string' || query.selector.id
				? {
						$: preparedSession.pipe(
							map((session) => (session?.status === 'open' ? session : null))
						),
					}
				: { exec: async () => mockOpenSession.value, $: mockOpenSession }
		);
		const order = makeOrder();
		const flow = {
			hasLiveLeg: false,
			legacyMethods: [{ id: 'legacy', title: 'Legacy' }],
			saveState: null,
		} as never;
		const catalog = { pos_cash: null, bacs: 'pending' };
		try {
			mockCheckoutSession = { ...MOCK_CHECKOUT_SESSION, gatewayResolved: false };
			const view = render(<LegacyTab order={order} flow={flow} />);
			await act(async () => {});
			expect(recordCompletionAttempt).not.toHaveBeenCalled();
			expect(view.getByTestId('checkout-legacy-skeleton')).toBeTruthy();

			mockCheckoutSession = { ...MOCK_CHECKOUT_SESSION, settledOrderStatuses: catalog };
			view.rerender(<LegacyTab order={order} flow={flow} />);

			await waitFor(() => expect(recordCompletionAttempt).toHaveBeenCalledTimes(1));
			expect(jest.mocked(recordCompletionAttempt).mock.calls[0][1]).toMatchObject({
				source: 'gateway-snapshot',
				settledOrderStatuses: catalog,
			});
		} finally {
			mockCheckoutSession = MOCK_CHECKOUT_SESSION;
		}
	});
	it('LegacyTab forwards receiptHost to PaymentWebview', async () => {
		autoShowReceipt = false;
		resetCheckoutMode();
		enterCheckout('uuid-42');
		mockAdoptOrderSnapshot.mockResolvedValue('applied');
		const session = { id: 'session-A', status: 'open', incrementalPatch: async () => undefined };
		const preparedSession = new BehaviorSubject(session);
		mockOpenSession.next(session);
		mockSessions.findOne.mockImplementation((query: string | { selector: { id?: string } }) =>
			typeof query === 'string' || query.selector.id
				? {
						$: preparedSession.pipe(
							map((session) => (session?.status === 'open' ? session : null))
						),
					}
				: { exec: async () => mockOpenSession.value, $: mockOpenSession }
		);
		render(
			<LegacyTab
				order={makeOrder()}
				flow={
					{
						hasLiveLeg: false,
						legacyMethods: [{ id: 'legacy', title: 'Legacy' }],
						saveState: null,
					} as never
				}
				receiptHost="stage"
			/>
		);
		await act(async () => {});
		const payload = {
			id: 42,
			number: '42',
			status: 'completed',
			meta_data: [{ key: '_woocommerce_pos_uuid', value: ORDER_UUID }],
			line_items: [],
		};
		await act(async () => {
			webViewProps.onMessage({
				nativeEvent: { data: { action: 'wcpos-payment-received', payload } },
			});
			await Promise.resolve();
		});
		expect(getCheckoutModeSnapshot().checkoutOrders.has('uuid-42')).toBe(false);
		expect(mockSetCurrentOrderID).toHaveBeenCalledWith('');
		expect(mockReplace).not.toHaveBeenCalled();
		expect(mockDismissTo).not.toHaveBeenCalled();
	});
	it('opening a session recovers the legacy frame exactly once without a retryToken', async () => {
		const logger = getLogger(['wcpos', 'pos', 'checkout', 'payment']);
		const setFrameStatus = jest.fn();
		render(
			<PaymentWebview
				order={makeOrder(undefined, [
					{ key: '_wcpos_sale_counter', value: '7' },
					{ key: '_wcpos_session', value: 'session-A' },
				])}
				setLoading={jest.fn()}
				setFrameStatus={setFrameStatus}
				onStockRejection={() => false}
			/>
		);
		await act(async () => {});
		expect(setFrameStatus).toHaveBeenLastCalledWith('stalled');
		expect(logger.info).toHaveBeenCalledWith(
			'pos_checkout.open_register_first',
			expect.objectContaining({ showToast: true })
		);
		expect(webViewMounts).toBe(0);
		expect(commitGatewaySale).toHaveBeenCalledTimes(1);
		const session = { id: 'session-B', status: 'open', incrementalPatch: async () => undefined };
		mockSessions.findOne.mockReturnValue({ exec: async () => session, $: mockOpenSession });
		await act(async () => mockOpenSession.next(session));
		expect(commitGatewaySale).toHaveBeenCalledTimes(2);
		expect(webViewMounts).toBe(1);
		expect(webViewProps.src).toContain('/order-pay/42');
		expect(mockLocalPatch.mock.calls[0][0].data.meta_data).toContainEqual({
			key: '_wcpos_session',
			value: 'session-B',
		});
		await act(async () => mockOpenSession.next({ ...session }));
		expect(commitGatewaySale).toHaveBeenCalledTimes(2);
	});
	it.each(['choose-register', 'provenance-push'])(
		'opening a session does not retry %s failure',
		async (failure) => {
			if (failure === 'choose-register') mockBindingStatus = 'choose';
			else {
				mockSessions.findOne.mockReturnValue({
					exec: async () => ({ id: 'session-A', incrementalPatch: async () => undefined }),
					$: mockOpenSession,
				});
				mockPushDocument.mockRejectedValueOnce(new Error('push failed'));
			}
			const setFrameStatus = jest.fn();
			const view = render(
				<PaymentWebview
					order={makeOrder()}
					setLoading={jest.fn()}
					setFrameStatus={setFrameStatus}
					onStockRejection={() => false}
				/>
			);
			await act(async () => {});
			expect(setFrameStatus).toHaveBeenLastCalledWith('stalled');
			await act(async () => mockOpenSession.next({ id: 'session-B' }));
			expect(commitGatewaySale).toHaveBeenCalledTimes(1);
			expect(webViewMounts).toBe(0);
			view.unmount();
			mockBindingStatus = 'bound';
		}
	);
	it.each(['offline', 'online-website-unavailable'])(
		'%s at mount without an open session: toasts, stalls and never exposes the frame',
		async (status) => {
			mockOnlineStatus = status;
			const logger = getLogger(['wcpos', 'pos', 'checkout', 'payment']);
			const setFrameStatus = jest.fn();
			render(
				<PaymentWebview
					order={makeOrder()}
					setLoading={jest.fn()}
					setFrameStatus={setFrameStatus}
					onStockRejection={() => false}
				/>
			);
			expect(webViewMounts).toBe(0);
			await act(async () => {});
			expect(logger.info).toHaveBeenCalledWith(
				'pos_checkout.open_register_first',
				expect.objectContaining({ showToast: true })
			);
			expect(setFrameStatus).toHaveBeenLastCalledWith('stalled');
			expect(webViewProps.src).toBeUndefined();
			expect(webViewMounts).toBe(0);
			expect(persistSaleProvenance).not.toHaveBeenCalled();
			expect(mockLocalPatch).not.toHaveBeenCalled();
			expect(mockPushDocument).not.toHaveBeenCalled();
		}
	);
	it('website unavailable with an open session: waits for preparation, pushes the session stamp only online', async () => {
		mockOnlineStatus = 'online-website-unavailable';
		mockSessions.findOne.mockReturnValue({
			exec: async () => ({ id: 'session-42', incrementalPatch: async () => undefined }),
			$: new BehaviorSubject({ id: 'session-42', status: 'open' }),
		});
		let finish!: () => void;
		const pendingPreparation = new Promise<void>((resolve) => {
			finish = resolve;
		});
		jest.mocked(recordCompletionAttempt).mockReturnValueOnce(pendingPreparation);
		const props = {
			order: makeOrder(),
			setLoading: jest.fn(),
			setFrameStatus: jest.fn(),
			onStockRejection: () => false,
		};
		const view = render(<PaymentWebview {...props} />);
		await act(async () => {});
		expect(webViewMounts).toBe(0);
		expect(mockPushDocument).not.toHaveBeenCalled();
		await act(async () => finish());
		expect(webViewMounts).toBe(1);
		expect(webViewProps.src).toContain('/order-pay/42');
		expect(persistSaleProvenance).toHaveBeenCalledWith(expect.anything(), {
			order: props.order,
			source: 'gateway-snapshot',
			sessionId: 'session-42',
			online: false,
		});
		expect(mockLocalPatch).not.toHaveBeenCalled();
		expect(mockPushDocument).not.toHaveBeenCalled();
		// Offline preparation does not push provenance; reconnection stamps the session.
		mockOnlineStatus = 'online-website-available';
		view.rerender(<PaymentWebview {...props} />);
		await act(async () => {});
		expect(mockLocalPatch.mock.calls[0][0].data.meta_data).toContainEqual({
			key: '_wcpos_session',
			value: 'session-42',
		});
		expect(mockPushDocument).toHaveBeenCalledTimes(1);
	});
	it('offline with sessions off: exposes the frame immediately without preparation or a toast', async () => {
		mockSessionsOn = false;
		mockOnlineStatus = 'offline';
		render(
			<PaymentWebview
				order={makeOrder()}
				setLoading={jest.fn()}
				setFrameStatus={jest.fn()}
				onStockRejection={() => false}
			/>
		);
		expect(webViewMounts).toBe(1);
		expect(webViewProps.src).toContain('/order-pay/42');
		await act(async () => {});
		expect(recordCompletionAttempt).not.toHaveBeenCalled();
		expect(mockSessions.findOne).not.toHaveBeenCalled();
		expect(mockLocalPatch).not.toHaveBeenCalled();
		expect(mockPushDocument).not.toHaveBeenCalled();
		expect(getLogger(['wcpos', 'pos', 'checkout', 'payment']).info).not.toHaveBeenCalled();
	});
	it('no open session: toasts, stalls and keeps failed preparation closed even offline', async () => {
		const logger = getLogger(['wcpos', 'pos', 'checkout', 'payment']);
		const setFrameStatus = jest.fn();
		const props = {
			order: makeOrder(),
			setLoading: jest.fn(),
			setFrameStatus,
			onStockRejection: () => false,
		};
		const view = render(<PaymentWebview {...props} />);
		await act(async () => {});
		expect(logger.info).toHaveBeenCalledWith(
			'pos_checkout.open_register_first',
			expect.objectContaining({ showToast: true })
		);
		expect(setFrameStatus).toHaveBeenLastCalledWith('stalled');
		expect(mockLocalPatch).not.toHaveBeenCalled();
		expect(mockPushDocument).not.toHaveBeenCalled();
		expect(recordCompletionAttempt).not.toHaveBeenCalled();
		expect(logger.error).not.toHaveBeenCalled();
		expect(webViewMounts).toBe(0);
		mockOnlineStatus = 'offline';
		await act(async () => view.rerender(<PaymentWebview {...props} />));
		expect(webViewMounts).toBe(0);
	});
	it.each([true, false])(
		'stamps the open session only with sessions enabled: %s',
		async (enabled) => {
			mockSessionsOn = enabled;
			mockSessions.findOne.mockReturnValue({
				exec: async () => ({ id: 'session-42', incrementalPatch: async () => undefined }),
				$: new BehaviorSubject({ id: 'session-42', status: 'open' }),
			});
			render(
				<PaymentWebview
					order={makeOrder()}
					setLoading={jest.fn()}
					setFrameStatus={jest.fn()}
					onStockRejection={() => false}
				/>
			);
			await waitFor(() => expect(webViewMounts).toBe(1));
			const meta: { key: string; value: unknown }[] =
				mockLocalPatch.mock.calls[0][0].data.meta_data;
			expect(meta.filter(({ key }) => key === '_wcpos_session')).toEqual(
				enabled ? [{ key: '_wcpos_session', value: 'session-42' }] : []
			);
			expect(mockPushDocument).toHaveBeenCalledTimes(1);
			if (!enabled) expect(mockSessions.findOne).not.toHaveBeenCalled();
			expect(getLogger(['wcpos', 'pos', 'checkout', 'payment']).info).not.toHaveBeenCalledWith(
				'pos_checkout.open_register_first',
				expect.anything()
			);
		}
	);
});

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
		mockOnlineStatus = 'offline';
		mockSessionsOn = false;
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
		mockEngineRequire.mockReturnValue({ ready: Promise.resolve(), release: jest.fn() });
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

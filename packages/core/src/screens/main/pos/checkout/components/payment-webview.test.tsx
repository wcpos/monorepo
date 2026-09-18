/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, render, waitFor } from '@testing-library/react';

import { getLogger } from '@wcpos/utils/logger';

import { persistSaleProvenance } from '../sale-completion';
import { recordCompletionAttempt } from '../completion-journal';
import { PAYMENT_FRAME_LOAD_TIMEOUT_MS, PaymentWebview } from './payment-webview';

// Capture the props handed to the (mocked) WebView so the test can drive the
// `onLoad` lifecycle the same way the real iframe/native webview would.
let webViewProps: Record<string, any> = {};
// Every mount of the (mocked) WebView: a reload is a remount (new `key`).
let webViewMounts = 0;
const mockGet = jest.fn();
const mockReplace = jest.fn();
const mockSetCurrentOrderID = jest.fn();
const mockStockAdjustment = jest.fn();
const mockEngineRequire = jest.fn();
const mockAdoptOrderSnapshot = jest.fn();
const mockUserDB = {};
const mockSite = { uuid: 'site' };
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
			}, []);
			return null;
		},
	};
});
jest.mock('@wcpos/components/error-boundary', () => ({
	ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('observable-hooks', () => ({
	// Return the synchronous default; the component only needs the resolved value.
	useObservableState: (_observable: unknown, defaultValue: unknown) => defaultValue,
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));
jest.mock('@wcpos/query', () => ({
	useDocField: jest.requireActual('@wcpos/core-test/mock-use-doc-field').mockUseDocField,
	useQueryRuntime: () => ({
		engine: { require: mockEngineRequire, adoptOrderSnapshot: mockAdoptOrderSnapshot },
	}),
	useRecordField: (record: unknown, select: (value: unknown) => unknown) => select(record),
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
	useStoreSession: () => ({ userDB: mockUserDB, site: mockSite, store: { id: 1 } }),
	useAppState: () => ({
		wpCredentials: { access_token: 'jwt-token', access_token$: {} },
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

const makeOrder = (href = 'https://shop.example.com/wcpos-checkout/order-pay/42') => {
	const order = {
		uuid: 'uuid-42',
		payload: {
			id: 42,
			number: '42',
			status: 'pos-open',
			links: { payment: [{ href }] },
			line_items: [],
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
const mockSessions = { findOne: jest.fn() };
describe('pay-page session gate', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		jest.mocked(recordCompletionAttempt).mockReset().mockResolvedValue(undefined);
		mockSessionsOn = true;
		mockOnlineStatus = 'online-website-available';
		webViewMounts = 0;
		webViewProps = {};
		mockLocalPatch.mockResolvedValue(true);
		mockSessions.findOne.mockReturnValue({ exec: async () => null });
		jest
			.mocked(persistSaleProvenance)
			.mockImplementation(jest.requireActual('../sale-completion').persistSaleProvenance);
	});
	afterEach(() => {
		mockSessionsOn = false;
		mockOnlineStatus = 'offline';
		jest.mocked(persistSaleProvenance).mockReset();
	});
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
			expect(getLogger(['wcpos', 'pos', 'checkout', 'payment']).info).not.toHaveBeenCalledWith(
				'pos_checkout.open_register_first',
				expect.anything()
			);
		}
	);
});

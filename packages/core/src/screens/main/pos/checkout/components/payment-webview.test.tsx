/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, render } from '@testing-library/react';

import { getLogger } from '@wcpos/utils/logger';

import { PaymentWebview } from './payment-webview';

// Capture the props handed to the (mocked) WebView so the test can drive the
// `onLoad` lifecycle the same way the real iframe/native webview would.
let webViewProps: Record<string, any> = {};
const mockGet = jest.fn();
const mockReplace = jest.fn();
const mockSetCurrentOrderID = jest.fn();
const mockStockAdjustment = jest.fn();
const mockEngineRequire = jest.fn();
const mockAdoptOrderSnapshot = jest.fn();
let autoShowReceipt = false;

jest.mock('@wcpos/components/webview', () => ({
	WebView: (props: Record<string, unknown>) => {
		webViewProps = props;
		return null;
	},
}));
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
jest.mock('../../../../../contexts/app-state', () => ({
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
							payload: { id: 42, number: '42', status: 'completed', line_items: [] },
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
		const payload = { id: 42, number: '42', status: 'completed', line_items: [] };

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

	it('routes on SERVER truth even when the local document never updates', async () => {
		// The review scenario: an engine require can settle without applying a
		// newer revision (skip-coalesced resident task, dirty-row protection) —
		// the local doc stays pos-open forever. The decision must come from the
		// direct server probe, with the engine refresh as best-effort catch-up.
		jest.useFakeTimers();
		mockGet.mockResolvedValue({
			data: [{ id: 42, status: 'completed', number: '42', line_items: [] }],
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
			status: 'completed',
			number: '42',
			line_items: [],
		});
		expect(mockEngineRequire).toHaveBeenCalledTimes(1); // best-effort local catch-up
		expect(logger.error).not.toHaveBeenCalled();
		expect(mockSetCurrentOrderID).toHaveBeenCalledWith('');
		expect(mockReplace).toHaveBeenCalledWith({ pathname: '/cart' });
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
		expect(setFrameStatus).toHaveBeenLastCalledWith('failed');
	});
});

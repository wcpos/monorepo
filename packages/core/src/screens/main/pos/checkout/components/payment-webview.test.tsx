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
const mockStockAdjustment = jest.fn();
const mockEngineRequire = jest.fn();
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
	useQueryManager: () => ({ engine: { require: mockEngineRequire } }),
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
jest.mock('../../../hooks/use-rest-http-client', () => ({
	useRestHttpClient: () => ({ get: mockGet }),
}));
jest.mock('../../../hooks/use-stock-adjustment', () => ({
	useStockAdjustment: () => ({ stockAdjustment: mockStockAdjustment }),
}));

const makeOrder = () =>
	({
		id: 42,
		uuid: 'uuid-42',
		number: '42',
		links: { payment: [{ href: 'https://shop.example.com/wcpos-checkout/order-pay/42' }] },
		links$: { pipe: () => ({}) },
		getLatest: () => ({ status: 'pos-open', links: {}, line_items: [] }),
	}) as never;

describe('PaymentWebview fallback order refresh', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		jest.useRealTimers();
		webViewProps = {};
		autoShowReceipt = false;
		mockEngineRequire.mockReturnValue({ ready: Promise.resolve(), release: jest.fn() });
	});

	it('refreshes the engine order before routing a successful payment to its receipt', async () => {
		autoShowReceipt = true;
		let resolveRefresh: (() => void) | undefined;
		const release = jest.fn();
		mockEngineRequire.mockReturnValue({
			ready: new Promise<void>((resolve) => {
				resolveRefresh = resolve;
			}),
			release,
		});
		const logger = getLogger(['wcpos', 'pos', 'checkout', 'payment']);

		render(<PaymentWebview order={makeOrder()} setLoading={jest.fn()} />);

		await act(async () => {
			webViewProps.onMessage({
				nativeEvent: {
					data: {
						action: 'wcpos-payment-received',
						payload: { number: '42', status: 'completed', line_items: [] },
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
			wooIds: [42],
			forceRefresh: true,
		});
		expect(mockReplace).not.toHaveBeenCalled();

		await act(async () => {
			resolveRefresh?.();
			await Promise.resolve();
		});

		expect(release).toHaveBeenCalledTimes(1);
		expect(mockReplace).toHaveBeenCalledWith({
			pathname: '(modals)/cart/receipt/uuid-42',
		});
	});

	it('routes structured stock errors through the shared rejection handler', async () => {
		const onStockRejection = jest.fn(async () => true);
		const logger = getLogger(['wcpos', 'pos', 'checkout', 'payment']);
		const payload = {
			code: 'wcpos_insufficient_stock',
			data: { items: [{ product_id: 1, variation_id: 0, available: 0 }] },
		};
		render(
			<PaymentWebview
				order={makeOrder()}
				setLoading={jest.fn()}
				onStockRejection={onStockRejection}
			/>
		);

		await act(async () => {
			await webViewProps.onMessage({ nativeEvent: { data: { payload } } });
		});

		expect(onStockRejection).toHaveBeenCalledWith(payload);
		expect(logger.error).not.toHaveBeenCalled();
	});

	it('does not poll on the initial page load (payment cannot have completed yet)', async () => {
		jest.useFakeTimers();
		render(<PaymentWebview order={makeOrder()} setLoading={jest.fn()} />);

		await act(async () => {
			webViewProps.onLoad({});
			await jest.advanceTimersByTimeAsync(1000);
		});

		expect(mockEngineRequire).not.toHaveBeenCalled();
		expect(mockGet).not.toHaveBeenCalled();
		jest.useRealTimers();
	});

	it('does not log a payment-gateway error when the fallback server probe fails', async () => {
		jest.useFakeTimers();
		mockGet.mockRejectedValue(new Error('Request failed with status code 404'));
		const logger = getLogger(['wcpos', 'pos', 'checkout', 'payment']);

		render(<PaymentWebview order={makeOrder()} setLoading={jest.fn()} />);

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
		jest.useRealTimers();
	});

	it('routes on SERVER truth even when the local document never updates', async () => {
		// The review scenario: an engine require can settle without applying a
		// newer revision (skip-coalesced resident task, dirty-row protection) —
		// the local doc stays pos-open forever. The decision must come from the
		// direct server probe, with the engine refresh as best-effort catch-up.
		jest.useFakeTimers();
		mockGet.mockResolvedValue({
			data: [{ status: 'completed', number: '42', line_items: [] }],
		});
		const logger = getLogger(['wcpos', 'pos', 'checkout', 'payment']);

		render(<PaymentWebview order={makeOrder()} setLoading={jest.fn()} />);

		await act(async () => {
			webViewProps.onLoad({});
			webViewProps.onLoad({});
			await jest.advanceTimersByTimeAsync(1000);
		});

		expect(mockGet).toHaveBeenCalledWith('orders', { params: { include: 42, per_page: 1 } });
		expect(mockEngineRequire).toHaveBeenCalledTimes(1); // best-effort local catch-up
		expect(logger.error).not.toHaveBeenCalled();
		expect(mockReplace).toHaveBeenCalledWith({ pathname: 'cart' });
		jest.useRealTimers();
	});
});

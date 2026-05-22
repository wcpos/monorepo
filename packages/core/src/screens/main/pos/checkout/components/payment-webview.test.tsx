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
jest.mock('../../../../../contexts/app-state', () => ({
	useAppState: () => ({
		wpCredentials: { access_token: 'jwt-token', access_token$: {} },
	}),
}));
jest.mock('../../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('../../../contexts/ui-settings', () => ({
	useUISettings: () => ({ uiSettings: { autoShowReceipt: false } }),
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
		collection: { parseRestResponse: (data: unknown) => data },
		getLatest: () => ({ status: 'pos-open', links: {}, line_items: [] }),
	}) as never;

describe('PaymentWebview fallback order fetch', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		jest.useRealTimers();
		webViewProps = {};
	});

	it('does not poll on the initial page load (payment cannot have completed yet)', async () => {
		jest.useFakeTimers();
		render(<PaymentWebview order={makeOrder()} setLoading={jest.fn()} />);

		await act(async () => {
			webViewProps.onLoad({});
			await jest.advanceTimersByTimeAsync(1000);
		});

		expect(mockGet).not.toHaveBeenCalled();
		jest.useRealTimers();
	});

	it('does not log a payment-gateway error when the fallback fetch fails (e.g. 404)', async () => {
		jest.useFakeTimers();
		mockGet.mockRejectedValue(new Error('Request failed with status code 404'));
		const logger = getLogger(['wcpos', 'pos', 'checkout', 'payment']);

		render(<PaymentWebview order={makeOrder()} setLoading={jest.fn()} />);

		await act(async () => {
			webViewProps.onLoad({}); // initial order-pay load — gated, no poll
			webViewProps.onLoad({}); // post-payment navigation — schedules the poll
			await jest.advanceTimersByTimeAsync(1000);
		});

		expect(mockGet).toHaveBeenCalledWith('/42');
		// The regression: a failed safety-net poll must NOT be raised as an error
		// (which is what surfaced the spurious PY02001 payment-gateway error).
		expect(logger.error).not.toHaveBeenCalled();
		expect(logger.debug).toHaveBeenCalled();
		jest.useRealTimers();
	});

	it('stays quiet (no error, no navigation) when the server status has not changed yet', async () => {
		jest.useFakeTimers();
		mockGet.mockResolvedValue({ data: { status: 'pos-open' } });
		const logger = getLogger(['wcpos', 'pos', 'checkout', 'payment']);

		render(<PaymentWebview order={makeOrder()} setLoading={jest.fn()} />);

		await act(async () => {
			webViewProps.onLoad({});
			webViewProps.onLoad({});
			await jest.advanceTimersByTimeAsync(1000);
		});

		expect(mockGet).toHaveBeenCalledWith('/42');
		expect(logger.error).not.toHaveBeenCalled();
		expect(mockReplace).not.toHaveBeenCalled();
		jest.useRealTimers();
	});
});

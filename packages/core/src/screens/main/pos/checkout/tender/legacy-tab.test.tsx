/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render } from '@testing-library/react';

import { PaymentWebview, type PaymentWebviewProps } from '../components/payment-webview';
import { LegacyTab } from './legacy-tab';

jest.mock('../../../../../contexts/translations', () => ({
	useT: () => jest.requireActual('../../../../../../jest/translate').createTestT(),
}));
jest.mock('@wcpos/query', () => ({
	useRecordField: jest.requireActual('@wcpos/core-test/mock-use-doc-field').mockUseDocField,
}));
const refetch = jest.fn();
const MOCK_CHECKOUT_SESSION = {
	handleStockRejection: jest.fn(),
	settledOrderStatuses: {} as Record<string, string | null>,
	gatewayResolved: true,
	gatewayError: null as string | null,
	refetch,
};
let mockCheckoutSession = MOCK_CHECKOUT_SESSION;
jest.mock('../hooks/use-checkout-session', () => ({
	useCheckoutSession: () => mockCheckoutSession,
}));
// Mounting the payment frame starts a sale; keep that boundary inert in this UI test. The
// stand-in records its props and answers the tab's ref the way the real frame's WebView does.
const mockPostMessage = jest.fn();
jest.mock('../components/payment-webview', () => {
	const R = jest.requireActual('react');
	return {
		PaymentWebview: jest.fn((props: { ref?: React.Ref<unknown> }) => {
			R.useImperativeHandle(props.ref, () => ({ postMessage: mockPostMessage }));
			return null;
		}),
	};
});
// The handler each Process Payment render hands the button, so a test can fire a press held
// over from an earlier render (a DOM click on a disabled button never reaches onClick).
const mockPressHandlers: (() => void)[] = [];
jest.mock('@wcpos/components/button', () => ({
	Button: ({
		children,
		testID,
		onPress,
		disabled,
	}: React.PropsWithChildren<{
		testID?: string;
		onPress?: () => void;
		disabled?: boolean;
	}>) => {
		if (testID === 'checkout-legacy-process-payment' && onPress) mockPressHandlers.push(onPress);
		return (
			<button data-testid={testID} onClick={onPress} disabled={disabled}>
				{children}
			</button>
		);
	},
	ButtonText: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));

const en = jest.requireActual('../../../../../contexts/translations/locales/en/core.json');
const flow = {
	hasLiveLeg: false,
	legacyMethods: [{ id: 'legacy', title: 'Legacy' }],
	saveState: null,
} as never;
const makeOrder = (hasURL = true) =>
	({
		payload: { links: { payment: hasURL ? [{ href: 'https://example.com/pay' }] : [] } },
	}) as never;
/** The props of the frame's latest render. */
const frameProps = () => jest.mocked(PaymentWebview).mock.lastCall![0] as PaymentWebviewProps;
const report = (status: Parameters<PaymentWebviewProps['setFrameStatus']>[0]) =>
	act(() => frameProps().setFrameStatus(status));

beforeEach(() => {
	jest.clearAllMocks();
	mockPressHandlers.length = 0;
	mockCheckoutSession = MOCK_CHECKOUT_SESSION;
});

it.each([true, false])(
	'catalog failure blocks the pay frame and offers retry (payment URL: %s)',
	(hasURL) => {
		mockCheckoutSession = { ...MOCK_CHECKOUT_SESSION, gatewayError: 'fetch failed' };
		const view = render(<LegacyTab order={makeOrder(hasURL)} flow={flow} />);
		expect(PaymentWebview).not.toHaveBeenCalled();
		fireEvent.click(view.getByTestId('checkout-gateway-catalog-retry'));
		expect(refetch).toHaveBeenCalledTimes(1);
	}
);

it('a frame that leaves ready (a closed session re-gates it) disables Process Payment and refuses a held-over press', () => {
	const view = render(<LegacyTab order={makeOrder()} flow={flow} />);
	const button = view.getByTestId('checkout-legacy-process-payment') as HTMLButtonElement;
	expect(button.disabled).toBe(true);
	report('ready');
	expect(button.disabled).toBe(false);
	const pressFromReadyRender = mockPressHandlers[mockPressHandlers.length - 1];
	report('stalled');
	expect(button.disabled).toBe(true);
	act(() => pressFromReadyRender());
	expect(mockPostMessage).not.toHaveBeenCalled();
});

it('a press into a frame that then stalls clears on Retry, so the reloaded frame can be pressed', () => {
	// The session closed after the press: nothing will answer it, and nothing else clears busy.
	const view = render(<LegacyTab order={makeOrder()} flow={flow} />);
	const button = view.getByTestId('checkout-legacy-process-payment') as HTMLButtonElement;
	report('ready');
	act(() => button.click());
	expect(button.disabled).toBe(true);
	report('stalled');
	fireEvent.click(view.getByTestId('checkout-payment-form-retry'));
	report('ready');
	expect(button.disabled).toBe(false);
});

it('a press on a ready frame posts wcpos-process-payment once and holds the button', () => {
	const view = render(<LegacyTab order={makeOrder()} flow={flow} />);
	report('ready');
	const button = view.getByTestId('checkout-legacy-process-payment') as HTMLButtonElement;
	act(() => button.click());
	expect(mockPostMessage).toHaveBeenCalledTimes(1);
	expect(mockPostMessage).toHaveBeenCalledWith({ action: 'wcpos-process-payment' });
	expect(button.disabled).toBe(true);
});

it('waits for the gateway catalog, then hands the frame the LOADED catalog', () => {
	// The tender pane mounts LegacyTab before useCheckoutSession has loaded the catalog. The
	// frame's commit journals the catalog once, at mount, for replay: a frame mounted early
	// would journal {} and a BACS-at-pending sale would never replay (#2482 review).
	const catalog = { pos_cash: null, bacs: 'pending' };
	mockCheckoutSession = { ...MOCK_CHECKOUT_SESSION, gatewayResolved: false };
	const view = render(<LegacyTab order={makeOrder()} flow={flow} />);
	expect(PaymentWebview).not.toHaveBeenCalled();
	expect(view.getByTestId('checkout-legacy-skeleton')).toBeTruthy();

	mockCheckoutSession = { ...MOCK_CHECKOUT_SESSION, settledOrderStatuses: catalog };
	view.rerender(<LegacyTab order={makeOrder()} flow={flow} />);
	expect(jest.mocked(PaymentWebview).mock.calls[0][0].settledOrderStatuses).toEqual(catalog);
});

it('forwards receiptHost to PaymentWebview', () => {
	render(<LegacyTab order={makeOrder()} flow={flow} receiptHost="stage" />);
	expect(frameProps().receiptHost).toBe('stage');
});

it('a stalled frame offers Retry, and the Retry remounts the frame with a new retryToken', () => {
	const view = render(<LegacyTab order={makeOrder()} flow={flow} />);
	expect(frameProps().retryToken).toBe(0);
	expect(view.queryByTestId('checkout-payment-form-load-failed')).toBeNull();
	report('stalled');
	expect(view.getByTestId('checkout-payment-form-load-failed').textContent).toContain(
		en['pos_checkout.payment_form_load_failed_retry']
	);
	fireEvent.click(view.getByTestId('checkout-payment-form-retry'));
	expect(frameProps().retryToken).toBe(1);
});

it('a failed later navigation shows the check-the-order copy and offers no Retry', () => {
	// The sale may already be paid: "close checkout and try again" would invite a second charge.
	const view = render(<LegacyTab order={makeOrder()} flow={flow} />);
	report('failed');
	expect(view.getByTestId('checkout-payment-form-load-failed').textContent).toContain(
		en['pos_checkout.payment_form_navigation_failed']
	);
	expect(view.queryByTestId('checkout-payment-form-retry')).toBeNull();
	expect((view.getByTestId('checkout-legacy-process-payment') as HTMLButtonElement).disabled).toBe(
		true
	);
});

// Notice links out through the native URL boundary; keep that boundary inert in jsdom.
jest.mock('@wcpos/utils/open-external-url', () => ({ openExternalURL: jest.fn() }));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));

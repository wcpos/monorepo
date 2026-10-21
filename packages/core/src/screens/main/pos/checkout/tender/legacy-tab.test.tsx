/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render } from '@testing-library/react';

import { PaymentWebview } from '../components/payment-webview';
import { LegacyTab } from './legacy-tab';

jest.mock('../../../../../contexts/translations', () => ({
	useT: () => jest.requireActual('../../../../../../jest/translate').createTestT(),
}));
jest.mock('@wcpos/query', () => ({
	useRecordField: jest.requireActual('@wcpos/core-test/mock-use-doc-field').mockUseDocField,
}));
const refetch = jest.fn();
jest.mock('../hooks/use-checkout-session', () => ({
	useCheckoutSession: () => ({
		handleStockRejection: jest.fn(),
		settledOrderStatuses: {},
		gatewayResolved: true,
		gatewayError: 'fetch failed',
		refetch,
	}),
}));
// Mounting the payment frame starts a sale; keep that boundary inert in this UI test.
jest.mock('../components/payment-webview', () => ({ PaymentWebview: jest.fn(() => null) }));
jest.mock('@wcpos/components/button', () => ({
	Button: ({
		children,
		testID,
		onPress,
	}: React.PropsWithChildren<{
		testID?: string;
		onPress?: () => void;
	}>) => (
		<button data-testid={testID} onClick={onPress}>
			{children}
		</button>
	),
	ButtonText: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));

it.each([true, false])(
	'catalog failure blocks the pay frame and offers retry (payment URL: %s)',
	(hasURL) => {
		jest.clearAllMocks();
		const order = {
			payload: { links: { payment: hasURL ? [{ href: 'https://example.com/pay' }] : [] } },
		} as never;
		const flow = {
			hasLiveLeg: false,
			legacyMethods: [{ id: 'legacy', title: 'Legacy' }],
			saveState: null,
		} as never;
		const view = render(<LegacyTab order={order} flow={flow} />);
		expect(PaymentWebview).not.toHaveBeenCalled();
		fireEvent.click(view.getByTestId('checkout-gateway-catalog-retry'));
		expect(refetch).toHaveBeenCalledTimes(1);
	}
);

// Notice links out through the native URL boundary; keep that boundary inert in jsdom.
jest.mock('@wcpos/utils/open-external-url', () => ({ openExternalURL: jest.fn() }));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));

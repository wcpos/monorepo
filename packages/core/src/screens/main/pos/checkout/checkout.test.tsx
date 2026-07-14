/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { Checkout } from './checkout';

const mockUseCheckoutSession = jest.fn();

jest.mock('observable-hooks', () => ({
	useObservableSuspense: () => null,
	useObservableEagerState: () => {
		throw new Error('document observable accessed before null guard');
	},
}));

jest.mock('rxdb', () => ({ isRxDocument: () => false }));

jest.mock('./hooks/use-checkout-session', () => ({
	useCheckoutSession: (...args: unknown[]) => mockUseCheckoutSession(...args),
}));

jest.mock('./components/payment-webview', () => ({ PaymentWebview: () => null }));
jest.mock('./components/title', () => ({ CheckoutTitle: () => null }));

jest.mock('@wcpos/components/modal', () => ({
	Modal: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
	ModalContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
	ModalHeader: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
	ModalTitle: ({ children }: { children?: React.ReactNode }) => <h1>{children}</h1>,
}));

jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));

jest.mock('../../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));

describe('Checkout', () => {
	it('renders not-found before accessing document observables when the resource emits null', () => {
		render(<Checkout resource={{} as never} />);

		expect(screen.getByText('common.no_order_found')).toBeTruthy();
		expect(mockUseCheckoutSession).not.toHaveBeenCalled();
	});
});

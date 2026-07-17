/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { Checkout } from './checkout';

const mockUseCheckoutSession = jest.fn();
const mockUseObservableSuspense = jest.fn();
const mockUseObservableEagerState = jest.fn();
const mockIsRxDocument = jest.fn();

jest.mock('observable-hooks', () => ({
	useObservableSuspense: (...args: unknown[]) => mockUseObservableSuspense(...args),
	useObservableEagerState: (...args: unknown[]) => mockUseObservableEagerState(...args),
}));

jest.mock('rxdb', () => ({ isRxDocument: (...args: unknown[]) => mockIsRxDocument(...args) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: jest.fn() }) }));

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
	ModalBody: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
	ModalFooter: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
	ModalClose: ({ children }: { children?: React.ReactNode }) => <button>{children}</button>,
	ModalAction: ({ children }: { children?: React.ReactNode }) => <button>{children}</button>,
}));

jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));

jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('../../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));

describe('Checkout', () => {
	it('renders not-found before accessing document observables when the resource emits null', () => {
		mockUseObservableSuspense.mockReturnValue(null);
		mockIsRxDocument.mockReturnValue(false);
		render(<Checkout resource={{} as never} />);

		expect(screen.getByText('common.no_order_found')).toBeTruthy();
		expect(mockUseCheckoutSession).not.toHaveBeenCalled();
	});

	it('shows only Return to Cart after a stock rejection', () => {
		mockUseObservableSuspense.mockReturnValue({ uuid: 'order-1', number$: {} });
		mockIsRxDocument.mockReturnValue(true);
		mockUseObservableEagerState.mockReturnValueOnce('100').mockReturnValueOnce({
			orderUuid: 'order-1',
			items: [{ product_id: 1, variation_id: 0, available: 0 }],
		});
		mockUseCheckoutSession.mockReturnValue({
			mode: 'contract',
			error: 'insufficient_stock',
			startCheckout: jest.fn(),
		});

		render(<Checkout resource={{} as never} />);

		expect(screen.queryByText('common.cancel')).toBeNull();
		expect(screen.getByText('pos_checkout.return_to_cart')).toBeTruthy();
	});

	it('shows stock rejection detail for a legacy webview checkout', () => {
		mockUseObservableSuspense.mockReturnValue({ uuid: 'order-2', number$: {} });
		mockIsRxDocument.mockReturnValue(true);
		mockUseObservableEagerState.mockReturnValueOnce('101').mockReturnValueOnce({
			orderUuid: 'order-2',
			items: [{ product_id: 1, variation_id: 0, name: 'Keyboard', available: 0 }],
		});
		mockUseCheckoutSession.mockReturnValue({
			mode: 'webview',
			error: 'insufficient_stock',
			startCheckout: jest.fn(),
			handleCheckoutError: jest.fn(),
		});

		render(<Checkout resource={{} as never} />);

		expect(screen.getByText('pos_checkout.insufficient_stock_message')).toBeTruthy();
		expect(screen.queryByText('common.cancel')).toBeNull();
		expect(screen.getByText('pos_checkout.return_to_cart')).toBeTruthy();
	});
});

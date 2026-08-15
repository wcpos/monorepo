/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { Checkout } from './checkout';

import type { PaymentFrameStatus } from './components/payment-webview';

const mockUseCheckoutSession = jest.fn();
const mockBlockIfDegraded = jest.fn(() => false);
let mockStorageDegraded = false;

jest.mock('../../hooks/use-storage-health', () => ({
	useStorageMoneyPathGuard: () => ({
		storageDegraded: mockStorageDegraded,
		blockIfDegraded: mockBlockIfDegraded,
	}),
}));
const mockUseObservableSuspense = jest.fn();
const mockUseObservableEagerState = jest.fn();
const mockIsRxDocument = jest.fn();
const mockPostMessage = jest.fn();

interface MockPaymentWebviewProps {
	setFrameStatus: (status: PaymentFrameStatus) => void;
	setLoading?: (loading: boolean) => void;
	onStockRejection?: (error: unknown) => boolean;
	ref?: React.RefObject<{ postMessage: (message: unknown) => void } | null>;
}

interface MockModalActionProps {
	children?: React.ReactNode;
	testID?: string;
	disabled?: boolean;
	loading?: boolean;
	onPress?: () => void | Promise<void>;
}

const notRendered = (name: string) => () => {
	throw new Error(`${name} was not rendered`);
};

/** Props last handed to the (mocked) PaymentWebview, so a test can drive its load signal. */
let paymentWebviewProps: MockPaymentWebviewProps = {
	setFrameStatus: notRendered('PaymentWebview'),
};
/** Props last handed to the Process Payment ModalAction. */
let processPaymentProps: MockModalActionProps = {
	onPress: notRendered('process-payment-button'),
};

jest.mock('observable-hooks', () => ({
	useObservableSuspense: (...args: unknown[]) => mockUseObservableSuspense(...args),
	useObservableEagerState: (...args: unknown[]) => mockUseObservableEagerState(...args),
}));

jest.mock('rxdb', () => ({ isRxDocument: (...args: unknown[]) => mockIsRxDocument(...args) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: jest.fn() }) }));

jest.mock('./hooks/use-checkout-session', () => ({
	useCheckoutSession: (...args: unknown[]) => mockUseCheckoutSession(...args),
}));

jest.mock('./components/payment-webview', () => ({
	PaymentWebview: (props: MockPaymentWebviewProps) => {
		paymentWebviewProps = props;
		// The real component forwards the ref through to the WebView, which exposes
		// `postMessage`. Stand that in so the test can observe (or not observe) the
		// fire-and-forget `wcpos-process-payment` post.
		if (props.ref) {
			props.ref.current = { postMessage: mockPostMessage };
		}
		return null;
	},
}));
jest.mock('./components/title', () => ({ CheckoutTitle: () => null }));
// The R1 banner has its own suite (cart/totals-changed-banner.test.tsx); here it
// is only a child, and rendering it for real drags @wcpos/components/icon-button
// → expo-haptics into a suite that transforms neither.
jest.mock('../cart/totals-changed-banner', () => ({ TotalsChangedBanner: () => null }));

jest.mock('@wcpos/components/modal', () => ({
	Modal: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
	ModalContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
	ModalHeader: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
	ModalTitle: ({ children }: { children?: React.ReactNode }) => <h1>{children}</h1>,
	ModalBody: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
	ModalFooter: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
	ModalClose: ({ children }: { children?: React.ReactNode }) => <button>{children}</button>,
	// Superset of the mock #1019 introduced: it also captures the props so a test
	// can invoke the handler directly, and exposes the `loading` affordance.
	ModalAction: ({ children, ...props }: MockModalActionProps) => {
		if (props.testID === 'process-payment-button') {
			processPaymentProps = props;
		}
		return (
			<button
				data-testid={props.testID}
				disabled={!!props.disabled}
				data-loading={props.loading ? 'true' : 'false'}
				onClick={props.onPress}
			>
				{children}
			</button>
		);
	},
}));

jest.mock('@wcpos/components/text', () => ({
	// Forwards testID so the inline reasons can be asserted by the same selector
	// the app ships (and E2E would use), not just by their copy.
	Text: ({ children, testID }: { children?: React.ReactNode; testID?: string }) => (
		<span data-testid={testID}>{children}</span>
	),
}));

jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('../../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));

describe('Checkout', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockStorageDegraded = false;
		mockBlockIfDegraded.mockReturnValue(false);
	});

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

	it('shows stock rejection detail in legacy webview mode', () => {
		mockUseObservableSuspense.mockReturnValue({ uuid: 'order-1', number$: {} });
		mockIsRxDocument.mockReturnValue(true);
		mockUseObservableEagerState.mockReturnValueOnce('100').mockReturnValueOnce({
			orderUuid: 'order-1',
			items: [{ product_id: 1, variation_id: 0, available: 0 }],
		});
		mockUseCheckoutSession.mockReturnValue({
			mode: 'webview',
			error: 'insufficient_stock',
			startCheckout: jest.fn(),
		});

		render(<Checkout resource={{} as never} />);

		expect(screen.getByText('pos_checkout.insufficient_stock_message')).toBeTruthy();
	});

	/**
	 * #163 ruling R5. This is the surface that catches a checkout already in
	 * progress: the modal is open because storage was healthy when Checkout was
	 * pressed, and the worker died since.
	 */
	it('disables Process Payment while storage is degraded', () => {
		mockStorageDegraded = true;
		mockBlockIfDegraded.mockReturnValue(true);
		mockUseObservableSuspense.mockReturnValue({ uuid: 'order-1', number$: {} });
		mockIsRxDocument.mockReturnValue(true);
		mockUseObservableEagerState.mockReturnValueOnce('100').mockReturnValueOnce(null);
		const startCheckout = jest.fn();
		mockUseCheckoutSession.mockReturnValue({
			mode: 'contract',
			error: null,
			loading: false,
			startCheckout,
		});

		render(<Checkout resource={{} as never} />);

		const button = screen.getByTestId('process-payment-button') as HTMLButtonElement;
		expect(button.disabled).toBe(true);

		fireEvent.click(button);
		expect(startCheckout).not.toHaveBeenCalled();
	});

	it('refuses to start a payment when the latch fires after render', () => {
		mockStorageDegraded = false;
		mockBlockIfDegraded.mockReturnValue(true);
		mockUseObservableSuspense.mockReturnValue({ uuid: 'order-1', number$: {} });
		mockIsRxDocument.mockReturnValue(true);
		mockUseObservableEagerState.mockReturnValueOnce('100').mockReturnValueOnce(null);
		const startCheckout = jest.fn();
		mockUseCheckoutSession.mockReturnValue({
			mode: 'contract',
			error: null,
			loading: false,
			startCheckout,
		});

		render(<Checkout resource={{} as never} />);

		const button = screen.getByTestId('process-payment-button') as HTMLButtonElement;
		expect(button.disabled).toBe(false);

		fireEvent.click(button);
		expect(mockBlockIfDegraded).toHaveBeenCalledWith('process-payment', expect.any(Object));
		expect(startCheckout).not.toHaveBeenCalled();
	});
});

/* -------------------------------------------------------------------------- */
/* Payment-frame gate (#1024 follow-up)                                       */
/* -------------------------------------------------------------------------- */

/**
 * `wcpos-process-payment` is a fire-and-forget postMessage with no ack and no
 * retry. Posted before the store's order-pay document has parsed, it is dropped
 * silently and the button spins forever. The footer must therefore stay gated
 * until the payment frame signals it has loaded.
 */

// Sentinel observables so the eager-state mock can answer per-subject rather
// than by call order — the component re-renders when the gate flips, and a
// call-order mock would go out of phase on the second render.
const NUMBER$ = { __kind: 'number$' };
const PAYMENT_URL$ = { __kind: 'paymentURL$' };

const PAYMENT_URL = 'https://shop.example.com/wcpos-checkout/order-pay/42';

function makeOrder() {
	return {
		uuid: 'order-1',
		id: 42,
		number$: NUMBER$,
		links$: { pipe: () => PAYMENT_URL$ },
		links: { payment: [{ href: PAYMENT_URL }] },
	};
}

function renderCheckout({
	mode,
	error = null,
	loading = false,
	paymentURL = PAYMENT_URL,
	startCheckout = jest.fn(),
	storageDegraded = false,
}: {
	mode: string;
	error?: string | null;
	loading?: boolean;
	paymentURL?: string;
	startCheckout?: jest.Mock;
	storageDegraded?: boolean;
}) {
	mockStorageDegraded = storageDegraded;
	mockBlockIfDegraded.mockReturnValue(storageDegraded);
	mockUseObservableSuspense.mockReturnValue(makeOrder());
	mockIsRxDocument.mockReturnValue(true);
	mockUseObservableEagerState.mockImplementation((observable: unknown) => {
		if (observable === NUMBER$) return '100';
		if (observable === PAYMENT_URL$) return paymentURL;
		return null; // stockRejection$
	});
	mockUseCheckoutSession.mockReturnValue({
		loading,
		mode,
		error,
		startCheckout,
		handleStockRejection: jest.fn(),
	});

	render(<Checkout resource={{} as never} />);

	return screen.getByTestId('process-payment-button') as HTMLButtonElement;
}

describe('Checkout — Process Payment is gated on the payment frame', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockUseObservableEagerState.mockReset();
		mockUseObservableSuspense.mockReset();
		mockUseCheckoutSession.mockReset();
		mockIsRxDocument.mockReset();
		// `clearAllMocks` does not drop implementations, and the #1019 suite above
		// leaves this returning true — reset it so each case states its own storage
		// health rather than inheriting the previous describe's.
		mockBlockIfDegraded.mockReset();
		mockBlockIfDegraded.mockReturnValue(false);
		mockStorageDegraded = false;
		paymentWebviewProps = { setFrameStatus: notRendered('PaymentWebview') };
		processPaymentProps = { onPress: notRendered('process-payment-button') };
	});

	it('disables Process Payment while the payment frame is still loading, and enables it on the load signal', () => {
		const button = renderCheckout({ mode: 'webview' });

		expect(button.disabled).toBe(true);
		// Same affordance as the frame's own overlay — a spinner, not a new pattern.
		expect(button.dataset.loading).toBe('true');

		act(() => {
			paymentWebviewProps.setFrameStatus('ready');
		});

		const loaded = screen.getByTestId('process-payment-button') as HTMLButtonElement;
		expect(loaded.disabled).toBe(false);
		expect(loaded.dataset.loading).toBe('false');
	});

	it('posts nothing when pressed before the frame has loaded', async () => {
		renderCheckout({ mode: 'webview' });

		// `disabled` stops the DOM click, so invoke the handler directly: the guard
		// must hold even if the press wins the race against the re-render.
		await act(async () => {
			await processPaymentProps.onPress?.();
		});

		expect(mockPostMessage).not.toHaveBeenCalled();

		act(() => {
			paymentWebviewProps.setFrameStatus('ready');
		});

		await act(async () => {
			await processPaymentProps.onPress?.();
		});

		expect(mockPostMessage).toHaveBeenCalledWith({ action: 'wcpos-process-payment' });
	});

	it('does not re-enable the button when another guard also applies', () => {
		// The gate is additive: a loaded frame must never override an independent
		// reason to keep the money path shut.
		const button = renderCheckout({ mode: 'webview', error: 'payment_gateways_fetch_failed' });

		act(() => {
			paymentWebviewProps.setFrameStatus('ready');
		});

		expect((screen.getByTestId('process-payment-button') as HTMLButtonElement).disabled).toBe(true);
		expect(button.dataset.loading).toBe('false');
	});

	it('refuses a press held over from before the frame was re-gated', async () => {
		// The frame's src is swapped after it went ready — a JWT refresh or a new
		// payment link. The press already in flight carries the closure from the
		// ready render, so a guard that reads that closure would post into a
		// document that is loading again, recreating the exact silent stall this
		// change exists to prevent. The guard has to read live state.
		renderCheckout({ mode: 'webview' });

		act(() => {
			paymentWebviewProps.setFrameStatus('ready');
		});
		const pressFromReadyRender = processPaymentProps.onPress;
		expect(pressFromReadyRender).toBeDefined();

		act(() => {
			paymentWebviewProps.setFrameStatus('loading');
		});

		await act(async () => {
			await pressFromReadyRender?.();
		});

		expect(mockPostMessage).not.toHaveBeenCalled();
	});

	/* ---------------------------------------------------------------------- */
	/* Composition with the #163/R5 degraded-storage latch (#1019)            */
	/* ---------------------------------------------------------------------- */

	it('keeps the degraded-storage guard winning when both it and the frame gate apply', async () => {
		// Both reasons block. The storage latch is the more urgent thing to tell a
		// cashier — cash taken against an order that cannot persist — so it must be
		// the one that speaks, and it must be the one that refuses the press.
		const button = renderCheckout({ mode: 'webview', storageDegraded: true });

		expect(button.disabled).toBe(true);
		expect(screen.getByTestId('checkout-storage-unavailable')).toBeTruthy();

		await act(async () => {
			await processPaymentProps.onPress?.();
		});

		// `blockIfDegraded` ran, which pins the ordering: it sits ahead of the frame
		// guard in the handler, so it refuses (and toasts) rather than the frame
		// gate silently swallowing the press.
		expect(mockBlockIfDegraded).toHaveBeenCalledWith('process-payment', expect.any(Object));
		expect(mockPostMessage).not.toHaveBeenCalled();
	});

	it('keeps the degraded-storage guard winning even once the frame is ready', async () => {
		// The sharper case: the frame gate would allow this press. Storage must not.
		const button = renderCheckout({ mode: 'webview', storageDegraded: true });

		act(() => {
			paymentWebviewProps.setFrameStatus('ready');
		});

		expect(button.disabled).toBe(true);

		await act(async () => {
			await processPaymentProps.onPress?.();
		});

		expect(mockBlockIfDegraded).toHaveBeenCalledWith('process-payment', expect.any(Object));
		expect(mockPostMessage).not.toHaveBeenCalled();
	});

	it('holds the frame gate on its own when storage is healthy', async () => {
		// The converse: with the storage latch clear, the frame gate is still the
		// thing keeping the money path shut — it does not lean on #1019.
		const button = renderCheckout({ mode: 'webview', storageDegraded: false });

		expect(button.disabled).toBe(true);
		expect(button.dataset.loading).toBe('true');
		expect(screen.queryByTestId('checkout-storage-unavailable')).toBeNull();

		await act(async () => {
			await processPaymentProps.onPress?.();
		});

		expect(mockBlockIfDegraded).toHaveBeenCalledWith('process-payment', expect.any(Object));
		expect(mockPostMessage).not.toHaveBeenCalled();

		// ...and it is the only thing: clearing it alone opens the button.
		act(() => {
			paymentWebviewProps.setFrameStatus('ready');
		});

		expect((screen.getByTestId('process-payment-button') as HTMLButtonElement).disabled).toBe(
			false
		);

		await act(async () => {
			await processPaymentProps.onPress?.();
		});

		expect(mockPostMessage).toHaveBeenCalledWith({ action: 'wcpos-process-payment' });
	});

	it('stops the spinner and says why when the payment frame fails to load', async () => {
		// A gate with no failure state is worse than no gate: the button would sit
		// disabled behind a spinner forever, waiting for a load event that a network
		// error means will never arrive.
		const button = renderCheckout({ mode: 'webview' });

		act(() => {
			paymentWebviewProps.setFrameStatus('failed');
		});

		expect(button.disabled).toBe(true);
		expect(button.dataset.loading).toBe('false');
		expect(screen.getByText('pos_checkout.payment_form_load_failed')).toBeTruthy();

		await act(async () => {
			await processPaymentProps.onPress?.();
		});

		expect(mockPostMessage).not.toHaveBeenCalled();
	});

	it('leaves contract-mode checkout untouched — there is no frame to wait for', async () => {
		const startCheckout = jest.fn();
		const button = renderCheckout({ mode: 'contract', startCheckout });

		expect(button.disabled).toBe(false);

		await act(async () => {
			await processPaymentProps.onPress?.();
		});

		expect(startCheckout).toHaveBeenCalledTimes(1);
		expect(mockPostMessage).not.toHaveBeenCalled();
	});
});

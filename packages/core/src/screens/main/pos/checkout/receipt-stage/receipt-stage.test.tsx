/** @jest-environment jsdom */
import * as React from 'react';
import { AccessibilityInfo } from 'react-native';

import * as Haptics from 'expo-haptics';
import { withDelay, withTiming } from 'react-native-reanimated';
import { act, fireEvent, render, screen } from '@testing-library/react';

import { Platform } from '@wcpos/utils/platform';

import { enterReceipt, getCheckoutModeSnapshot, resetCheckoutMode } from '../checkout-mode';
import { ReceiptStage } from './receipt-stage';

const mockReplace = jest.fn();
const mockSetCurrentOrderID = jest.fn();
let mockPrintedTo: string | null = null;
let mockAutoPrint = false;
let mockAutoPrintPending = false;
let mockBack: () => void;
const mockOrder = {
	uuid: 'paid',
	payload: { total: '92.95', currency_symbol: '$', meta_data: [] },
};
jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status: 'online-website-available' }),
}));
jest.mock('@wcpos/query', () => ({
	useRecordField: <T,>(source: T, select: (value: T) => unknown) => select(source),
}));
jest.mock('../../../hooks/use-engine-document', () => ({ useEngineRecord: () => mockOrder }));
jest.mock('observable-hooks', () => ({ useObservableSuspense: <T,>(value: T) => value }));
jest.mock('../../../receipt/use-receipt-document', () => ({
	useReceiptDocument: () => ({ printedTo: mockPrintedTo, autoPrintPending: mockAutoPrintPending }),
}));
jest.mock('../../../contexts/ui-settings', () => ({
	useUISettings: () => ({ uiSettings: { autoPrintReceipt: mockAutoPrint } }),
}));
jest.mock('../../../receipt/receipt-body', () => ({ ReceiptBody: () => null }));
jest.mock('../../../receipt/receipt-actions', () => ({ ReceiptActions: () => null }));
jest.mock('../../../hooks/use-payment-methods', () => ({
	usePaymentMethods: () => ({
		methods: [
			{ id: 'pos_cash', title: 'Cash' },
			{ id: 'till_cash', title: 'Till cash' },
			{ id: 'pos_card', title: 'Card' },
		],
	}),
}));
jest.mock('../../../hooks/use-currency-format', () => ({
	useCurrencyFormat: () => ({ format: (value: number) => `$${value.toFixed(2)}` }),
}));
jest.mock('../../../../../contexts/app-state', () => ({
	useStoreSession: () => ({ store: { price_num_decimals: 2 } }),
}));
jest.mock('../../../../../contexts/translations', () => ({
	useT: () => jest.requireActual('../../../../../../jest/translate').createTestT(),
}));
jest.mock('../../contexts/current-order/context', () => ({
	useCurrentOrderActions: () => ({ setCurrentOrderID: mockSetCurrentOrderID }),
}));
jest.mock('../column/use-checkout-back', () => ({
	useCheckoutBack: (back: () => void) => {
		mockBack = back;
	},
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children, testID }: { children?: React.ReactNode; testID?: string }) => (
		<span data-testid={testID}>{children}</span>
	),
}));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('expo-haptics', () => ({
	notificationAsync: jest.fn().mockResolvedValue(undefined),
	NotificationFeedbackType: { Success: 'success' },
}));
jest.mock('@wcpos/utils/platform', () => ({ Platform: { isNative: false } }));
jest.mock('uniwind', () => ({ useCSSVariable: () => 'green' }));
// jsdom cannot run the UI-thread runtime; preserve styles and SVG props for assertions.
jest.mock('react-native-reanimated', () => ({
	__esModule: true,
	default: {
		View: jest.requireActual('react-native').View,
		createAnimatedComponent: (component: unknown) => component,
	},
	useSharedValue: (value: number) => React.useRef({ value }).current,
	useAnimatedStyle: (style: () => object) => style(),
	useAnimatedProps: (props: () => object) => props(),
	withTiming: jest.fn((value: number) => value),
	withDelay: jest.fn((_delay: number, value: number) => value),
	cancelAnimation: jest.fn(),
}));
jest.mock('react-native-svg', () => ({
	__esModule: true,
	default: ({ children }: { children?: React.ReactNode }) => <svg>{children}</svg>,
	Path: ({
		animatedProps,
		...props
	}: React.SVGProps<SVGPathElement> & { animatedProps?: object }) => (
		<path {...props} {...animatedProps} />
	),
}));
jest.mock('@wcpos/components/button', () => ({
	Button: ({
		children,
		testID,
		onPress,
		disabled,
		className,
	}: {
		children?: React.ReactNode;
		testID?: string;
		onPress?: () => void;
		disabled?: boolean;
		className?: string;
	}) => (
		<button data-testid={testID} onClick={onPress} disabled={disabled} className={className}>
			{children}
		</button>
	),
	ButtonText: ({ children, testID }: { children?: React.ReactNode; testID?: string }) => (
		<span data-testid={testID}>{children}</span>
	),
}));

beforeEach(() => {
	jest.clearAllMocks();
	resetCheckoutMode();
	enterReceipt('paid');
	mockPrintedTo = null;
	mockAutoPrint = false;
	mockAutoPrintPending = false;
	Platform.isNative = false;
	jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
	mockOrder.payload.total = '92.95';
	mockOrder.payload.meta_data = [
		{
			key: '_wcpos_payments',
			value: {
				schema: 1,
				payments: [
					{
						id: 'cash',
						status: 'captured',
						method_id: 'pos_cash',
						kind: 'cash',
						amount: '92.95',
						tendered: '100.00',
						captured_at_gmt: null,
					},
				],
			},
		},
	] as never;
});
afterEach(() => jest.restoreAllMocks());
it('shows the change headline and cash tendered sub-line', () => {
	render(<ReceiptStage orderUuid="paid" compact={false} />);
	expect(screen.getByTestId('receipt-paid-banner').textContent).toContain('$92.95');
	expect(screen.getByTestId('checkout-paid-headline').textContent).toBe('Change $7.05');
	expect(screen.getByTestId('receipt-change-due').textContent).toBe('Change $7.05');
	expect(screen.getByTestId('receipt-paid-with').textContent).toBe(
		'Paid $92.95 · tendered $100.00 in cash'
	);
	expect(screen.queryByTestId('receipt-printed-to')).toBeNull();
});
it('recognizes a custom cash method from the payment row kind', () => {
	mockOrder.payload.meta_data = [
		{
			key: '_wcpos_payments',
			value: {
				schema: 1,
				payments: [
					{
						id: 'cash',
						status: 'captured',
						method_id: 'till_cash',
						kind: 'cash',
						amount: '92.95',
						tendered: '100.00',
					},
				],
			},
		},
	] as never;
	render(<ReceiptStage orderUuid="paid" compact={false} />);
	expect(screen.getByTestId('receipt-paid-with').textContent).toBe(
		'Paid $92.95 · tendered $100.00 in cash'
	);
});
it('sums cash-row tendered values for a mixed split', () => {
	mockOrder.payload.total = '100.00';
	mockOrder.payload.meta_data = [
		{
			key: '_wcpos_payments',
			value: {
				schema: 1,
				payments: [
					{
						id: 'cash',
						status: 'captured',
						method_id: 'pos_cash',
						kind: 'cash',
						amount: '40.00',
						tendered: '50.00',
					},
					{
						id: 'card',
						status: 'captured',
						method_id: 'pos_card',
						kind: 'card',
						amount: '60.00',
						tendered: null,
					},
				],
			},
		},
	] as never;
	render(<ReceiptStage orderUuid="paid" compact={false} />);
	expect(screen.getByTestId('receipt-paid-with').textContent).toBe(
		'Paid $100.00 · tendered $50.00 in cash · 2 payments'
	);
});
it('counts recorded-offline authorizations as settled payments', () => {
	mockOrder.payload.meta_data = [
		{
			key: '_wcpos_payments',
			value: {
				schema: 1,
				payments: [
					{
						id: 'cash',
						status: 'captured',
						method_id: 'pos_cash',
						kind: 'cash',
						amount: '40.00',
						tendered: '40.00',
					},
					{
						id: 'card',
						status: 'authorized',
						recorded_offline: true,
						method_id: 'pos_card',
						kind: 'card',
						amount: '52.95',
						tendered: null,
					},
				],
			},
		},
	] as never;
	render(<ReceiptStage orderUuid="paid" compact={false} />);
	expect(screen.getByTestId('receipt-paid-with').textContent).toBe('Cash + Card · 2 payments');
});
it('shows successful printing and omits zero change', () => {
	mockPrintedTo = 'Till printer';
	mockOrder.payload.meta_data = [];
	render(<ReceiptStage orderUuid="paid" compact={false} />);
	expect(screen.getByTestId('receipt-printed-to').textContent).toContain('Till printer');
	expect(screen.queryByTestId('receipt-change-due')).toBeNull();
});
it.each(['receipt-no-receipt', 'receipt-new-sale'])(
	'%s finishes the sale on both layouts',
	(testID) => {
		const wide = render(<ReceiptStage orderUuid="paid" compact={false} />);
		fireEvent.click(screen.getByTestId(testID));
		expect(getCheckoutModeSnapshot().receiptOrders.has('paid')).toBe(false);
		expect(mockSetCurrentOrderID).toHaveBeenCalledWith('');
		expect(mockReplace).not.toHaveBeenCalled();
		wide.unmount();
		enterReceipt('paid');
		render(<ReceiptStage orderUuid="paid" compact />);
		fireEvent.click(screen.getByTestId(testID));
		expect(getCheckoutModeSnapshot().selectedReceiptOrder).toBeNull();
		expect(mockSetCurrentOrderID).toHaveBeenCalledTimes(2);
		expect(mockReplace).toHaveBeenCalledWith({ pathname: '/cart' });
	}
);
it('finishes on Android hardware back', () => {
	render(<ReceiptStage orderUuid="paid" compact />);
	act(() => mockBack());
	expect(getCheckoutModeSnapshot().receiptOrders.size).toBe(0);
	expect(mockSetCurrentOrderID).toHaveBeenCalledWith('');
	expect(mockReplace).toHaveBeenCalledWith({ pathname: '/cart' });
});

it('shows the paid headline and joined methods with only captured payments counted', () => {
	mockOrder.payload.meta_data = [
		{
			key: '_wcpos_payments',
			value: {
				schema: 1,
				payments: [
					{
						id: 'cash',
						status: 'captured',
						method_id: 'pos_cash',
						amount: '40.00',
						tendered: '40.00',
					},
					{ id: 'card', status: 'captured', method_id: 'pos_card', amount: '52.95' },
					{ id: 'failed', status: 'failed', method_id: 'pos_card', amount: '52.95' },
				],
			},
		},
	] as never;
	render(<ReceiptStage orderUuid="paid" compact={false} />);
	expect(screen.getByTestId('checkout-paid-headline').textContent).toBe('Paid $92.95');
	expect(screen.getByTestId('receipt-paid-with').textContent).toBe('Cash + Card · 2 payments');
	expect(screen.queryByTestId('receipt-change-due')).toBeNull();
});
it.each([false, true])(
	'labels the primary using auto-print = %s, not a manual print result',
	(autoPrint) => {
		mockAutoPrint = autoPrint;
		mockPrintedTo = 'Till printer';
		render(<ReceiptStage orderUuid="paid" compact />);
		expect(screen.getByTestId('receipt-new-sale').textContent).toBe(
			autoPrint ? 'Print receipt · New sale' : 'New sale'
		);
		expect(screen.getByTestId('receipt-new-sale').className).toContain('w-full');
		expect(screen.getByTestId('checkout-paid-print').closest('button')).toBe(
			screen.getByTestId('receipt-new-sale')
		);
		expect(screen.getByTestId('checkout-paid-none').closest('button')).toBe(
			screen.getByTestId('receipt-no-receipt')
		);
		expect(screen.getByTestId('receipt-no-receipt').textContent).toBe('No receipt · New sale');
	}
);
it('keeps both finish actions disabled while auto-print is pending', () => {
	mockAutoPrintPending = true;
	render(<ReceiptStage orderUuid="paid" compact />);
	for (const id of ['receipt-new-sale', 'receipt-no-receipt']) {
		fireEvent.click(screen.getByTestId(id));
		expect((screen.getByTestId(id) as HTMLButtonElement).disabled).toBe(true);
	}
	expect(getCheckoutModeSnapshot().receiptOrders.has('paid')).toBe(true);
	expect(mockSetCurrentOrderID).not.toHaveBeenCalled();
});
it('renders a complete tick and surface without animation when motion is reduced', async () => {
	await act(async () => {
		render(<ReceiptStage orderUuid="paid" compact />);
	});
	expect(AccessibilityInfo.isReduceMotionEnabled).toHaveBeenCalledTimes(1);
	expect(withTiming).not.toHaveBeenCalled();
	expect(withDelay).not.toHaveBeenCalled();
	expect(
		screen.getByTestId('checkout-paid').querySelector('path')?.getAttribute('stroke-dashoffset')
	).toBe('0');
	expect(screen.getByTestId('receipt-paid-banner').style.opacity).toBe('1');
});
it('starts the pop and delayed tick when motion is allowed', async () => {
	let resolvePreference!: (enabled: boolean) => void;
	jest
		.mocked(AccessibilityInfo.isReduceMotionEnabled)
		.mockImplementationOnce(() => new Promise<boolean>((resolve) => (resolvePreference = resolve)));
	render(<ReceiptStage orderUuid="paid" compact />);
	expect(screen.getByTestId('receipt-paid-banner').style.opacity).toBe('0');
	await act(async () => {
		resolvePreference(false);
	});
	expect(withTiming).toHaveBeenCalledWith(1, expect.objectContaining({ duration: 400 }));
	expect(withTiming).toHaveBeenCalledWith(0, expect.objectContaining({ duration: 450 }));
	expect(withDelay).toHaveBeenCalledWith(150, expect.anything());
});
it.each([false, true])('only sends a success haptic on native = %s', async (native) => {
	Platform.isNative = native;
	await act(async () => {
		render(<ReceiptStage orderUuid="paid" compact />);
	});
	expect(Haptics.notificationAsync).toHaveBeenCalledTimes(native ? 1 : 0);
	if (native)
		expect(Haptics.notificationAsync).toHaveBeenCalledWith(
			Haptics.NotificationFeedbackType.Success
		);
});
it('still allows finishing when native haptics reject', async () => {
	Platform.isNative = true;
	jest.mocked(Haptics.notificationAsync).mockRejectedValueOnce(new Error('Unavailable'));
	await act(async () => {
		render(<ReceiptStage orderUuid="paid" compact />);
	});
	fireEvent.click(screen.getByTestId('receipt-new-sale'));
	expect(getCheckoutModeSnapshot().receiptOrders.has('paid')).toBe(false);
});

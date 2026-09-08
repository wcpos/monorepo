/**
 * @jest-environment jsdom
 */
import * as React from 'react';
import { BackHandler, Platform } from 'react-native';

import { fireEvent, render, renderHook, screen } from '@testing-library/react';

import type { EngineRecord } from '@wcpos/query';
import type { PaymentMethodDescriptor } from '@wcpos/order-math';

import { CheckoutLedger } from '../../cart/checkout-ledger';
import { useCheckoutBack } from './use-checkout-back';
import { CheckoutColumn } from './checkout-column';
import { enterCheckout, getCheckoutModeSnapshot, resetCheckoutMode } from '../checkout-mode';
import { initialTenderState } from '../tender/tender-state';

import type { LedgerView } from '../tender/use-ledger-view';
import type { TenderFlow } from '../tender/use-tender-flow';

const mockPickMethod = jest.fn();
const mockBack = jest.fn();
let mockScreenSize: 'sm' | 'md' | 'lg' = 'lg';
let mockFlow: TenderFlow;
let mockNumber = '1187';
const mockUseFlow = jest.fn(() => mockFlow);

const method = (overrides: Partial<PaymentMethodDescriptor> = {}): PaymentMethodDescriptor => ({
	schema: 1,
	id: 'pos_cash',
	title: 'Cash',
	kind: 'cash',
	pos_enabled: true,
	order: 1,
	capture: { mode: 'manual', provider: null, hardware: null, webview_available: false },
	capabilities: {
		amount: { partial: true },
		change: true,
		refunds: { via: 'manual', partial: true },
		tips: 'none',
		offline: 'record',
		void: false,
	},
	defaults: { order_status: 'completed', rounding: null, open_drawer: true },
	provider_data: {},
	...overrides,
});

jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status: 'online-website-available' }),
}));
jest.mock('../tender/use-ledger-view', () => ({
	useLedgerView: () => ({ ...mockFlow, format: (minor: number) => `$${(minor / 100).toFixed(2)}` }),
}));
jest.mock('../tender/use-tender-flow', () => ({ useTenderFlow: () => mockUseFlow() }));
jest.mock('../tender/legacy-tab', () => ({ LegacyTab: () => <div data-testid="legacy-tab" /> }));
jest.mock('../../cart/totals-changed-banner', () => ({ TotalsChangedBanner: () => null }));
jest.mock('../../../hooks/use-storage-health', () => ({
	useStorageMoneyPathGuard: () => ({ storageDegraded: false, blockIfDegraded: () => false }),
}));
jest.mock('../../../hooks/use-currency-format', () => ({
	useCurrencyFormat: () => ({ format: (value: number) => `$${value.toFixed(2)}` }),
}));
jest.mock('../../../../../contexts/theme', () => ({
	useTheme: () => ({ screenSize: mockScreenSize }),
}));
jest.mock('../../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockBack }) }));
jest.mock('../../contexts/current-order/context', () => ({ useCurrentOrder: jest.fn() }));
jest.mock('@wcpos/query', () => ({
	useRecordField: (_order: unknown, select: (record: unknown) => unknown) =>
		select({ payload: { id: 1187, number: mockNumber, currency_symbol: '$', line_items: [] } }),
}));

// Chrome only: the assertions are about which pane renders, not how a modal or a
// tab strip paints. Everything that carries a testID stays real.
jest.mock('@wcpos/components/tabs', () => ({
	Tabs: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
	TabsList: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
	TabsTrigger: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/collapsible', () => ({
	Collapsible: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
	CollapsibleTrigger: ({ children, testID }: { children?: React.ReactNode; testID?: string }) => (
		<button data-testid={testID}>{children}</button>
	),
	CollapsibleContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/status-badge', () => ({
	StatusBadge: ({ label }: { label: string }) => <span>{label}</span>,
}));
jest.mock('@wcpos/components/loader', () => ({ Loader: () => null }));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children, testID }: { children?: React.ReactNode; testID?: string }) => (
		<span data-testid={testID}>{children}</span>
	),
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/button', () => ({
	Button: ({
		children,
		testID,
		disabled,
		onPress,
	}: {
		children?: React.ReactNode;
		testID?: string;
		disabled?: boolean;
		onPress?: () => void;
	}) => (
		<button data-testid={testID} disabled={!!disabled} onClick={onPress}>
			{children}
		</button>
	),
	ButtonText: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));

const order = { uuid: 'order-1' } as EngineRecord<'orders'>;

function makeFlow(overrides: Partial<TenderFlow> = {}): TenderFlow {
	return {
		state: initialTenderState,
		dispatch: jest.fn(),
		dp: 2,
		totalMinor: 9295,
		paidMinor: 0,
		balanceMinor: 9295,
		rows: [],
		liveRows: [],
		hasLiveLeg: false,
		online: true,
		tiles: [{ method: method(), disabled: false, reason: null, worksOffline: true }],
		legacyMethods: [],
		methodsLoaded: true,
		unsupportedSchema: false,
		method: null,
		entryAppliedMinor: 0,
		entryChangeMinor: 0,
		quickAmountsMinor: [],
		busy: false,
		saveState: null,
		pickMethod: mockPickMethod,
		takeTender: jest.fn(),
		cancelPayment: jest.fn(),
		...overrides,
	} as TenderFlow;
}

function mountColumn() {
	return render(<CheckoutColumn order={order} />);
}
beforeEach(() => {
	jest.clearAllMocks();
	mockNumber = '1187';
	resetCheckoutMode();
	enterCheckout('order-1');
	mockFlow = makeFlow();
	mockFlow satisfies LedgerView;
});
it.each([false, true])('Cart protects a live leg: %s', (live) => {
	mockFlow = makeFlow({ hasLiveLeg: live });
	mountColumn();
	fireEvent.click(screen.getByTestId('checkout-back-to-cart'));
	expect(getCheckoutModeSnapshot().checkoutOrders.has('order-1')).toBe(live);
	if (live) expect(mockFlow.dispatch).toHaveBeenCalledWith({ type: 'request-cancel' });
});
it.each([false, true])('Escape uses the same back action: live %s', (live) => {
	mockFlow = makeFlow({ hasLiveLeg: live });
	mountColumn();
	fireEvent.keyDown(document, { key: 'Escape' });
	expect(getCheckoutModeSnapshot().checkoutOrders.has('order-1')).toBe(live);
	if (live) expect(mockFlow.dispatch).toHaveBeenCalledWith({ type: 'request-cancel' });
});
it('leaves Escape to dialogs and editable fields', () => {
	mountColumn();
	const dialog = document.createElement('div');
	dialog.setAttribute('role', 'dialog');
	document.body.append(dialog);
	fireEvent.keyDown(document, { key: 'Escape' });
	dialog.remove();
	for (const tag of ['input', 'textarea', 'div']) {
		const target = document.createElement(tag);
		if (tag === 'div') target.setAttribute('contenteditable', 'true');
		document.body.append(target);
		fireEvent.keyDown(target, { key: 'Escape' });
		target.remove();
	}
	expect(getCheckoutModeSnapshot().checkoutOrders.has('order-1')).toBe(true);
});
it('ignores already handled Escape and unregisters on unmount', () => {
	const { unmount } = mountColumn();
	const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
	event.preventDefault();
	document.dispatchEvent(event);
	expect(getCheckoutModeSnapshot().checkoutOrders.has('order-1')).toBe(true);
	unmount();
	fireEvent.keyDown(document, { key: 'Escape' });
	expect(getCheckoutModeSnapshot().checkoutOrders.has('order-1')).toBe(true);
});

jest.mock('../../../hooks/use-customer-name-format', () => ({
	useCustomerNameFormat: () => ({ format: () => 'Guest' }),
}));
jest.mock('@wcpos/components/card', () => ({
	Card: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	CardContent: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	CardHeader: ({ children, testID }: React.PropsWithChildren<{ testID?: string }>) => (
		<div data-testid={testID}>{children}</div>
	),
}));
it('reads the ledger independently, with balance only in the tender header', () => {
	mockFlow = makeFlow({ paidMinor: 5000, balanceMinor: 4295 });
	render(
		<>
			<CheckoutColumn order={order} />
			<CheckoutLedger order={order} />
		</>
	);
	expect(mockUseFlow).toHaveBeenCalledTimes(1);
	expect(screen.getAllByTestId('checkout-balance')).toHaveLength(1);
	expect(screen.getByTestId('checkout-balance').textContent).toBe('$42.95');
	expect(screen.getByTestId('checkout-ledger-remaining').textContent).toBe('$42.95');
	expect(screen.getByTestId('checkout-ledger-totals').textContent).toContain('$50.00');
	expect(screen.getByTestId('checkout-ledger-header').textContent).toContain('Guest');
});
it('owns Android hardware back only while mounted', () => {
	const os = jest.replaceProperty(Platform, 'OS', 'android');
	let back: Parameters<typeof BackHandler.addEventListener>[1] | undefined;
	const remove = jest.fn();
	const listener = jest
		.spyOn(BackHandler, 'addEventListener')
		.mockImplementation((_event, handler) => {
			back = handler;
			return { remove };
		});
	const { unmount } = mountColumn();
	expect(back?.({ type: 'hardwareBackPress', timeStamp: 0 })).toBe(true);
	expect(getCheckoutModeSnapshot().checkoutOrders.has('order-1')).toBe(false);
	unmount();
	expect(remove).toHaveBeenCalled();
	listener.mockRestore();
	os.restore();
});

it('does not silently finish a receipt on Escape', () => {
	const finishSale = jest.fn();
	renderHook(() => useCheckoutBack(finishSale, { escape: false }));
	fireEvent.keyDown(document, { key: 'Escape' });
	expect(finishSale).not.toHaveBeenCalled();
});

it('leaves a live terminal leg without whole-order cancellation', () => {
	mockFlow = makeFlow({ hasLiveLeg: true, hasLiveTerminalLeg: true });
	mountColumn();
	fireEvent.click(screen.getByTestId('checkout-back-to-cart'));
	expect(getCheckoutModeSnapshot().checkoutOrders.has('order-1')).toBe(false);
	expect(mockFlow.dispatch).not.toHaveBeenCalled();
	expect(screen.queryByTestId('checkout-cancel-payment')).toBeNull();
});
it('offers whole-order cancellation after a final terminal result, not while live', () => {
	mockFlow = makeFlow({
		state: { ...initialTenderState, view: 'cancel' },
		terminalLeg: {
			phase: 'final',
			outcome: 'failed',
			row: { method_id: 'card', amount: '5.00', provider_refs: {} },
			clientEvents: [],
		} as unknown as NonNullable<TenderFlow['terminalLeg']>,
	});
	const { rerender } = mountColumn();
	expect(screen.getByTestId('checkout-cancel-confirm')).not.toBeNull();
	mockFlow = {
		...mockFlow,
		terminalLeg: { ...mockFlow.terminalLeg!, phase: 'polling', outcome: null },
		hasLiveTerminalLeg: true,
	};
	rerender(<CheckoutColumn order={order} />);
	expect(screen.queryByTestId('checkout-cancel-confirm')).toBeNull();
	expect(screen.getByTestId('checkout-terminal-cancel')).not.toBeNull();
});
it('shows a title skeleton while saving an unnumbered order', () => {
	mockNumber = '';
	mockFlow = makeFlow({ saveState: { kind: 'saving' } });
	const { rerender } = render(<CheckoutColumn order={order} />);
	expect(screen.getByTestId('checkout-title-skeleton')).not.toBeNull();
	mockFlow = makeFlow();
	rerender(<CheckoutColumn order={order} />);
	expect(screen.queryByTestId('checkout-title-skeleton')).toBeNull();
});

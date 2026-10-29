/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { OpenOrders } from './index';
import { consumeRegisterPanelRequest } from './register-panel-request';

let mockPosition = 'bottom';
let mockIsNew = false;
let mockStage = 'cart';
let mockBindingStatus = 'bound';
let mockDirectoryFailed = false;
let mockRetrying: false | 'none' | 'failed' = false;

jest.mock('../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('./register-bar', () => ({
	RegisterBar: ({
		panelOpen,
		onPanelOpenChange,
	}: {
		panelOpen: boolean;
		onPanelOpenChange: (open: boolean) => void;
	}) =>
		panelOpen ? <button data-testid="panel-open" onClick={() => onPanelOpenChange(false)} /> : null,
}));
// The strip's portal comes with the edge surface, which reads the safe-area insets.
jest.mock('react-native-safe-area-context', () => ({
	useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('../../components/session-hold-banner', () => ({ SessionHoldBanner: () => null }));
jest.mock('./register-gate-card', () => ({
	RegisterGateCard: ({ failed }: { failed: boolean }) => (
		<div data-testid="register-gate-card" data-failed={String(failed)} />
	),
}));
jest.mock('./register-picker', () => ({ RegisterPicker: () => null }));
jest.mock('./open-register-card', () => ({
	OpenRegisterCard: () => <div data-testid="open-register-card" />,
}));
jest.mock('./register-count', () => ({ RegisterCount: () => null }));
jest.mock('../../../../services/register/use-register-binding', () => ({
	useRegisterBinding: () => ({
		status: mockBindingStatus,
		failed: mockDirectoryFailed,
		retrying: mockRetrying,
		registers: [],
	}),
}));
let mockSession: {
	session: { id: string; status: string } | null;
	sessionsOn: boolean;
	loaded?: boolean;
	countingHere?: boolean;
	countingElsewhere?: boolean;
	overdue?: boolean;
} = {
	session: null,
	sessionsOn: false,
};
jest.mock('../../../../services/register-session/use-register-session', () => ({
	useRegisterSession: () => ({ loaded: true, ...mockSession }),
}));
jest.mock('../../contexts/ui-settings', () => ({
	useUISettings: () => ({ uiSettings: { openOrdersPosition: mockPosition } }),
}));
jest.mock('@wcpos/query', () => ({
	useDocField: <T,>(source: T, select: (value: T) => unknown) => select(source),
}));
jest.mock('../contexts/current-order', () => ({
	useCurrentOrder: () => ({ currentOrderRecord: { uuid: 'order-1', isNew: mockIsNew } }),
}));
jest.mock('./table', () => ({ CartTable: () => <div data-testid="cart-table" /> }));
jest.mock('./totals', () => ({ Totals: () => <div /> }));
jest.mock('./totals-changed-banner', () => ({ CartTotalsChangedBanner: () => <div /> }));
jest.mock('./conditions-notice', () => ({ CartConditionsNotice: () => null }));
jest.mock('../conditions/use-cart-conditions', () => ({
	CartConditionsProvider: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('./cart-header', () => ({ CartHeader: () => <div data-testid="cart-header" /> }));
jest.mock('@wcpos/components/empty-state', () => ({
	EmptyState: ({ testID }: { testID?: string }) => <div data-testid={testID} />,
}));
jest.mock('./foot', () => ({
	CartFoot: ({ onOpenSheet }: { onOpenSheet: () => void }) => (
		<div data-testid="checkout-button" onClick={onOpenSheet} />
	),
}));
jest.mock('./order-sheet', () => ({
	OrderSheet: ({ open }: { open: boolean }) => (open ? <div data-testid="order-sheet" /> : null),
}));
const mockVoidOrder = jest.fn();
jest.mock('../hooks/use-void-order', () => ({
	useVoidOrder: ({ onBeforeVoid }: { onBeforeVoid?: () => void }) => ({
		voidOrder: async () => {
			onBeforeVoid?.();
			mockVoidOrder();
		},
		storageDegraded: false,
	}),
}));
let mockScreenFocused = true;
jest.mock('expo-router/react-navigation', () => ({ useIsFocused: () => mockScreenFocused }));
jest.mock('./tabs', () => ({
	OpenOrderTabs: ({ onCoverChange }: { onCoverChange: (covered: boolean) => Promise<void> }) => (
		<button data-testid="open-orders" onClick={() => void onCoverChange(true)} />
	),
}));

// Keep the slot and its registration real; replace native chrome and data-heavy children.
jest.mock('@wcpos/components/error-boundary', () => ({
	ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('@wcpos/components/card', () => ({
	Card: ({ children }: { children: React.ReactNode }) => (
		<div data-testid="cart-card">{children}</div>
	),
	CardContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/button', () => ({
	Button: ({
		children,
		testID,
		onPress,
	}: {
		children?: React.ReactNode;
		testID?: string;
		onPress?: () => void;
	}) => (
		<button data-testid={testID} onClick={onPress}>
			{children}
		</button>
	),
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));

jest.mock('../checkout/checkout-mode', () => ({ useOrderCheckoutStage: () => mockStage }));
jest.mock('./stilled-cart', () => ({ StilledCart: () => <div data-testid="cart-card" /> }));
it("the empty cart's Close register opens the panel on the count pane", async () => {
	const previous = mockSession,
		previousNew = mockIsNew;
	mockSession = { session: { id: 's', status: 'open' }, sessionsOn: true, overdue: true };
	mockIsNew = true;
	try {
		render(<OpenOrders isColumn />);
		fireEvent.click(screen.getByTestId('checkout-close-register'));
		expect(screen.getByTestId('panel-open')).toBeTruthy();
		expect(consumeRegisterPanelRequest()).toBe('count');
	} finally {
		mockSession = previous;
		mockIsNew = previousNew;
		consumeRegisterPanelRequest();
	}
});
it('a reload mid-count reopens the count pane once', async () => {
	const previous = mockSession;
	mockSession = { session: { id: 's', status: 'counting' }, sessionsOn: true, countingHere: true };
	try {
		const view = render(<OpenOrders isColumn />);
		await waitFor(() => expect(screen.getByTestId('panel-open')).toBeTruthy());
		expect(consumeRegisterPanelRequest()).toBe('count');
		fireEvent.click(screen.getByTestId('panel-open'));
		view.rerender(<OpenOrders isColumn />);
		expect(screen.queryByTestId('panel-open')).toBeNull();
		expect(consumeRegisterPanelRequest()).toBeNull();
	} finally {
		mockSession = previous;
		consumeRegisterPanelRequest();
	}
});

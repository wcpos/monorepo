/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { consumeRegisterPanelRequest, requestRegisterPanel } from './register-panel-request';
import { consumeCashierSheetRequest } from '../../components/cashier-entry/cashier-sheet-request';
import { RegisterBar } from './register-bar';

jest.mock('expo-haptics', () => ({}));
// The bar carries the notifications bell (language decision 42); its Popover primitive ships
// untransformed JSX, so the bell is a stub here as it is in the rail test.
jest.mock('../../components/notification-bell/notification-bell', () => ({
	NotificationBell: ({ testID }: { testID?: string }) => <div data-testid={testID ?? 'bell'} />,
}));

jest.mock('./user-sheet', () => ({
	UserSheet: ({
		open,
		onOpenRegister,
	}: {
		open: boolean;
		onOpenRegister?: (pane?: 'register' | 'count') => void;
	}) =>
		open ? (
			<div data-testid="user-sheet">
				<button data-testid="user-sheet-drawer" onClick={() => onOpenRegister?.()} />
				<button data-testid="user-sheet-close-register" onClick={() => onOpenRegister?.('count')} />
			</div>
		) : null,
}));
let mockStores: string[] = [];
let mockIsPhone = true;
jest.mock('@wcpos/components/lib/device', () => ({
	useIsPhone: () => mockIsPhone,
	usePointer: () => 'coarse',
}));

jest.mock('../../../../hooks/use-wcpos-auth/redirect-result', () => ({
	takeRedirectReturn: () => false,
}));
jest.mock('expo-router', () => ({ useNavigation: () => ({}) }));
jest.mock('../../../../contexts/app-state', () => ({
	useStoreSession: () => ({
		site: { wcpos_login_url: 'https://shop.test/login' },
		store: { name: 'Shop' },
		wpCredentials: { display_name: 'Cashier', stores: mockStores },
	}),
}));
jest.mock('../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
let mockBinding: Record<string, unknown> = {
	status: 'bound',
	registerName: 'Front',
	registers: [{ id: 'r' }],
};
jest.mock('../../../../services/register/use-register-binding', () => ({
	useRegisterBinding: () => mockBinding,
}));
jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status: 'online-website-available' }),
}));
jest.mock('@wcpos/query', () => ({
	useDocField: (doc: unknown, pick: (doc: unknown) => unknown) => pick(doc),
}));
jest.mock('@wcpos/components/button', () => ({
	Button: ({
		testID,
		onPress,
		children,
	}: {
		testID: string;
		onPress: () => void;
		children: React.ReactNode;
	}) => (
		<button data-testid={testID} onClick={onPress}>
			{children}
		</button>
	),
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ testID, children }: { testID: string; children: React.ReactNode }) => (
		<span data-testid={testID}>{children}</span>
	),
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/status-badge', () => ({
	StatusBadge: ({ label, testID }: { label: string; testID?: string }) => (
		<span data-testid={testID}>{label}</span>
	),
}));
jest.mock('../../components/user-avatar', () => ({ UserAvatar: () => null }));

beforeEach(() => {
	mockIsPhone = true;
	mockBinding = { status: 'bound', registerName: 'Front', registers: [{ id: 'r' }] };
});

// Try again republishes `unknown` while it runs; the pill keeps the state being retried.
it.each([
	['none', 'register.no_register'],
	['failed', 'register.offline'],
] as const)('keeps the %s pill while a retry is in flight', (retrying, pill) => {
	mockBinding = { status: 'unknown', failed: false, retrying, registerName: null, registers: [] };
	render(<RegisterBar panelOpen={false} onPanelOpenChange={jest.fn()} />);
	expect(screen.getByTestId('register-bar-pill').textContent).toBe(pill);
});
it('opens the user sheet from the bar avatar', () => {
	render(<RegisterBar panelOpen={false} onPanelOpenChange={jest.fn()} />);
	expect(screen.queryByTestId('user-sheet')).toBeNull();
	expect(screen.getByTestId('register-bar-place').textContent).toBe('Shop');
	fireEvent.click(screen.getByTestId('register-bar-avatar'));
	expect(screen.getByTestId('user-sheet')).toBeTruthy();
});
let mockSession: { status: string } | null = null;
jest.mock('../../../../services/register-session/use-register-session', () => ({
	useRegisterSession: () => ({ session: mockSession, sessionsOn: true, overdue: false }),
}));
jest.mock('./register-panel', () => ({
	RegisterPanel: ({ initialPane }: { initialPane: string }) => (
		<div data-testid="requested-pane">{initialPane}</div>
	),
}));
// One door to the register (Paul, 2026-10-29): the bar has no register button, on any size and
// with a session open; the avatar's sheet opens the panel through the bar.
it.each([true, false])('has the avatar and no register button (phone: %s)', (phone) => {
	mockIsPhone = phone;
	mockSession = { status: 'open' };
	const onPanelOpenChange = jest.fn();
	render(<RegisterBar panelOpen={false} onPanelOpenChange={onPanelOpenChange} />);
	expect(screen.queryByTestId('register-bar-drawer')).toBeNull();
	fireEvent.click(screen.getByTestId('register-bar-avatar'));
	fireEvent.click(screen.getByTestId('user-sheet-drawer'));
	expect(onPanelOpenChange).toHaveBeenCalledWith(true);
	mockSession = null;
});

let mockFocused = true;
jest.mock('expo-router/react-navigation', () => ({ useIsFocused: () => mockFocused }));
it("opens the register panel when a page bar's sheet asked for it, on the focused bar only", () => {
	const hiddenOpen = jest.fn();
	const onPanelOpenChange = jest.fn();
	requestRegisterPanel();
	mockFocused = false;
	render(<RegisterBar panelOpen={false} onPanelOpenChange={hiddenOpen} />);
	mockFocused = true;
	render(<RegisterBar panelOpen={false} onPanelOpenChange={onPanelOpenChange} />);
	expect(hiddenOpen).not.toHaveBeenCalled();
	expect(onPanelOpenChange).toHaveBeenCalledWith(true);
	expect(consumeRegisterPanelRequest()).toBeNull();
});

it('the store title opens the cashier sheet instead of a sheet of its own', () => {
	mockStores = ['a', 'b'];
	mockIsPhone = false;
	render(<RegisterBar panelOpen={false} onPanelOpenChange={jest.fn()} />);
	fireEvent.click(screen.getByTestId('register-bar-store'));
	// The bar's own avatar claims the request, on wide as on the phone.
	expect(screen.getByTestId('user-sheet')).toBeTruthy();
	expect(consumeCashierSheetRequest()).toBe(false);
	expect(screen.queryByTestId('switch-store-sheet')).toBeNull();
	mockStores = [];
});

it('passes the count pane claimed from an external request to its panel', () => {
	try {
		requestRegisterPanel('count');
		render(<RegisterBar panelOpen onPanelOpenChange={jest.fn()} />);
		expect(screen.getByTestId('requested-pane').textContent).toBe('count');
	} finally {
		consumeRegisterPanelRequest();
	}
});

it('an ordinary cashier-sheet opening replaces a consumed count request', () => {
	try {
		requestRegisterPanel('count');
		const onPanelOpenChange = jest.fn();
		const view = render(<RegisterBar panelOpen onPanelOpenChange={onPanelOpenChange} />);
		expect(consumeRegisterPanelRequest()).toBeNull();
		view.rerender(<RegisterBar panelOpen={false} onPanelOpenChange={onPanelOpenChange} />);
		fireEvent.click(screen.getByTestId('register-bar-avatar'));
		fireEvent.click(screen.getByTestId('user-sheet-drawer'));
		expect(screen.getByTestId('requested-pane').textContent).toBe('register');
		expect(onPanelOpenChange).toHaveBeenCalledWith(true);
	} finally {
		consumeRegisterPanelRequest();
	}
});

it('the cashier sheet Close register door opens the count pane through the bar', () => {
	const onPanelOpenChange = jest.fn();
	render(<RegisterBar panelOpen={false} onPanelOpenChange={onPanelOpenChange} />);
	fireEvent.click(screen.getByTestId('register-bar-avatar'));
	fireEvent.click(screen.getByTestId('user-sheet-close-register'));
	expect(screen.getByTestId('requested-pane').textContent).toBe('count');
	expect(onPanelOpenChange).toHaveBeenCalledWith(true);
});

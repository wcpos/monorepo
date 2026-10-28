/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { RegisterBar } from './register-bar';

jest.mock('expo-haptics', () => ({}));
// The bar carries the notifications bell (language decision 42); its Popover primitive ships
// untransformed JSX, so the bell is a stub here as it is in the rail test.
jest.mock('../../components/notification-bell/notification-bell', () => ({
	NotificationBell: ({ testID }: { testID?: string }) => <div data-testid={testID ?? 'bell'} />,
}));

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
		wpCredentials: { display_name: 'Cashier', stores: [] },
	}),
}));
let mockScreenSize: 'sm' | 'lg' = 'sm';
jest.mock('../../../../contexts/theme', () => ({
	useTheme: () => ({ screenSize: mockScreenSize }),
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
jest.mock('./switch-store-sheet', () => ({ SwitchStoreSheet: () => null }));
jest.mock('./user-sheet', () => ({
	UserSheet: ({ open }: { open: boolean }) => (open ? <div data-testid="user-sheet" /> : null),
}));

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
	render(
		<RegisterBar onSwitchRegister={jest.fn()} panelOpen={false} onPanelOpenChange={jest.fn()} />
	);
	expect(screen.getByTestId('register-bar-pill').textContent).toBe(pill);
});
it('opens the user sheet from the bar avatar', () => {
	render(
		<RegisterBar onSwitchRegister={jest.fn()} panelOpen={false} onPanelOpenChange={jest.fn()} />
	);
	expect(screen.queryByTestId('user-sheet')).toBeNull();
	expect(screen.getByTestId('register-bar-place').textContent).toBe('Shop');
	fireEvent.click(screen.getByTestId('register-bar-avatar'));
	expect(screen.getByTestId('user-sheet')).toBeTruthy();
});
let mockSession: { status: string } | null = null;
jest.mock('../../../../services/register-session/use-register-session', () => ({
	useRegisterSession: () => ({ session: mockSession, sessionsOn: true, overdue: false }),
}));
jest.mock('./register-panel', () => ({ RegisterPanel: () => null }));
it('shows the drawer only with a session and opens its panel', () => {
	const onPanelOpenChange = jest.fn();
	const view = render(<RegisterBar panelOpen={false} onPanelOpenChange={onPanelOpenChange} />);
	expect(screen.queryByTestId('register-bar-drawer')).toBeNull();
	mockSession = { status: 'open' };
	view.rerender(<RegisterBar panelOpen={false} onPanelOpenChange={onPanelOpenChange} />);
	fireEvent.click(screen.getByTestId('register-bar-drawer'));
	expect(onPanelOpenChange).toHaveBeenCalledWith(true);
	mockSession = null;
});

it('has no avatar on wide, where the rail carries it', () => {
	mockScreenSize = 'lg';
	render(<RegisterBar panelOpen={false} onPanelOpenChange={jest.fn()} />);
	expect(screen.queryByTestId('register-bar-avatar')).toBeNull();
	mockScreenSize = 'sm';
});
it('has an avatar on the phone', () => {
	render(<RegisterBar panelOpen={false} onPanelOpenChange={jest.fn()} />);
	expect(screen.getByTestId('register-bar-avatar')).toBeTruthy();
});

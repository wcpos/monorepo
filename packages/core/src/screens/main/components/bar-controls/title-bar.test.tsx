/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { TitleBarStripContent } from './title-bar';

let mockStatus = 'online-website-available';
let mockBinding: Record<string, unknown> = {};
const mockRequestCashierSheet = jest.fn();
// Jest resolves the native portal, which has no strip: render in place to read the strip's row.
jest.mock('@wcpos/components/edge-surface', () => ({
	TitleBarStripPortal: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@wcpos/components/button', () => ({
	Button: ({ testID, variant, onPress, children }: Record<string, any>) => (
		<button data-testid={testID} data-variant={variant} onClick={onPress}>
			{children}
		</button>
	),
}));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/loader', () => ({ Loader: () => null }));
jest.mock('expo-router', () => ({ useNavigation: () => ({ openDrawer: jest.fn() }) }));
jest.mock('../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('../../../../contexts/app-state', () => ({
	useStoreSession: () => ({ store: { name: 'Main Street' } }),
}));
jest.mock('@wcpos/query', () => ({
	useDocField: (doc: Record<string, unknown>, read: (value: unknown) => unknown) => read(doc),
}));
jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status: mockStatus }),
}));
jest.mock('../../../../services/register/use-register-binding', () => ({
	useRegisterBinding: () => mockBinding,
}));
jest.mock('../../../../services/register-session/use-register-session', () => ({
	useRegisterSession: () => ({ session: { status: 'open' }, sessionsOn: true, overdue: false }),
}));
jest.mock('../../pos/checkout/use-awaiting-store', () => ({ useAwaitingStoreCount: () => 0 }));
jest.mock('../cashier-entry/cashier-sheet-request', () => ({
	requestCashierSheet: () => mockRequestCashierSheet(),
}));
jest.mock('../notification-bell/notification-bell', () => ({
	NotificationBell: ({ testID, bare }: { testID: string; bare?: boolean }) => (
		<div data-testid={testID} data-bare={String(bare)} />
	),
}));
jest.mock('../cashier-entry', () => ({
	CashierEntry: ({ testID, bare }: { testID: string; bare?: boolean }) => (
		<div data-testid={testID} data-bare={String(bare)} />
	),
}));

beforeEach(() => {
	mockStatus = 'online-website-available';
	mockBinding = { status: 'bound', registerName: 'Front', registers: [{ id: 'r' }] };
});

// The title bar (Paul, 2026-10-29/30): the till's place, the door to the cashier sheet; then the
// register pill (Offline is one of its states, so no second badge), the bell and the avatar.
it('is the place, then the register pill, the bell and the avatar', () => {
	mockStatus = 'offline';
	render(<TitleBarStripContent />);
	fireEvent.click(screen.getByTestId('title-bar-store'));
	expect(screen.getByTestId('title-bar-store').textContent).toBe('Main Street');
	expect(mockRequestCashierSheet).toHaveBeenCalledTimes(1);
	expect(screen.getByText('register.offline')).toBeTruthy();
	expect(screen.queryByText('common.status_offline')).toBeNull();
	expect(screen.getByTestId('title-bar-bell')).toBeTruthy();
	expect(screen.getByTestId('title-bar-avatar')).toBeTruthy();
});

it('names the register where the store has more than one', () => {
	mockBinding = { status: 'bound', registerName: 'Front', registers: [{ id: 'r' }, { id: 's' }] };
	render(<TitleBarStripContent />);
	expect(screen.getByTestId('title-bar-store').textContent).toBe('Main Street · Front');
	expect(screen.queryByText('register.offline')).toBeNull();
});

// A macOS title-bar item (Paul, 2026-10-30): no surface on hover or press, on every control.
it('draws its store button, bell and avatar bare', () => {
	render(<TitleBarStripContent />);
	expect(screen.getByTestId('title-bar-store').getAttribute('data-variant')).toBe('bare');
	expect(screen.getByTestId('title-bar-bell').getAttribute('data-bare')).toBe('true');
	expect(screen.getByTestId('title-bar-avatar').getAttribute('data-bare')).toBe('true');
});

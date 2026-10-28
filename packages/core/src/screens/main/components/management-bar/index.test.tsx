/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { ManagementBar } from './index';
jest.mock('expo-haptics', () => ({}));
jest.mock('@wcpos/components/loader', () => ({ Loader: () => null }));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
let mockPhone = false;
let mockStatus = 'online-website-available';
const mockDrawer = jest.fn();
jest.mock('@wcpos/components/lib/device', () => ({
	useIsPhone: () => mockPhone,
	usePointer: () => 'coarse',
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0 }) }));
jest.mock('expo-router', () => ({ useNavigation: () => ({ openDrawer: mockDrawer }) }));
jest.mock('../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('../../../../contexts/app-state', () => ({
	useStoreSession: () => ({
		site: { wcpos_login_url: 'login' },
		wpCredentials: { display_name: 'Jane' },
	}),
}));
jest.mock('../../../../hooks/use-wcpos-auth/redirect-result', () => ({
	takeRedirectReturn: () => false,
}));
jest.mock('@wcpos/query', () => ({
	useDocField: (v: unknown, select: (v: unknown) => unknown) => select(v),
}));
jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status: mockStatus }),
}));
jest.mock('../notification-bell/notification-bell', () => ({
	NotificationBell: ({ testID }: { testID: string }) => <button data-testid={testID} />,
}));
jest.mock('../user-avatar', () => ({ UserAvatar: () => null }));
let mockHeld = false;
jest.mock('../session-hold-banner', () => ({
	SessionHoldBanner: () => (mockHeld ? <div data-testid="session-hold-banner" /> : null),
}));
jest.mock('../../pos/cart/user-sheet', () => ({
	UserSheet: ({
		open,
		portalHost,
		onSwitchRegister,
	}: {
		open: boolean;
		portalHost?: string | null;
		onSwitchRegister?: () => void;
	}) =>
		open ? (
			<div data-testid="user-sheet" data-host={String(portalHost)}>
				{onSwitchRegister && <button data-testid="switch-register" onClick={onSwitchRegister} />}
			</div>
		) : null,
}));
jest.mock('../../pos/cart/register-picker-request', () => ({
	requestRegisterPicker: jest.fn(),
}));
beforeEach(() => {
	mockPhone = false;
	mockStatus = 'online-website-available';
	mockHeld = false;
	jest.clearAllMocks();
});
const bar = () =>
	render(
		<ManagementBar title="Orders" testID="orders-bar" search={<input data-testid="search" />}>
			<button data-testid="display" />
		</ManagementBar>
	);
it('rehosts drawer and avatar on a phone and opens the user sheet', () => {
	mockPhone = true;
	bar();
	fireEvent.click(screen.getByTestId('orders-bar-menu'));
	expect(mockDrawer).toHaveBeenCalledTimes(1);
	fireEvent.click(screen.getByTestId('orders-bar-avatar'));
	// The root host: the POS host lives inside the POS screen, hidden while a page is up.
	expect(screen.getByTestId('user-sheet').getAttribute('data-host')).toBe('null');
	// The same cashier rows as the rail's sheet: Switch register raises the picker request.
	fireEvent.click(screen.getByTestId('switch-register'));
	expect(
		jest.requireMock<{ requestRegisterPicker: jest.Mock }>('../../pos/cart/register-picker-request')
			.requestRegisterPicker
	).toHaveBeenCalledTimes(1);
	expect(screen.getByTestId('orders-bar-bell')).toBeTruthy();
});
it('leaves drawer and avatar to the wide rail', () => {
	bar();
	expect(screen.queryByTestId('orders-bar-menu')).toBeNull();
	expect(screen.queryByTestId('orders-bar-avatar')).toBeNull();
});
it.each([
	['offline', 'common.status_offline'],
	['online-website-unavailable', 'common.status_offline'],
])('labels %s in the bar', (status, label) => {
	mockStatus = status;
	bar();
	expect(screen.getByTestId('orders-bar-status').textContent).toContain(label);
});
// The phone search row is PageBar's (its own test pins the row); the page bar hands it on.
it('has no badge while available and keeps phone search under the control row', () => {
	mockPhone = true;
	bar();
	expect(screen.queryByTestId('orders-bar-status')).toBeNull();
	const [row, searchRow] = Array.from(screen.getByTestId('orders-bar').children);
	expect(row.contains(screen.getByTestId('search'))).toBe(false);
	expect(searchRow).toBe(screen.getByTestId('orders-bar-search'));
	expect(searchRow.contains(screen.getByTestId('search'))).toBe(true);
});
jest.mock('@rn-primitives/slot', () => ({ Slot: 'span' }));

// The drawer header was the held-session banner's last home: every page bar now carries it.
it('shows a held session under the bar, after the phone search row', () => {
	mockPhone = true;
	mockHeld = true;
	const { container } = bar();
	const rows = Array.from(container.children);
	expect(rows[0]).toBe(screen.getByTestId('orders-bar'));
	expect(rows[0].lastElementChild?.contains(screen.getByTestId('search'))).toBe(true);
	expect(rows[1]).toBe(screen.getByTestId('session-hold-banner'));
});

it.each([false, true])('omits the empty search slot (phone: %s)', (phone) => {
	mockPhone = phone;
	const { container } = render(<ManagementBar title="Settings" testID="settings-bar" />);
	expect(screen.getByTestId('settings-bar-title').textContent).toBe('Settings');
	// No search means no second phone row and no empty desktop search wrapper.
	expect(container.firstElementChild).toBe(screen.getByTestId('settings-bar'));
	expect(container.children).toHaveLength(1);
	expect(screen.getByTestId('settings-bar').children).toHaveLength(1);
	expect(screen.queryByTestId('settings-bar-search')).toBeNull();
	// The bell, then on a phone the avatar the rail carries off a phone.
	expect(screen.getByTestId('settings-bar-bell').parentElement?.children).toHaveLength(
		phone ? 2 : 1
	);
});
it('passes the phone back crumb through with its label, selector and action', () => {
	mockPhone = true;
	const onBack = jest.fn();
	render(
		<ManagementBar
			title="General"
			testID="settings-bar"
			back={{ label: 'Settings', onPress: onBack, testID: 'settings-navigation-back' }}
		/>
	);
	expect(screen.getByTestId('settings-navigation-back').textContent).toContain('Settings');
	expect(screen.queryByTestId('settings-bar-menu')).toBeNull();
	fireEvent.click(screen.getByTestId('settings-navigation-back'));
	expect(onBack).toHaveBeenCalledTimes(1);
});
it("puts a scoped room's control in the title's place", () => {
	render(<ManagementBar testID="reports-bar" titleSlot={<button data-testid="reports-scope" />} />);
	expect(screen.queryByTestId('reports-bar-title')).toBeNull();
	expect(
		screen.getByTestId('reports-bar-title-slot').contains(screen.getByTestId('reports-scope'))
	).toBe(true);
});
// The list pages carry no title (owner, 2026-10-18): the search names the page, so on `lg` it
// is the first thing in the bar after its left gutter.
it('puts the search first on a list page that has no title', () => {
	render(
		<ManagementBar testID="products-bar" search={<input data-testid="search" />}>
			<button data-testid="display" />
		</ManagementBar>
	);
	expect(screen.queryByTestId('products-bar-title')).toBeNull();
	const row = screen.getByTestId('products-bar').firstElementChild!;
	const search = screen.getByTestId('products-bar-search');
	expect(row.firstElementChild!.contains(search)).toBe(true);
	expect(search.contains(screen.getByTestId('search'))).toBe(true);
});

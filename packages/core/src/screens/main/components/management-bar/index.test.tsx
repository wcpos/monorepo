/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { ManagementBar } from './index';
jest.mock('expo-haptics', () => ({}));
jest.mock('@wcpos/components/loader', () => ({ Loader: () => null }));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
let mockPhone = false;
let mockSize = 'md';
let mockStatus = 'online-website-available';
const mockDrawer = jest.fn();
jest.mock('@wcpos/components/lib/device', () => ({ useIsPhone: () => mockPhone }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0 }) }));
jest.mock('expo-router', () => ({ useNavigation: () => ({ openDrawer: mockDrawer }) }));
jest.mock('../../../../contexts/theme', () => ({ useTheme: () => ({ screenSize: mockSize }) }));
jest.mock('../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('../../../../contexts/app-state', () => ({
	useStoreSession: () => ({
		site: { wcpos_login_url: 'login' },
		wpCredentials: { display_name: 'Jane' },
	}),
}));
jest.mock('../../../../hooks/use-wcpos-auth/redirect-result', () => ({
	peekRedirectLoginUrl: () => null,
}));
jest.mock('@wcpos/query', () => ({
	useDocField: (v: unknown, select: (v: unknown) => unknown) => select(v),
}));
jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status: mockStatus }),
}));
jest.mock('../header/notification-bell', () => ({
	NotificationBell: ({ testID }: { testID: string }) => <button data-testid={testID} />,
}));
jest.mock('../header/user-avatar', () => ({ UserAvatar: () => null }));
jest.mock('../../pos/cart/user-sheet', () => ({
	UserSheet: ({ open }: { open: boolean }) => (open ? <div data-testid="user-sheet" /> : null),
}));
beforeEach(() => {
	mockPhone = false;
	mockSize = 'md';
	mockStatus = 'online-website-available';
	jest.clearAllMocks();
});
const bar = () =>
	render(
		<ManagementBar title="Orders" testID="orders-bar" search={<input data-testid="search" />}>
			<button data-testid="display" />
		</ManagementBar>
	);
it('rehosts drawer and avatar below lg and opens the user sheet', () => {
	bar();
	fireEvent.click(screen.getByTestId('orders-bar-menu'));
	expect(mockDrawer).toHaveBeenCalledTimes(1);
	fireEvent.click(screen.getByTestId('orders-bar-avatar'));
	expect(screen.getByTestId('user-sheet')).toBeTruthy();
	expect(screen.getByTestId('orders-bar-bell')).toBeTruthy();
});
it('leaves drawer and avatar to the wide rail', () => {
	mockSize = 'lg';
	bar();
	expect(screen.queryByTestId('orders-bar-menu')).toBeNull();
	expect(screen.queryByTestId('orders-bar-avatar')).toBeNull();
});
it.each([
	['offline', 'common.status_offline'],
	['online-website-unavailable', 'common.status_site_unreachable'],
])('labels %s in the bar', (status, label) => {
	mockStatus = status;
	bar();
	expect(screen.getByTestId('orders-bar-status').textContent).toContain(label);
});
it('has no badge while available and keeps phone search under the bar', () => {
	mockPhone = true;
	bar();
	expect(screen.queryByTestId('orders-bar-status')).toBeNull();
	expect(screen.getByTestId('orders-bar').contains(screen.getByTestId('search'))).toBe(false);
});
jest.mock('@rn-primitives/slot', () => ({ Slot: 'span' }));

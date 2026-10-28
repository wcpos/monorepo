/** @jest-environment jsdom */
import * as React from 'react';

import { render, renderHook, screen } from '@testing-library/react';

import { BarControls, useBarMenu, useOnlineBadge } from './index';

let mockSize: 'sm' | 'lg' = 'sm';
let mockStatus = 'online-website-available';
const mockOpenDrawer = jest.fn();
jest.mock('expo-router', () => ({ useNavigation: () => ({ openDrawer: mockOpenDrawer }) }));
jest.mock('@wcpos/components/lib/device', () => ({
	...jest.requireActual('@wcpos/components/lib/device'),
	useIsPhone: () => mockSize === 'sm',
}));
jest.mock('../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status: mockStatus }),
}));
jest.mock('../notification-bell/notification-bell', () => ({
	NotificationBell: ({ testID, portalHost }: { testID: string; portalHost?: string }) => (
		<div data-testid={testID} data-host={String(portalHost)} />
	),
}));
jest.mock('../cashier-entry', () => ({
	CashierEntry: ({ testID, portalHost }: { testID: string; portalHost: string | null }) => (
		<div data-testid={testID} data-host={String(portalHost)} />
	),
}));

beforeEach(() => {
	mockSize = 'sm';
	mockStatus = 'online-website-available';
	mockOpenDrawer.mockClear();
});

// Below `lg` the bar opens the drawer and carries the cashier entry; on `lg` the rail does both.
it.each([
	['sm', true],
	['lg', false],
] as const)('on %s the bar has the menu and the avatar: %s', (size, below) => {
	mockSize = size;
	const { result } = renderHook(() => useBarMenu());
	expect(result.current?.label).toBe(below ? 'common.menu' : undefined);
	result.current?.onPress();
	expect(mockOpenDrawer).toHaveBeenCalledTimes(below ? 1 : 0);

	render(<BarControls testID="register-bar" portalHost="pos" />);
	expect(screen.getByTestId('register-bar-bell').getAttribute('data-host')).toBe('pos');
	expect(screen.queryByTestId('register-bar-avatar') !== null).toBe(below);
});

it('puts the bell and the entry on the root host unless the bar names one', () => {
	render(<BarControls testID="orders-bar" />);
	expect(screen.getByTestId('orders-bar-bell').getAttribute('data-host')).toBe('undefined');
	expect(screen.getByTestId('orders-bar-avatar').getAttribute('data-host')).toBe('null');
});

// One form for every bar: Offline as a StatusBadge in the warning tone, an unreachable store
// included; nothing while the store answers.
it.each([
	['online-website-available', undefined],
	['offline', { label: 'common.status_offline', variant: 'warning' }],
	['online-website-unavailable', { label: 'common.status_offline', variant: 'warning' }],
])('reads %s as %j', (status, badge) => {
	mockStatus = status;
	const { result } = renderHook(() => useOnlineBadge());
	expect(result.current).toEqual(badge);
});

/** @jest-environment jsdom */
import * as React from 'react';

import { render, renderHook, screen } from '@testing-library/react';

import { TitleBarStripProvider } from '@wcpos/components/edge-surface/title-bar-strip';

import { BarControls, useBarMenu, useBarStatus, useOnlineBadge } from './index';

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

// Below `lg` the bar opens the drawer; on `lg` the rail is always on screen. The cashier entry is
// the bar's on every size: the rail lists pages only (Paul, 2026-10-29).
it.each([
	['sm', true],
	['lg', false],
] as const)('on %s the bar has the menu: %s, and the avatar always', (size, below) => {
	mockSize = size;
	const { result } = renderHook(() => useBarMenu());
	expect(result.current?.label).toBe(below ? 'common.menu' : undefined);
	result.current?.onPress();
	expect(mockOpenDrawer).toHaveBeenCalledTimes(below ? 1 : 0);

	render(<BarControls testID="register-bar" portalHost="pos" />);
	expect(screen.getByTestId('register-bar-bell').getAttribute('data-host')).toBe('pos');
	expect(screen.getByTestId('register-bar-avatar')).toBeTruthy();
});

// The cashier sheet opens beside the rail on wide (the drawer layout's `scene` host, #3061), never
// over it; a phone has no rail, so the root. The bell stays on the root; a named host wins.
it.each([
	['sm', 'null'],
	['lg', 'scene'],
] as const)('on %s puts the entry on the %s host unless the bar names one', (size, host) => {
	mockSize = size;
	const { unmount } = render(<BarControls testID="orders-bar" />);
	expect(screen.getByTestId('orders-bar-bell').getAttribute('data-host')).toBe('undefined');
	expect(screen.getByTestId('orders-bar-avatar').getAttribute('data-host')).toBe(host);
	unmount();
	render(<BarControls testID="register-bar" portalHost="pos" />);
	expect(screen.getByTestId('register-bar-avatar').getAttribute('data-host')).toBe('pos');
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

// No doubles (Paul, 2026-10-29): while the desktop title bar shows it is the one home of Offline,
// the bell and the avatar, so every other bar draws none; full screen (0) gives them back.
it.each([
	[28, false],
	[0, true],
])('with a title-bar strip of %s a bar carries its controls: %s', (height, carried) => {
	mockStatus = 'offline';
	const strip = ({ children }: React.PropsWithChildren) => (
		<TitleBarStripProvider value={{ node: null, height }}>{children}</TitleBarStripProvider>
	);
	render(<BarControls testID="orders-bar" />, { wrapper: strip });
	expect(screen.queryByTestId('orders-bar-bell') !== null).toBe(carried);
	expect(screen.queryByTestId('orders-bar-avatar') !== null).toBe(carried);
	expect(renderHook(() => useBarStatus(), { wrapper: strip }).result.current !== undefined).toBe(
		carried
	);
	render(<BarControls testID="title-bar" inTitleBar />, { wrapper: strip });
	expect(screen.getByTestId('title-bar-bell')).toBeTruthy();
	expect(screen.getByTestId('title-bar-avatar')).toBeTruthy();
});

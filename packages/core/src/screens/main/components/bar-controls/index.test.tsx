/** @jest-environment jsdom */
import * as React from 'react';

import { render, renderHook, screen } from '@testing-library/react';

import { TitleBarStripProvider } from '@wcpos/components/edge-surface/title-bar-strip';
import { OverlayHostProvider } from '@wcpos/components/lib/overlay-host';

import { BarControls, useBarMenu, useBarStatus, useOnlineBadge } from './index';
import { setFocusedPageSheetHost } from '../page-sheet-host';

const wrapper = ({ children }: React.PropsWithChildren) => (
	<OverlayHostProvider name="scene:orders" phoneUsesRoot>
		{children}
	</OverlayHostProvider>
);
// The till's host, nested in its page's.
const till = ({ children }: React.PropsWithChildren) =>
	wrapper({ children: <OverlayHostProvider name="pos">{children}</OverlayHostProvider> });

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
// Each records the host its sheet's DialogContent takes: the nearest provided, else the root.
jest.mock('../notification-bell/notification-bell', () => ({
	NotificationBell: ({ testID }: { testID: string }) => (
		<div
			data-testid={testID}
			data-host={String(jest.requireActual('@wcpos/components/lib/overlay-host').useOverlayHost())}
		/>
	),
}));
jest.mock('../cashier-entry', () => ({
	CashierEntry: ({ testID }: { testID: string }) => (
		<div
			data-testid={testID}
			data-host={String(
				jest.requireActual('@wcpos/components/lib/overlay-host').useOverlayHost() ?? null
			)}
		/>
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

	render(<BarControls testID="register-bar" />, { wrapper: till });
	expect(screen.getByTestId('register-bar-bell').getAttribute('data-host')).toBe('pos');
	expect(screen.getByTestId('register-bar-avatar')).toBeTruthy();
});

// The bell shares the entry's host: with no host named, the drawer layout's per-screen Scene
// host on wide, beside the rail (#3061), and the root on a phone. A named host wins for both.
it.each([
	['sm', 'null', 'undefined'],
	['lg', 'scene:orders', 'scene:orders'],
] as const)(
	'on %s puts the entry on the %s host unless the bar names one',
	(size, host, bellHost) => {
		mockSize = size;
		const { unmount } = render(<BarControls testID="orders-bar" />, { wrapper });
		expect(screen.getByTestId('orders-bar-bell').getAttribute('data-host')).toBe(bellHost);
		expect(screen.getByTestId('orders-bar-avatar').getAttribute('data-host')).toBe(host);
		unmount();
		render(<BarControls testID="register-bar" />, { wrapper: till });
		expect(screen.getByTestId('register-bar-bell').getAttribute('data-host')).toBe('pos');
		expect(screen.getByTestId('register-bar-avatar').getAttribute('data-host')).toBe('pos');
	}
);

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
		<OverlayHostProvider name="scene:orders" phoneUsesRoot>
			<TitleBarStripProvider value={{ node: null, height }}>{children}</TitleBarStripProvider>
		</OverlayHostProvider>
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

// The title bar sits above every screen, outside any Scene's provider: its pair follows the
// focused screen's host, never the root, which would cover the rail (Greptile, #3419).
it('puts the title bar pair on the focused screen host', () => {
	mockSize = 'lg';
	setFocusedPageSheetHost('scene:orders');
	try {
		const strip = ({ children }: React.PropsWithChildren) => (
			<TitleBarStripProvider value={{ node: null, height: 28 }}>{children}</TitleBarStripProvider>
		);
		render(<BarControls testID="title-bar" inTitleBar />, { wrapper: strip });
		expect(screen.getByTestId('title-bar-bell').getAttribute('data-host')).toBe('scene:orders');
		expect(screen.getByTestId('title-bar-avatar').getAttribute('data-host')).toBe('scene:orders');
	} finally {
		setFocusedPageSheetHost(undefined);
	}
});

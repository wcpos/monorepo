/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { NavigationAreaIndex, NavigationAreaLayout } from './index';

import type { NavigationAreaItem } from './index';

const mockPush = jest.fn();
const mockNavigate = jest.fn();
let mockPathname = '/settings/tax';
let mockScreenSize: 'sm' | 'lg' = 'lg';

jest.mock('expo-router', () => ({
	Redirect: ({ href }: { href: string }) => <div data-testid="redirect">{href}</div>,
	usePathname: () => mockPathname,
	useRouter: () => ({ push: mockPush, navigate: mockNavigate }),
	useNavigation: () => ({ openDrawer: jest.fn() }),
}));

jest.mock('../../../../contexts/theme', () => ({
	useTheme: () => ({ screenSize: mockScreenSize }),
}));

jest.mock('expo-haptics', () => ({}));
jest.mock('@wcpos/components/loader', () => ({ Loader: () => null }));
jest.mock('@wcpos/components/icon', () => ({
	Icon: ({ name }: { name: string }) => <span data-icon={name} />,
}));
jest.mock('@rn-primitives/slot', () => ({ Slot: 'span' }));
jest.mock('@wcpos/components/lib/device', () => ({
	useIsPhone: () => mockScreenSize === 'sm',
	usePointer: () => 'fine',
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0 }) }));
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
	useOnlineStatus: () => ({ status: 'online-website-available' }),
}));
jest.mock('../notification-bell/notification-bell', () => ({ NotificationBell: () => null }));
jest.mock('../user-avatar', () => ({ UserAvatar: () => null }));
jest.mock('../../pos/cart/user-sheet', () => ({ UserSheet: () => null }));

const items: NavigationAreaItem[] = [
	{
		href: '/settings/general',
		label: 'General',
		testID: 'settings-nav-general',
	},
	{ href: '/settings/tax', label: 'Tax', testID: 'settings-nav-tax' },
];

describe('NavigationAreaLayout', () => {
	beforeEach(() => {
		mockPush.mockClear();
		mockNavigate.mockClear();
		mockPathname = '/settings/tax';
		mockScreenSize = 'lg';
	});

	it('shows a wide-screen rail, marks the current item, and navigates between pages', () => {
		render(
			<NavigationAreaLayout
				items={items}
				indexHref="/settings"
				areaLabel="Settings"
				testID="settings-navigation"
				screenTestID="settings-screen"
				barTestID="settings-bar"
			>
				<div data-testid="settings-content" />
			</NavigationAreaLayout>
		);

		expect(screen.getByTestId('settings-bar-title').textContent).toBe('Settings');
		expect(screen.queryByTestId('settings-navigation-back')).toBeNull();
		expect(screen.getByTestId('settings-navigation-rail')).toBeTruthy();
		expect(screen.getByTestId('settings-screen')).toBeTruthy();
		expect(screen.getByTestId('settings-nav-tax').getAttribute('aria-selected')).toBe('true');
		expect(screen.getByTestId('settings-nav-general').getAttribute('aria-selected')).toBe('false');

		fireEvent.click(screen.getByTestId('settings-nav-general'));
		expect(mockPush).toHaveBeenCalledWith('/settings/general');
		expect(screen.getByTestId('settings-content')).toBeTruthy();
	});

	// The narrowest wide screen (a tablet in portrait) is `lg` too: still the rail, no crumb.
	it('keeps the rail beside the screen with no crumb on the bar on a wide screen', () => {
		mockScreenSize = 'lg';
		render(
			<NavigationAreaLayout
				items={items}
				indexHref="/settings"
				areaLabel="Settings"
				testID="settings-navigation"
				screenTestID="settings-screen"
				barTestID="settings-bar"
			>
				<div data-testid="settings-content" />
			</NavigationAreaLayout>
		);

		expect(screen.getByTestId('settings-navigation-rail')).toBeTruthy();
		expect(screen.getByTestId('settings-content')).toBeTruthy();
		expect(screen.queryByTestId('settings-navigation-back')).toBeNull();
		expect(screen.getByTestId('settings-bar-title').textContent).toBe('Settings');
	});

	it('uses the leaf title and a single bar crumb to navigate a phone deep link to the index', () => {
		mockScreenSize = 'sm';
		render(
			<NavigationAreaLayout
				items={items}
				indexHref="/settings"
				areaLabel="Settings"
				testID="settings-navigation"
				screenTestID="settings-screen"
				barTestID="settings-bar"
			>
				<div data-testid="settings-content" />
			</NavigationAreaLayout>
		);
		expect(screen.getByTestId('settings-bar-title').textContent).toBe('Tax');
		const back = screen.getByTestId('settings-navigation-back');
		expect(screen.getByTestId('settings-bar').contains(back)).toBe(true);
		expect(back.textContent).toContain('Settings');
		expect(screen.queryByTestId('settings-bar-menu')).toBeNull();
		expect(screen.queryByTestId('settings-navigation-rail')).toBeNull();
		expect(screen.getByTestId('settings-content')).toBeTruthy();
		fireEvent.click(back);
		expect(mockNavigate).toHaveBeenCalledWith('/settings');
	});

	it('keeps the area title and chevron list on the phone index with no back crumb', () => {
		mockScreenSize = 'sm';
		mockPathname = '/settings';
		render(
			<NavigationAreaLayout
				items={items}
				indexHref="/settings"
				areaLabel="Settings"
				testID="settings-navigation"
				barTestID="settings-bar"
			>
				<NavigationAreaIndex
					items={items}
					defaultHref="/settings/general"
					testID="screen-settings"
				/>
			</NavigationAreaLayout>
		);
		expect(screen.getByTestId('settings-bar-title').textContent).toBe('Settings');
		expect(screen.queryByTestId('settings-navigation-back')).toBeNull();
		expect(screen.getByTestId('screen-settings')).toBeTruthy();
		expect(
			screen.getByTestId('settings-nav-general').querySelector('[data-icon="chevronRight"]')
		).toBeTruthy();
		fireEvent.click(screen.getByTestId('settings-nav-tax'));
		expect(mockPush).toHaveBeenCalledWith('/settings/tax');
	});

	it('lifts the selected row onto bg-card only on the opted-in (background) rail; the legacy rail keeps its tint', () => {
		const layout = (barTestID?: string) => (
			<NavigationAreaLayout
				items={items}
				indexHref="/settings"
				areaLabel="Settings"
				testID="settings-navigation"
				screenTestID="settings-screen"
				barTestID={barTestID}
			>
				<div />
			</NavigationAreaLayout>
		);
		// Uniwind compiles the classes away, so the row exposes the surface it styles for.
		const lifted = render(layout('settings-bar'));
		expect(lifted.getByTestId('settings-nav-tax').getAttribute('data-surface')).toBe('background');
		lifted.unmount();

		// Health has not opted in: its rail is still bg-card, where a bg-card row is invisible.
		const legacy = render(layout());
		expect(legacy.getByTestId('settings-nav-tax').getAttribute('data-surface')).toBe('card');
	});

	it('keeps the legacy back bar when the layout has not opted in', () => {
		mockScreenSize = 'sm';

		render(
			<NavigationAreaLayout
				items={items}
				indexHref="/settings"
				areaLabel="Settings"
				testID="settings-navigation"
				screenTestID="settings-screen"
			>
				<div data-testid="settings-content" />
			</NavigationAreaLayout>
		);

		expect(screen.queryByTestId('settings-navigation-rail')).toBeNull();
		expect(screen.getByTestId('settings-content')).toBeTruthy();
		expect(screen.getByTestId('settings-navigation-back')).toBeTruthy();
		expect(screen.queryByTestId('settings-bar')).toBeNull();
		fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
		expect(mockNavigate).toHaveBeenCalledWith('/settings');
		expect(screen.getByTestId('settings-screen')).toBeTruthy();
	});
});

describe('NavigationAreaIndex', () => {
	beforeEach(() => {
		mockPush.mockClear();
		mockNavigate.mockClear();
		mockScreenSize = 'sm';
	});

	it('shows a tappable page list on narrow screens', () => {
		render(
			<NavigationAreaIndex items={items} defaultHref="/settings/general" testID="settings-index" />
		);

		fireEvent.click(screen.getByTestId('settings-nav-tax'));
		expect(mockPush).toHaveBeenCalledWith('/settings/tax');
	});

	it('redirects the area root to its default page on wide screens', () => {
		mockScreenSize = 'lg';

		render(
			<NavigationAreaIndex items={items} defaultHref="/settings/general" testID="settings-index" />
		);

		expect(screen.getByTestId('redirect').textContent).toBe('/settings/general');
	});
});

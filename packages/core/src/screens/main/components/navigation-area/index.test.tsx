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
// The index re-exports `AreaPage`, whose boundary's fallback pulls the overlay stack in.
jest.mock('@wcpos/components/error-boundary', () => ({
	ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
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
let mockRedirectLoginUrl: string | null = null;
jest.mock('../../../../hooks/use-wcpos-auth/redirect-result', () => ({
	peekRedirectLoginUrl: () => mockRedirectLoginUrl,
}));
jest.mock('@wcpos/query', () => ({
	useDocField: (v: unknown, select: (v: unknown) => unknown) => select(v),
}));
jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status: 'online-website-available' }),
}));
jest.mock('../notification-bell/notification-bell', () => ({ NotificationBell: () => null }));
jest.mock('../user-avatar', () => ({ UserAvatar: () => null }));
let mockHeld = false;
jest.mock('../session-hold-banner', () => ({
	SessionHoldBanner: () => (mockHeld ? <div data-testid="session-hold-banner" /> : null),
	useSessionHeld: () => mockHeld,
}));
jest.mock('../../pos/cart/user-sheet', () => ({
	UserSheet: ({ open }: { open: boolean }) => (open ? <div data-testid="user-sheet" /> : null),
}));

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
		mockHeld = false;
		mockRedirectLoginUrl = null;
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

		// No bar on `lg`: the page carries its heading, the app rail the bell and the avatar.
		expect(screen.queryByTestId('settings-bar')).toBeNull();
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
		expect(screen.queryByTestId('settings-bar')).toBeNull();
	});

	// The bar's other jobs outlive it on `lg`: the upgrade notice and a held session still show
	// above the rail, and a redirect login still reopens the cashier sheet to claim its result.
	it('keeps the notice, the held-session banner and the redirect-login sheet on lg', () => {
		mockHeld = true;
		mockRedirectLoginUrl = 'login';
		render(
			<NavigationAreaLayout
				items={items}
				indexHref="/health"
				areaLabel="Store health"
				testID="health-navigation"
				screenTestID="health-screen"
				barTestID="health-bar"
				barNotice={<div data-testid="upgrade-notice" />}
				leafPagesCarryTitle
			>
				<div data-testid="health-content" />
			</NavigationAreaLayout>
		);
		expect(screen.queryByTestId('health-bar')).toBeNull();
		const banner = screen.getByTestId('session-hold-banner');
		const notice = screen.getByTestId('upgrade-notice');
		const area = screen.getByTestId('health-navigation');
		// Banner, then notice, then the rail and page row: the order the bar gave them.
		const rows = Array.from(area.parentElement!.children);
		expect(rows.indexOf(banner)).toBe(0);
		// After the hold banner the notice is the next row, in a wrapper that carries the
		// page gutter between them (it is flush when it is the column's first row).
		expect(rows[1]).toBe(notice.parentElement);
		expect(rows.indexOf(area)).toBe(2);
		expect(screen.getByTestId('user-sheet')).toBeTruthy();
	});

	it('leaves the sheet closed on lg when no redirect login is pending for this site', () => {
		mockRedirectLoginUrl = 'another-site';
		render(
			<NavigationAreaLayout
				items={items}
				indexHref="/settings"
				areaLabel="Settings"
				testID="settings-navigation"
				barTestID="settings-bar"
			>
				<div />
			</NavigationAreaLayout>
		);
		expect(screen.queryByTestId('user-sheet')).toBeNull();
		expect(screen.queryByTestId('session-hold-banner')).toBeNull();
	});

	it('shows no bar title and a single bar crumb to navigate a phone deep link to the index', () => {
		mockScreenSize = 'sm';
		render(
			<NavigationAreaLayout
				items={items}
				indexHref="/settings"
				areaLabel="Settings"
				testID="settings-navigation"
				screenTestID="settings-screen"
				barTestID="settings-bar"
				leafPagesCarryTitle
			>
				<div data-testid="settings-content" />
			</NavigationAreaLayout>
		);
		// The leaf page carries its own heading; the bar shows only the way back (one title).
		expect(screen.queryByTestId('settings-bar-title')).toBeNull();
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

	it('marks the current page selected in the rail (the shared nav row lifts it onto the card)', () => {
		render(
			<NavigationAreaLayout
				items={items}
				indexHref="/settings"
				areaLabel="Settings"
				testID="settings-navigation"
				screenTestID="settings-screen"
				barTestID="settings-bar"
			>
				<div />
			</NavigationAreaLayout>
		);
		expect(screen.getByTestId('settings-nav-tax').getAttribute('aria-selected')).toBe('true');
		expect(screen.getByTestId('settings-nav-general').getAttribute('aria-selected')).toBe('false');
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

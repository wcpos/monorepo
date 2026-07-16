/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { NavigationAreaIndex, NavigationAreaLayout } from './index';

import type { NavigationAreaItem } from './index';

const mockPush = jest.fn();
let mockPathname = '/settings/tax';
let mockScreenSize: 'sm' | 'md' | 'lg' = 'lg';

jest.mock('expo-router', () => ({
	Redirect: ({ href }: { href: string }) => <div data-testid="redirect">{href}</div>,
	usePathname: () => mockPathname,
	useRouter: () => ({ push: mockPush }),
}));

jest.mock('../../../../contexts/theme', () => ({
	useTheme: () => ({ screenSize: mockScreenSize }),
}));

jest.mock('@wcpos/components/button', () => ({
	Button: ({
		children,
		onPress,
		testID,
		accessibilityState,
	}: {
		children: React.ReactNode;
		onPress: () => void;
		testID: string;
		accessibilityState: { selected: boolean };
	}) => (
		<button data-testid={testID} aria-selected={accessibilityState.selected} onClick={onPress}>
			{children}
		</button>
	),
	ButtonText: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/lib/utils', () => ({
	cn: (...values: (string | false | undefined)[]) => values.filter(Boolean).join(' '),
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
		mockPathname = '/settings/tax';
		mockScreenSize = 'lg';
	});

	it('shows a wide-screen rail, marks the current item, and navigates between pages', () => {
		render(
			<NavigationAreaLayout items={items} testID="settings-navigation">
				<div data-testid="settings-content" />
			</NavigationAreaLayout>
		);

		expect(screen.getByTestId('settings-navigation-rail')).toBeTruthy();
		expect(screen.getByTestId('settings-nav-tax').getAttribute('aria-selected')).toBe('true');

		fireEvent.click(screen.getByTestId('settings-nav-general'));
		expect(mockPush).toHaveBeenCalledWith('/settings/general');
		expect(screen.getByTestId('settings-content')).toBeTruthy();
	});

	it('shows only page content on narrow screens', () => {
		mockScreenSize = 'sm';

		render(
			<NavigationAreaLayout items={items} testID="settings-navigation">
				<div data-testid="settings-content" />
			</NavigationAreaLayout>
		);

		expect(screen.queryByTestId('settings-navigation-rail')).toBeNull();
		expect(screen.getByTestId('settings-content')).toBeTruthy();
	});
});

describe('NavigationAreaIndex', () => {
	beforeEach(() => {
		mockPush.mockClear();
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
		mockScreenSize = 'md';

		render(
			<NavigationAreaIndex items={items} defaultHref="/settings/general" testID="settings-index" />
		);

		expect(screen.getByTestId('redirect').textContent).toBe('/settings/general');
	});
});

/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { NavigationAreaIndex, NavigationAreaLayout } from './index';

import type { NavigationAreaItem } from './index';

const mockPush = jest.fn();
const mockNavigate = jest.fn();
const mockBar = jest.fn();
let mockPathname = '/settings/tax';
let mockScreenSize: 'sm' | 'md' | 'lg' = 'lg';

jest.mock('expo-router', () => ({
	Redirect: ({ href }: { href: string }) => <div data-testid="redirect">{href}</div>,
	usePathname: () => mockPathname,
	useRouter: () => ({ push: mockPush, navigate: mockNavigate }),
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
		accessibilityState?: { selected: boolean };
	}) => (
		<button
			data-testid={testID}
			aria-selected={accessibilityState?.selected ?? false}
			onClick={onPress}
		>
			{children}
		</button>
	),
	ButtonText: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children, testID }: { children: React.ReactNode; testID?: string }) => (
		<div data-testid={testID}>{children}</div>
	),
}));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
// The bar is the shared ManagementBar; what the layout hands it is the contract here.
type BarProps = {
	title: string;
	testID: string;
	back?: { label: string; onPress: () => void; testID?: string };
};
jest.mock('../management-bar', () => ({
	ManagementBar: (props: BarProps) => {
		mockBar(props);
		return (
			<div data-testid={props.testID}>
				{props.back && <button data-testid={props.back.testID} onClick={props.back.onPress} />}
			</div>
		);
	},
}));
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

		expect(screen.getByTestId('settings-navigation-rail')).toBeTruthy();
		expect(screen.getByTestId('settings-screen')).toBeTruthy();
		expect(screen.getByTestId('settings-nav-tax').getAttribute('aria-selected')).toBe('true');

		fireEvent.click(screen.getByTestId('settings-nav-general'));
		expect(mockPush).toHaveBeenCalledWith('/settings/general');
		expect(screen.getByTestId('settings-content')).toBeTruthy();
	});

	it('shows content with a back bar to the area index on narrow leaf pages', () => {
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
		expect(screen.getByTestId('settings-screen')).toBeTruthy();
		expect(mockBar).not.toHaveBeenCalled();
	});
});

describe('NavigationAreaLayout under the page bar', () => {
	const renderBarred = () =>
		render(
			<NavigationAreaLayout
				items={items}
				indexHref="/settings"
				areaLabel="Settings"
				testID="settings-navigation"
				screenTestID="settings-screen"
				barTestID="settings-bar"
				banner={<div data-testid="banner" />}
			>
				<div data-testid="settings-content" />
			</NavigationAreaLayout>
		);

	beforeEach(() => {
		mockNavigate.mockClear();
		mockBar.mockClear();
		mockPathname = '/settings/tax';
		mockScreenSize = 'sm';
	});

	it('hands the phone leaf title and the crumb to the bar instead of its own back bar', () => {
		renderBarred();

		expect(mockBar).toHaveBeenLastCalledWith(
			expect.objectContaining({
				title: 'Tax',
				testID: 'settings-bar',
				back: expect.objectContaining({ label: 'Settings', testID: 'settings-navigation-back' }),
			})
		);
		// The one back control is the bar's crumb; the area's h-12 bar is gone.
		expect(screen.getAllByTestId('settings-navigation-back')).toHaveLength(1);
		expect(
			screen.getByTestId('settings-bar').contains(screen.getByTestId('settings-navigation-back'))
		).toBe(true);
		fireEvent.click(screen.getByTestId('settings-navigation-back'));
		expect(mockNavigate).toHaveBeenCalledWith('/settings');
		expect(
			screen.getByTestId('settings-screen').contains(screen.getByTestId('settings-content'))
		).toBe(true);
		expect(screen.getByTestId('banner')).toBeTruthy();
	});

	it('titles the phone index with the area and gives it no crumb', () => {
		mockPathname = '/settings';
		renderBarred();

		expect(mockBar).toHaveBeenLastCalledWith(
			expect.objectContaining({ title: 'Settings', back: undefined })
		);
		expect(screen.queryByTestId('settings-navigation-back')).toBeNull();
	});

	it('keeps the wide rail beside the screen, with no crumb on the bar', () => {
		mockScreenSize = 'md';
		renderBarred();

		expect(mockBar).toHaveBeenLastCalledWith(
			expect.objectContaining({ title: 'Settings', back: undefined })
		);
		expect(screen.getByTestId('settings-navigation-rail')).toBeTruthy();
		expect(screen.getByTestId('settings-screen')).toBeTruthy();
		expect(screen.getByTestId('settings-nav-tax').getAttribute('aria-selected')).toBe('true');
		expect(screen.getByTestId('settings-nav-general').getAttribute('aria-selected')).toBe('false');
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

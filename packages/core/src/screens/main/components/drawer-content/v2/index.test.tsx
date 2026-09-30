/**
 * @jest-environment jsdom
 *
 * `DrawerContent` is NOT rendered as a component: `DrawerView.renderDrawerContent` calls
 * `drawerContent({ state, navigation, descriptors })` as a plain function, and
 * `react-native-drawer-layout`'s `Drawer` calls `renderDrawerContent()` inside its own render
 * body. Every hook in `DrawerContent`'s body therefore runs at `Drawer`'s position in the tree,
 * above the providers `Drawer` itself renders — so a `useDrawerProgress()` call there throws
 * "Couldn't find a drawer. Is your component inside a drawer?" and takes the whole app into the
 * root error boundary, on web AND native.
 *
 * This pins that: `DrawerContent` renders with no drawer context of any kind in the tree, the
 * way the library invokes it, and the mocked `useDrawerProgress` below throws so any future
 * hook call from the body fails here first.
 */
import * as React from 'react';
import { Platform } from 'react-native';

import { fireEvent, render, screen } from '@testing-library/react';

import { DrawerContent } from './index';
import { DrawerPanelVisibilityProvider, DrawerPanelVisibilityReporter } from '../panel-visibility';

import type { DrawerContentComponentProps } from 'expo-router/drawer';

jest.mock('react-native-safe-area-context', () => ({
	useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('expo-router/drawer', () => {
	const R = require('react');
	return {
		DrawerContentScrollView: ({
			children,
			testID,
			importantForAccessibility,
			accessibilityElementsHidden,
		}: {
			children?: React.ReactNode;
			testID?: string;
			importantForAccessibility?: string;
			accessibilityElementsHidden?: boolean;
		}) =>
			R.createElement(
				'div',
				{
					'data-testid': 'drawer-scroll',
					'data-panel': testID,
					'data-important': importantForAccessibility,
					'data-elements-hidden': String(accessibilityElementsHidden),
				},
				children
			),
		// Throws exactly like the real hook does without a `DrawerProgressContext`, so this
		// suite fails loudly if anything ever calls it from `DrawerContent`'s body again.
		useDrawerProgress: () => {
			throw new Error("Couldn't find a drawer. Is your component inside a drawer?");
		},
		getDrawerStatusFromState: (state: { history?: { type: string; status?: string }[] }) =>
			state.history?.findLast?.((entry) => entry.type === 'drawer')?.status ?? 'closed',
	};
});

jest.mock('../../header/notification-bell', () => ({
	NotificationBell: () => <div data-testid="bell" />,
}));
jest.mock('./drawer-item', () => ({
	DrawerItem: ({ testID }: { testID: string }) => <div data-testid={testID} />,
}));

jest.mock('../version', () => ({ Version: () => <div data-testid="version" /> }));
jest.mock('expo-router/react-navigation', () => ({ CommonActions: {}, DrawerActions: {} }));
jest.mock('../../../../../contexts/app-state', () => ({
	useStoreSession: () => ({ wpCredentials: { display_name: 'Cashier' } }),
}));
jest.mock('@wcpos/query', () => ({
	useDocField: <T,>(value: T, select: (value: T) => unknown) => select(value),
}));
jest.mock('../../header/user-avatar', () => ({ UserAvatar: () => <div data-testid="avatar" /> }));
jest.mock('../../../pos/cart/user-sheet', () => ({
	UserSheet: ({ open, portalHost }: { open: boolean; portalHost?: string | null }) =>
		open ? <div data-testid="user-sheet" data-root={String(portalHost === null)} /> : null,
}));
function PlainCall(props: DrawerContentComponentProps) {
	return DrawerContent(props);
}

const drawerProps = {
	state: {
		key: 'drawer-1',
		index: 0,
		routeNames: ['(pos)'],
		routes: [{ key: 'pos-1', name: '(pos)' }],
		history: [{ type: 'route', key: 'pos-1' }],
		type: 'drawer',
		stale: false,
	},
	navigation: {},
	descriptors: { 'pos-1': { options: {} } },
} as unknown as DrawerContentComponentProps;

describe('DrawerContent', () => {
	it('is the web variant under test', () => {
		expect(Platform.OS).toBe('web');
	});

	it('renders with no drawer context in the tree', () => {
		// No DrawerProgressContext, no DrawerGestureContext — exactly what `DrawerContent`'s
		// body can see when `Drawer` calls it during its own render.
		const { container } = render(
			<DrawerPanelVisibilityProvider>
				<PlainCall {...drawerProps} />
			</DrawerPanelVisibilityProvider>
		);

		expect(container.querySelector('[data-testid="drawer-scroll"]')).not.toBeNull();
	});

	it('hides the menu from assistive tech while the panel is hidden, and exposes it once open', () => {
		// The provider starts hidden (the drawer boots closed). Android kept reporting the
		// hidden panel's items with stale bounds after a heavy screen mount (run 33740223026).
		const { container, rerender } = render(
			<DrawerPanelVisibilityProvider>
				<PlainCall {...drawerProps} />
			</DrawerPanelVisibilityProvider>
		);
		const scroll = () => container.querySelector('[data-testid="drawer-scroll"]');
		// A closable panel: the E2E readiness guard may close it through the scrim.
		expect(scroll()?.getAttribute('data-panel')).toBe('drawer-panel');
		expect(scroll()?.getAttribute('data-important')).toBe('no-hide-descendants');
		expect(scroll()?.getAttribute('data-elements-hidden')).toBe('true');

		// An open drawer un-hides immediately (the reporter is what DrawerContent renders).
		rerender(
			<DrawerPanelVisibilityProvider>
				<DrawerPanelVisibilityReporter status="open" />
				<PlainCall {...drawerProps} />
			</DrawerPanelVisibilityProvider>
		);
		expect(scroll()?.getAttribute('data-important')).toBe('auto');
		expect(scroll()?.getAttribute('data-elements-hidden')).toBe('false');
	});

	it('never hides a permanent drawer from assistive tech', () => {
		// The large-screen rail is `drawerType: 'permanent'`: always on screen, never hidden by
		// the layout, but the navigator's state still says "closed" (no drawer entry in
		// `history`), so the provider's flag alone would hide the visible sidebar from screen
		// readers for the whole session (Codex P1 on #1804). The gate is the focused route's
		// `drawerType` option, which is what the layout sets per screen size.
		const permanentProps = {
			...drawerProps,
			descriptors: { 'pos-1': { options: { drawerType: 'permanent' } } },
		} as unknown as DrawerContentComponentProps;
		const { container } = render(
			<DrawerPanelVisibilityProvider>
				<PlainCall {...permanentProps} />
			</DrawerPanelVisibilityProvider>
		);
		const scroll = container.querySelector('[data-testid="drawer-scroll"]');
		// The rail says it is permanent so the E2E readiness guard never tries to close it.
		expect(scroll?.getAttribute('data-panel')).toBe('drawer-panel-permanent');
		expect(scroll?.getAttribute('data-important')).toBe('auto');
		expect(scroll?.getAttribute('data-elements-hidden')).toBe('false');
	});

	it('renders even with no visibility provider either', () => {
		const { container } = render(<PlainCall {...drawerProps} />);

		expect(container.querySelector('[data-testid="drawer-scroll"]')).not.toBeNull();
	});
});

it('renders avatar and version without a bell and opens the cashier sheet on the root host', () => {
	render(<PlainCall {...drawerProps} />);
	for (const id of ['avatar', 'version']) expect(screen.getByTestId(id)).toBeTruthy();
	expect(screen.queryByTestId('bell')).toBeNull();
	fireEvent.click(screen.getByTestId('register-bar-avatar'));
	expect(screen.getByTestId('user-sheet').getAttribute('data-root')).toBe('true');
});

it('groups Health, Settings and Support below the top POS item', () => {
	const routes = ['(pos)', 'health', 'settings', 'support'].map((name) => ({ key: name, name }));
	const props = {
		...drawerProps,
		state: { ...drawerProps.state, routes },
		descriptors: Object.fromEntries(
			routes.map(({ key }) => [
				key,
				{
					options: key === 'health' ? { drawerItemStyle: [{ marginTop: 'auto' }] } : {},
				},
			])
		),
	} as unknown as DrawerContentComponentProps;
	render(<PlainCall {...props} />);
	expect(
		screen.getByTestId('drawer-top-group').contains(screen.getByTestId('drawer-item-pos'))
	).toBe(true);
	const bottom = screen.getByTestId('drawer-bottom-group');
	for (const name of ['health', 'settings', 'support']) {
		expect(bottom.contains(screen.getByTestId(`drawer-item-${name}`))).toBe(true);
	}
	expect(bottom.contains(screen.getByTestId('drawer-item-pos'))).toBe(false);
});

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
 * way the library invokes it. Jest has no platform-extension resolution, so the web variant of
 * `DrawerProgressWatcher` is the one resolved here — the same file the browser bundle gets.
 */
import * as React from 'react';
import { Platform } from 'react-native';

import { render } from '@testing-library/react';

import { DrawerContent } from './index';
import { DrawerPanelVisibilityProvider } from './panel-visibility';

import type { DrawerContentComponentProps } from 'expo-router/build/react-navigation/drawer';

jest.mock('react-native-safe-area-context', () => ({
	useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('expo-router/build/react-navigation/drawer', () => {
	const R = require('react');
	return {
		DrawerContentScrollView: ({ children }: { children?: React.ReactNode }) =>
			R.createElement('div', { 'data-testid': 'drawer-scroll' }, children),
		// Throws exactly like the real hook does without a `DrawerProgressContext`, so this
		// suite fails loudly if anything ever calls it from `DrawerContent`'s body again.
		useDrawerProgress: () => {
			throw new Error("Couldn't find a drawer. Is your component inside a drawer?");
		},
		getDrawerStatusFromState: (state: { history?: { type: string; status?: string }[] }) =>
			state.history?.findLast?.((entry) => entry.type === 'drawer')?.status ?? 'closed',
	};
});

jest.mock('./drawer-item-list', () => ({
	DrawerItemList: () => null,
}));

jest.mock('./version', () => ({
	Version: () => null,
}));

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
	descriptors: {},
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
				<DrawerContent {...drawerProps} />
			</DrawerPanelVisibilityProvider>
		);

		expect(container.querySelector('[data-testid="drawer-scroll"]')).not.toBeNull();
	});

	it('renders even with no visibility provider either', () => {
		const { container } = render(<DrawerContent {...drawerProps} />);

		expect(container.querySelector('[data-testid="drawer-scroll"]')).not.toBeNull();
	});
});

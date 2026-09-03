import * as React from 'react';

// SDK 56: expo-router vendors react-navigation; @react-navigation/drawer is no longer a dependency.
import {
	DrawerContentScrollView,
	getDrawerStatusFromState,
} from 'expo-router/build/react-navigation/drawer';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DrawerItemList } from './drawer-item-list';
import { DrawerPanelVisibilityReporter, useDrawerPanelHidden } from './panel-visibility';
import { Version } from './version';

import type { DrawerContentComponentProps } from 'expo-router/build/react-navigation/drawer';

/**
 * NOTE ON HOOKS IN THIS COMPONENT.
 *
 * This is not rendered as a component. `DrawerView.renderDrawerContent` calls
 * `drawerContent({ state, navigation, descriptors })` as a plain function, and
 * `react-native-drawer-layout`'s `Drawer` calls `renderDrawerContent()` inside its own render
 * body. So every hook below runs at `Drawer`'s position in the tree, NOT where its output is
 * mounted — which means it can only read context from providers ABOVE `Drawer`, and none of
 * the ones `Drawer` itself renders (`DrawerProgressContext`, `DrawerGestureContext`).
 * `useSafeAreaInsets` is fine because its provider is far above. Anything that needs a
 * drawer-owned context has to be a rendered element instead.
 */
export function DrawerContent(props: DrawerContentComponentProps) {
	const insets = useSafeAreaInsets();

	// The drawer's open/closed status only exists on the navigator's state, and the drawer
	// content is the one component the navigator hands it to. Report it upward so the layout
	// can take a settled-closed panel out of layout entirely — see `panel-visibility.tsx`.
	const status = getDrawerStatusFromState(props.state);

	// A settled-closed panel is out of layout (`display: 'none'`, see `panel-visibility.tsx`)
	// but its subtree stays mounted, and on Android the accessibility tree kept reporting the
	// items with their last laid-out bounds after a heavy screen mount — a screen reader (and
	// Maestro, run 33740223026: `drawer-item-pos` "visible" with nothing drawn) could reach
	// menu items that are not on the screen. Hide the descendants from assistive tech while
	// the panel is hidden; the reporter above stays mounted so an open can un-hide them.
	const panelHidden = useDrawerPanelHidden();

	return (
		<>
			<DrawerPanelVisibilityReporter status={status === 'open' ? 'open' : 'closed'} />
			<DrawerContentScrollView
				{...props}
				importantForAccessibility={panelHidden ? 'no-hide-descendants' : 'auto'}
				accessibilityElementsHidden={panelHidden}
				contentContainerStyle={{
					paddingTop: insets.top,
					paddingBottom: insets.bottom,
					paddingLeft: 0,
					paddingRight: 0,
					paddingStart: 0,
					paddingEnd: 0,
					justifyContent: 'flex-start',
					// flexGrow (not height: '100%') so the bottom group's marginTop: 'auto'
					// still anchors when content fits, while overflowing items stay scrollable
					// on short viewports (#1425).
					flexGrow: 1,
				}}
			>
				<DrawerItemList {...props} />
				<Version />
			</DrawerContentScrollView>
		</>
	);
}

import * as React from 'react';

// SDK 56: expo-router vendors react-navigation; @react-navigation/drawer is no longer a dependency.
import {
	DrawerContentScrollView,
	getDrawerStatusFromState,
	useDrawerProgress,
} from 'expo-router/build/react-navigation/drawer';
import { useAnimatedReaction } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DrawerItemList } from './drawer-item-list';
import { DrawerPanelVisibilityReporter, useReassertDrawerPanelHidden } from './panel-visibility';
import { Version } from './version';

import type { DrawerContentComponentProps } from 'expo-router/build/react-navigation/drawer';

/**
 * `react-native-drawer-layout` renders the drawer content inside its `DrawerProgressContext`
 * (`Drawer.native.js` / `Drawer.js` both wrap `renderDrawerContent()` in the provider), so this
 * is the one component that can watch the panel's animated progress. When that progress returns
 * to 0 the drawer is closed on screen — which is not always accompanied by a navigation state
 * change (a cancelled opening swipe is not), so it is the signal the visibility guard needs to
 * re-apply itself. See `panel-visibility.tsx`.
 */
function useReassertHiddenWhenProgressSettlesClosed() {
	const progress = useDrawerProgress();
	const reassert = useReassertDrawerPanelHidden();

	useAnimatedReaction(
		() => progress.value,
		(value, previous) => {
			if (previous !== null && previous !== value && value === 0) {
				scheduleOnRN(reassert);
			}
		},
		[reassert]
	);
}

export function DrawerContent(props: DrawerContentComponentProps) {
	const insets = useSafeAreaInsets();

	// The drawer's open/closed status only exists on the navigator's state, and the drawer
	// content is the one component the navigator hands it to. Report it upward so the layout
	// can take a settled-closed panel out of layout entirely — see `panel-visibility.tsx`.
	const status = getDrawerStatusFromState(props.state);
	useReassertHiddenWhenProgressSettlesClosed();

	return (
		<>
			<DrawerPanelVisibilityReporter status={status === 'open' ? 'open' : 'closed'} />
			<DrawerContentScrollView
				{...props}
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

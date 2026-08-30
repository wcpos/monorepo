import * as React from 'react';

// SDK 56: expo-router vendors react-navigation; @react-navigation/drawer is no longer a dependency.
import {
	DrawerContentScrollView,
	getDrawerStatusFromState,
} from 'expo-router/build/react-navigation/drawer';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DrawerItemList } from './drawer-item-list';
import { DrawerPanelVisibilityReporter } from './panel-visibility';
import { Version } from './version';

import type { DrawerContentComponentProps } from 'expo-router/build/react-navigation/drawer';

export function DrawerContent(props: DrawerContentComponentProps) {
	const insets = useSafeAreaInsets();

	// The drawer's open/closed status only exists on the navigator's state, and the drawer
	// content is the one component the navigator hands it to. Report it upward so the layout
	// can take a settled-closed panel out of layout entirely — see `panel-visibility.tsx`.
	const status = getDrawerStatusFromState(props.state);

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

import * as React from 'react';

// SDK 56: expo-router vendors react-navigation; @react-navigation/drawer is no longer a dependency.
import { DrawerContentScrollView } from 'expo-router/build/react-navigation/drawer';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DrawerItemList } from './drawer-item-list';
import { Version } from './version';

import type { DrawerContentComponentProps } from 'expo-router/build/react-navigation/drawer';

export function DrawerContent(props: DrawerContentComponentProps) {
	const insets = useSafeAreaInsets();

	return (
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
				height: '100%',
			}}
		>
			<DrawerItemList {...props} />
			<Version />
		</DrawerContentScrollView>
	);
}

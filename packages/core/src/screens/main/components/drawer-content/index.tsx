import * as React from 'react';

import { DrawerContentScrollView } from '@react-navigation/drawer';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import DrawerItemList from './drawer-item-list';
import Version from './version';

import type { DrawerContentComponentProps } from '@react-navigation/drawer';

export const DrawerContent = (props: DrawerContentComponentProps & { largeScreen: boolean }) => {
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
			<Version largeScreen={props.largeScreen} />
		</DrawerContentScrollView>
	);
};

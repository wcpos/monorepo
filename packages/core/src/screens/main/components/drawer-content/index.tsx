import * as React from 'react';

import { DrawerContentScrollView, DrawerContentComponentProps } from '@react-navigation/drawer';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import DrawerItemList from './drawer-item-list';
import Version from './version';

const Drawer = (props: DrawerContentComponentProps & { largeScreen: boolean }) => {
	const insets = useSafeAreaInsets();

	return (
		<DrawerContentScrollView
			{...props}
			contentContainerStyle={{
				paddingTop: insets.top,
				paddingBottom: insets.bottom,
				justifyContent: 'flex-start',
				height: '100%',
			}}
		>
			<DrawerItemList {...props} />
			<Version largeScreen={props.largeScreen} />
		</DrawerContentScrollView>
	);
};

export default Drawer;

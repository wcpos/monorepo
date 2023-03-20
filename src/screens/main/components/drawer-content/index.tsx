import * as React from 'react';

// import { Linking } from 'react-native';
import {
	DrawerContentScrollView,
	// DrawerItem,
	DrawerContentComponentProps,
} from '@react-navigation/drawer';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// import Icon from '@wcpos/components/src/icon';
import DrawerItemList from './drawer-item-list';

const Drawer = (props: DrawerContentComponentProps) => {
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
			{/* <DrawerItem label="Help" onPress={() => Linking.openURL('https://mywebsite.com/help')} /> */}
		</DrawerContentScrollView>
	);
};

export default Drawer;

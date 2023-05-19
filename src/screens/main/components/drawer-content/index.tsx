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
			{/* <DrawerItem label="Help" onPress={() => Linking.openURL('https://mywebsite.com/help')} /> */}
			<Version largeScreen={props.largeScreen} />
		</DrawerContentScrollView>
	);
};

export default Drawer;

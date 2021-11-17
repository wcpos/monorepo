import * as React from 'react';
import { Linking } from 'react-native';
import {
	DrawerContentScrollView,
	DrawerItemList,
	DrawerItem,
	DrawerContentComponentProps,
} from '@react-navigation/drawer';

const Drawer = (props: DrawerContentComponentProps) => {
	console.log(props);
	return (
		<DrawerContentScrollView {...props}>
			<DrawerItemList {...props} />
			<DrawerItem label="Help" onPress={() => Linking.openURL('https://mywebsite.com/help')} />
		</DrawerContentScrollView>
	);
};

export default Drawer;

import * as React from 'react';
import { Linking } from 'react-native';
import {
	DrawerContentScrollView,
	DrawerItem,
	DrawerContentComponentProps,
} from '@react-navigation/drawer';
import Icon from '@wcpos/components/src/icon';
import DrawerItemList from './drawer-item-list';

const Drawer = (props: DrawerContentComponentProps) => {
	return (
		<DrawerContentScrollView {...props} contentContainerStyle={{ paddingTop: 0 }}>
			<DrawerItemList {...props} />
			{/* <DrawerItem label="Help" onPress={() => Linking.openURL('https://mywebsite.com/help')} /> */}
		</DrawerContentScrollView>
	);
};

export default Drawer;

import * as React from 'react';
import { Linking } from 'react-native';
import {
	DrawerContentScrollView,
	DrawerItem,
	DrawerContentComponentProps,
} from '@react-navigation/drawer';
import Icon from '@wcpos/common/src/components/icon';
import DrawerItemList from './drawer-item-list';

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

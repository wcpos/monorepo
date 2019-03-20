import React from 'react';
import List, { ListItem } from '../../components/list';
import { SideBarView } from './styles';

/**
 * Based on:
 * https://github.com/react-navigation/react-navigation-drawer/blob/master/src/views/DrawerNavigatorItems.js
 */
type Item = import('react-navigation').NavigationRoute;
type Props = {
	activeItemKey: string;
	items: Item[];
	onItemPress: (drawItem: import('react-navigation').DrawerItem) => void;
	drawerPosition?: 'left' | 'right';
};

const SideBar = ({ activeItemKey, items, onItemPress }: Props) => {
	const renderItem = (item: Item) => {
		return (
			<ListItem
				key={item.key}
				text={item.routeName}
				onPress={() => {
					onItemPress({ route: item, focused: false });
				}}
			/>
		);
	};

	return (
		<SideBarView>
			<List items={items} renderItem={renderItem} />
		</SideBarView>
	);
};

export default SideBar;

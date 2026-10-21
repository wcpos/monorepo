import type * as React from 'react';
import { View } from 'react-native';

import { NavItem } from './index';

const onPress = () => {};
// The drawer rows sit on the drawer's own colour, as they do in the app.
const drawer = (children: React.ReactNode) => (
	<View className="bg-sidebar w-52 p-2">{children}</View>
);
const area = (children: React.ReactNode) => (
	<View className="bg-background w-56 p-3">{children}</View>
);

export const stories = [
	{
		id: 'row-selected',
		render: () =>
			area(
				<NavItem selected icon="settings" label="General" onPress={onPress} testID="nav-row-on" />
			),
	},
	{
		id: 'row',
		render: () =>
			area(<NavItem icon="receipt" label="Tax" chevron onPress={onPress} testID="nav-row-off" />),
	},
	{
		id: 'drawer-selected',
		render: () =>
			drawer(
				<NavItem
					selected
					size="drawer"
					icon="register"
					label="POS"
					onPress={onPress}
					testID="nav-drawer-on"
				/>
			),
	},
	{
		id: 'drawer',
		render: () =>
			drawer(
				<NavItem
					size="drawer"
					icon="gift"
					label="Products"
					onPress={onPress}
					testID="nav-drawer-off"
				/>
			),
	},
];

import * as React from 'react';

import { CommonActions, DrawerActions } from 'expo-router/react-navigation';

import { DrawerItem } from './drawer-item';

import type { DrawerContentComponentProps } from 'expo-router/drawer';

/**
 * Component that renders the navigation list in the drawer.
 */
export function DrawerItemList({ state, navigation, descriptors }: DrawerContentComponentProps) {
	return state.routes.map((route, i) => {
		const focused = i === state.index;
		const { title, drawerLabel, drawerIcon, drawerItemStyle } = descriptors[route.key].options;

		return (
			<DrawerItem
				key={route.key}
				testID={`drawer-item-${route.name.replace(/[()]/g, '')}`}
				label={
					(drawerLabel !== undefined ? drawerLabel : title !== undefined ? title : route.name) as
						string | ((props: { focused?: boolean; color?: string }) => React.ReactNode)
				}
				icon={
					drawerIcon as
						| ((props: { focused?: boolean; size?: number; color?: string }) => React.ReactNode)
						| undefined
				}
				focused={focused}
				style={drawerItemStyle}
				onPress={() => {
					navigation.dispatch({
						...(focused
							? DrawerActions.closeDrawer()
							: CommonActions.navigate({ name: route.name, merge: true })),
						target: state.key,
					});
				}}
			/>
		);
	}) as React.ReactNode as React.ReactElement;
}

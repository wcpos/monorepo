import * as React from 'react';

import { CommonActions, DrawerActions } from '@react-navigation/native';

import { DrawerItem } from './drawer-item';

import type { DrawerContentComponentProps } from '@react-navigation/drawer';

/**
 * Component that renders the navigation list in the drawer.
 */
export function DrawerItemList({ state, navigation, descriptors }: DrawerContentComponentProps) {
	const focusedRoute = state.routes[state.index];
	const focusedDescriptor = descriptors[focusedRoute.key];
	const focusedOptions = focusedDescriptor.options;

	const {
		drawerActiveTintColor,
		drawerInactiveTintColor,
		drawerActiveBackgroundColor,
		drawerInactiveBackgroundColor,
	} = focusedOptions;

	return state.routes.map((route, i) => {
		const focused = i === state.index;
		const { title, drawerLabel, drawerIcon, drawerLabelStyle, drawerItemStyle, drawerType } =
			descriptors[route.key].options;

		return (
			<DrawerItem
				key={route.key}
				label={
					(drawerLabel !== undefined ? drawerLabel : title !== undefined ? title : route.name) as
						| string
						| ((props: { focused?: boolean; color?: string }) => React.ReactNode)
				}
				icon={
					drawerIcon as
						| ((props: { focused?: boolean; size?: number; color?: string }) => React.ReactNode)
						| undefined
				}
				focused={focused}
				activeTintColor={drawerActiveTintColor}
				inactiveTintColor={drawerInactiveTintColor}
				activeBackgroundColor={drawerActiveBackgroundColor}
				inactiveBackgroundColor={drawerInactiveBackgroundColor}
				labelStyle={drawerLabelStyle}
				style={drawerItemStyle}
				onPress={() => {
					navigation.dispatch({
						...(focused
							? DrawerActions.closeDrawer()
							: CommonActions.navigate({ name: route.name, merge: true })),
						target: state.key,
					});
				}}
				drawerType={drawerType}
			/>
		);
	}) as React.ReactNode as React.ReactElement;
}

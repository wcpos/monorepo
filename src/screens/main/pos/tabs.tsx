import * as React from 'react';
import { createBottomTabNavigator, BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { View, Text, TouchableOpacity } from 'react-native';
import Box from '@wcpos/components/src/box';
import Button from '@wcpos/components/src/button';
import Products from './products';
import OpenOrders from './cart';

export type TabsParamList = {
	Products: undefined;
	Cart: undefined;
};

const Tab = createBottomTabNavigator<TabsParamList>();

function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
	return (
		<Box horizontal style={{ backgroundColor: '#FFFFFF', borderTopColor: '#f5f5f5' }}>
			<Button.Group background="clear" alignment="full">
				{state.routes.map((route, index) => {
					const { options } = descriptors[route.key];
					const label =
						options.tabBarLabel !== undefined
							? options.tabBarLabel
							: options.title !== undefined
							? options.title
							: route.name;

					const isFocused = state.index === index;

					const onPress = () => {
						const event = navigation.emit({
							type: 'tabPress',
							target: route.key,
							canPreventDefault: true,
						});

						if (!isFocused && !event.defaultPrevented) {
							// The `merge: true` option makes sure that the params inside the tab screen are preserved
							navigation.navigate({ name: route.name, merge: true });
						}
					};

					return (
						<Button
							key={label}
							onPress={onPress}
							disabled={isFocused}
							accessibilityRole="button"
							accessibilityState={isFocused ? { selected: true } : {}}
							accessibilityLabel={options.tabBarAccessibilityLabel}
						>
							{label}
						</Button>
					);
				})}
			</Button.Group>
		</Box>
	);
}

const POSTabs = () => {
	return (
		<Tab.Navigator
			screenOptions={{ headerShown: false }}
			tabBar={TabBar}
			// detachInactiveScreens={false} - @TODO - this is not working in web?!
		>
			<Tab.Screen name="Products" component={Products} />
			<Tab.Screen name="Cart" component={OpenOrders} />
		</Tab.Navigator>
	);
};

export default POSTabs;

import * as React from 'react';

import { createBottomTabNavigator, BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useObservableState } from 'observable-hooks';
import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import Button from '@wcpos/components/src/button';
import Icon from '@wcpos/components/src/icon';
import Text from '@wcpos/components/src/text';

import useAuth from '../../../contexts/auth';
import { t } from '../../../lib/translations';
import OpenOrders from './cart';
import Products from './products';
// import { usePOSContext } from './context';

export type TabsParamList = {
	Products: undefined;
	Cart: undefined;
};

const Tab = createBottomTabNavigator<TabsParamList>();

/**
 *
 */
const TabBar = ({ state, descriptors, navigation }: BottomTabBarProps) => {
	const theme = useTheme();

	// @TODO - add currentOrder total to cart tab
	// this means I would have to either:
	// 1. prefetch the first current order because the cart is not rendered yet
	// 2. reender the cart to get the currentOrder
	// const { currentOrder } = usePOSContext();

	return (
		<Box horizontal style={{ backgroundColor: '#FFFFFF', borderTopColor: theme.colors.border }}>
			<Button.Group background="clear" fill>
				{state.routes.map((route, index) => {
					const { options } = descriptors[route.key];
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
							key={route.name}
							onPress={onPress}
							// disabled={isFocused}
							// accessibilityRole="button"
							// accessibilityState={isFocused ? { selected: true } : {}}
							// accessibilityLabel={options.tabBarAccessibilityLabel}
						>
							<Box space="xxSmall" align="center">
								<Icon
									name={route.name === 'Products' ? 'gifts' : 'cartShopping'}
									type={isFocused ? 'primary' : 'text'}
								/>
								<Text size="xSmall" type={isFocused ? 'primary' : 'text'} uppercase>
									{options.label}
								</Text>
							</Box>
						</Button>
					);
				})}
			</Button.Group>
		</Box>
	);
};

/**
 *
 */
const POSTabs = () => {
	const { store } = useAuth();
	const storeName = useObservableState(store.name$, store.name);
	const tabBar = React.useCallback((props: BottomTabBarProps) => <TabBar {...props} />, []);

	return (
		<Tab.Navigator
			initialRouteName="Cart"
			screenOptions={{ headerShown: false }}
			tabBar={tabBar}
			// detachInactiveScreens={false} - @TODO - this is not working in web?!
		>
			<Tab.Screen
				name="Products"
				component={Products}
				options={{ title: `${t('Products')} - ${storeName}`, label: t('Products') }}
			/>
			<Tab.Screen
				name="Cart"
				component={OpenOrders}
				options={{ title: `${t('Cart')} - ${storeName}`, label: t('Cart') }}
			/>
		</Tab.Navigator>
	);
};

export default POSTabs;

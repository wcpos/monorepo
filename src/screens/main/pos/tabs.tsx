import * as React from 'react';
import { createBottomTabNavigator, BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useTheme } from 'styled-components/native';
import Box from '@wcpos/components/src/box';
import Button from '@wcpos/components/src/button';
import Icon from '@wcpos/components/src/icon';
import Text from '@wcpos/components/src/text';
import Products from './products';
import OpenOrders from './cart';

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

	return (
		<Box horizontal style={{ backgroundColor: '#FFFFFF', borderTopColor: theme.colors.border }}>
			<Button.Group background="clear" fill>
				{state.routes.map((route, index) => {
					// const { options } = descriptors[route.key];
					const label = route.name;

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
							// disabled={isFocused}
							// accessibilityRole="button"
							// accessibilityState={isFocused ? { selected: true } : {}}
							// accessibilityLabel={options.tabBarAccessibilityLabel}
						>
							<Box space="xxSmall" align="center">
								<Icon
									name={label === 'Products' ? 'gifts' : 'cartShopping'}
									type={isFocused ? 'primary' : 'text'}
								/>
								<Text size="xSmall" type={isFocused ? 'primary' : 'text'} uppercase>
									{label}
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
	const tabBar = React.useCallback((props: BottomTabBarProps) => <TabBar {...props} />, []);

	return (
		<Tab.Navigator
			screenOptions={{ headerShown: false }}
			tabBar={tabBar}
			// detachInactiveScreens={false} - @TODO - this is not working in web?!
		>
			<Tab.Screen name="Products" component={Products} />
			<Tab.Screen name="Cart" component={OpenOrders} />
		</Tab.Navigator>
	);
};

export default POSTabs;

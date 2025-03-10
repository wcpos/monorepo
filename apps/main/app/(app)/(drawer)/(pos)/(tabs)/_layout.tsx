import { Tabs } from 'expo-router';

import { Icon } from '@wcpos/components/icon';

export const unstable_settings = {
	// Ensure that reloading on `/modal` keeps a back button present.
	initialRouteName: 'products',
};

export default function TabLayout() {
	return (
		<Tabs screenOptions={{ tabBarActiveTintColor: 'blue' }}>
			<Tabs.Screen
				name="products"
				options={{
					title: 'Products',
					tabBarIcon: ({ focused }) => (
						<Icon name="gifts" className={focused ? 'text-primary' : 'text-muted-foreground'} />
					),
				}}
			/>
			<Tabs.Screen
				name="cart"
				options={{
					title: 'Cart',
					tabBarIcon: ({ focused }) => (
						<Icon
							name="cartShopping"
							className={focused ? 'text-primary' : 'text-muted-foreground'}
						/>
					),
				}}
			/>
		</Tabs>
	);
}

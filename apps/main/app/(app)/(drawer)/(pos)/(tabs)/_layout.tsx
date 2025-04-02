import { Redirect, Tabs } from 'expo-router';

import { Icon } from '@wcpos/components/icon';
import { useTheme } from '@wcpos/core/contexts/theme';

export const unstable_settings = {
	// Ensure that reloading on `/modal` keeps a back button present.
	initialRouteName: 'index',
};

export default function TabsLayout() {
	const { screenSize } = useTheme();

	if (screenSize !== 'sm') {
		return <Redirect href="(columns)" />;
	}

	return (
		<Tabs screenOptions={{ headerShown: false }}>
			<Tabs.Screen
				name="index"
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

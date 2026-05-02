import { View } from 'react-native';

import { Stack } from 'expo-router';

export const unstable_settings = {
	// Ensure that reloading on `/modal` keeps a back button present.
	initialRouteName: 'index',
};

export default function ProductsLayout() {
	return (
		<View className="bg-background flex-1">
			<Stack
				screenOptions={{
					headerShown: false,
					contentStyle: { backgroundColor: 'transparent' },
				}}
			>
				<Stack.Screen name="index" />
				<Stack.Screen
					name="(modals)/edit/product/[productId]"
					options={{
						presentation: 'containedTransparentModal',
						animation: 'fade',
						contentStyle: { backgroundColor: 'transparent' },
					}}
				/>
				<Stack.Screen
					name="(modals)/edit/variation/[variationId]"
					options={{
						presentation: 'containedTransparentModal',
						animation: 'fade',
						contentStyle: { backgroundColor: 'transparent' },
					}}
				/>
			</Stack>
		</View>
	);
}

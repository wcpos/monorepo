import { View } from 'react-native';

import { Stack } from 'expo-router';

export const unstable_settings = {
	initialRouteName: 'index',
};

export default function CouponsLayout() {
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
					name="(modals)/edit/[couponId]"
					options={{
						presentation: 'containedTransparentModal',
						animation: 'fade',
						contentStyle: { backgroundColor: 'transparent' },
					}}
				/>
				<Stack.Screen
					name="(modals)/add"
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

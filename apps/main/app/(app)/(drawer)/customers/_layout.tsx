import { View } from 'react-native';

import { Stack } from 'expo-router';

import { useNavigationBackground } from '../../../../components/use-navigation-background';

export const unstable_settings = {
	// Ensure that reloading on `/modal` keeps a back button present.
	initialRouteName: 'index',
};

export default function CustomersLayout() {
	const screenBackgroundColor = useNavigationBackground();
	return (
		<View className="bg-background flex-1">
			<Stack
				screenOptions={{
					headerShown: false,
					contentStyle: { backgroundColor: screenBackgroundColor },
				}}
			>
				<Stack.Screen name="index" />
				<Stack.Screen
					name="(modals)/edit/[customerId]"
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

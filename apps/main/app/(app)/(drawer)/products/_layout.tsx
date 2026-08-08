import { View } from 'react-native';

import { Stack } from 'expo-router';

import { useUserCapabilities } from '@wcpos/core/screens/main/hooks/use-user-capabilities';

import { useNavigationBackground } from '../../../../components/use-navigation-background';

export const unstable_settings = {
	// Ensure that reloading on `/modal` keeps a back button present.
	initialRouteName: 'index',
};

export default function ProductsLayout() {
	const screenBackgroundColor = useNavigationBackground();
	const { caps } = useUserCapabilities();
	return (
		<View className="bg-background flex-1">
			<Stack
				screenOptions={{
					headerShown: false,
					contentStyle: { backgroundColor: screenBackgroundColor },
				}}
			>
				<Stack.Screen name="index" />
				<Stack.Protected guard={caps.canEditProducts}>
					<Stack.Screen
						name="(modals)/edit/product/[productId]"
						options={{
							presentation: 'containedTransparentModal',
							animation: 'fade',
							contentStyle: { backgroundColor: 'transparent' },
						}}
					/>
				</Stack.Protected>
				<Stack.Protected guard={caps.canEditVariations}>
					<Stack.Screen
						name="(modals)/edit/variation/[variationId]"
						options={{
							presentation: 'containedTransparentModal',
							animation: 'fade',
							contentStyle: { backgroundColor: 'transparent' },
						}}
					/>
				</Stack.Protected>
			</Stack>
		</View>
	);
}
